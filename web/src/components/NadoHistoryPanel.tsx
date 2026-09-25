import { useState } from "react";
import type { HistoryRange } from "@server/protocols/tydro/types";
import { useNadoHistory } from "../api/hooks";
import { formatDateTime, formatUsd } from "../lib/format";
import { Freshness, SourceTag } from "./Freshness";
import { Panel } from "./Panel";
import { RangePicker } from "./RangePicker";
import { EmptyState, ErrorState, Skeleton } from "./states";
import { Legend, TimeSeriesChart, type Series } from "./TimeSeriesChart";

// Dataviz categorical slots 1–2 (dark steps), validated on the panel surface #11141b.
const SLOT_1 = "#3987e5";
const SLOT_2 = "#d95926";

const intervalLabel = (seconds: number) => (seconds % 86_400 === 0 ? `${seconds / 86_400}d` : `${seconds / 3600}h`);

export function NadoHistoryPanel() {
  const [range, setRange] = useState<HistoryRange>("7d");
  const [showTable, setShowTable] = useState(false);
  const { data, error, isPending, isFetching, refetch } = useNadoHistory(range);

  const points = data?.data.points ?? [];
  const timestamps = points.map((p) => p.timestamp);
  const interval = data ? intervalLabel(data.data.granularitySeconds) : "";
  const oiSeries: Series[] = [{ key: "oi", label: "Open interest", color: SLOT_1, values: points.map((p) => p.openInterest) }];
  const flowSeries: Series[] = [
    { key: "volume", label: `Volume per ${interval}`, color: SLOT_1, values: points.map((p) => p.volume) },
  ];
  const liqSeries: Series[] = [
    { key: "liq", label: `Liquidations per ${interval}`, color: SLOT_2, values: points.map((p) => p.liquidations) },
  ];

  return (
    <Panel
      title="History"
      meta={
        <>
          <RangePicker value={range} onChange={setRange} />
          {data && (
            <>
              <SourceTag label={`nado archive · ${interval} snapshots`} />
              <Freshness at={data.cachedAt} staleAfterMs={30 * 60_000} />
            </>
          )}
        </>
      }
    >
      {isPending ? (
        <div className="grid gap-4 p-4 lg:grid-cols-3">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : points.length < 2 ? (
        <EmptyState>Not enough snapshots in this range.</EmptyState>
      ) : (
        <div className={`p-4 transition-opacity ${isFetching ? "opacity-60" : ""}`}>
          <div className="grid gap-6 lg:grid-cols-3">
            {[
              { title: `Open interest (${data.data.quote})`, series: oiSeries },
              { title: `Volume per ${interval} (${data.data.quote})`, series: flowSeries },
              { title: `Liquidations per ${interval} (${data.data.quote})`, series: liqSeries },
            ].map((chart) => (
              <figure key={chart.title} className="min-w-0">
                <figcaption className="mb-2 flex items-center justify-between gap-2 text-sm">
                  {chart.title}
                  {chart.series.length > 1 && <Legend series={chart.series} />}
                </figcaption>
                <TimeSeriesChart
                  timestamps={timestamps}
                  series={chart.series}
                  formatValue={(v) => formatUsd(v)}
                  ariaLabel={`Nado ${chart.title}, ${range}`}
                />
              </figure>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-faint">
            <span>
              {points.length} intervals · volume and liquidations are differences of Nado's cumulative counters between snapshots
            </span>
            <button onClick={() => setShowTable((v) => !v)} className="text-muted underline-offset-2 hover:text-fg hover:underline">
              {showTable ? "Hide table" : "Show table"}
            </button>
          </div>
          {showTable && (
            <div className="mt-3 max-h-72 overflow-auto rounded border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-panel-2 text-left text-muted">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Interval end</th>
                    <th className="px-3 py-1.5 text-right font-medium">Open interest</th>
                    <th className="px-3 py-1.5 text-right font-medium">Volume</th>
                    <th className="px-3 py-1.5 text-right font-medium">Liquidations</th>
                    <th className="px-3 py-1.5 text-right font-medium">TVL</th>
                  </tr>
                </thead>
                <tbody className="num divide-y divide-line">
                  {[...points].reverse().map((p) => (
                    <tr key={p.timestamp}>
                      <td className="px-3 py-1.5">{formatDateTime(p.timestamp)}</td>
                      <td className="px-3 py-1.5 text-right">{formatUsd(p.openInterest, false)}</td>
                      <td className="px-3 py-1.5 text-right">{formatUsd(p.volume, false)}</td>
                      <td className="px-3 py-1.5 text-right">{formatUsd(p.liquidations, false)}</td>
                      <td className="px-3 py-1.5 text-right">{formatUsd(p.tvl, false)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
