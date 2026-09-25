import { getAddress } from "viem";
import { explorerTxUrl } from "../../config/chain.js";
import { querySubgraph } from "../../data/goldsky.js";
import type { DataProvenance, ProtocolEvent, ProtocolEventType } from "../../domain/types.js";
import { ratio, toUsd, tokenAmount } from "../../domain/units.js";
import type { HistoryPoint, HistoryRange } from "./types.js";

/** The Graph caps `first` at 1000 and `skip` at 5000. */
const PAGE_SIZE = 1000;
export const MAX_EVENT_SKIP = 5000;
const ORACLE_DECIMALS = 8;

export const HISTORY_RANGE_SECONDS: Record<HistoryRange, number> = {
  "24h": 86_400,
  "7d": 7 * 86_400,
  "30d": 30 * 86_400,
  "90d": 90 * 86_400,
};

type ReserveRef = { id: string; symbol: string; decimals: number };

export type PoolEventRow = {
  id: string;
  type: string;
  reserve: ReserveRef;
  user: string;
  amount: string;
  caller: string | null;
  interestRateMode: number | null;
  usedAsCollateral: boolean | null;
  collateralAsset: string | null;
  liquidatedCollateralAmount: string | null;
  liquidator: string | null;
  premium: string | null;
  blockNumber: string;
  timestamp: string;
  txHash: string;
  logIndex: string;
};

export type SnapshotRow = {
  id: string;
  reserve: ReserveRef;
  blockNumber: string;
  timestamp: string;
  totalSupplied: string;
  totalBorrowed: string;
  priceUsd: string | null;
};

const KNOWN_TYPES = new Set<ProtocolEventType>([
  "supply",
  "withdraw",
  "borrow",
  "repay",
  "liquidation",
  "collateral_change",
  "flash_loan",
]);

export type EventFilter = {
  types?: ProtocolEventType[];
  wallet?: string;
  asset?: string;
  first: number;
  skip: number;
};

const EVENT_FIELDS = `id type user amount caller interestRateMode usedAsCollateral collateralAsset
  liquidatedCollateralAmount liquidator premium blockNumber timestamp txHash logIndex
  reserve { id symbol decimals }`;

export async function fetchPoolEvents(url: string, filter: EventFilter): Promise<PoolEventRow[]> {
  const where: Record<string, unknown> = {};
  if (filter.types?.length) where.type_in = filter.types;
  if (filter.wallet) where.user = filter.wallet.toLowerCase();
  if (filter.asset) where.reserve = filter.asset.toLowerCase();

  const data = await querySubgraph<{ poolEvents: PoolEventRow[] }>(
    url,
    `query Events($first: Int!, $skip: Int!, $where: PoolEvent_filter) {
      poolEvents(first: $first, skip: $skip, where: $where, orderBy: timestamp, orderDirection: desc) { ${EVENT_FIELDS} }
    }`,
    { first: filter.first, skip: filter.skip, where },
  );
  return data.poolEvents;
}

/** Pages through every snapshot since `fromTimestamp` using id cursors (the pattern The Graph recommends). */
export async function fetchSnapshots(url: string, fromTimestamp: number, asset?: string): Promise<SnapshotRow[]> {
  const rows: SnapshotRow[] = [];
  let lastId = "0x";
  for (;;) {
    const where: Record<string, unknown> = { timestamp_gte: String(fromTimestamp), id_gt: lastId };
    if (asset) where.reserve = asset.toLowerCase();
    const { reserveSnapshots } = await querySubgraph<{ reserveSnapshots: SnapshotRow[] }>(
      url,
      `query Snapshots($where: ReserveSnapshot_filter) {
        reserveSnapshots(first: ${PAGE_SIZE}, where: $where, orderBy: id, orderDirection: asc) {
          id blockNumber timestamp totalSupplied totalBorrowed priceUsd reserve { id symbol decimals }
        }
      }`,
      { where },
    );
    rows.push(...reserveSnapshots);
    if (reserveSnapshots.length < PAGE_SIZE) return rows;
    lastId = reserveSnapshots[reserveSnapshots.length - 1]!.id;
  }
}

