// Archive reads for the hourly snapshots, as cached Effects. The subgraph's
// `try_` calls map to Multicall3 `allowFailure`: only a contract revert is
// treated as "no value"; a transport error is retried and never mistaken for one.
import { createEffect, S } from "envio";
import {
  type Address,
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  fallback,
  http,
  parseAbi,
} from "viem";
import { DATA_PROVIDER, ORACLE, POOL } from "./constants";

const DEFAULT_RPC = ["https://rpc-gel.inkonchain.com"];
const urls = process.env.ENVIO_RPC_URL
  ? process.env.ENVIO_RPC_URL.split(",")
      .map((u) => u.trim())
      .filter(Boolean)
  : DEFAULT_RPC;

const client = createPublicClient({
  transport: fallback(
    urls.map((url) =>
      http(url, { batch: { batchSize: 20 }, retryCount: 5, timeout: 30_000 }),
    ),
  ),
});

const poolAbi = parseAbi(["function getReservesList() view returns (address[])"]);
const providerAbi = parseAbi([
  "function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)",
]);
const oracleAbi = parseAbi(["function getAssetPrice(address asset) view returns (uint256)"]);
const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
const multicall3Abi = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  // Declared view (it is payable on-chain) so viem allows it in eth_call.
  "function aggregate3(Call3[] calls) view returns (Result[] returnData)",
]);
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

// ENVIO_RPC_STATS=1 logs how many RPC requests ran and how long they took in
// total (summed over concurrent requests, so it can exceed wall-clock time).
const stats = { calls: 0, ms: 0 };
const logStats = process.env.ENVIO_RPC_STATS === "1";

async function withRetry<T>(what: string, fn: () => Promise<T>): Promise<T> {
  let delay = 500;
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    try {
      const value = await fn();
      stats.calls++;
      stats.ms += Date.now() - started;
      if (logStats && stats.calls % 500 === 0)
        console.info(`rpc-stats calls=${stats.calls} totalMs=${stats.ms}`);
      return value;
    } catch (error) {
      if (attempt >= 10)
        throw new Error(`${what} failed after ${attempt} attempts: ${error}`);
      console.warn(`RPC retry ${attempt} for ${what}: ${String(error).split("\n")[0]}`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 20_000);
    }
  }
}

type Call = { target: Address; allowFailure: true; callData: `0x${string}` };

function aggregate(what: string, calls: Call[], blockNumber: number) {
  return withRetry(what, () =>
    client.readContract({
      address: MULTICALL3,
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [calls],
      blockNumber: BigInt(blockNumber),
    }),
  );
}

function tryDecode<T>(
  r: { success: boolean; returnData: `0x${string}` },
  decode: (data: `0x${string}`) => T,
): T | undefined {
  if (!r.success) return undefined;
  try {
    return decode(r.returnData);
  } catch {
    return undefined; // undecodable return data counts as a revert, as in graph-node
  }
}

type MulticallResult = { success: boolean; returnData: `0x${string}` };

/**
 * Pairs each reserve with its `getReserveData` / `getAssetPrice` result.
 * A reverted `getReserveData` drops the reserve; a reverted price is undefined.
 */
export function decodeSnapshot(list: readonly Address[], results: readonly MulticallResult[]) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const data = tryDecode(results[2 * i]!, (d) =>
      decodeFunctionResult({ abi: providerAbi, functionName: "getReserveData", data: d }),
    );
    if (!data) continue;
    const priceUsd = tryDecode(results[2 * i + 1]!, (d) =>
      decodeFunctionResult({ abi: oracleAbi, functionName: "getAssetPrice", data: d }),
    );
    out.push({
      asset: list[i]!.toLowerCase(),
      totalSupplied: data[2],
      totalBorrowed: data[3] + data[4],
      liquidityRate: data[5],
      variableBorrowRate: data[6],
      priceUsd,
    });
  }
  return out;
}

/** `try_symbol` / `try_decimals` at the block where the reserve was first seen. */
export const tokenMeta = createEffect(
  {
    name: "tokenMeta",
    input: { asset: S.string, blockNumber: S.number },
    output: S.schema({ symbol: S.string, decimals: S.number }),
    cache: true,
    rateLimit: false,
  },
  async ({ input }) => {
    const asset = input.asset as Address;
    const [sym, dec] = await aggregate(
      `tokenMeta@${input.blockNumber}`,
      [
        { target: asset, allowFailure: true, callData: encodeFunctionData({ abi: erc20Abi, functionName: "symbol" }) },
        { target: asset, allowFailure: true, callData: encodeFunctionData({ abi: erc20Abi, functionName: "decimals" }) },
      ],
      input.blockNumber,
    );
    const symbol = tryDecode(sym!, (d) => decodeFunctionResult({ abi: erc20Abi, functionName: "symbol", data: d }));
    const decimals = tryDecode(dec!, (d) => decodeFunctionResult({ abi: erc20Abi, functionName: "decimals", data: d }));
    // Same fallbacks as the subgraph: "Unknown", and -1 for unknown decimals.
    return { symbol: symbol ?? "Unknown", decimals: decimals ?? -1 };
  },
);

/**
 * One snapshot block: the Pool's reserve list, then `getReserveData` and
 * `getAssetPrice` for each reserve, in two `eth_call`s. A reserve whose
 * `getReserveData` reverted is left out; a reverted price is `undefined`.
 */
export const reserveSnapshot = createEffect(
  {
    name: "reserveSnapshot",
    input: S.number,
    output: S.array(
      S.schema({
        asset: S.string,
        totalSupplied: S.bigint,
        totalBorrowed: S.bigint,
        liquidityRate: S.bigint,
        variableBorrowRate: S.bigint,
        priceUsd: S.optional(S.bigint),
      }),
    ),
    cache: true,
    // The public Ink RPC rate-limits per IP (about 1000 requests in a burst
    // failed in testing); this stays well under it. Raise it with a paid node.
    rateLimit: { calls: 20, per: "second" },
  },
  async ({ input: blockNumber }) => {
    const [listResult] = await aggregate(
      `getReservesList@${blockNumber}`,
      [{ target: POOL as Address, allowFailure: true, callData: encodeFunctionData({ abi: poolAbi, functionName: "getReservesList" }) }],
      blockNumber,
    );
    const list = tryDecode(listResult!, (d) =>
      decodeFunctionResult({ abi: poolAbi, functionName: "getReservesList", data: d }),
    );
    if (!list || list.length === 0) return [];

    const calls: Call[] = list.flatMap((asset) => [
      { target: DATA_PROVIDER as Address, allowFailure: true as const, callData: encodeFunctionData({ abi: providerAbi, functionName: "getReserveData", args: [asset] }) },
      { target: ORACLE as Address, allowFailure: true as const, callData: encodeFunctionData({ abi: oracleAbi, functionName: "getAssetPrice", args: [asset] }) },
    ]);
    const results = await aggregate(`reserveSnapshot@${blockNumber}`, calls, blockNumber);

    return decodeSnapshot(list, results);
  },
);

/** Block timestamp for snapshot blocks (onBlock handlers carry only the number). */
export const blockTimestamp = createEffect(
  { name: "blockTimestamp", input: S.number, output: S.bigint, cache: true, rateLimit: { calls: 20, per: "second" } },
  async ({ input: blockNumber }) => {
    const block = await withRetry(`getBlock@${blockNumber}`, () =>
      client.getBlock({ blockNumber: BigInt(blockNumber) }),
    );
    return block.timestamp;
  },
);
