import { NavLink, Outlet } from "react-router-dom";
import { useHealth } from "../api/hooks";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/protocols/tydro", label: "Tydro" },
  { to: "/protocols/nado", label: "Nado" },
  { to: "/events", label: "Events" },
];

function StatusIndicator() {
  const { data, isError } = useHealth();
  const ok = data?.status === "ok" && !isError;
  return (
    <div className="flex items-center gap-2 text-xs text-muted" aria-live="polite">
      <span className={`size-1.5 rounded-full ${ok ? "bg-up" : isError ? "bg-down" : "bg-faint"}`} aria-hidden />
      {data ? (
        <span className="num">
          Block {Number(data.latestBlock.number).toLocaleString("en-US")}
          <span className="hidden sm:inline"> · {data.rpc.source}</span>
        </span>
      ) : (
        <span>{isError ? "API unreachable" : "Connecting…"}</span>
      )}
    </div>
  );
}

export function Layout() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <NavLink to="/" className="font-semibold tracking-tight">
            Ink DeFi <span className="text-accent">Monitor</span>
          </NavLink>
          <nav className="flex gap-1 text-sm">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded px-2.5 py-1 ${isActive ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto">
            <StatusIndicator />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-faint">
        Read-only, informational data from public on-chain and protocol sources. Not financial advice.
      </footer>
    </div>
  );
}
