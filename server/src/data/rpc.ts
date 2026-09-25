import { createPublicClient, http, type Log } from "viem";
import { ink, MAX_LOG_BLOCK_RANGE } from "../config/chain.js";
import { env } from "../config/env.js";

export const rpcSource = (): "alchemy" | "ink-rpc" => (env.rpcProvider === "alchemy" ? "alchemy" : "ink-rpc");

export const rpc = createPublicClient({
  chain: ink,
  transport: http(env.inkRpcUrl, {
    batch: { batchSize: 50, wait: 10 },
    retryCount: 3,
    retryDelay: 250,
    timeout: 20_000,
  }),
});

/** Fetches logs across a block range in chunks the RPC accepts. */
export async function getLogsChunked(params: {
  address: `0x${string}`;
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<Log[]> {
  const ranges: Array<[bigint, bigint]> = [];
  for (let start = params.fromBlock; start <= params.toBlock; start += MAX_LOG_BLOCK_RANGE) {
    const end = start + MAX_LOG_BLOCK_RANGE - 1n;
    ranges.push([start, end > params.toBlock ? params.toBlock : end]);
  }
  const chunks = await Promise.all(
    ranges.map(([fromBlock, toBlock]) => rpc.getLogs({ address: params.address, fromBlock, toBlock })),
  );
  return chunks.flat();
}

/** Resolves timestamps for a set of blocks (batched JSON-RPC). */
export async function getBlockTimestamps(blockNumbers: bigint[]): Promise<Map<bigint, number>> {
  const unique = [...new Set(blockNumbers)];
  const blocks = await Promise.all(unique.map((blockNumber) => rpc.getBlock({ blockNumber })));
  return new Map(blocks.map((b) => [b.number, Number(b.timestamp) * 1000]));
}
