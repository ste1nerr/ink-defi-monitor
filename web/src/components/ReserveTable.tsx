import type { TydroReserve } from "@server/protocols/tydro/types";
import { formatPct, formatPrice, formatToken, formatUsd } from "../lib/format";

function UtilizationBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-faint">—</span>;
  const tone = value >= 0.9 ? "bg-down" : value >= 0.75 ? "bg-warn" : "bg-accent";
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="num">{formatPct(value, 1)}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded bg-panel-2" aria-hidden>
        <span className={`block h-full ${tone}`} style={{ width: `${Math.min(100, value * 100)}%` }} />
      </span>
    </div>
  );
}

/** Factual config flags from getReserveConfigurationData; no interpretation. */
function reserveStatus(r: TydroReserve): string {
  const flags: string[] = [];
  if (r.isFrozen) flags.push("Frozen");
  flags.push(r.borrowingEnabled ? "Borrowable" : "Borrowing off");
  if (r.ltv > 0) flags.push(`LTV ${formatPct(r.ltv, 0)}`);
  else if (r.liquidationThreshold > 0) flags.push("LTV 0");
  return flags.join(" · ");
}

export function ReserveTable({ reserves }: { reserves: TydroReserve[] }) {
  const sorted = [...reserves].sort((a, b) => b.suppliedUsd - a.suppliedUsd);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="sticky left-0 z-[1] bg-panel px-4 py-2 font-medium">Asset</th>
            <th className="px-4 py-2 text-right font-medium">Supplied</th>
            <th className="px-4 py-2 text-right font-medium">Borrowed</th>
            <th className="px-4 py-2 text-right font-medium">Available</th>
            <th className="px-4 py-2 text-right font-medium">Utilization</th>
            <th className="px-4 py-2 text-right font-medium">Supply APY</th>
            <th className="px-4 py-2 text-right font-medium">Borrow APY</th>
            <th className="px-4 py-2 text-right font-medium">Oracle price</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((r) => (
            <tr key={r.asset} className="group hover:bg-panel-2">
              <td className="sticky left-0 z-[1] bg-panel px-4 py-2.5 group-hover:bg-panel-2">
                <div className="font-medium">{r.symbol}</div>
                <div className="whitespace-nowrap text-xs text-faint">{reserveStatus(r)}</div>
              </td>
              <td className="px-4 py-2.5 text-right">
                <div className="num">{formatUsd(r.suppliedUsd)}</div>
                <div className="num text-xs text-faint">{formatToken(r.supplied.formatted, true)}</div>
              </td>
              <td className="px-4 py-2.5 text-right">
                <div className="num">{formatUsd(r.borrowedUsd)}</div>
                <div className="num text-xs text-faint">{formatToken(r.borrowed.formatted, true)}</div>
              </td>
              <td className="px-4 py-2.5 text-right">
                <div className="num">{formatUsd(Math.max(0, r.suppliedUsd - r.borrowedUsd))}</div>
                <div className="num text-xs text-faint">{formatToken(r.availableLiquidity.formatted, true)}</div>
              </td>
              <td className="px-4 py-2.5 text-right">
                <UtilizationBar value={r.utilization} />
              </td>
              <td className="num px-4 py-2.5 text-right">{formatPct(r.supplyApy)}</td>
              <td className="num px-4 py-2.5 text-right">
                {r.borrowed.raw !== "0" || r.borrowingEnabled ? formatPct(r.variableBorrowApy) : "—"}
              </td>
              <td className="num px-4 py-2.5 text-right text-muted">{formatPrice(r.priceUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
