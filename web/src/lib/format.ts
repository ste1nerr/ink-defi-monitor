const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});
const usdFull = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const tokenFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const tokenCompact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

export const formatUsd = (value: number | undefined | null, compact = true) =>
  value === undefined || value === null || !Number.isFinite(value) ? "—" : (compact ? usdCompact : usdFull).format(value);

/** Display-only; the exact value stays in `TokenAmount.formatted`. */
export const formatToken = (formatted: string, compact = false) => {
  const n = Number(formatted);
  if (!Number.isFinite(n)) return formatted;
  return (compact && Math.abs(n) >= 10_000 ? tokenCompact : tokenFmt).format(n);
};

export const formatPct = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? "—" : `${(value * 100).toFixed(digits)}%`;

export const shortHash = (hash: string, chars = 4) => `${hash.slice(0, 2 + chars)}…${hash.slice(-chars)}`;

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export const formatTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const formatDateTime = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium" });

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Time for today's events; short date + time otherwise, so older rows are never ambiguous. */
export const formatEventTime = (ms: number, now = new Date()) => {
  const date = new Date(ms);
  return isSameDay(date, now)
    ? formatTime(ms)
    : date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export const formatHourMinute = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Signed percentage with explicit sign, e.g. funding rates. */
export const formatSignedPct = (value: number | null | undefined, digits = 4) =>
  value === null || value === undefined ? "—" : `${value > 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;

const countFmt = new Intl.NumberFormat("en-US");
export const formatCount = (value: number | null | undefined) => (value === null || value === undefined ? "—" : countFmt.format(value));

const priceSmall = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumSignificantDigits: 4 });
/** Prices keep 4 significant digits below $1 so small-cap assets never render as $0.00. */
export const formatPrice = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : Math.abs(value) < 1 && value !== 0
      ? priceSmall.format(value)
      : usdFull.format(value);
