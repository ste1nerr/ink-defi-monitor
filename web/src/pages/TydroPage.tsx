import { usePageTitle } from "../lib/usePageTitle";
import { useTydroOverview } from "../api/hooks";
import { EventsPanel } from "../components/EventsPanel";
import { Freshness, SourceTag } from "../components/Freshness";
import { Panel } from "../components/Panel";
import { ReserveTable } from "../components/ReserveTable";
import { TydroHistoryPanel } from "../components/TydroHistoryPanel";
import { TydroSummary } from "../components/TydroSummary";
import { ErrorState, SkeletonRows } from "../components/states";

const EXPLORER = "https://explorer.inkonchain.com/address/";

export function TydroPage() {
  usePageTitle("Tydro");
  const { data, error, isPending, refetch } = useTydroOverview();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Tydro</h1>
          <p className="max-w-2xl text-sm text-muted">
            {data?.protocol.description ?? "Ink-native lending market."} Figures are read directly from the protocol's
            data provider and oracle contracts at the block shown.
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

      <TydroSummary title="Market totals" />

      <TydroHistoryPanel />

      <Panel
        title="Reserves"
        meta={data && <Freshness at={data.cachedAt} />}
      >
        {isPending ? <SkeletonRows rows={8} /> : error ? <ErrorState error={error} onRetry={() => refetch()} /> : <ReserveTable reserves={data.data.reserves} />}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <EventsPanel protocol="tydro" pageSize={25} />
        <Panel title="Contracts">
          <ul className="divide-y divide-line text-sm">
            {data &&
              Object.entries(data.protocol.contracts).map(([name, address]) => (
                <li key={name} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span className="text-muted">{name}</span>
                  <a className="num truncate text-xs hover:text-accent" href={EXPLORER + address} target="_blank" rel="noreferrer">
                    {address.slice(0, 8)}…{address.slice(-6)} ↗
                  </a>
                </li>
              ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
