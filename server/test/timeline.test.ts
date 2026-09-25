import { describe, expect, it } from "vitest";
import { mergeTimeline } from "../src/domain/timeline.js";
import type { ProtocolEvent } from "../src/domain/types.js";

const ev = (id: string, timestamp: number, protocol: ProtocolEvent["protocol"]): ProtocolEvent => ({
  id,
  protocol,
  type: "supply",
  timestamp,
  provenance: { source: "ink-rpc", reference: "test", retrievedAt: 0 },
});

describe("mergeTimeline", () => {
  const tydro = [ev("t3", 300, "tydro"), ev("t1", 100, "tydro")];
  const nado = [ev("n2", 200, "nado"), ev("n0", 100, "nado")];

  it("interleaves protocols newest first with a deterministic tiebreak", () => {
    const page = mergeTimeline([{ events: tydro, hasMore: false }, { events: nado, hasMore: false }], 0, 10);
    expect(page.events.map((e) => e.id)).toEqual(["t3", "n2", "n0", "t1"]);
    expect(page.hasMore).toBe(false);
  });

  it("pages over the merged list", () => {
    const page = mergeTimeline([{ events: tydro, hasMore: false }, { events: nado, hasMore: false }], 1, 2);
    expect(page.events.map((e) => e.id)).toEqual(["n2", "n0"]);
    expect(page.hasMore).toBe(true);
  });

  it("reports more pages when any source has more", () => {
    expect(mergeTimeline([{ events: tydro, hasMore: true }], 0, 5).hasMore).toBe(true);
  });
});
