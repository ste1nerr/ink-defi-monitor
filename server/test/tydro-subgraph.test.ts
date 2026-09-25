import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { aggregateSnapshots, mapPoolEvent, type PoolEventRow, type SnapshotRow } from "../src/protocols/tydro/subgraph.js";

const USDC = { id: "0x2d270e6886d130d724215a266106e6832161eaed", symbol: "USDC", decimals: 6 };
const WETH = { id: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18 };

// Same liquidation as fixtures/tydro-pool-logs.json, in the shape the subgraph returns.
const liquidationRow: PoolEventRow = {
  id: "0xd13b",
  type: "liquidation",
  reserve: { id: "0x0200c29006150606b650577bbe7b6248f58470c1", symbol: "USD₮0", decimals: 6 },
  user: "0x226264e3560c23861d04797ff4746dd8f8778315",
  amount: "159063097",
  caller: null,
  interestRateMode: null,
  usedAsCollateral: null,
  collateralAsset: WETH.id,
  liquidatedCollateralAmount: "45310183656275620",
  liquidator: "0xf0570ec48d03171a80ff796dceadf0d385a00004",
  premium: null,
  blockNumber: "27210262",
  timestamp: "1760700000",
  txHash: "0xd13b46aaefb95b47f13d42db3015e0f4e3ede310494948bc9c6e4adff5ac8e40",
  logIndex: "7",
};

const provenance = { source: "goldsky" as const, reference: "test", retrievedAt: 0 };

describe("mapPoolEvent", () => {
  it("produces the same shape as the RPC normalizer (checksummed addresses, exact amounts)", () => {
    const event = mapPoolEvent(liquidationRow, () => 1, provenance);
    expect(event).toMatchObject({
      id: `tydro:${liquidationRow.txHash}:7`,
      type: "liquidation",
      timestamp: 1_760_700_000_000,
      wallet: getAddress(liquidationRow.user),
      asset: { address: getAddress(liquidationRow.reserve.id), symbol: "USD₮0" },
      amount: { raw: "159063097", formatted: "159.063097" },
      amountUsd: 159.063097,
      metadata: {
        collateralAsset: getAddress(WETH.id),
        liquidatedCollateralRaw: "45310183656275620",
        liquidator: getAddress(liquidationRow.liquidator!),
      },
      explorerUrl: `https://explorer.inkonchain.com/tx/${liquidationRow.txHash}`,
      provenance: { source: "goldsky", blockNumber: "27210262" },
    });
  });

  it("omits USD value when there is no price and amount for collateral toggles", () => {
    const noPrice = mapPoolEvent(liquidationRow, () => undefined, provenance);
    expect(noPrice.amountUsd).toBeUndefined();

    const toggle = mapPoolEvent({ ...liquidationRow, type: "collateral_change", amount: "0", usedAsCollateral: false }, () => 1, provenance);
    expect(toggle.amount).toBeUndefined();
    expect(toggle.metadata?.usedAsCollateral).toBe(false);
  });

  it("does not format amounts when reserve decimals are unknown", () => {
    const event = mapPoolEvent({ ...liquidationRow, reserve: { ...liquidationRow.reserve, decimals: -1 } }, () => 1, provenance);
    expect(event.amount).toBeUndefined();
  });

  it("maps unrecognised types to unknown", () => {
    expect(mapPoolEvent({ ...liquidationRow, type: "something_new" }, () => 1, provenance).type).toBe("unknown");
  });
});

const snap = (reserve: SnapshotRow["reserve"], block: string, supplied: string, borrowed: string, price: string | null): SnapshotRow => ({
  id: `${reserve.id}-${block}`,
  reserve,
  blockNumber: block,
  timestamp: String(Number(block)),
  totalSupplied: supplied,
  totalBorrowed: borrowed,
  priceUsd: price,
});

describe("aggregateSnapshots", () => {
  it("sums reserves per block in USD and orders by time", () => {
    const points = aggregateSnapshots([
      snap(USDC, "200", "2000000000", "1000000000", "100000000"), // 2000 USDC supplied, 1000 borrowed @ $1
      snap(WETH, "100", "1000000000000000000", "0", "200000000000"), // 1 WETH @ $2000
      snap(USDC, "100", "1000000000", "500000000", "100000000"),
    ]);
    expect(points).toEqual([
      expect.objectContaining({ blockNumber: "100", suppliedUsd: 3000, borrowedUsd: 500, reserves: 2, unpricedReserves: 0 }),
      expect.objectContaining({ blockNumber: "200", suppliedUsd: 2000, borrowedUsd: 1000, utilization: 0.5 }),
    ]);
    expect(points[0]!.utilization).toBeCloseTo(500 / 3000);
  });

  it("excludes unpriced reserves from USD totals and reports them", () => {
    const [point] = aggregateSnapshots([
      snap(USDC, "1", "1000000", "0", "100000000"),
      snap(WETH, "1", "1000000000000000000", "0", null),
    ]);
    expect(point).toMatchObject({ suppliedUsd: 1, unpricedReserves: 1, reserves: 2 });
  });

  it("uses token-denominated utilization for a single reserve", () => {
    const [point] = aggregateSnapshots([snap(USDC, "1", "3", "1", null)]);
    expect(point!.utilization).toBe(0.333333);
  });
});
