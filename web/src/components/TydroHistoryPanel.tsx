import { useState } from "react";
import type { HistoryRange } from "@server/protocols/tydro/types";
import { ApiError } from "../api/client";
import { useTydroHistory } from "../api/hooks";
import { formatDateTime, formatPct, formatUsd } from "../lib/format";
import { Freshness, SourceTag } from "./Freshness";
import { Panel } from "./Panel";
import { RangePicker } from "./RangePicker";
import { EmptyState, ErrorState, Skeleton } from "./states";
import { Legend, TimeSeriesChart, type Series } from "./TimeSeriesChart";

// Dataviz categorical slots 1–2 (dark steps), validated on the panel surface #11141b.
const SUPPLIED_COLOR = "#3987e5";
const BORROWED_COLOR = "#d95926";

export function TydroHistoryPanel() {
  const [range, setRange] = useState<HistoryRange>("7d");
  const [showTable, setShowTable] = useState(false);
  const { data, error, isPending, isFetching, refetch } = useTydroHistory(range);

  const indexerMissing = error instanceof ApiError && error.status === 503;
  const points = data?.data.points ?? [];
  const timestamps = points.map((p) => p.timestamp);
  const valueSeries: Series[] = [
    { key: "supplied", label: "Supplied", color: SUPPLIED_COLOR, values: points.map((p) => p.suppliedUsd) },
    { key: "borrowed", label: "Borrowed", color: BORROWED_COLOR, values: points.map((p) => p.borrowedUsd) },
  ];
  const utilizationSeries: Series[] = [
    { key: "utilization", label: "Utilization", color: SUPPLIED_COLOR, values: points.map((p) => p.utilization) },
  ];
  const unpriced = Math.max(0, ...points.map((p) => p.unpricedReserves));

  return (
    <Panel
      title="History"
      meta={
        <>
          {!indexerMissing && <RangePicker value={range} onChange={setRange} />}
          {data && (
            <>
              <SourceTag label="goldsky · hourly snapshots" />
              <Freshness at={data.cachedAt} staleAfterMs={20 * 60_000} />
            </>
          )}
        </>
      }
    >
      {indexerMissing ? (
        <EmptyState>Historical data needs the Tydro Goldsky indexer, which is not configured on this deployment.</EmptyState>
      ) : isPending ? (
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : points.length < 2 ? (
        <EmptyState>Not enough snapshots in this range yet (one is taken about every hour).</EmptyState>
      ) : (
        <div className={`p-4 transition-opacity ${isFetching ? "opacity-60" : ""}`}>
          <div className="grid gap-6 lg:grid-cols-2">
            <figure className="min-w-0">
              <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">Supplied and borrowed (USD)</span>
                <Legend series={valueSeries} />
              </figcaption>
              <TimeSeriesChart
                timestamps={timestamps}
                series={valueSeries}
                formatValue={(v) => formatUsd(v)}
                ariaLabel={`Tydro supplied and borrowed USD, ${range}`}
              />
            </figure>
            <figure className="min-w-0">
              <figcaption className="mb-2 text-sm">Market utilization</figcaption>
              <TimeSeriesChart
                timestamps={timestamps}
                series={utilizationSeries}
                formatValue={(v) => formatPct(v, 1)}
                formatTick={(v) => formatPct(v, 0)}
                ariaLabel={`Tydro utilization, ${range}`}
              />
            </figure>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-faint">
            <span>
              {points.length} snapshots · every {data.data.intervalBlocks.toLocaleString("en-US")} blocks · USD via TydroOracle at each
              snapshot block
              {unpriced > 0 && <span className="text-warn"> · {unpriced} reserve(s) without a price excluded</span>}
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
                    <th className="px-3 py-1.5 font-medium">Time</th>
                    <th className="px-3 py-1.5 font-medium">Block</th>
                    <th className="px-3 py-1.5 text-right font-medium">Supplied</th>
                    <th className="px-3 py-1.5 text-right font-medium">Borrowed</th>
                    <th className="px-3 py-1.5 text-right font-medium">Utilization</th>
                  </tr>
                </thead>
                <tbody className="num divide-y divide-line">
                  {[...points].reverse().map((p) => (
                    <tr key={p.blockNumber}>
                      <td className="px-3 py-1.5">{formatDateTime(p.timestamp)}</td>
                      <td className="px-3 py-1.5 text-muted">{p.blockNumber}</td>
                      <td className="px-3 py-1.5 text-right">{formatUsd(p.suppliedUsd, false)}</td>
                      <td className="px-3 py-1.5 text-right">{formatUsd(p.borrowedUsd, false)}</td>
                      <td className="px-3 py-1.5 text-right">{formatPct(p.utilization)}</td>
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
