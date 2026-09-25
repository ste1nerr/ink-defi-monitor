import { usePageTitle } from "../lib/usePageTitle";
import { EventsPanel } from "../components/EventsPanel";

export function EventsPage() {
  usePageTitle("Events");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Ink DeFi events</h1>
        <p className="max-w-3xl text-sm text-muted">
          One timeline across protocols. Tydro events are individual on-chain transactions; Nado events are hourly
          per-market aggregates because Nado's sequencer does not expose a transaction hash per liquidation. Each source's
          coverage is shown above the list.
        </p>
      </div>
      <EventsPanel pageSize={30} title="Timeline" />
    </div>
  );
}
