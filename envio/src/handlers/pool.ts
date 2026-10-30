// Port of indexer/tydro/src/pool.ts.
import { type EvmOnEventContext, indexer } from "envio";
import { CHAIN_ID, POOL_START_BLOCK, SNAPSHOT_EVERY, concatI32 } from "../lib/constants";
import { blockTimestamp, reserveSnapshot, tokenMeta } from "../lib/rpc";

type Ctx = EvmOnEventContext;
type Base = {
  block: { number: number; timestamp: number };
  transaction: { hash: string };
  logIndex: number;
};

async function getOrCreateReserve(context: Ctx, asset: string, blockNumber: number) {
  const id = asset.toLowerCase();
  const existing = await context.Reserve.get(id);
  if (existing) return existing;
  // Preload runs every handler ahead of time, concurrently; it must not fan out
  // one symbol/decimals RPC read per event block. The real run reads once per reserve.
  if (context.isPreload) return { id };
  const meta = await context.effect(tokenMeta, { asset: id, blockNumber });
  const reserve = {
    id,
    symbol: meta.symbol,
    decimals: meta.decimals,
    firstSeenBlock: BigInt(blockNumber),
  };
  context.Reserve.set(reserve);
  return reserve;
}

async function newEvent(
  context: Ctx,
  event: Base,
  type: string,
  asset: string,
  user: string,
  amount: bigint,
) {
  const reserve = await getOrCreateReserve(context, asset, event.block.number);
  return {
    id: concatI32(event.transaction.hash, event.logIndex),
    type,
    reserve_id: reserve.id,
    user: user.toLowerCase(),
    amount,
    caller: undefined as string | undefined,
    interestRateMode: undefined as number | undefined,
    usedAsCollateral: undefined as boolean | undefined,
    collateralAsset: undefined as string | undefined,
    liquidatedCollateralAmount: undefined as bigint | undefined,
    liquidator: undefined as string | undefined,
    premium: undefined as bigint | undefined,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
    txHash: event.transaction.hash.toLowerCase(),
    logIndex: BigInt(event.logIndex),
  };
}

const fields = { block: ["timestamp"], transaction: ["hash"] } as const;

indexer.onEvent({ contract: "Pool", event: "Supply", fields }, async ({ event, context }) => {
  const e = await newEvent(context, event, "supply", event.params.reserve, event.params.onBehalfOf, event.params.amount);
  e.caller = event.params.user.toLowerCase();
  context.PoolEvent.set(e);
});

indexer.onEvent({ contract: "Pool", event: "Withdraw", fields }, async ({ event, context }) => {
  context.PoolEvent.set(
    await newEvent(context, event, "withdraw", event.params.reserve, event.params.user, event.params.amount),
  );
});

indexer.onEvent({ contract: "Pool", event: "Borrow", fields }, async ({ event, context }) => {
  const e = await newEvent(context, event, "borrow", event.params.reserve, event.params.onBehalfOf, event.params.amount);
  e.caller = event.params.user.toLowerCase();
  e.interestRateMode = Number(event.params.interestRateMode);
  context.PoolEvent.set(e);
});

indexer.onEvent({ contract: "Pool", event: "Repay", fields }, async ({ event, context }) => {
  const e = await newEvent(context, event, "repay", event.params.reserve, event.params.user, event.params.amount);
  e.caller = event.params.repayer.toLowerCase();
  context.PoolEvent.set(e);
});

indexer.onEvent({ contract: "Pool", event: "LiquidationCall", fields }, async ({ event, context }) => {
  const e = await newEvent(context, event, "liquidation", event.params.debtAsset, event.params.user, event.params.debtToCover);
  await getOrCreateReserve(context, event.params.collateralAsset, event.block.number);
  e.collateralAsset = event.params.collateralAsset.toLowerCase();
  e.liquidatedCollateralAmount = event.params.liquidatedCollateralAmount;
  e.liquidator = event.params.liquidator.toLowerCase();
  context.PoolEvent.set(e);
});

indexer.onEvent({ contract: "Pool", event: "ReserveUsedAsCollateralEnabled", fields }, async ({ event, context }) => {
  const e = await newEvent(context, event, "collateral_change", event.params.reserve, event.params.user, 0n);
  e.usedAsCollateral = true;
  context.PoolEvent.set(e);
});

indexer.onEvent({ contract: "Pool", event: "ReserveUsedAsCollateralDisabled", fields }, async ({ event, context }) => {
  const e = await newEvent(context, event, "collateral_change", event.params.reserve, event.params.user, 0n);
  e.usedAsCollateral = false;
  context.PoolEvent.set(e);
});

indexer.onEvent({ contract: "Pool", event: "FlashLoan", fields }, async ({ event, context }) => {
  const e = await newEvent(context, event, "flash_loan", event.params.asset, event.params.initiator, event.params.amount);
  e.caller = event.params.target.toLowerCase();
  e.premium = event.params.premium;
  context.PoolEvent.set(e);
});

// Hourly snapshot: the subgraph's polling block handler (`every: 3600` from the
// Pool's start block). Reverted reads skip that reserve; nothing is invented.
indexer.onBlock(
  {
    name: "Snapshot",
    where: ({ chain }) => {
      if (chain.id !== CHAIN_ID) return false;
      return { block: { number: { _gte: POOL_START_BLOCK, _every: SNAPSHOT_EVERY } } };
    },
  },
  async ({ block, context }) => {
    const rows = await context.effect(reserveSnapshot, block.number);
    if (rows.length === 0) return;
    const timestamp = await context.effect(blockTimestamp, block.number);
    for (const row of rows) {
      const reserve = await getOrCreateReserve(context, row.asset, block.number);
      context.ReserveSnapshot.set({
        id: concatI32(row.asset, block.number),
        reserve_id: reserve.id,
        blockNumber: BigInt(block.number),
        timestamp,
        totalSupplied: row.totalSupplied,
        totalBorrowed: row.totalBorrowed,
        liquidityRate: row.liquidityRate,
        variableBorrowRate: row.variableBorrowRate,
        priceUsd: row.priceUsd,
      });
    }
  },
);
