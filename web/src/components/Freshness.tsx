import { useEffect, useState } from "react";
import { formatDateTime, timeAgo } from "../lib/format";

/**
 * Default age at which data is flagged stale. The server's `stale` flag only means a background refresh
 * is running; if refreshes keep failing, `cachedAt` stops moving and the age crosses the threshold.
 * Slow-moving sources (hourly snapshots) pass a longer `staleAfterMs`.
 */
const DEFAULT_STALE_AFTER_MS = 2 * 60_000;

function useNow(intervalMs = 5_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function Freshness({ at, staleAfterMs = DEFAULT_STALE_AFTER_MS }: { at: number; staleAfterMs?: number }) {
  const now = useNow();
  const isStale = now - at > staleAfterMs;
  return (
    <span className="inline-flex items-center gap-1.5" title={`Retrieved ${formatDateTime(at)}`}>
      <span className={`size-1.5 rounded-full ${isStale ? "bg-warn" : "bg-up"}`} aria-hidden />
      <span className={isStale ? "text-warn" : undefined}>
        {isStale ? "Stale · " : ""}
        {timeAgo(at, now)}
      </span>
    </span>
  );
}

export function SourceTag({ label, href }: { label: string; href?: string }) {
  const content = <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px]">{label}</span>;
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="hover:text-accent" title="Data source">
      {content}
    </a>
  ) : (
    content
  );
}
