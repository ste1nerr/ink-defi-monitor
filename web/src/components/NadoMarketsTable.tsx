import { useMemo, useState } from "react";
import type { NadoMarket } from "@server/protocols/nado/types";
import { formatCount, formatPrice, formatSignedPct, formatUsd } from "../lib/format";

type SortKey = "volume24h" | "openInterest" | "liquidations24h" | "trades24h";

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "volume24h", label: "Volume 24h" },
  { key: "openInterest", label: "Open interest" },
  { key: "liquidations24h", label: "Liquidations 24h" },
  { key: "trades24h", label: "Trades 24h" },
];

const PAGE_SIZE = 20;

export function NadoMarketsTable({ markets }: { markets: NadoMarket[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("volume24h");
  const [type, setType] = useState<"all" | "perp" | "spot">("all");
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(
    () =>
      markets
        .filter((m) => type === "all" || m.type === type)
        .sort((a, b) => (b[sortKey] ?? -1) - (a[sortKey] ?? -1)),
    [markets, sortKey, type],
  );
  const visible = showAll ? rows : rows.slice(0, PAGE_SIZE);

  return (
    <>
      <div className="flex flex-wrap gap-1 border-b border-line px-4 py-2" role="toolbar" aria-label="Market type">
        {(["all", "perp", "spot"] as const).map((t) => (
          <button
            key={t}
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className={`rounded px-2 py-0.5 text-xs capitalize ${type === t ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}
          >
            {t === "all" ? `All (${markets.length})` : t}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="sticky left-0 z-[1] bg-panel px-4 py-2 font-medium">Market</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-4 py-2 text-right font-medium" aria-sort={sortKey === c.key ? "descending" : "none"}>
                  <button onClick={() => setSortKey(c.key)} className={`hover:text-fg ${sortKey === c.key ? "text-fg" : ""}`}>
                    {c.label}
                    {sortKey === c.key ? " ↓" : ""}
                  </button>
                </th>
              ))}
              <th className="px-4 py-2 text-right font-medium">Funding 1h</th>
              <th className="px-4 py-2 text-right font-medium">Oracle price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((m) => (
              <tr key={m.productId} className="group hover:bg-panel-2">
                <td className="sticky left-0 z-[1] bg-panel px-4 py-2 group-hover:bg-panel-2">
                  <div className="font-medium">{m.symbol}</div>
                  <div className="text-xs text-faint">
                    {m.type} · #{m.productId}
                  </div>
                </td>
                <td className="num px-4 py-2 text-right">{formatUsd(m.volume24h)}</td>
                <td className="num px-4 py-2 text-right">{m.type === "perp" ? formatUsd(m.openInterest) : "—"}</td>
                <td className={`num px-4 py-2 text-right ${m.liquidations24h ? "" : "text-faint"}`}>{formatUsd(m.liquidations24h)}</td>
                <td className="num px-4 py-2 text-right text-muted">{formatCount(m.trades24h)}</td>
                <td className="num px-4 py-2 text-right text-muted">{m.type === "perp" ? formatSignedPct(m.fundingRate1h) : "—"}</td>
                <td className="num px-4 py-2 text-right text-muted">{formatPrice(m.oraclePrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PAGE_SIZE && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full border-t border-line px-4 py-2 text-xs text-muted hover:text-fg"
        >
          {showAll ? "Show top 20" : `Show all ${rows.length} markets`}
        </button>
      )}
    </>
  );
}
