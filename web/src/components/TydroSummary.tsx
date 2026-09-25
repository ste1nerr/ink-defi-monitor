import { useTydroOverview } from "../api/hooks";
import { formatPct, formatUsd } from "../lib/format";
import { Freshness, SourceTag } from "./Freshness";
import { Panel, Stat } from "./Panel";
import { ErrorState, Skeleton } from "./states";

export function TydroSummary({ title = "Tydro · Lending", link }: { title?: string; link?: { to: string; label: string } }) {
  const { data, error, isPending, refetch } = useTydroOverview();

  return (
    <Panel
      title={title}
      link={link}
      meta={
        data && (
          <>
            <SourceTag label="on-chain" href={`https://explorer.inkonchain.com/address/${data.protocol.contracts.protocolDataProvider}`} />
            <span className="num">#{Number(data.data.blockNumber).toLocaleString("en-US")}</span>
            <Freshness at={data.cachedAt} />
          </>
        )
      }
    >
      {isPending ? (
        <div className="grid grid-cols-2 gap-4 p-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <div className="grid grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x">
          <Stat label="Total supplied" value={formatUsd(data.data.totals.suppliedUsd)} hint="Oracle-priced" />
          <Stat label="Total borrowed" value={formatUsd(data.data.totals.borrowedUsd)} />
          <Stat label="Available liquidity" value={formatUsd(data.data.totals.availableUsd)} />
          <Stat
            label="Utilization"
            value={formatPct(data.data.totals.utilization, 1)}
            hint={`${data.data.reserves.length} reserves`}
          />
        </div>
      )}
    </Panel>
  );
}
