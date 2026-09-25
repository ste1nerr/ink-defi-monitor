import { cache } from "../../data/cache.js";
import type { ProtocolEvent } from "../../domain/types.js";
import { QueryError } from "../errors.js";
import type { EventQuery, Freshness, ProtocolAdapter } from "../types.js";
import { fetchAssets, fetchMarketSnapshots, NADO_ARCHIVE_URL, NADO_ASSETS_URL, type MarketSnapshot } from "./api.js";
import { buildHistory, buildOverview, liquidationEvents, tradableAssets } from "./metrics.js";
import type { NadoHistory, NadoHistoryRange, NadoOverview } from "./types.js";
import { NADO_QUOTE } from "./types.js";

const ASSETS_TTL_MS = 60 * 60_000;
const DAY_TTL_MS = 60_000;
const ALIGNED_TTL_MS = 5 * 60_000;
const HISTORY_TTL_MS = 10 * 60_000;
const HOUR = 3600;
const DAY = 86_400;

/** `count` = number of intervals. With `max_time` set the API returns exactly `interval.count` snapshots, so we request count + 1 (the oldest is the baseline). */
const HISTORY_INTERVALS: Record<NadoHistoryRange, { count: number; granularity: number }> = {
  "24h": { count: 24, granularity: HOUR },
  "7d": { count: 28, granularity: 6 * HOUR },
  "30d": { count: 30, granularity: DAY },
  "90d": { count: 90, granularity: DAY },
};

const fresh = <T>(r: { value: T; storedAt: number; stale: boolean }): Freshness<T> => ({
  data: r.value,
  cachedAt: r.storedAt,
  stale: r.stale,
});

const getAssets = () => cache.get("nado:assets", fetchAssets, { ttlMs: ASSETS_TTL_MS });

async function loadSnapshots(count: number, granularity: number, alignToHour = false): Promise<MarketSnapshot[]> {
  const { value: assets } = await getAssets();
  const now = Math.floor(Date.now() / 1000);
  return fetchMarketSnapshots({
    count: count + 1,
    granularity,
    maxTime: alignToHour ? now - (now % HOUR) : now,
    productIds: tradableAssets(assets).map((a) => a.product_id),
  });
}

/** Last 24h of hourly snapshots ending now; shared by the overview and 24h history. */
const getDaySnapshots = () =>
  cache.get("nado:snapshots:24h", () => loadSnapshots(HISTORY_INTERVALS["24h"].count, HOUR), { ttlMs: DAY_TTL_MS });

/**
 * Same window ending at the last full hour. Liquidation events use it so each event covers a fixed
 * clock-hour bucket and keeps a stable id across refreshes.
 */
const getAlignedDaySnapshots = () =>
  cache.get("nado:snapshots:24h:aligned", () => loadSnapshots(HISTORY_INTERVALS["24h"].count, HOUR, true), {
    ttlMs: ALIGNED_TTL_MS,
  });

const archiveProvenance = () => ({ source: "nado-archive" as const, reference: NADO_ARCHIVE_URL, retrievedAt: Date.now() });

export async function getNadoHistory(range: NadoHistoryRange): Promise<Freshness<NadoHistory>> {
  const { count, granularity } = HISTORY_INTERVALS[range];
  const result = await cache.get(
    `nado:history:${range}`,
    async (): Promise<NadoHistory> => {
      const [{ value: assets }, snapshots] = await Promise.all([
        getAssets(),
        range === "24h" ? getDaySnapshots().then((r) => r.value) : loadSnapshots(count, granularity),
      ]);
      const perpIds = new Set(assets.filter((a) => a.market_type === "perp").map((a) => String(a.product_id)));
      return {
        range,
        quote: NADO_QUOTE,
        granularitySeconds: granularity,
        points: buildHistory(snapshots, perpIds),
        provenance: archiveProvenance(),
      };
    },
    { ttlMs: HISTORY_TTL_MS },
  );
  return fresh(result);
}

async function loadEvents(): Promise<ProtocolEvent[]> {
  const [{ value: assets }, { value: snapshots }] = await Promise.all([getAssets(), getAlignedDaySnapshots()]);
  return liquidationEvents(snapshots, assets, archiveProvenance());
}

export const nadoAdapter: ProtocolAdapter<NadoOverview> = {
  info: {
    id: "nado",
    name: "Nado",
    category: "Perps & spot CLOB",
    description: "Ink-native central-limit-orderbook exchange for perpetuals and spot, run by an off-chain sequencer.",
    sources: {
      docs: "https://docs.nado.xyz",
      archive: "https://docs.nado.xyz/developer-resources/api/archive-indexer",
      app: "https://app.nado.xyz",
    },
    contracts: { endpoint: "0x05ec92d78ed421f3d3ada77ffde167106565974e" },
  },

  async getOverview() {
    const result = await cache.get(
      "nado:overview",
      async () => {
        const [{ value: assets }, { value: snapshots }] = await Promise.all([getAssets(), getDaySnapshots()]);
        return buildOverview(snapshots, assets, [
          { ...archiveProvenance(), reference: `${NADO_ARCHIVE_URL} market_snapshots` },
          { source: "nado-gateway", reference: NADO_ASSETS_URL, retrievedAt: Date.now() },
        ]);
      },
      { ttlMs: DAY_TTL_MS },
    );
    return fresh(result);
  },

  async getEvents(query: EventQuery) {
    if (query.wallet) throw new QueryError("Nado events are market-level aggregates; wallet filtering is not supported yet");
    if (query.asset) throw new QueryError("Nado events cannot be filtered by token address");
    const result = await cache.get("nado:events", loadEvents, { ttlMs: DAY_TTL_MS });
    const filtered = query.types?.length ? result.value.filter((e) => query.types!.includes(e.type)) : result.value;
    return {
      data: {
        events: filtered.slice(query.offset, query.offset + query.limit),
        limit: query.limit,
        offset: query.offset,
        hasMore: filtered.length > query.offset + query.limit,
        coverage: { mode: "time-window", hours: 24, intervalSeconds: HOUR },
      },
      cachedAt: result.storedAt,
      stale: result.stale,
    };
  },
};
