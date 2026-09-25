import type { ProtocolEvent, ProtocolEventType, ProtocolId } from "../domain/types.js";

export type ProtocolInfo = {
  id: ProtocolId;
  name: string;
  category: string;
  description: string;
  sources: Record<string, string>;
  contracts: Record<string, string>;
};

export type EventQuery = {
  limit: number;
  offset: number;
  types?: ProtocolEventType[];
  wallet?: string;
  asset?: string;
};

/**
 * How far back events go. `indexed` = full history from an indexer;
 * `recent-window` = only the last N blocks scanned live over RPC;
 * `time-window` = aggregates over the last N hours at a fixed interval.
 */
export type EventCoverage =
  | { mode: "indexed"; indexer: string; indexedBlock: number | null }
  | { mode: "recent-window"; blocks: number }
  | { mode: "time-window"; hours: number; intervalSeconds: number };

export type EventPage = {
  events: ProtocolEvent[];
  limit: number;
  offset: number;
  hasMore: boolean;
  coverage: EventCoverage;
};

export type IndexerStatus = {
  configured: boolean;
  indexedBlock: number | null;
  indexedAt: number | null;
  hasIndexingErrors: boolean | null;
  error?: string;
};

/** Every protocol integration implements this; the API layer only talks to adapters. */
export interface ProtocolAdapter<TOverview = unknown> {
  info: ProtocolInfo;
  getOverview(): Promise<Freshness<TOverview>>;
  getEvents(query: EventQuery): Promise<Freshness<EventPage>>;
  getIndexerStatus?(): Promise<IndexerStatus>;
}

/** Wraps any payload with cache freshness metadata. */
export type Freshness<T> = { data: T; cachedAt: number; stale: boolean };
