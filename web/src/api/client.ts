import type { ProtocolEventType } from "@server/domain/types";
import type { HistoryRange, TydroHistory, TydroReservesSnapshot } from "@server/protocols/tydro/types";
import type { NadoHistory, NadoOverview } from "@server/protocols/nado/types";
import type { EventCoverage, EventPage, Freshness, IndexerStatus, ProtocolInfo } from "@server/protocols/types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status);
  return body as T;
}

export type Health = {
  status: "ok" | "degraded";
  chainId: number;
  rpc: { source: string; latencyMs: number };
  latestBlock: { number: string; timestamp: number };
  protocols: string[];
  indexers: Record<string, IndexerStatus | null>;
};

export type EventParams = {
  limit: number;
  offset: number;
  types?: ProtocolEventType[];
  wallet?: string;
  asset?: string;
};

function eventSearch({ limit, offset, types, wallet, asset, protocols }: EventParams & { protocols?: string[] }): string {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (protocols?.length) params.set("protocol", protocols.join(","));
  if (types?.length) params.set("type", types.join(","));
  if (wallet) params.set("wallet", wallet);
  if (asset) params.set("asset", asset);
  return params.toString();
}

export type TimelinePage = {
  events: EventPage["events"];
  hasMore: boolean;
  limit: number;
  offset: number;
  sources: Record<string, { coverage: EventCoverage; cachedAt: number } | { error: string }>;
};

export type ProtocolOverview<T> = Freshness<T> & { protocol: ProtocolInfo };

export const api = {
  health: (signal?: AbortSignal) => getJson<Health>("/health", signal),
  tydro: (signal?: AbortSignal) => getJson<ProtocolOverview<TydroReservesSnapshot>>("/protocols/tydro", signal),
  protocolEvents: (protocol: string, params: EventParams, signal?: AbortSignal) =>
    getJson<Freshness<EventPage>>(`/protocols/${protocol}/events?${eventSearch(params)}`, signal),
  tydroHistory: (range: HistoryRange, signal?: AbortSignal) =>
    getJson<Freshness<TydroHistory>>(`/protocols/tydro/history?range=${range}`, signal),
  nado: (signal?: AbortSignal) => getJson<ProtocolOverview<NadoOverview>>("/protocols/nado", signal),
  nadoHistory: (range: HistoryRange, signal?: AbortSignal) =>
    getJson<Freshness<NadoHistory>>(`/protocols/nado/history?range=${range}`, signal),
  timeline: (params: EventParams & { protocols?: string[] }, signal?: AbortSignal) =>
    getJson<Freshness<TimelinePage>>(`/events?${eventSearch(params)}`, signal),
};
