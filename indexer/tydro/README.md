# Tydro subgraph (Goldsky)

Indexes the Tydro Pool on Ink mainnet for Ink DeFi Monitor:

- **PoolEvent**: supply, withdraw, borrow, repay, liquidation, collateral_change and flash_loan events, from the first Pool log (block 26,821,425) onwards.
- **ReserveSnapshot**: every 3,600 blocks (about 1 hour), a polling block handler reads each reserve's `getReserveData` (ProtocolDataProvider) and `getAssetPrice` (TydroOracle). This is the full historical TVL and utilization series.
- **Reserve**: symbol and decimals, read once per asset.

Bookkeeping events (`ReserveDataUpdated`, `MintedToTreasury`, `IsolationModeTotalDebtUpdated`) are not stored.

## Build and test
```bash
npm install
npm run codegen && npm run build
npx graph test        # matchstick unit tests (values from real mainnet txs)
```

## Deploy to Goldsky
```bash
curl https://goldsky.com | sh          # install the Goldsky CLI
goldsky login                          # API key from app.goldsky.com → Settings
npm run codegen && npm run build
goldsky subgraph deploy tydro-ink/0.1.0 --path .
```
Then set the GraphQL URL shown by Goldsky in the root `.env`:
```
GOLDSKY_TYDRO_URL=https://api.goldsky.com/api/public/<project>/subgraphs/tydro-ink/0.1.0/gn
```
Check sync progress with `goldsky subgraph list` or `GET /api/v1/health` → `indexers.tydro`.

## Cost
- Starter plan: one-time $100 credit, with no monthly reset. One always-on subgraph worker costs about $36.50/month, and storage above 100K entities is billed. The snapshots alone add about 13 × 24 = 312 entities per day.
- Goldsky marks Ink subgraphs **"Partner sponsored"**: usage is covered by the chain *if approved by the Ink team* ([docs.goldsky.com/chains/ink](https://docs.goldsky.com/chains/ink)). Apply before the credit runs out.

## Notes
- The snapshot handler makes 2 `eth_call`s per reserve per snapshot, so the initial sync is slower than for an event-only subgraph.
- If a call reverts (for example before a contract existed), that reserve's snapshot is skipped. Nothing is invented.
