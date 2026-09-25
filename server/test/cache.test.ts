import { afterEach, describe, expect, it, vi } from "vitest";
import { SwrCache } from "../src/data/cache.js";

describe("SwrCache", () => {
  afterEach(() => vi.useRealTimers());

  it("deduplicates concurrent loads", async () => {
    const cache = new SwrCache();
    const load = vi.fn(async () => 1);
    const results = await Promise.all([1, 2, 3].map(() => cache.get("k", load, { ttlMs: 1000 })));
    expect(load).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.value === 1 && !r.stale)).toBe(true);
  });

  it("serves stale data while revalidating, then fresh data", async () => {
    vi.useFakeTimers();
    const cache = new SwrCache();
    let n = 0;
    const load = async () => ++n;
    await cache.get("k", load, { ttlMs: 1000 });
    vi.advanceTimersByTime(1500);
    const stale = await cache.get("k", load, { ttlMs: 1000 });
    expect(stale).toMatchObject({ value: 1, stale: true });
    await vi.runAllTimersAsync();
    expect((await cache.get("k", load, { ttlMs: 1000 })).value).toBe(2);
  });

  it("keeps serving the last good value when a refresh fails after max staleness", async () => {
    vi.useFakeTimers();
    const cache = new SwrCache();
    await cache.get("k", async () => "good", { ttlMs: 10, maxStaleMs: 20 });
    vi.advanceTimersByTime(100);
    const result = await cache.get("k", async () => Promise.reject(new Error("rpc down")), { ttlMs: 10, maxStaleMs: 20 });
    expect(result).toMatchObject({ value: "good", stale: true });
  });

  it("throws when there is nothing to fall back to", async () => {
    const cache = new SwrCache();
    await expect(cache.get("k", async () => Promise.reject(new Error("down")), { ttlMs: 10 })).rejects.toThrow("down");
  });
});
