import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { isAddress } from "viem";
import { z } from "zod";
import { INK_CHAIN_ID } from "../config/chain.js";
import { env } from "../config/env.js";
import { rpc, rpcSource } from "../data/rpc.js";
import { mergeTimeline } from "../domain/timeline.js";
import type { ProtocolEventType } from "../domain/types.js";
import { IndexerNotConfiguredError, QueryError } from "../protocols/errors.js";
import { adapters, getAdapter } from "../protocols/registry.js";
import { getNadoHistory } from "../protocols/nado/adapter.js";
import { getTydroHistory } from "../protocols/tydro/adapter.js";

const EVENT_TYPES = [
  "supply",
  "withdraw",
  "borrow",
  "repay",
  "liquidation",
  "collateral_change",
  "flash_loan",
  "unknown",
] as const satisfies readonly ProtocolEventType[];

const AddressParam = z.string().refine((v) => isAddress(v, { strict: false }), "must be a 0x address");

const EventsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  /** Comma-separated list, e.g. `type=borrow,liquidation`. */
  type: z
    .string()
    .transform((v) => v.split(",").filter(Boolean))
    .pipe(z.array(z.enum(EVENT_TYPES)))
    .optional(),
  wallet: AddressParam.optional(),
  asset: AddressParam.optional(),
});

/** Merged pages need offset + limit rows from every protocol, so keep that window bounded. */
const MAX_TIMELINE_WINDOW = 1000;

const TimelineQuery = EventsQuery.extend({
  protocol: z
    .string()
    .transform((v) => v.split(",").filter(Boolean))
    .pipe(z.array(z.enum(["tydro", "nado"])))
    .optional(),
});

const HistoryQuery = z.object({
  range: z.enum(["24h", "7d", "30d", "90d"]).default("7d"),
  asset: AddressParam.optional(),
});

const historyLoaders: Record<string, (q: z.infer<typeof HistoryQuery>) => Promise<unknown>> = {
  tydro: (q) => getTydroHistory(q.range, q.asset),
  nado: (q) => {
    if (q.asset) throw new QueryError("Nado history is market-wide; `asset` is not supported");
    return getNadoHistory(q.range);
  },
};

/** BigInt is not JSON-serialisable; the domain layer should never leak one, but guard anyway. */
const json = (data: unknown) =>
  JSON.parse(JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

function parseQuery<T extends z.ZodType>(schema: T, query: Record<string, string>): z.infer<T> {
  const result = schema.safeParse(query);
  if (!result.success) throw new HTTPException(400, { message: z.prettifyError(result.error) });
  return result.data;
}

function requireAdapter(id: string) {
  const adapter = getAdapter(id);
  if (!adapter) throw new HTTPException(404, { message: `Unknown protocol '${id}'` });
  return adapter;
}

export function createApp() {
  const app = new Hono();
  app.use("/api/*", cors({ origin: env.corsOrigin }));

  const v1 = new Hono();

  v1.get("/health", async (c) => {
    const startedAt = Date.now();
    const indexers = Object.fromEntries(
      await Promise.all(
        Object.values(adapters).map(async (a) => [a.info.id, (await a.getIndexerStatus?.()) ?? null] as const),
      ),
    );
    try {
      const block = await rpc.getBlock();
      return c.json({
        status: "ok",
        chainId: INK_CHAIN_ID,
        rpc: { source: rpcSource(), latencyMs: Date.now() - startedAt },
        latestBlock: { number: block.number.toString(), timestamp: Number(block.timestamp) * 1000 },
        protocols: Object.keys(adapters),
        indexers,
      });
    } catch (error) {
      return c.json({ status: "degraded", error: (error as Error).message, indexers }, 503);
    }
  });

  v1.get("/events", async (c) => {
    const { protocol, type, offset, limit, ...filters } = parseQuery(TimelineQuery, c.req.query());
    if (offset + limit > MAX_TIMELINE_WINDOW) throw new QueryError(`offset + limit must be ≤ ${MAX_TIMELINE_WINDOW}`);
    const selected = Object.values(adapters).filter((a) => !protocol?.length || protocol.includes(a.info.id as "tydro" | "nado"));

    const results = await Promise.all(
      selected.map(async (adapter) => {
        try {
          const page = await adapter.getEvents({ ...filters, types: type, offset: 0, limit: offset + limit });
          return { protocol: adapter.info.id, page };
        } catch (error) {
          // One failing or non-applicable source must not blank the whole timeline; report it instead.
          return { protocol: adapter.info.id, error: (error as Error).message };
        }
      }),
    );
    const ok = results.flatMap((r) => (r.page ? [r.page] : []));
    const merged = mergeTimeline(
      ok.map((p) => p.data),
      offset,
      limit,
    );
    return c.json(
      json({
        data: {
          ...merged,
          limit,
          offset,
          sources: Object.fromEntries(
            results.map((r) => [
              r.protocol,
              r.page ? { coverage: r.page.data.coverage, cachedAt: r.page.cachedAt } : { error: r.error },
            ]),
          ),
        },
        cachedAt: ok.length ? Math.min(...ok.map((p) => p.cachedAt)) : Date.now(),
        stale: ok.some((p) => p.stale),
      }),
    );
  });

  v1.get("/protocols", (c) => c.json({ protocols: Object.values(adapters).map((a) => a.info) }));

  v1.get("/protocols/:protocol/history", async (c) => {
    const protocol = requireAdapter(c.req.param("protocol")).info.id;
    const load = historyLoaders[protocol];
    if (!load) throw new HTTPException(404, { message: `No history for '${protocol}'` });
    return c.json(json(await load(parseQuery(HistoryQuery, c.req.query()))));
  });

  v1.get("/protocols/:protocol", async (c) => {
    const adapter = requireAdapter(c.req.param("protocol"));
    const overview = await adapter.getOverview();
    return c.json(json({ protocol: adapter.info, ...overview }));
  });

  v1.get("/protocols/:protocol/events", async (c) => {
    const adapter = requireAdapter(c.req.param("protocol"));
    const { type, ...rest } = parseQuery(EventsQuery, c.req.query());
    return c.json(json(await adapter.getEvents({ ...rest, types: type })));
  });

  app.route("/api/v1", v1);

  app.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    if (error instanceof QueryError) return c.json({ error: error.message }, 400);
    if (error instanceof IndexerNotConfiguredError) return c.json({ error: error.message }, 503);
    console.error(error);
    return c.json({ error: "Upstream data source failed", detail: error.message }, 502);
  });
  app.notFound((c) => c.json({ error: "Not found" }, 404));

  return app;
}
