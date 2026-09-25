/**
 * Nado public APIs (no key). Endpoints and limits from https://docs.nado.xyz/developer-resources/api.
 */
export const NADO_ARCHIVE_URL = "https://api.prod.nado.xyz/archive/v1";
export const NADO_ASSETS_URL = "https://gateway.prod.nado.xyz/v2/assets";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
/** Documented: interval.count × product_ids.length < 2000. */
const MAX_SNAPSHOT_CELLS = 1999;
const MAX_PARALLEL_REQUESTS = 3;

type ProductMap<T> = Record<string, T>;

export type MarketSnapshot = {
  timestamp: number;
  cumulative_users: number | null;
  daily_active_users: number | null;
  cumulative_trades: ProductMap<number>;
  cumulative_volumes: ProductMap<string>;
  cumulative_liquidation_amounts: ProductMap<string>;
  open_interests: ProductMap<string>;
  funding_rates: ProductMap<string>;
  oracle_prices: ProductMap<string>;
  tvl: string | null;
};

export type NadoAsset = {
  product_id: number;
  ticker_id: string | null;
  market_type: "perp" | "spot" | null;
  name: string;
  symbol: string;
};

async function postWithRetry<T>(url: string, body: unknown): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", "accept-encoding": "gzip, br, deflate" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await response.text();
      if (response.status === 429 || response.status >= 500) throw new Error(`Nado HTTP ${response.status}`);
      if (!response.ok) {
        // 4xx other than 429 is a bad request; retrying will not help.
        throw Object.assign(new Error(`Nado HTTP ${response.status}: ${text.slice(0, 200)}`), { permanent: true });
      }
      return JSON.parse(text) as T;
    } catch (error) {
      lastError = error;
      if ((error as { permanent?: boolean }).permanent || attempt === MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

export const fetchAssets = () => postWithRetry<NadoAsset[]>(NADO_ASSETS_URL, undefined);

/**
 * Fetches `count` snapshots (newest first, ending at `maxTime`) for all given products,
 * splitting product ids into chunks that respect the documented size limit and merging by position.
 * A fixed `maxTime` keeps chunk timestamps aligned.
 */
export async function fetchMarketSnapshots(params: {
  count: number;
  granularity: number;
  maxTime: number;
  productIds: number[];
}): Promise<MarketSnapshot[]> {
  const perChunk = Math.max(1, Math.floor(MAX_SNAPSHOT_CELLS / params.count));
  const chunks: number[][] = [];
  for (let i = 0; i < params.productIds.length; i += perChunk) chunks.push(params.productIds.slice(i, i + perChunk));

  const results: MarketSnapshot[][] = [];
  for (let i = 0; i < chunks.length; i += MAX_PARALLEL_REQUESTS) {
    const batch = chunks.slice(i, i + MAX_PARALLEL_REQUESTS).map((product_ids) =>
      postWithRetry<{ snapshots: MarketSnapshot[] }>(NADO_ARCHIVE_URL, {
        market_snapshots: {
          interval: { count: params.count, granularity: params.granularity, max_time: params.maxTime },
          product_ids,
        },
      }).then((r) => r.snapshots),
    );
    results.push(...(await Promise.all(batch)));
  }
  return mergeSnapshotChunks(results);
}

/** Merges per-chunk snapshot lists (same interval, same order) into one list of full snapshots. */
export function mergeSnapshotChunks(chunks: MarketSnapshot[][]): MarketSnapshot[] {
  const [first, ...rest] = chunks;
  if (!first) return [];
  return first.map((base, index) => {
    const merged: MarketSnapshot = { ...base };
    for (const chunk of rest) {
      const other = chunk[index];
      if (!other) continue;
      merged.cumulative_trades = { ...merged.cumulative_trades, ...other.cumulative_trades };
      merged.cumulative_volumes = { ...merged.cumulative_volumes, ...other.cumulative_volumes };
      merged.cumulative_liquidation_amounts = { ...merged.cumulative_liquidation_amounts, ...other.cumulative_liquidation_amounts };
      merged.open_interests = { ...merged.open_interests, ...other.open_interests };
      merged.funding_rates = { ...merged.funding_rates, ...other.funding_rates };
      merged.oracle_prices = { ...merged.oracle_prices, ...other.oracle_prices };
    }
    return merged;
  });
}
