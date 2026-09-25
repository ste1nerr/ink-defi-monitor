import type { ProtocolEvent } from "./types.js";

/**
 * Merges newest-first event lists from several protocols into one newest-first page.
 * Each input must contain at least its first `offset + limit` events (or all it has) for the page to be exact.
 */
export function mergeTimeline(
  sources: Array<{ events: ProtocolEvent[]; hasMore: boolean }>,
  offset: number,
  limit: number,
): { events: ProtocolEvent[]; hasMore: boolean } {
  const merged = sources
    .flatMap((s) => s.events)
    // Stable tiebreak on id so pagination is deterministic for events in the same second.
    .sort((a, b) => b.timestamp - a.timestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    events: merged.slice(offset, offset + limit),
    hasMore: merged.length > offset + limit || sources.some((s) => s.hasMore),
  };
}
