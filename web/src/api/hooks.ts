import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { HistoryRange } from "@server/protocols/tydro/types";
import { api, type EventParams } from "./client";

/** Refetch cadence mirrors the server cache TTLs; polling faster would only hit the cache. */
const OVERVIEW_REFRESH_MS = 30_000;
const EVENTS_REFRESH_MS = 15_000;
const HISTORY_REFRESH_MS = 5 * 60_000;

export const useHealth = () =>
  useQuery({ queryKey: ["health"], queryFn: ({ signal }) => api.health(signal), refetchInterval: 15_000 });

export const useTydroOverview = () =>
  useQuery({ queryKey: ["protocol", "tydro"], queryFn: ({ signal }) => api.tydro(signal), refetchInterval: OVERVIEW_REFRESH_MS });

export const useTydroHistory = (range: HistoryRange) =>
  useQuery({
    queryKey: ["history", "tydro", range],
    queryFn: ({ signal }) => api.tydroHistory(range, signal),
    refetchInterval: HISTORY_REFRESH_MS,
    placeholderData: keepPreviousData,
  });

export const useNadoOverview = () =>
  useQuery({ queryKey: ["protocol", "nado"], queryFn: ({ signal }) => api.nado(signal), refetchInterval: 60_000 });

export const useNadoHistory = (range: HistoryRange) =>
  useQuery({
    queryKey: ["history", "nado", range],
    queryFn: ({ signal }) => api.nadoHistory(range, signal),
    refetchInterval: HISTORY_REFRESH_MS,
    placeholderData: keepPreviousData,
  });

/** Server cap for merged timelines: offset + limit ≤ 1000. */
const TIMELINE_WINDOW = 1000;

type FeedParams = Omit<EventParams, "offset"> & { protocols?: string[] };

/** Append-style event feed: each page continues where the previous one ended. */
export const useEventFeed = (protocol: string | undefined, params: FeedParams) =>
  useInfiniteQuery({
    queryKey: ["feed", protocol ?? "all", params],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const page = { ...params, offset: pageParam };
      if (protocol) {
        const r = await api.protocolEvents(protocol, page, signal);
        return { events: r.data.events, hasMore: r.data.hasMore, cachedAt: r.cachedAt, sources: { [protocol]: { coverage: r.data.coverage, cachedAt: r.cachedAt } } };
      }
      const r = await api.timeline(page, signal);
      return { events: r.data.events, hasMore: r.data.hasMore, cachedAt: r.cachedAt, sources: r.data.sources };
    },
    getNextPageParam: (last, pages) => {
      const next = pages.length * params.limit;
      if (!last.hasMore) return undefined;
      if (!protocol && next + params.limit > TIMELINE_WINDOW) return undefined;
      return next;
    },
    refetchInterval: EVENTS_REFRESH_MS,
  });
