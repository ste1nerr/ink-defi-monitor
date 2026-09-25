import type { ReactNode } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-panel-2 ${className}`} />;
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
      <div>
        <div className="font-medium text-down">Data unavailable</div>
        <div className="text-muted">{error instanceof Error ? error.message : "Unknown error"}</div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded border border-line px-3 py-1.5 text-fg hover:border-accent hover:text-accent"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="p-6 text-center text-sm text-muted">{children}</div>;
}