/** Maps a subgraph row to the shared event model. `priceUsd` is the current oracle price, if known. */
export function mapPoolEvent(
  row: PoolEventRow,
  priceUsd: (asset: string) => number | undefined,
  provenance: Omit<DataProvenance, "blockNumber" | "txHash">,
): ProtocolEvent {
  const type: ProtocolEventType = KNOWN_TYPES.has(row.type as ProtocolEventType) ? (row.type as ProtocolEventType) : "unknown";
  const asset = getAddress(row.reserve.id);
  const hasDecimals = row.reserve.decimals >= 0;
  const amount = hasDecimals && type !== "collateral_change" ? tokenAmount(BigInt(row.amount), row.reserve.decimals) : undefined;
  const price = priceUsd(asset);

  const metadata: NonNullable<ProtocolEvent["metadata"]> = {};
  if (row.caller) metadata.caller = getAddress(row.caller);
  if (row.interestRateMode !== null) metadata.interestRateMode = row.interestRateMode;
  if (row.usedAsCollateral !== null) metadata.usedAsCollateral = row.usedAsCollateral;
  if (row.collateralAsset) metadata.collateralAsset = getAddress(row.collateralAsset);
  if (row.liquidatedCollateralAmount) metadata.liquidatedCollateralRaw = row.liquidatedCollateralAmount;
  if (row.liquidator) metadata.liquidator = getAddress(row.liquidator);
  if (row.premium) metadata.premiumRaw = row.premium;

  return {
    id: `tydro:${row.txHash}:${Number(row.logIndex)}`,
    protocol: "tydro",
    type,
    timestamp: Number(row.timestamp) * 1000,
    blockNumber: row.blockNumber,
    txHash: row.txHash,
    explorerUrl: explorerTxUrl(row.txHash),
    wallet: getAddress(row.user),
    asset: { address: asset, symbol: row.reserve.symbol },
    amount,
    amountUsd: amount && price !== undefined ? Number(amount.formatted) * price : undefined,
    metadata,
    provenance: { ...provenance, blockNumber: row.blockNumber, txHash: row.txHash },
  };
}

/**
 * Sums reserve snapshots taken at the same block into market totals.
 * Reserves without an oracle price or known decimals are excluded from USD totals and counted in `unpricedReserves`.
 */
export function aggregateSnapshots(rows: SnapshotRow[]): HistoryPoint[] {
  const byBlock = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const group = byBlock.get(row.blockNumber);
    if (group) group.push(row);
    else byBlock.set(row.blockNumber, [row]);
  }

  return [...byBlock.values()]
    .map((group) => {
      let suppliedUsd = 0;
      let borrowedUsd = 0;
      let unpricedReserves = 0;
      for (const row of group) {
        if (row.priceUsd === null || row.reserve.decimals < 0) {
          unpricedReserves++;
          continue;
        }
        const price = BigInt(row.priceUsd);
        suppliedUsd += toUsd(BigInt(row.totalSupplied), row.reserve.decimals, price, ORACLE_DECIMALS);
        borrowedUsd += toUsd(BigInt(row.totalBorrowed), row.reserve.decimals, price, ORACLE_DECIMALS);
      }
      const first = group[0]!;
      const single = group.length === 1 ? first : undefined;
      return {
        timestamp: Number(first.timestamp) * 1000,
        blockNumber: first.blockNumber,
        suppliedUsd,
        borrowedUsd,
        // For a single reserve, token-denominated utilization is exact and does not depend on price.
        utilization: single
          ? ratio(BigInt(single.totalBorrowed), BigInt(single.totalSupplied))
          : suppliedUsd > 0
            ? borrowedUsd / suppliedUsd
            : null,
        reserves: group.length,
        unpricedReserves,
      } satisfies HistoryPoint;
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}
