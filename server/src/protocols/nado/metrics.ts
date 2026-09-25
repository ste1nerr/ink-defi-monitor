import type { DataProvenance, ProtocolEvent } from "../../domain/types.js";
import { fromX18 } from "../../domain/units.js";
import type { MarketSnapshot, NadoAsset } from "./api.js";
import type { NadoHistoryPoint, NadoMarket, NadoOverview } from "./types.js";
import { NADO_QUOTE } from "./types.js";

const x18 = (value: string | undefined | null): number | null =>
  value === undefined || value === null ? null : fromX18(BigInt(value));

/** Positive difference of a cumulative counter; null when the older value is missing. */
function delta(newer: string | undefined, older: string | undefined): number | null {
  if (newer === undefined || older === undefined) return null;
  const d = BigInt(newer) - BigInt(older);
  // Cumulative counters should never decrease; clamp instead of emitting negative activity.
  return fromX18(d > 0n ? d : 0n);
}

const sum = (values: Array<number | null>) => values.reduce<number>((acc, v) => acc + (v ?? 0), 0);

/** Only products with a market type (spot/perp) are markets; product 0 is the quote asset. */
export const tradableAssets = (assets: NadoAsset[]) =>
  assets.filter((a): a is NadoAsset & { market_type: "perp" | "spot" } => a.market_type === "perp" || a.market_type === "spot");

/**
 * @param snapshots newest first; the last element is the reference point ~24h earlier.
 */
export function buildOverview(snapshots: MarketSnapshot[], assets: NadoAsset[], provenance: DataProvenance[]): NadoOverview {
  const latest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];
  if (!latest || !oldest || latest === oldest) throw new Error("Nado overview needs at least two snapshots");

  const markets: NadoMarket[] = tradableAssets(assets).map((asset) => {
    const id = String(asset.product_id);
    const isPerp = asset.market_type === "perp";
    const tradesNow = latest.cumulative_trades[id];
    const tradesThen = oldest.cumulative_trades[id];
    return {
      productId: asset.product_id,
      symbol: asset.symbol,
      name: asset.name,
      type: asset.market_type,
      openInterest: isPerp ? x18(latest.open_interests[id]) : null,
      volume24h: delta(latest.cumulative_volumes[id], oldest.cumulative_volumes[id]),
      liquidations24h: delta(latest.cumulative_liquidation_amounts[id], oldest.cumulative_liquidation_amounts[id]),
      trades24h: tradesNow !== undefined && tradesThen !== undefined ? Math.max(0, tradesNow - tradesThen) : null,
      fundingRate1h: isPerp ? x18(latest.funding_rates[id]) : null,
      oraclePrice: x18(latest.oracle_prices[id]),
    };
  });

  return {
    quote: NADO_QUOTE,
    snapshotAt: latest.timestamp * 1000,
    windowStart: oldest.timestamp * 1000,
    tvl: x18(latest.tvl),
    dailyActiveUsers: latest.daily_active_users,
    cumulativeSubaccounts: latest.cumulative_users,
    totals: {
      openInterest: sum(markets.map((m) => m.openInterest)),
      volume24h: sum(markets.map((m) => m.volume24h)),
      liquidations24h: sum(markets.map((m) => m.liquidations24h)),
      trades24h: sum(markets.map((m) => m.trades24h)),
    },
    markets: markets.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)),
    provenance,
  };
}

/** Converts newest-first snapshots into oldest-first interval points (the oldest snapshot is only a baseline). */
export function buildHistory(snapshots: MarketSnapshot[], perpIds: Set<string>): NadoHistoryPoint[] {
  const ordered = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
  const points: NadoHistoryPoint[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]!;
    const cur = ordered[i]!;
    const ids = Object.keys(cur.cumulative_volumes);
    points.push({
      timestamp: cur.timestamp * 1000,
      openInterest: sum(Object.entries(cur.open_interests).map(([id, v]) => (perpIds.has(id) ? x18(v) : null))),
      volume: sum(ids.map((id) => delta(cur.cumulative_volumes[id], prev.cumulative_volumes[id]))),
      liquidations: sum(ids.map((id) => delta(cur.cumulative_liquidation_amounts[id], prev.cumulative_liquidation_amounts[id]))),
      tvl: x18(cur.tvl),
    });
  }
  return points;
}

/**
 * Hourly liquidation aggregates per market, derived from `cumulative_liquidation_amounts`.
 * Nado's archive does not expose a per-liquidation transaction hash, so these carry no tx link.
 */
export function liquidationEvents(
  snapshots: MarketSnapshot[],
  assets: NadoAsset[],
  provenance: Omit<DataProvenance, "blockNumber" | "txHash">,
): ProtocolEvent[] {
  const symbols = new Map(assets.map((a) => [String(a.product_id), a.symbol]));
  const ordered = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
  const events: ProtocolEvent[] = [];

  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]!;
    const cur = ordered[i]!;
    for (const [id, value] of Object.entries(cur.cumulative_liquidation_amounts)) {
      const amount = delta(value, prev.cumulative_liquidation_amounts[id]);
      if (!amount) continue;
      events.push({
        id: `nado:liquidations:${id}:${cur.timestamp}`,
        protocol: "nado",
        type: "liquidation",
        timestamp: cur.timestamp * 1000,
        asset: { symbol: symbols.get(id) ?? "Unknown" },
        amountUsd: amount,
        metadata: {
          aggregation: "interval",
          productId: Number(id),
          windowStart: prev.timestamp * 1000,
          windowEnd: cur.timestamp * 1000,
          quote: NADO_QUOTE,
        },
        provenance,
      });
    }
  }
  return events.sort((a, b) => b.timestamp - a.timestamp);
}
