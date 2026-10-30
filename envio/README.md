# Envio HyperIndex port of `indexer/tydro`

This directory ports the [`indexer/tydro`](../indexer/tydro/README.md) subgraph
to [Envio HyperIndex](https://docs.envio.dev). It indexes the same Tydro Pool
on Ink from the same block (26,821,425), and produces the same three entities
(`Reserve`, `PoolEvent`, `ReserveSnapshot`) with the same names, fields and
ids. Event logs come from HyperSync. The hourly snapshot reads come from an
Ink archive RPC. The project targets `envio` 3.15.0.

The subgraph is untouched. The port sits beside it, with its own pnpm lockfile
(the Envio CLI expects pnpm) and is not part of the npm workspace.

## Run it

You need Node.js 22.15 or later, pnpm 10, Docker (for `pnpm dev`) and an Envio
API token for HyperSync (<https://envio.dev/app/api-tokens>).

```bash
cd envio
pnpm install
cp .env.example .env          # set ENVIO_API_TOKEN; optionally ENVIO_RPC_URL
pnpm dev                      # starts Postgres and Hasura in Docker, then indexes
```

Hasura serves GraphQL at <http://localhost:8080> (local admin password
`testing`). A full sync from block 26,821,425 to head took 37 minutes on the
public Ink RPC and about 30 seconds with the snapshot reads already cached;
see [Benchmark](#benchmark).

To use your own Postgres instead of Docker, set `ENVIO_PG_HOST`,
`ENVIO_PG_PORT`, `ENVIO_PG_USER`, `ENVIO_PG_PASSWORD` and `ENVIO_PG_DATABASE`
(plus `ENVIO_HASURA=false` if you run without Hasura), then `pnpm start -r`.
The `-r` flag wipes the database and re-indexes from scratch.

Other commands:

```bash
pnpm codegen      # regenerate types after editing config.yaml or schema.graphql
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest: ids and snapshot decoding
```

### RPC

The hourly snapshot needs, per snapshot block, the Pool's reserve list and
`getReserveData` / `getAssetPrice` for each reserve. That is two Multicall3
`eth_call`s per block (9,177 blocks to date), cached in the database by the
Effect API. Each new reserve's `symbol` and `decimals` are read once.

`ENVIO_RPC_URL` takes one archive endpoint or a comma-separated list. If it is
unset, the indexer uses the public Ink RPC (`rpc-gel.inkonchain.com`) that the
server already defaults to. It serves historical `eth_call`s, but limits each
IP's request rate. The snapshot effect is capped at 20 calls per second to stay
under the limit; with a dedicated node you can raise it in `src/lib/rpc.ts`.

A failed RPC request is retried with backoff. After ten failures the indexer
stops. A transport error is never treated as a contract revert, so a flaky
endpoint cannot drop a reserve's snapshot. Set `ENVIO_RPC_STATS=1` to log the
request count and summed request time every 500 requests.

## What maps to what

| Subgraph (`subgraph.yaml`, `src/pool.ts`)                          | HyperIndex                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `Pool` data source, 8 event handlers                               | `Pool` contract, 8 `indexer.onEvent` handlers in `src/handlers/pool.ts`              |
| `handleSnapshotBlock`, polling `every: 3600` from block 26,821,425 | `indexer.onBlock` with `_gte: 26821425, _every: 3600`                                |
| `try_getReservesList`, `try_getReserveData`, `try_getAssetPrice`   | `reserveSnapshot` effect: Multicall3 `aggregate3` with `allowFailure`; a revert skips the reserve (or leaves `priceUsd` null) |
| `ERC20.try_symbol` / `try_decimals` in `getOrCreateReserve`        | `tokenMeta` effect, at the block where the reserve is first seen                     |
| `schema.graphql`                                                   | `schema.graphql`: the same entities and fields                                       |

Details that matter for exact parity:

- **Ids.** `PoolEvent` ids are the transaction hash followed by the log index
  as a little-endian int32, as graph-ts `concatI32` builds them.
  `ReserveSnapshot` ids are the lowercase asset address followed by the block
  number the same way. `Reserve` ids are lowercase asset addresses.
- **Snapshot blocks.** `onBlock` keeps `(block - 26821425) % 3600 == 0`, the
  same blocks as the subgraph's polling filter, including the first one.
- **Reserve creation.** As in the subgraph, a reserve is created by the first
  event or snapshot that mentions it. A liquidation also creates the collateral
  reserve.
- **Reverts.** A reverted or undecodable `getReserveData` skips that reserve's
  snapshot. A reverted `getAssetPrice` leaves `priceUsd` null. Unknown
  `symbol` / `decimals` become `"Unknown"` / `-1`.

## Differences a consumer will notice

The stored data is identical. The API around it is not.

- **Query shape.** HyperIndex serves a Hasura GraphQL API, not graph-node's, so
  `server/src/protocols/tydro/subgraph.ts` would need small rewrites: for
  example `poolEvents(first, skip, where: {type_in: …}, orderBy: timestamp,
  orderDirection: desc)` becomes `PoolEvent(limit, offset, where: {type:
  {_in: …}}, order_by: {timestamp: desc})`, and `_meta { block hasIndexingErrors }`
  becomes `_meta { chainId progressBlock isReady }`. I did not port or run the
  server against Hasura.
- **Hex fields are plain strings.** `Bytes` fields (`id`, `user`, `caller`,
  `collateralAsset`, `liquidator`, `txHash`) are stored as lowercase `0x` hex
  text. `Reserve` is referenced by a `reserve_id` column, exposed as a
  `reserve` relationship.
- **Extra column.** Every table has a `chainId` column, always `57073`.
- **No time-travel queries** (`block: {number: N}`). The three entities are
  immutable except `Reserve`, which is written once; history is complete.
- **Not ported:** Goldsky deployment (`goldsky subgraph deploy`) and matchstick
  tests. Unit tests for the new code are in `src/lib/rpc.test.ts`.

## Benchmark

Cold full sync on one Apple Silicon laptop shared with other indexers, Postgres
17 in Docker, envio 3.15.0, from block 26,821,425 to chain head (59,857,690
when it finished). Time runs from "Starting indexing" to "Ready" in the log.
The machine was busy, so treat the timings as noisy.

| Run                                  | Time    | Pool events processed¹ | Snapshot blocks | RPC requests |
| ------------------------------------ | ------- | ------ | --------------- | ------------ |
| Cold, empty database and no cache    | 2,219 s | 708,680 | 9,177 | 27,500+ (13,426 retries) |
| Warm, snapshot reads loaded from `.envio/cache` | 32 s | 708,681 | 9,177 | 0 |

¹ `envio_chains.events_processed` minus the 9,177 snapshot-block calls. The chain kept
producing blocks, so the two runs ended a few dozen blocks apart.

Roughly 98% of the cold sync is therefore waiting on the public RPC (cold
minus warm). HyperSync delivered all the Pool events in the 32-second warm
run. The cold run's retries come from the public endpoint's per-IP rate limit,
which is shared with whatever else runs on the same address. A dedicated
archive RPC should shorten the cold run considerably; I have not measured one.

The warm run copied the effect cache from the first run's database into
`.envio/cache/57073/*.tsv`, the mechanism the
[docs](https://docs.envio.dev/docs/HyperIndex/effect-api#reuse-effect-cache-on-indexer-reruns)
describe. It produced the same data as the cold run (checked for every
`PoolEvent` up to block 59,850,000).

I did not time the subgraph. graph-node ran on this machine only for the parity
check below, as an emulated amd64 image on arm64, and the production Goldsky
deployment cannot be timed from outside.

## Parity

The Goldsky endpoint is not public, so I ran the unchanged subgraph on
graph-node v0.37.0 against the same public Ink RPC, limited to blocks
26,821,425 to 27,500,000 (the only change is an `endBlock` in the copy's
`subgraph.yaml`; the ABIs also needed `"anonymous": false` and empty output
names added to load in graph-node 0.37). The port was run to chain head;
rows up to block 27,500,000 were compared field by field with
`scripts/parity-subgraph.mjs`, which queries the subgraph with
`block: {number: 27500000}` and pages by id:

| Entity           | Rows   | Fields compared | Differences |
| ---------------- | ------ | --------------- | ----------- |
| Reserve          | 5      | 15              | 0           |
| PoolEvent        | 28,492 | 427,380         | 0           |
| ReserveSnapshot  | 945    | 7,560           | 0           |

Every id set was equal. That range covers 189 snapshot blocks and 5 of the 14
reserves. It does not cover later reserves, so a second check,
`scripts/parity-rpc.mjs`, rebuilds rows straight from `eth_getLogs` and plain
`eth_call`s (no HyperSync, no Multicall) and compares them with the database:

- Blocks 59,000,000 to 59,850,000: 7,415 `PoolEvent` rows in the chain logs and
  7,415 in the database, 111,225 fields compared, 0 differences.
- 35 sampled snapshot blocks (every 3,600th from 26,821,425 onwards, plus the
  last one in range, across the whole history): 490 `ReserveSnapshot` rows,
  3,920 fields compared, 0 differences. At the late blocks all 14 reserves are
  present.

(Run on 2026-10-30 with `--from 59000000 --to 59850000 --snapshots 30`.)

To check against your own deployment, point the first script at the Goldsky URL:

```bash
node scripts/parity-subgraph.mjs --url https://api.goldsky.com/api/public/<project>/subgraphs/tydro-ink/0.1.0/gn --block <N>
```

Run the indexer with `ENVIO_END_BLOCK=<N>` first so both sides are at the same
block. Both scripts need `psql` and read the `ENVIO_PG_*` variables.
