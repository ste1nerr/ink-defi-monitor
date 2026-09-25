import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function Panel({
  title,
  meta,
  children,
  className = "",
  link,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Optional drill-down link shown at the end of the header. */
  link?: { to: string; label: string };
}) {
  return (
    <section className={`min-w-0 rounded-lg border border-line bg-panel ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {(meta || link) && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-faint">
            {meta}
            {link && (
              <Link to={link.to} className="text-muted hover:text-accent">
                {link.label} →
              </Link>
            )}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="num mt-1 truncate text-xl font-medium">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
    </div>
  );
}
