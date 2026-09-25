import { decodeEventLog, type Address, type Log } from "viem";
import { explorerTxUrl } from "../../config/chain.js";
import type { DataProvenance, ProtocolEvent, ProtocolEventType } from "../../domain/types.js";
import { tokenAmount } from "../../domain/units.js";
import { BOOKKEEPING_EVENTS, poolEventsAbi } from "./abi.js";

export type ReserveInfo = { symbol: string; decimals: number; priceUsd: number };
export type ReserveLookup = (asset: Address) => ReserveInfo | undefined;

type Decoded =
  | { kind: "skip" }
  | { kind: "unknown"; eventName?: string }
  | {
      kind: "event";
      type: Exclude<ProtocolEventType, "unknown">;
      wallet: Address;
      asset: Address;
      amount?: bigint;
      metadata: ProtocolEvent["metadata"];
    };

function classify(log: Log): Decoded {
  let decoded;
  try {
    decoded = decodeEventLog({ abi: poolEventsAbi, data: log.data, topics: log.topics });
  } catch {
    return { kind: "unknown" };
  }
  const { eventName, args } = decoded;
  if (BOOKKEEPING_EVENTS.has(eventName)) return { kind: "skip" };

  switch (eventName) {
    case "Supply":
      return {
        kind: "event",
        type: "supply",
        wallet: args.onBehalfOf,
        asset: args.reserve,
        amount: args.amount,
        metadata: { caller: args.user },
      };
    case "Withdraw":
      return { kind: "event", type: "withdraw", wallet: args.user, asset: args.reserve, amount: args.amount, metadata: { to: args.to } };
    case "Borrow":
      return {
        kind: "event",
        type: "borrow",
        wallet: args.onBehalfOf,
        asset: args.reserve,
        amount: args.amount,
        metadata: { caller: args.user, interestRateMode: args.interestRateMode },
      };
    case "Repay":
      return {
        kind: "event",
        type: "repay",
        wallet: args.user,
        asset: args.reserve,
        amount: args.amount,
        metadata: { repayer: args.repayer, useATokens: args.useATokens },
      };
    case "LiquidationCall":
      return {
        kind: "event",
        type: "liquidation",
        wallet: args.user,
        asset: args.debtAsset,
        amount: args.debtToCover,
        metadata: {
          collateralAsset: args.collateralAsset,
          liquidatedCollateralRaw: args.liquidatedCollateralAmount.toString(),
          liquidator: args.liquidator,
          receiveAToken: args.receiveAToken,
        },
      };
    case "ReserveUsedAsCollateralEnabled":
    case "ReserveUsedAsCollateralDisabled":
      return {
        kind: "event",
        type: "collateral_change",
        wallet: args.user,
        asset: args.reserve,
        metadata: { usedAsCollateral: eventName === "ReserveUsedAsCollateralEnabled" },
      };
    case "FlashLoan":
      return {
        kind: "event",
        type: "flash_loan",
        wallet: args.initiator,
        asset: args.asset,
        amount: args.amount,
        metadata: { target: args.target, premiumRaw: args.premium.toString() },
      };
    default:
      return { kind: "unknown", eventName };
  }
}

/** Normalizes raw Tydro Pool logs into ProtocolEvents. Pure; timestamps and reserve data are injected. */
export function normalizeTydroLogs(
  logs: Log[],
  timestamps: Map<bigint, number>,
  lookupReserve: ReserveLookup,
  baseProvenance: Omit<DataProvenance, "blockNumber" | "txHash">,
): ProtocolEvent[] {
  const events: ProtocolEvent[] = [];

  for (const log of logs) {
    if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) continue;
    const decoded = classify(log);
    if (decoded.kind === "skip") continue;

    const blockNumber = log.blockNumber.toString();
    const common = {
      id: `tydro:${log.transactionHash}:${log.logIndex}`,
      protocol: "tydro" as const,
      timestamp: timestamps.get(log.blockNumber) ?? 0,
      blockNumber,
      txHash: log.transactionHash,
      explorerUrl: explorerTxUrl(log.transactionHash),
      provenance: { ...baseProvenance, blockNumber, txHash: log.transactionHash },
    };

    if (decoded.kind === "unknown") {
      events.push({
        ...common,
        type: "unknown",
        metadata: { eventName: decoded.eventName ?? null, topic0: log.topics[0] ?? null },
      });
      continue;
    }

    const reserve = lookupReserve(decoded.asset);
    const amount =
      reserve && decoded.amount !== undefined ? tokenAmount(decoded.amount, reserve.decimals) : undefined;
    events.push({
      ...common,
      type: decoded.type,
      wallet: decoded.wallet,
      asset: { address: decoded.asset, symbol: reserve?.symbol ?? "Unknown" },
      amount,
      amountUsd: amount && reserve ? Number(amount.formatted) * reserve.priceUsd : undefined,
      metadata: decoded.metadata,
    });
  }

  return events.sort((a, b) => b.timestamp - a.timestamp);
}
