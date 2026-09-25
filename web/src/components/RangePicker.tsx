import type { HistoryRange } from "@server/protocols/tydro/types";

export const RANGES: HistoryRange[] = ["24h", "7d", "30d", "90d"];

export function RangePicker({ value, onChange }: { value: HistoryRange; onChange: (r: HistoryRange) => void }) {
  return (
    <div role="radiogroup" aria-label="Time range" className="flex rounded border border-line p-0.5">
      {RANGES.map((r) => (
        <button
          key={r}
          role="radio"
          aria-checked={value === r}
          onClick={() => onChange(r)}
          className={`rounded px-2 py-0.5 text-xs ${value === r ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
