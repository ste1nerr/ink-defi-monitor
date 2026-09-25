import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";

export type Series = {
  key: string;
  label: string;
  /** Categorical slot colour, validated for the dark surface (dataviz palette, slots 1–2). */
  color: string;
  values: Array<number | null>;
};

type Props = {
  timestamps: number[];
  series: Series[];
  formatValue: (v: number) => string;
  formatTick?: (v: number) => string;
  /** Fixed y-domain max (e.g. 1 for ratios); otherwise derived from data. */
  yMax?: number;
  height?: number;
  ariaLabel: string;
};

const PAD = { top: 12, right: 16, bottom: 24, left: 56 };
const TARGET_Y_TICKS = 4;

/** Round tick step (1, 2, 2.5, 5 × 10^n) so axis labels stay readable. */
function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  for (const s of [1, 2, 2.5, 5]) if (s * magnitude >= rough) return s * magnitude;
  return 10 * magnitude;
}

function yScale(dataMax: number, fixedMax?: number): { top: number; ticks: number[] } {
  const max = fixedMax ?? (dataMax > 0 ? dataMax : 1);
  const step = niceStep(max / TARGET_Y_TICKS);
  const top = fixedMax ?? Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1e6; v += step) ticks.push(v);
  return { top, ticks };
}

const dateTick = (ms: number, spanMs: number) =>
  new Date(ms).toLocaleString("en-GB", spanMs <= 2 * 86_400_000 ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" });

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function TimeSeriesChart({ timestamps, series, formatValue, formatTick = formatValue, yMax, height = 220, ariaLabel }: Props) {
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (width === 0 || timestamps.length === 0) return null;
    const innerW = Math.max(1, width - PAD.left - PAD.right);
    const innerH = height - PAD.top - PAD.bottom;
    const t0 = timestamps[0]!;
    const t1 = timestamps[timestamps.length - 1]!;
    const span = Math.max(1, t1 - t0);
    const dataMax = Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)));
    const { top, ticks: yTicks } = yScale(dataMax, yMax);
    const x = (t: number) => PAD.left + ((t - t0) / span) * innerW;
    const y = (v: number) => PAD.top + innerH - (v / top) * innerH;

    const paths = series.map((s) => {
      let d = "";
      let pen = false;
      s.values.forEach((v, i) => {
        if (v === null) {
          pen = false; // gaps stay gaps; never interpolate missing data
          return;
        }
        d += `${pen ? "L" : "M"}${x(timestamps[i]!).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      });
      return d;
    });

    const xTickCount = Math.max(2, Math.min(6, Math.floor(innerW / 110)));
    const xTicks = Array.from({ length: xTickCount }, (_, i) => t0 + (span * i) / (xTickCount - 1));
    return { x, y, paths, xTicks, yTicks, span, innerH };
  }, [width, height, timestamps, series, yMax]);

  function onPointerMove(e: PointerEvent<SVGRectElement>) {
    if (!geometry) return;
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left + PAD.left;
    let best = 0;
    for (let i = 1; i < timestamps.length; i++) {
      if (Math.abs(geometry.x(timestamps[i]!) - px) < Math.abs(geometry.x(timestamps[best]!) - px)) best = i;
    }
    setHover(best);
  }

  const hoverX = geometry && hover !== null ? geometry.x(timestamps[hover]!) : null;

  return (
    <div ref={containerRef} className="relative w-full select-none" style={{ height }}>
      {geometry && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
          {geometry.yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={geometry.y(v)} y2={geometry.y(v)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={PAD.left - 8} y={geometry.y(v)} dy="0.32em" textAnchor="end" className="fill-faint num text-[11px]">
                {formatTick(v)}
              </text>
            </g>
          ))}
          {geometry.xTicks.map((t, i) => (
            <text
              key={t}
              x={geometry.x(t)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === geometry.xTicks.length - 1 ? "end" : "middle"}
              className="fill-faint text-[11px]"
            >
              {dateTick(t, geometry.span)}
            </text>
          ))}
          {geometry.paths.map((d, i) => (
            <path key={series[i]!.key} d={d} fill="none" stroke={series[i]!.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {hoverX !== null && hover !== null && (
            <g pointerEvents="none">
              <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={PAD.top + geometry.innerH} stroke="var(--color-muted)" strokeWidth={1} />
              {series.map((s) => {
                const v = s.values[hover];
                return v === null || v === undefined ? null : (
                  <circle key={s.key} cx={hoverX} cy={geometry.y(v)} r={4} fill={s.color} stroke="var(--color-panel)" strokeWidth={2} />
                );
              })}
            </g>
          )}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={Math.max(0, width - PAD.left - PAD.right)}
            height={geometry.innerH}
            fill="transparent"
            className="cursor-crosshair"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {geometry && hover !== null && hoverX !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-40 rounded border border-line bg-panel-2 px-3 py-2 text-xs shadow-lg"
          style={hoverX > width / 2 ? { right: width - hoverX + 12 } : { left: hoverX + 12 }}
        >
          <div className="mb-1 text-muted">{new Date(timestamps[hover]!).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</div>
          {series.map((s) => {
            const v = s.values[hover];
            return (
              <div key={s.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden />
                  {s.label}
                </span>
                <span className="num text-fg">{v === null || v === undefined ? "—" : formatValue(v)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Legend for ≥ 2 series; text stays in text colours, the swatch carries identity. */
export function Legend({ series }: { series: Pick<Series, "key" | "label" | "color">[] }) {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-muted">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}
