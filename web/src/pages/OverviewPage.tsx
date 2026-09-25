import { usePageTitle } from "../lib/usePageTitle";
import { EventsPanel } from "../components/EventsPanel";
import { NadoSummary } from "../components/NadoSummary";
import { TydroSummary } from "../components/TydroSummary";

export function OverviewPage() {
  usePageTitle();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Ink DeFi overview</h1>
        <p className="text-sm text-muted">Live protocol state and activity across Ink. Every figure links to its source.</p>
      </div>
      <TydroSummary link={{ to: "/protocols/tydro", label: "Reserves & history" }} />
      <NadoSummary link={{ to: "/protocols/nado", label: "Markets & history" }} />
      <EventsPanel pageSize={15} title="Recent activity · all protocols" filters={false} link={{ to: "/events", label: "Full timeline" }} />
    </div>
  );
}
