import { afterEach, describe, expect, it, vi } from "vitest";
import { querySubgraph } from "../src/data/goldsky.js";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("querySubgraph", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retries 5xx / 429 and returns data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(ok({ data: { x: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(querySubgraph("https://example.test", "{ x }")).resolves.toEqual({ x: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry GraphQL query errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ errors: [{ message: "Type `Query` has no field `nope`" }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(querySubgraph("https://example.test", "{ nope }")).rejects.toThrow("has no field");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
