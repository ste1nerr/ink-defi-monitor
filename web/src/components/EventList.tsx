import type { ProtocolEvent, ProtocolEventType } from "@server/domain/types";
import { formatDateTime, formatEventTime, formatHourMinute, formatToken, formatUsd, shortHash } from "../lib/format";

const TYPE_LABEL: Record<ProtocolEventType, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  liquidation: "Liquidation",
  collateral_change: "Collateral",
  flash_loan: "Flash loan",
  unknown: "Unknown",
};

const TYPE_TONE: Partial<Record<ProtocolEventType, string>> = {
  liquidation: "text-down border-down/40",
  borrow: "text-warn border-warn/40",
  supply: "text-up border-up/40",
};

function describe(event: ProtocolEvent): string | null {
  if (event.type === "collateral_change") {
    return event.metadata?.usedAsCollateral ? "enabled as collateral" : "disabled as collateral";
  }
  if (event.type === "unknown") return String(event.metadata?.eventName ?? "Unclassified log");
  return null;
}

export function EventList({ events }: { events: ProtocolEvent[] }) {
  return (
    <ol className="divide-y divide-line">
      {events.map((event) => (
        <li key={event.id} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[7rem_5rem_7rem_1fr_auto]">
          <time className="num text-xs text-muted" dateTime={new Date(event.timestamp).toISOString()} title={formatDateTime(event.timestamp)}>
            {formatEventTime(event.timestamp)}
          </time>
          <span className="hidden text-xs capitalize text-muted sm:block">{event.protocol}</span>
          <span className={`w-fit rounded border px-1.5 py-0.5 text-xs ${TYPE_TONE[event.type] ?? "border-line text-fg"}`}>
            {TYPE_LABEL[event.type]}
          </span>
          <span className="col-span-3 min-w-0 truncate sm:col-span-1">
            {event.metadata?.aggregation === "interval" ? (
              <>
                <span className="num">{formatUsd(event.amountUsd, false)}</span>{" "}
                <span className="text-muted">{event.asset?.symbol}</span>
                <span className="num ml-2 text-xs text-faint" title={`Sum of ${String(event.metadata.quote)} liquidated in this window`}>
                  {formatHourMinute(Number(event.metadata.windowStart))}–{formatHourMinute(Number(event.metadata.windowEnd))}
                </span>
              </>
            ) : event.amount ? (
              <>
                <span className="num">{formatToken(event.amount.formatted, true)}</span>{" "}
                <span className="text-muted">{event.asset?.symbol}</span>
                {event.amountUsd !== undefined && (
                  <span className="num ml-2 text-xs text-faint" title="Valued at the protocol oracle price at retrieval time">
                    ≈{formatUsd(event.amountUsd)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted">
                {event.asset?.symbol} {describe(event)}
              </span>
            )}
          </span>
          <span className="col-start-3 row-start-1 text-right sm:col-start-auto sm:row-start-auto">
            {event.explorerUrl && event.txHash ? (
              <a href={event.explorerUrl} target="_blank" rel="noreferrer" className="num text-xs text-faint hover:text-accent">
                {shortHash(event.txHash)} ↗
              </a>
            ) : (
              <span className="text-xs text-faint">{event.metadata?.aggregation === "interval" ? "hourly aggregate" : "no tx"}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
