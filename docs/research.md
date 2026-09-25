# Ink DeFi Monitor — Research Report

Research date: 2026-09-25. Every item marked **Verified** was confirmed by a live call
(RPC / HTTP) or by the protocol's own documentation on that date. Items marked
**Unverified** were not confirmed and must not be relied on in the product.

---

## A. Ecosystem & Spark

| Fact | Value | Evidence |
|---|---|---|
| Ink mainnet chain ID | 57073 (`0xdef1`) | Verified: `eth_chainId` on `https://rpc-gel.inkonchain.com` |
| Block time | ~1 s | Verified: Blockscout `/api/v2/stats` `average_block_time: 1000` |
| Explorer | `https://explorer.inkonchain.com` (Blockscout, public REST API v2) | Verified: `/api/v2/stats`, `/api/v2/addresses/{addr}/transactions` |
| Public RPC limit | `eth_getLogs` max **1000 blocks** per request | Verified (error `-32602 block range greater than 1000 max`) |
| Official indexers listed by Ink | Goldsky, Alchemy Subgraphs, Envio | [docs.inkonchain.com/tools/indexers](https://docs.inkonchain.com/tools/indexers) |

**Spark program** ([source](https://docs.inkonchain.com/ink-builder-program/spark-program)):
500–20,000 USDC, non-dilutive, for *live* projects. Six criteria: Ink Ecosystem Alignment,
Proof of Live Utility, Measurable Traction, Priority Fit, Responsible Use of Funds, Builder
Credibility. Current priorities: **Tydro integrations, Nado applications, RWA infrastructure,
AI-agent transaction infrastructure, cross-protocol combinations.**

"Cross-protocol combinations" is an explicitly listed priority — this is the strongest
alignment point for this product.

## B. Competitor matrix

| Product | What it does | Protocols | Historical | Event-level | Alerts | Cross-protocol | API | Agent-readable | Gap |
|---|---|---|---|---|---|---|---|---|---|
| **DefiLlama** | TVL/fees/revenue aggregates | Tydro (Lending, Ink), Nado (listed) | Yes (daily TVL) | No | No (not verified) | Aggregate only | Yes (public) | Indirectly | No per-reserve utilization, no events, daily granularity |
| **OAK Research** | Protocol analytics page for Tydro | Tydro | Yes | No | Not verified | No | Not verified | No | Data is sourced from DefiLlama (stated on page) — same gaps |
| **Nado app / Archive API** | Official Nado trading UI + indexer | Nado only | Yes (hourly snapshots, candles, events) | Yes | No public alerts found | No | Yes (public, no key) | Via nado-mcp | Nado-only; raw x18 values; no Ink/Tydro context |
| **Tydro app + docs** | Official lending UI | Tydro only | Limited in UI | No | No | No | No public REST API found | Tydro MCP (community `mavrkofficial/tydro-mcp`, linked from Tydro docs) | Tydro-only |
| **Aave protocol subgraph "Protocol V3 Ink"** | GraphQL index of Aave v3 on Ink | Tydro | Yes | Yes | No | No | GraphQL (The Graph, API key) | No | Explorer shows 0 signal, last updated ~1 year ago; sync status not verifiable without key |
| **nado-mcp (nadohq)** | MCP: market data + trading | Nado | Yes | Yes | No | No | — | Yes | Can execute trades; Nado-only |
| **inkonchain-mcp (quostr)** | MCP: ~93 tools (Tsunami DEX, ZNS, DailyGM, Relay…) | Tsunami, misc. | Partial | No | No | Partly | — | Yes | Needs a private key; no Tydro/Nado monitoring |
| **Ink Explorer (Blockscout)** | Blocks, txs, addresses | All (raw) | Yes | Raw logs | No | No semantics | Yes | No | No protocol semantics |
| **InkScope** ([repo](https://github.com/wingarddavid20-jpg/inkscope), [live](https://inkscope-one.vercel.app/)) — found 2026-09-25 | Tydro + Nado dashboard, wallet positions, health-factor risk labels, ecosystem/NFT/DEX pages | Tydro, Nado, DefiLlama data | Not mentioned | Recent Nado trades | Not mentioned | Yes (same pairing) | MCP at `/api/mcp` | Yes (MCP) | **Closest competitor.** Created 2026-08-27, 22 commits. README/page show no history charts, unified event timeline, alerts or provenance; main metrics showed "Unavailable/Refreshing" when fetched server-side (may load client-side) |
| **Nado Explorer** (listed on ecosystem.nado.xyz) | Nado traders, markets, points, cohorts, fees, funding, liquidations | Nado | Likely | Likely | Not verified | No | Not verified | Not verified | Deep Nado-only analytics — do not compete on Nado depth |
| **nuanze** (ecosystem.nado.xyz) | "On-chain perps analytics dashboard" | Nado | Not verified | Not verified | Not verified | No | Not verified | Not verified | Nado-only |
| **Dune**: [Tydro](https://dune.com/sealaunch/tydro-liquidity-protocol-built-on-ink-and-powered-by-aave), [Nado](https://dune.com/23studio/nado-dashboard) | SQL dashboards | one protocol each | Yes | Yes (SQL) | No | No | Dune API (paid tiers) | No | Separate dashboards; no unified model or provenance per value |
| **Inkavern** | — | — | — | — | — | — | — | — | **Unverified**: no search results, domains `inkavern.{com,xyz,io,app}` did not resolve. Need a link from the user. |

## C. Existing Tydro tooling
- Tydro = white-label **Aave v3** instance ([Aave blog](https://aave.com/blog/kraken-ink), [Tydro docs](https://docs.tydro.com)).
- Official contract list (Tydro docs "Smart Contracts"); key addresses verified on-chain:
  - PoolAddressesProvider `0x4172E6aAEC070ACB31aaCE343A58c93E4C70f44D` → `getPool()` returns Pool ✔
  - Pool `0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA` → `getReservesList()` returns 13 reserves ✔
  - TydroProtocolDataProvider `0x96086C25d13943C80Ff9a19791a40Df6aFC08328` ✔
  - TydroOracle (AaveOracle, Chainlink feeds) `0x4758213271BFdC72224A7a8742dC865fC97756e1`, base unit 1e8 USD ✔
  - UIPoolDataProvider `0x39bc1bfDa2130d6Bb6DBEfd366939b4c7aa7C697` (not used — ABI differs between Aave versions)
- Tydro MCP (community) and the stale Aave subgraph above.

## D. Existing Nado tooling
- Official TypeScript SDK `nadohq/nado-typescript-sdk` (incl. `@nadohq/indexer-client`).
- **Gateway** `https://gateway.prod.nado.xyz/v1/query?type=all_products` — verified: 15 spot, 82 perp products, live `open_interest`, oracle price, cumulative funding.
- **Archive (indexer)** `https://api.prod.nado.xyz/archive/v1` (POST JSON, no key) — verified:
  - `market_snapshots` (hourly, per product): `open_interests`, `cumulative_volumes`, `cumulative_trades`, `cumulative_liquidation_amounts`, `funding_rates`, `tvl`, `daily_active_users`, `cumulative_users`, `oracle_prices`…
  - `events` with `event_types: ["liquidate_subaccount", …]` — verified.
- `gateway.prod.nado.xyz/v2/assets` — verified (market names/symbols).
- Nado is a **sequencer-based CLOB**: events carry `submission_idx`, **not a per-event tx hash**. Explorer links are not available for individual Nado fills/liquidations.

## E. Ink agent tooling
nado-mcp (official, can trade), Tydro MCP (community, can transact), inkonchain-mcp
(community, needs private key), moltiverse-mcp. **All are protocol-specific or
action-oriented; none found that provides read-only, normalized, cross-protocol state.**

## F. Product gap (verified scope)
1. No tool found that shows **Tydro and Nado on one timeline** with the same event model.
2. Per-reserve Tydro utilization history at sub-daily granularity is not offered by DefiLlama/OAK.
3. No read-only, key-free, agent-friendly endpoint summarising Ink DeFi state across protocols.
4. No factual threshold-based change detection (utilization Δ, OI Δ, large liquidation) across both.

## G. Product thesis
Even with few end users, the product produces **reusable infrastructure output**: a normalized
Ink DeFi event/metric API with provenance, which other builders and agents can consume
instead of integrating Aave-on-Ink contracts and Nado's x18 archive format themselves.
Its value is measurable (API requests, indexed events, snapshot count) independent of UI traffic.

## H. Data-source matrix

| Data | Source | Endpoint / Contract | Verified | Historical | Notes |
|---|---|---|---|---|---|
| Ink latest block | Ink RPC (Alchemy when key set) | `eth_blockNumber` | ✔ (public RPC) | — | Alchemy URL needs user's key |
| Ink network stats | Blockscout | `/api/v2/stats` | ✔ | No | Free, no key |
| Wallet tx history | Blockscout | `/api/v2/addresses/{a}/transactions` | ✔ | Yes | Alchemy Transfers API on Ink **unverified** (needs key) |
| Wallet token balances | Blockscout | `/api/v2/addresses/{a}/token-balances` | Not yet called | — | Verify during wallet phase |
| Tydro supply per reserve | Ink RPC | ProtocolDataProvider `getReserveData().totalAToken` | ✔ | Via our snapshots | |
| Tydro borrow per reserve | Ink RPC | `totalVariableDebt + totalStableDebt` | ✔ | Via our snapshots | |
| Tydro utilization | Derived | borrow / supply | ✔ | Via our snapshots | |
| Tydro rates | Ink RPC | `liquidityRate`, `variableBorrowRate` (ray, 1e27) | ✔ | Via our snapshots | |
| Tydro USD values | TydroOracle | `getAssetPrice` (1e8 USD, Chainlink) | ✔ | Via our snapshots | Protocol-native price |
| Tydro events (Supply/Borrow/Repay/Withdraw/LiquidationCall) | Ink RPC `eth_getLogs` on Pool | Aave v3 event ABI | Pending (decoding test) | Only going forward on free RPC | Full backfill needs an indexer (see J) |
| Nado volume | Nado Archive | `market_snapshots.cumulative_volumes` | ✔ | ✔ hourly | x18 USDT0 |
| Nado OI | Nado Gateway / Archive | `all_products.open_interest` / `market_snapshots.open_interests` | ✔ | ✔ | base units x18; × oracle price for notional |
| Nado funding | Nado Archive | `market_snapshots.funding_rates` | ✔ | ✔ | |
| Nado liquidations | Nado Archive | `events` type `liquidate_subaccount`; `cumulative_liquidation_amounts` | ✔ | ✔ | no tx hash |
| Token prices | Protocol oracles | TydroOracle; Nado `oracle_price_x18` | ✔ | ✔ | No third-party price API needed for MVP |

## I. Contracts / ABIs
Aave v3 standard ABIs (Pool events, ProtocolDataProvider, AaveOracle). Encoded as minimal
`parseAbi` fragments in `server/src/protocols/tydro/abi.ts`. Nado needs no ABI for MVP
(Endpoint `0x05ec92d78ed421f3d3ada77ffde167106565974e` from `query?type=contracts`, verified).

## J. Goldsky strategy — ⚠ conflicts with brief
- Goldsky supports Ink mainnet (Ink docs + Goldsky docs).
- **Goldsky Starter is a one-time $100 credit, not a monthly free tier** ([pricing](https://docs.goldsky.com/pricing/summary)). One always-on subgraph worker ≈ $36.50/month → the credit lasts ~2–3 months. **"Goldsky in production at $0" is not achievable long-term.**
- **Nado does not need Goldsky** — its official archive already provides hourly historical snapshots and events.
- Goldsky is useful for exactly one thing: **Tydro history** (events + hourly reserve snapshots).
- **Decision (2026-09-25): option (b) — Goldsky, per the brief.** A lean custom subgraph (`indexer/tydro`) instead of the full `aave/protocol-subgraphs`: fewer entities (cheaper), and it exposes exactly the fields the monitor uses.
- **Goldsky lists Ink subgraphs as "Partner sponsored"** — usage covered by the chain *if approved by the Ink team* ([docs.goldsky.com/chains/ink](https://docs.goldsky.com/chains/ink)). If approved, Goldsky becomes $0. Needs an application to Ink.
- Alternative kept on file: Blockscout's etherscan-compatible `getLogs` returns full Pool history for free (verified), usable as a fallback backfill source.

## K. Alchemy strategy
Alchemy's Ink page lists RPC, Token API, Transfers API, Webhooks, Prices API — **none tested
(requires the user's key)**. Design: `INK_RPC_URL` env var; Alchemy URL when provided, public
RPC fallback. Alchemy-specific methods are only used after they are verified with the key.

## L. Price strategy
| Asset | Source | API | Update | Reliability | Fallback |
|---|---|---|---|---|---|
| Tydro reserves | TydroOracle (Chainlink) | `getAssetPrice` | per Chainlink heartbeat | Same price the protocol uses for liquidations | quantity only |
| Nado products | Nado oracle | `oracle_price_x18` | real time | Same price Nado uses for margin | quantity only |

## M. Architecture
```
Ink RPC ─┐                      ┌─ /api/v1/* (Hono, zod, typed)
Nado API ─┼─> protocol adapters ─┼─ snapshot job (SQLite) → history
Blockscout┘   (normalize, prov.) └─ React (Vite, TanStack Query)
```
One Node process: API + in-process scheduler writing Tydro snapshots and new Tydro events
into SQLite. Nado history is read from Nado's archive on demand (cached).

## N. P0
Overview, Tydro page (reserves, utilization, history from snapshots), Nado page (OI, volume,
funding, liquidations, hourly history), unified /events, wallet (Blockscout txs + Tydro
position via `getUserReserveData`), health + freshness, provenance on every metric.

## O. Estimate (one senior full-stack dev)
Research ✔ (done) · P0 backend + adapters 5–7 days · P0 frontend 5–7 days · tests/docs/deploy
3–4 days · **≈ 3 weeks for P0**, +1–2 weeks P1 (alerts, agent endpoints, API docs).

## P. Cost
| Component | Choice | Cost |
|---|---|---|
| RPC | Public Ink RPC / Alchemy free tier | $0 (Alchemy free limits to be confirmed with key) |
| Nado data | Official API | $0 |
| Explorer data | Blockscout | $0 |
| Storage | SQLite on the host disk | $0 |
| Hosting | Single Node service (e.g. Fly.io/Render free tier) + static web | $0 within free limits |
| Tydro history | Goldsky subgraph | $100 one-time credit, then ~$36.50/month per worker — **$0 if Ink approves partner sponsorship** |

## Q. Risks
1. Tydro full history requires a paid indexer or a slow RPC backfill (1000 blocks/request ≈ 27k requests for 1 year).
2. Nado events have no tx hash → cannot link every event to the Explorer.
3. Aave subgraph for Ink looks unmaintained.
4. Public Ink RPC **rate-limits per IP** (verified: `-32016 Your IP has exceeded its request rate limit` after a burst of archive `eth_call`s). Production must use an Alchemy key; caching + backoff required. Nado API limits undocumented.
5. Alchemy Ink capabilities unverified until key provided.
6. Product risk: users may be satisfied by the native apps; value must come from cross-protocol view + API.

## R. Spark alignment
| Criterion | How |
|---|---|
| Ecosystem Alignment | Only covers Ink-native protocols (Tydro, Nado) |
| Proof of Live Utility | Live deployment, public API, open data sources |
| Measurable Traction | API request counts, wallets analyzed, events indexed, snapshot count — collected by the app itself |
| Priority Fit | Tydro + Nado + "cross-protocol combinations" + read-only agent endpoints |
| Responsible Use of Funds | Indexer cost (Goldsky), longer history, alert infrastructure, more adapters |
| Builder Credibility | Open-source repo, tests on real tx data, documented provenance |
