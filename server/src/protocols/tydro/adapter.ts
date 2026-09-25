import { getAddress, type Address } from "viem";
import { env } from "../../config/env.js";
import { cache } from "../../data/cache.js";
import { getSubgraphMeta } from "../../data/goldsky.js";
import { getBlockTimestamps, getLogsChunked, rpc, rpcSource } from "../../data/rpc.js";
import type { ProtocolEvent } from "../../domain/types.js";
import { IndexerNotConfiguredError, QueryError } from "../errors.js";
import type { EventPage, EventQuery, Freshness, IndexerStatus, ProtocolAdapter } from "../types.js";
import { TYDRO_CONTRACTS, TYDRO_SOURCES } from "./contracts.js";
import { normalizeTydroLogs, type ReserveInfo } from "./events.js";
import { readReserves } from "./reserves.js";
import {
  aggregateSnapshots,
  fetchPoolEvents,
  fetchSnapshots,
  HISTORY_RANGE_SECONDS,
  mapPoolEvent,
  MAX_EVENT_SKIP,
} from "./subgraph.js";
import type { HistoryRange, TydroHistory, TydroReservesSnapshot } from "./types.js";

const OVERVIEW_TTL_MS = 30_000;
const EVENTS_TTL_MS = 15_000;
const HISTORY_TTL_MS = 5 * 60_000;
const META_TTL_MS = 30_000;
/** Snapshot cadence configured in indexer/tydro/subgraph.yaml. */
const SNAPSHOT_INTERVAL_BLOCKS = 3600;
/** Live-scan window when no indexer is configured (~1s blocks → ~50 minutes). */
const RECENT_EVENTS_BLOCKS = 3_000;

const fresh = <T>(r: { value: T; storedAt: number; stale: boolean }): Freshness<T> => ({
  data: r.value,
  cachedAt: r.storedAt,
  stale: r.stale,
});

const getReserves = () => cache.get("tydro:reserves", readReserves, { ttlMs: OVERVIEW_TTL_MS });

async function currentPrices(): Promise<Map<Address, number>> {
  const { value } = await getReserves();
  return new Map(value.reserves.map((r) => [getAddress(r.asset), r.priceUsd]));
}

function reserveIndex(snapshot: TydroReservesSnapshot): Map<Address, ReserveInfo> {
  return new Map(snapshot.reserves.map((r) => [getAddress(r.asset), r]));
}

// --- Recent-window mode (no indexer) ---

async function loadRecentEvents(): Promise<ProtocolEvent[]> {
  const [{ value: snapshot }, latest] = await Promise.all([getReserves(), rpc.getBlockNumber()]);
  const logs = await getLogsChunked({
    address: TYDRO_CONTRACTS.pool,
    fromBlock: latest - BigInt(RECENT_EVENTS_BLOCKS) + 1n,
    toBlock: latest,
  });
  const timestamps = await getBlockTimestamps(logs.flatMap((l) => (l.blockNumber === null ? [] : [l.blockNumber])));
  const byAsset = reserveIndex(snapshot);
  return normalizeTydroLogs(logs, timestamps, (asset) => byAsset.get(getAddress(asset)), {
    source: rpcSource(),
    reference: TYDRO_CONTRACTS.pool,
    retrievedAt: Date.now(),
  });
}

function recentWindowPage(all: ProtocolEvent[], query: EventQuery): EventPage {
  const wallet = query.wallet?.toLowerCase();
  const asset = query.asset?.toLowerCase();
  const filtered = all.filter(
    (e) =>
      (!query.types?.length || query.types.includes(e.type)) &&
      (!wallet || e.wallet?.toLowerCase() === wallet) &&
      (!asset || e.asset?.address?.toLowerCase() === asset),
  );
  return {
    events: filtered.slice(query.offset, query.offset + query.limit),
    limit: query.limit,
    offset: query.offset,
    hasMore: filtered.length > query.offset + query.limit,
    coverage: { mode: "recent-window", blocks: RECENT_EVENTS_BLOCKS },
  };
}

