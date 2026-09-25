# Ink DeFi Monitor

**Live:** https://ink-defi-monitor-web-beta.vercel.app · API: [`/api/v1/health`](https://ink-defi-monitor-web-beta.vercel.app/api/v1/health)

A read-only, cross-protocol monitoring layer for Ink DeFi. It shows Tydro and Nado activity in one
normalized event and metrics model, with a source attached to every figure.

> Status: **P0 in progress.** Tydro, Nado and the cross-protocol event timeline work end to end.
> Wallet pages, agent endpoints and deployment are next.
> Research and data-source verification are in [`docs/research.md`](docs/research.md).

## What works today
| Area | State | Source |
|---|---|---|
| Ink health / latest block | ✅ live | Ink RPC |
| Tydro reserves: supply, borrow, available, utilization, APYs, oracle prices | ✅ live | TydroProtocolDataProvider + TydroOracle |
| Tydro events (supply / withdraw / borrow / repay / liquidation / collateral / flash loan), filters + pagination | ✅ full history with Goldsky; last ~3000 blocks without it | `indexer/tydro` subgraph / Pool logs over RPC |
| Tydro history (supplied, borrowed, utilization; 24h–90d) | ✅ needs Goldsky | hourly `ReserveSnapshot`s |
| Nado: OI, 24h volume / liquidations / trades, funding, TVL, DAU, 96 markets | ✅ live | Nado archive `market_snapshots` + gateway `/v2/assets` |
| Nado history (OI, volume, liquidations; 24h–90d) | ✅ live | Nado archive |
| Nado liquidation events (hourly per-market aggregates, no tx hash) | ✅ live, last 24h | cumulative liquidation counters |
| Cross-protocol timeline `/events` | ✅ live | merges all adapters, per-source coverage shown |
| Wallet pages | ⏳ next | |

## Layout
```
server/                Node + Hono API (TypeScript, viem, zod)
  src/config/          env, chain constants
  src/data/            RPC client (chunked getLogs, batching, retries), SWR cache
  src/domain/          ProtocolEvent / DataProvenance types, bigint-safe unit helpers
  src/protocols/       one folder per protocol adapter + registry
  src/api/             HTTP routes (/api/v1)
  test/                vitest; Tydro tests use real mainnet receipts as fixtures
web/                   React + Vite + Tailwind + TanStack Query
indexer/tydro/         Goldsky subgraph: Tydro Pool events + hourly reserve snapshots (see its README)
docs/                  research, data sources
```

## Deployment
Vercel, from this repository (every push to `main` deploys). `npm run vercel-build` writes the
[Build Output API](https://vercel.com/docs/build-output-api/v3) layout: the Vite site as static files and the
Hono API as one Node.js function under `/api/*`. API responses carry `s-maxage` headers so the CDN absorbs
repeat traffic. Set `INK_RPC_URL` and `GOLDSKY_TYDRO_URL` in the Vercel project's environment variables.

## Run locally
```bash
npm install
cp .env.example .env          # optional: set INK_RPC_URL to your Alchemy URL
npm run dev:server            # http://localhost:8787
npm run dev:web               # http://localhost:5173 (proxies /api to the server)
npm test                      # server tests
```

## Environment
| Variable | Default | Purpose |
|---|---|---|
| `INK_RPC_URL` | public Ink RPC | Alchemy URL recommended (`https://ink-mainnet.g.alchemy.com/v2/<KEY>`) |
| `PORT` | `8787` | API port |
| `GOLDSKY_TYDRO_URL` | unset | Tydro subgraph GraphQL URL; enables full event history and `/history` |
| `CORS_ORIGIN` | `http://localhost:5173` | Web origin allowed to call the API |

## API (v1)
| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/health` | chain id, RPC source/latency, latest block |
| GET | `/api/v1/protocols` | registered protocol adapters |
| GET | `/api/v1/protocols/:protocol` | overview + `cachedAt`, `stale` |
| GET | `/api/v1/protocols/:protocol/events?limit=&offset=&type=borrow,liquidation&wallet=0x…&asset=0x…` | normalized events page + coverage (`indexed` / `recent-window`) |
| GET | `/api/v1/protocols/:protocol/history?range=24h\|7d\|30d\|90d` | history series (Tydro: 503 without Goldsky) |
| GET | `/api/v1/events?protocol=tydro,nado&type=&limit=&offset=` | merged timeline + per-source coverage/errors (offset + limit ≤ 1000) |

## Data rules
- No fabricated values. When a metric cannot be read, the UI shows **Data unavailable**.
- USD values use the **protocol's own oracle** (the price Tydro uses for liquidations). Event USD amounts use the price at retrieval time and are labelled that way.
- Logs that cannot be decoded are returned as `unknown`, not guessed.
- Read-only: no wallet keys, no transactions.

## Limitations (current)
- Without `GOLDSKY_TYDRO_URL`, Tydro events cover only a recent block window (public RPC: 1000 blocks per `eth_getLogs`) and history is unavailable.
- Indexed event pagination is offset-based, capped at offset + limit ≤ 5000 (The Graph limit); use filters for deeper queries.
- The public Ink RPC rate-limits per IP; use an Alchemy URL in production.
- Nado events carry a sequencer `submission_idx`, not a transaction hash, so they cannot link to the explorer. Raw `liquidate_subaccount` events are not interpreted (their per-product semantics are undocumented); liquidations are shown as hourly aggregates of Nado's documented cumulative counter.
- Nado values are USDT0-denominated (shown with a `$` sign; USDT0 is a USD stablecoin).
- Nado `market_snapshots` limits `interval.count × products < 2000`, so requests are chunked by product.
