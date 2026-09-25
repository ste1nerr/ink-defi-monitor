import { useMemo, useState } from "react";
import type { ProtocolEvent, ProtocolEventType } from "@server/domain/types";
import type { EventCoverage } from "@server/protocols/types";
import { useEventFeed } from "../api/hooks";
import { EventList } from "./EventList";
import { Freshness, SourceTag } from "./Freshness";
import { Panel } from "./Panel";
import { EmptyState, ErrorState, SkeletonRows } from "./states";

const TYPE_FILTERS: Array<{ label: string; types?: ProtocolEventType[] }> = [
  { label: "All" },
  { label: "Supply", types: ["supply"] },
  { label: "Withdraw", types: ["withdraw"] },
  { label: "Borrow", types: ["borrow"] },
  { label: "Repay", types: ["repay"] },
  { label: "Liquidations", types: ["liquidation"] },
];

const PROTOCOL_FILTERS: Array<{ label: string; protocols?: string[] }> = [
  { label: "All protocols" },
  { label: "Tydro", protocols: ["tydro"] },
  { label: "Nado", protocols: ["nado"] },
];

export function coverageLabel(coverage: EventCoverage): string {
  switch (coverage.mode) {
    case "indexed":
      return `full history · ${coverage.indexer}${coverage.indexedBlock ? ` @ #${coverage.indexedBlock.toLocaleString("en-US")}` : ""}`;
    case "recent-window":
      return `last ${coverage.blocks.toLocaleString("en-US")} blocks (~${Math.round(coverage.blocks / 60)} min)`;
    case "time-window":
      return `last ${coverage.hours}h · ${coverage.intervalSeconds / 3600}h aggregates`;
  }
}

function FilterBar<T extends { label: string }>({
  options,
  value,
  onChange,
  label,
}: {
  options: T[];
  value: number;
  onChange: (index: number) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="toolbar" aria-label={label}>
      {options.map((option, i) => (
        <button
          key={option.label}
          aria-pressed={value === i}
          onClick={() => onChange(i)}
          className={`rounded px-2 py-0.5 text-xs ${value === i ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Event feed for one protocol (`protocol` set) or the merged cross-protocol timeline (`protocol` omitted). */
export function EventsPanel({
  protocol,
  pageSize = 25,
  title = "Events",
  filters = true,
  link,
}: {
  link?: { to: string; label: string };
  protocol?: string;
  pageSize?: number;
  title?: string;
  filters?: boolean;
}) {
  const [typeIndex, setTypeIndex] = useState(0);
  const [protocolIndex, setProtocolIndex] = useState(0);
  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } = useEventFeed(protocol, {
    limit: pageSize,
    types: TYPE_FILTERS[typeIndex]!.types,
    protocols: protocol ? undefined : PROTOCOL_FILTERS[protocolIndex]!.protocols,
  });

  const result = useMemo(() => {
    if (!data) return undefined;
    // New events arriving between page loads shift offsets; drop the resulting duplicates.
    const seen = new Set<string>();
    const events: ProtocolEvent[] = [];
    for (const page of data.pages) {
      for (const event of page.events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        events.push(event);
      }
    }
    const first = data.pages[0]!;
    const meta = Object.entries(first.sources).map(([p, s]) =>
      "error" in s ? { protocol: p, error: s.error } : { protocol: protocol ? undefined : p, coverage: s.coverage },
    );
    return { events, cachedAt: first.cachedAt, meta };
  }, [data, protocol]);

  return (
    <Panel title={title} link={link} meta={result && <Freshness at={result.cachedAt} staleAfterMs={10 * 60_000} />}>
      {result && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-xs text-faint">
          {result.meta.map((m, i) => (
            <span key={m.protocol ?? i} className="flex items-center gap-1.5">
              {m.protocol && <span className="capitalize text-muted">{m.protocol}</span>}
              {m.coverage ? (
                <>
                  <SourceTag label={m.coverage.mode === "indexed" ? "goldsky" : m.coverage.mode === "time-window" ? "nado archive" : "rpc logs"} />
                  {coverageLabel(m.coverage)}
                </>
              ) : (
                <span className="text-warn">{m.error}</span>
              )}
            </span>
          ))}
        </div>
      )}
      {filters && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2">
          {protocol === undefined && (
            <FilterBar
              label="Protocol filter"
              options={PROTOCOL_FILTERS}
              value={protocolIndex}
                onChange={setProtocolIndex}
            />
          )}
          <FilterBar
            label="Event type filter"
            options={TYPE_FILTERS}
            value={typeIndex}
            onChange={setTypeIndex}
          />
        </div>
      )}
      {isPending ? (
        <SkeletonRows />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !result || result.events.length === 0 ? (
        <EmptyState>No matching events in the covered range.</EmptyState>
      ) : (
        <>
          <EventList events={result.events} />
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-faint">
            <span className="num">Showing {result.events.length} events</span>
            {hasNextPage ? (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="rounded border border-line px-3 py-1.5 text-fg hover:border-accent hover:text-accent disabled:opacity-60"
              >
                {isFetchingNextPage ? "Loading…" : `Load ${pageSize} more`}
              </button>
            ) : (
              <span>End of covered range</span>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