// --- Indexed mode (Goldsky subgraph) ---

const getMeta = (url: string) => cache.get("tydro:subgraph:meta", () => getSubgraphMeta(url), { ttlMs: META_TTL_MS });

async function indexedPage(url: string, query: EventQuery): Promise<EventPage> {
  if (query.offset + query.limit > MAX_EVENT_SKIP) {
    throw new QueryError(`offset + limit must be ≤ ${MAX_EVENT_SKIP}; narrow the query with filters`);
  }
  // Fetch one extra row to know whether another page exists.
  const [rows, prices, meta] = await Promise.all([
    fetchPoolEvents(url, { ...query, first: query.limit + 1, skip: query.offset }),
    currentPrices(),
    getMeta(url).catch(() => undefined),
  ]);
  const provenance = { source: "goldsky" as const, reference: "indexer/tydro subgraph", retrievedAt: Date.now() };
  return {
    events: rows.slice(0, query.limit).map((row) => mapPoolEvent(row, (a) => prices.get(getAddress(a)), provenance)),
    limit: query.limit,
    offset: query.offset,
    hasMore: rows.length > query.limit,
    coverage: { mode: "indexed", indexer: "goldsky", indexedBlock: meta?.value.block.number ?? null },
  };
}

// --- Public API ---

export async function getTydroHistory(range: HistoryRange, asset?: string): Promise<Freshness<TydroHistory>> {
  const url = env.goldskyTydroUrl;
  if (!url) throw new IndexerNotConfiguredError("Tydro history requires the Goldsky indexer (GOLDSKY_TYDRO_URL)");
  const key = `tydro:history:${range}:${asset?.toLowerCase() ?? "all"}`;
  const result = await cache.get(
    key,
    async (): Promise<TydroHistory> => {
      const from = Math.floor(Date.now() / 1000) - HISTORY_RANGE_SECONDS[range];
      const rows = await fetchSnapshots(url, from, asset);
      return {
        range,
        asset: asset ? getAddress(asset) : null,
        intervalBlocks: SNAPSHOT_INTERVAL_BLOCKS,
        points: aggregateSnapshots(rows),
        provenance: { source: "goldsky", reference: "indexer/tydro ReserveSnapshot", retrievedAt: Date.now() },
      };
    },
    { ttlMs: HISTORY_TTL_MS },
  );
  return fresh(result);
}

export const tydroAdapter: ProtocolAdapter<TydroReservesSnapshot> = {
  info: {
    id: "tydro",
    name: "Tydro",
    category: "Lending",
    description: "Ink-native lending market; a white-label deployment of Aave v3.",
    sources: TYDRO_SOURCES,
    contracts: TYDRO_CONTRACTS,
  },

  async getOverview() {
    return fresh(await getReserves());
  },

  async getEvents(query) {
    const url = env.goldskyTydroUrl;
    if (!url) {
      const recent = await cache.get("tydro:events:recent", loadRecentEvents, { ttlMs: EVENTS_TTL_MS });
      return { data: recentWindowPage(recent.value, query), cachedAt: recent.storedAt, stale: recent.stale };
    }
    const key = `tydro:events:${JSON.stringify(query)}`;
    return fresh(await cache.get(key, () => indexedPage(url, query), { ttlMs: EVENTS_TTL_MS }));
  },

  async getIndexerStatus(): Promise<IndexerStatus> {
    const url = env.goldskyTydroUrl;
    if (!url) return { configured: false, indexedBlock: null, indexedAt: null, hasIndexingErrors: null };
    try {
      const { value } = await getMeta(url);
      return {
        configured: true,
        indexedBlock: value.block.number,
        indexedAt: value.block.timestamp ? value.block.timestamp * 1000 : null,
        hasIndexingErrors: value.hasIndexingErrors,
      };
    } catch (error) {
      return { configured: true, indexedBlock: null, indexedAt: null, hasIndexingErrors: null, error: (error as Error).message };
    }
  },
};
