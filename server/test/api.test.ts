import { describe, expect, it } from "vitest";
import { createApp } from "../src/api/app.js";

// These cases are rejected before any upstream call, so they run offline.
const app = createApp();
const get = (path: string) => app.request(`/api/v1${path}`);

describe("API validation", () => {
  it("404s unknown protocols", async () => {
    const res = await get("/protocols/nope/events");
    expect(res.status).toBe(404);
  });

  it.each([
    ["/protocols/tydro/events?limit=0", "limit"],
    ["/protocols/tydro/events?limit=500", "limit"],
    ["/protocols/tydro/events?type=borrow,teleport", "type"],
    ["/protocols/tydro/events?wallet=0x123", "wallet"],
    ["/protocols/tydro/history?range=1y", "range"],
  ])("400s invalid query %s", async (path, field) => {
    const res = await get(path);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(field);
  });

  it("503s history when the Goldsky indexer is not configured", async () => {
    const res = await get("/protocols/tydro/history?range=7d");
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("GOLDSKY_TYDRO_URL");
  });
});

describe("timeline validation", () => {
  it.each([
    ["/events?protocol=aave", "protocol"],
    ["/events?offset=990&limit=50", "1000"],
  ])("400s %s", async (path, text) => {
    const res = await get(path);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(text);
  });
});
