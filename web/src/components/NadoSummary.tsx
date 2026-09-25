import { useNadoOverview } from "../api/hooks";
import { formatCount, formatUsd } from "../lib/format";
import { Freshness, SourceTag } from "./Freshness";
import { Panel, Stat } from "./Panel";
import { ErrorState, Skeleton } from "./states";

export function NadoSummary({ title = "Nado · Perps & spot", link }: { title?: string; link?: { to: string; label: string } }) {
  const { data, error, isPending, refetch } = useNadoOverview();

  return (
    <Panel
      title={title}
      link={link}
      meta={
        data && (
          <>
            <SourceTag label="nado archive" href={data.protocol.sources.archive} />
            <span>{data.data.quote}-denominated</span>
            <Freshness at={data.cachedAt} staleAfterMs={5 * 60_000} />
          </>
        )
      }
    >
      {isPending ? (
        <div className="grid grid-cols-2 gap-4 p-4 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <div className="grid grid-cols-2 divide-line lg:grid-cols-5 lg:divide-x">
          <Stat label="Open interest" value={formatUsd(data.data.totals.openInterest)} hint="Perps, notional" />
          <Stat label="Volume 24h" value={formatUsd(data.data.totals.volume24h)} hint={`${formatCount(data.data.totals.trades24h)} trades`} />
          <Stat label="Liquidations 24h" value={formatUsd(data.data.totals.liquidations24h)} />
          <Stat label="TVL" value={formatUsd(data.data.tvl)} />
          <Stat
            label="Daily active"
            value={formatCount(data.data.dailyActiveUsers)}
            hint={`${formatCount(data.data.cumulativeSubaccounts)} subaccounts total`}
          />
        </div>
      )}
    </Panel>
  );
}
