import { usePageTitle } from "../lib/usePageTitle";
import { useNadoOverview } from "../api/hooks";
import { EventsPanel } from "../components/EventsPanel";
import { Freshness, SourceTag } from "../components/Freshness";
import { NadoHistoryPanel } from "../components/NadoHistoryPanel";
import { NadoMarketsTable } from "../components/NadoMarketsTable";
import { NadoSummary } from "../components/NadoSummary";
import { Panel } from "../components/Panel";
import { ErrorState, SkeletonRows } from "../components/states";

export function NadoPage() {
  usePageTitle("Nado");
  const { data, error, isPending, refetch } = useNadoOverview();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Nado</h1>
          <p className="max-w-2xl text-sm text-muted">
            {data?.protocol.description ?? "Ink-native orderbook exchange."} Figures come from Nado's public archive
            (indexer) API; 24h values are differences of its cumulative counters.
          </p>
        </div>
        {data && (
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            {Object.entries(data.protocol.sources).map(([label, href]) => (
              <SourceTag key={label} label={label} href={href} />
            ))}
          </div>
        )}
      </div>

      <NadoSummary title="Exchange totals" />
      <NadoHistoryPanel />

      <Panel title="Markets" meta={data && <Freshness at={data.cachedAt} staleAfterMs={5 * 60_000} />}>
        {isPending ? <SkeletonRows rows={10} /> : error ? <ErrorState error={error} onRetry={() => refetch()} /> : <NadoMarketsTable markets={data.data.markets} />}
      </Panel>

      <EventsPanel protocol="nado" pageSize={25} title="Liquidations" filters={false} />
    </div>
  );
}
