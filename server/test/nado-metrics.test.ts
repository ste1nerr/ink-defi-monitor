import { describe, expect, it } from "vitest";
import { mergeSnapshotChunks, type MarketSnapshot, type NadoAsset } from "../src/protocols/nado/api.js";
import { buildHistory, buildOverview, liquidationEvents } from "../src/protocols/nado/metrics.js";
import fixture from "./fixtures/nado-market-snapshots.json" with { type: "json" };

// Real archive response (see fixture.request), newest first.
const snapshots = fixture.snapshots as unknown as MarketSnapshot[];
const assets: NadoAsset[] = [
  { product_id: 0, ticker_id: null, market_type: null, name: "USDT0", symbol: "USDT0" },
  { product_id: 2, ticker_id: "BTC-PERP_USDT0", market_type: "perp", name: "Bitcoin Perp", symbol: "BTC-PERP" },
  { product_id: 4, ticker_id: "ETH-PERP_USDT0", market_type: "perp", name: "Ethereum Perp", symbol: "ETH-PERP" },
  { product_id: 159, ticker_id: "X_USDT0", market_type: "spot", name: "Spot 159", symbol: "SPOT159" },
];
const provenance = { source: "nado-archive" as const, reference: "test", retrievedAt: 0 };

describe("buildOverview", () => {
  const overview = buildOverview(snapshots, assets, [provenance]);
  const market = (symbol: string) => overview.markets.find((m) => m.symbol === symbol)!;

  it("takes open interest from the newest snapshot (USDT0, perps only)", () => {
    expect(market("BTC-PERP").openInterest).toBeCloseTo(20_824_733.40828, 4);
    expect(market("SPOT159").openInterest).toBeNull();
    expect(overview.totals.openInterest).toBeCloseTo(35_980_240.57448, 4);
  });

  it("derives window volume and liquidations from cumulative counters", () => {
    expect(market("BTC-PERP").volume24h).toBeCloseTo(12_564_371.259192, 5);
    expect(market("ETH-PERP").volume24h).toBeCloseTo(6_437_738.745286, 5);
    expect(market("SPOT159").volume24h).toBe(0);
    expect(market("ETH-PERP").liquidations24h).toBeCloseTo(1022.71926555, 6);
    expect(market("BTC-PERP").liquidations24h).toBe(0);
  });

  it("excludes the quote asset and reports the window bounds", () => {
    expect(overview.markets.map((m) => m.productId).sort()).toEqual([159, 2, 4]);
    expect(overview.snapshotAt).toBe(1790337598 * 1000);
    expect(overview.windowStart).toBe(1790330399 * 1000);
  });

  it("refuses to compute window metrics from a single snapshot", () => {
    expect(() => buildOverview(snapshots.slice(0, 1), assets, [])).toThrow();
  });
});

describe("buildHistory", () => {
  it("returns oldest-first interval points and drops the baseline snapshot", () => {
    const points = buildHistory(snapshots, new Set(["2", "4"]));
    expect(points.map((p) => p.timestamp)).toEqual([1790333999000, 1790337598000]);
    expect(points[1]!.volume).toBeCloseTo(7_775_442.727583 + 4_427_956.655308, 3);
    expect(points[1]!.liquidations).toBeCloseTo(1022.71926555, 6);
    expect(points[1]!.openInterest).toBeCloseTo(35_980_240.57448, 4);
  });
});

describe("liquidationEvents", () => {
  it("emits one aggregate event per market-interval with liquidations, without tx hashes", () => {
    const events = liquidationEvents(snapshots, assets, provenance);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      protocol: "nado",
      type: "liquidation",
      timestamp: 1790337598000,
      asset: { symbol: "ETH-PERP" },
      metadata: { aggregation: "interval", productId: 4, windowStart: 1790333999000, quote: "USDT0" },
    });
    expect(events[0]!.amountUsd).toBeCloseTo(1022.71926555, 6);
    expect(events[0]!.txHash).toBeUndefined();
  });
});

describe("mergeSnapshotChunks", () => {
  it("merges product maps from chunked requests by position", () => {
    const pick = (s: MarketSnapshot, id: string): MarketSnapshot => ({
      ...s,
      open_interests: id in s.open_interests ? { [id]: s.open_interests[id]! } : {},
      cumulative_volumes: { [id]: s.cumulative_volumes[id]! },
    });
    const merged = mergeSnapshotChunks([snapshots.map((s) => pick(s, "2")), snapshots.map((s) => pick(s, "4"))]);
    expect(merged).toHaveLength(3);
    expect(Object.keys(merged[0]!.cumulative_volumes).sort()).toEqual(["2", "4"]);
    expect(merged[0]!.open_interests["4"]).toBe(snapshots[0]!.open_interests["4"]);
  });
});
