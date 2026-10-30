// Independent check of the indexed rows against the chain, without HyperSync or
// the indexer's code: PoolEvent rows are rebuilt from eth_getLogs and
// ReserveSnapshot rows from plain (non-multicall) eth_calls, then compared with
// Postgres field by field.
//
//   node scripts/parity-rpc.mjs --from 26821425 --to 27000000 --snapshots 40
//
// Reads the same ENVIO_PG_* variables as the indexer and the public Ink RPC
// (or ENVIO_RPC_URL). Needs `psql` on the PATH.
import { execFileSync } from "node:child_process";
import { createPublicClient, decodeEventLog, http, parseAbi } from "viem";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const FROM = Number(arg("from", "26821425"));
const TO = Number(arg("to", "27000000"));
const SNAP_SAMPLE = Number(arg("snapshots", "40"));
const SNAPSHOT_START = 26821425;
const EVERY = 3600;
const POOL = "0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA";
const DATA_PROVIDER = "0x96086C25d13943C80Ff9a19791a40Df6aFC08328";
const ORACLE = "0x4758213271BFdC72224A7a8742dC865fC97756e1";
const rpc = (process.env.ENVIO_RPC_URL ?? "https://rpc-gel.inkonchain.com").split(",")[0].trim();
const client = createPublicClient({ transport: http(rpc, { retryCount: 8, retryDelay: 1000, timeout: 30_000 }) });

const abi = parseAbi([
  "event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)",
  "event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)",
  "event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)",
  "event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)",
  "event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)",
  "event ReserveUsedAsCollateralEnabled(address indexed reserve, address indexed user)",
  "event ReserveUsedAsCollateralDisabled(address indexed reserve, address indexed user)",
  "event FlashLoan(address indexed target, address initiator, address indexed asset, uint256 amount, uint8 interestRateMode, uint256 premium, uint16 indexed referralCode)",
]);
const pool = parseAbi(["function getReservesList() view returns (address[])"]);
const provider = parseAbi([
  "function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)",
]);
const oracle = parseAbi(["function getAssetPrice(address asset) view returns (uint256)"]);

const le32 = (n) => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b.toString("hex"); };
const lc = (a) => a?.toLowerCase();

function sql(query) {
  const env = { ...process.env, PGPASSWORD: process.env.ENVIO_PG_PASSWORD ?? "testing" };
  const out = execFileSync("psql", [
    "-h", process.env.ENVIO_PG_HOST ?? "localhost",
    "-p", process.env.ENVIO_PG_PORT ?? "5432",
    "-U", process.env.ENVIO_PG_USER ?? "postgres",
    "-d", process.env.ENVIO_PG_DATABASE ?? "envio-dev",
    "-At", "-c", `select coalesce(json_agg(t), '[]') from (${query}) t`,
  ], { env, maxBuffer: 1 << 30 });
  // Quote integers above 2^53 so JSON.parse does not round them to floats.
  return JSON.parse(out.toString().replace(/(?<=[:\[,])(-?\d{16,})(?=[,}\]])/g, '"$1"'));
}

async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

// ---- events ---------------------------------------------------------------
const ranges = [];
for (let s = FROM; s <= TO; s += 1000) ranges.push([s, Math.min(s + 999, TO)]);
const logs = (await mapLimit(ranges, 8, ([fromBlock, toBlock]) =>
  client.getLogs({ address: POOL, fromBlock: BigInt(fromBlock), toBlock: BigInt(toBlock) }))).flat();

const expected = new Map();
for (const log of logs) {
  let ev;
  try { ev = decodeEventLog({ abi, data: log.data, topics: log.topics }); } catch { continue; } // bookkeeping events
  const a = ev.args;
  const row = { type: null, asset: null, user: null, amount: null, caller: null, interestRateMode: null,
    usedAsCollateral: null, collateralAsset: null, liquidatedCollateralAmount: null, liquidator: null, premium: null };
  switch (ev.eventName) {
    case "Supply": Object.assign(row, { type: "supply", asset: a.reserve, user: a.onBehalfOf, amount: a.amount, caller: a.user }); break;
    case "Withdraw": Object.assign(row, { type: "withdraw", asset: a.reserve, user: a.user, amount: a.amount }); break;
    case "Borrow": Object.assign(row, { type: "borrow", asset: a.reserve, user: a.onBehalfOf, amount: a.amount, caller: a.user, interestRateMode: Number(a.interestRateMode) }); break;
    case "Repay": Object.assign(row, { type: "repay", asset: a.reserve, user: a.user, amount: a.amount, caller: a.repayer }); break;
    case "LiquidationCall": Object.assign(row, { type: "liquidation", asset: a.debtAsset, user: a.user, amount: a.debtToCover, collateralAsset: a.collateralAsset, liquidatedCollateralAmount: a.liquidatedCollateralAmount, liquidator: a.liquidator }); break;
    case "ReserveUsedAsCollateralEnabled": Object.assign(row, { type: "collateral_change", asset: a.reserve, user: a.user, amount: 0n, usedAsCollateral: true }); break;
    case "ReserveUsedAsCollateralDisabled": Object.assign(row, { type: "collateral_change", asset: a.reserve, user: a.user, amount: 0n, usedAsCollateral: false }); break;
    case "FlashLoan": Object.assign(row, { type: "flash_loan", asset: a.asset, user: a.initiator, amount: a.amount, caller: a.target, premium: a.premium }); break;
  }
  row.blockNumber = log.blockNumber; row.txHash = log.transactionHash; row.logIndex = log.logIndex;
  expected.set(`${log.transactionHash.toLowerCase()}${le32(log.logIndex)}`, row);
}

const blocks = [...new Set([...expected.values()].map((r) => r.blockNumber))];
const ts = new Map(await mapLimit(blocks, 8, async (b) => [b, (await client.getBlock({ blockNumber: b })).timestamp]));

const actual = new Map(sql(`select * from "PoolEvent" where "blockNumber" between ${FROM} and ${TO}`).map((r) => [r.id, r]));
const nz = (v) => (v === null || v === undefined ? null : String(v));
let evDiffs = 0, evFields = 0;
const note = (msg) => { if (evDiffs++ < 20) console.log("  DIFF", msg); };
for (const [id, e] of expected) {
  const r = actual.get(id);
  if (!r) { note(`missing in db: ${id}`); continue; }
  const want = { type: e.type, reserve_id: lc(e.asset), user: lc(e.user), amount: e.amount, caller: lc(e.caller),
    interestRateMode: e.interestRateMode, usedAsCollateral: e.usedAsCollateral, collateralAsset: lc(e.collateralAsset),
    liquidatedCollateralAmount: e.liquidatedCollateralAmount, liquidator: lc(e.liquidator), premium: e.premium,
    blockNumber: e.blockNumber, timestamp: ts.get(e.blockNumber), txHash: lc(e.txHash), logIndex: BigInt(e.logIndex) };
  for (const [k, v] of Object.entries(want)) {
    evFields++;
    if (nz(v) !== nz(r[k])) note(`${id} ${k}: chain=${nz(v)} db=${nz(r[k])}`);
  }
}
for (const id of actual.keys()) if (!expected.has(id)) note(`extra in db: ${id}`);
console.log(`events ${FROM}-${TO}: chain ${expected.size}, db ${actual.size}, fields compared ${evFields}, differences ${evDiffs}`);

// ---- snapshots ------------------------------------------------------------
const snapBlocks = [];
for (let b = SNAPSHOT_START; b <= TO; b += EVERY) if (b >= FROM) snapBlocks.push(b);
const stride = Math.max(1, Math.floor(snapBlocks.length / SNAP_SAMPLE));
const sample = snapBlocks.filter((_, i) => i % stride === 0 || i === snapBlocks.length - 1);
const dbSnaps = sql(`select * from "ReserveSnapshot" where "blockNumber" in (${sample.join(",") || 0})`);
const bySnap = new Map(dbSnaps.map((r) => [r.id, r]));
let snapDiffs = 0, snapFields = 0, snapRows = 0;
const noteS = (msg) => { if (snapDiffs++ < 20) console.log("  DIFF", msg); };
for (const b of sample) {
  const bn = BigInt(b);
  const list = await client.readContract({ address: POOL, abi: pool, functionName: "getReservesList", blockNumber: bn });
  const stamp = (await client.getBlock({ blockNumber: bn })).timestamp;
  for (const asset of list) {
    let d;
    try { d = await client.readContract({ address: DATA_PROVIDER, abi: provider, functionName: "getReserveData", args: [asset], blockNumber: bn }); } catch { continue; }
    let price = null;
    try { price = await client.readContract({ address: ORACLE, abi: oracle, functionName: "getAssetPrice", args: [asset], blockNumber: bn }); } catch {}
    const id = `${lc(asset)}${le32(b)}`;
    snapRows++;
    const r = bySnap.get(id);
    if (!r) { noteS(`missing in db: ${id}`); continue; }
    const want = { reserve_id: lc(asset), blockNumber: bn, timestamp: stamp, totalSupplied: d[2], totalBorrowed: d[3] + d[4],
      liquidityRate: d[5], variableBorrowRate: d[6], priceUsd: price };
    for (const [k, v] of Object.entries(want)) { snapFields++; if (nz(v) !== nz(r[k])) noteS(`${id} ${k}: chain=${nz(v)} db=${nz(r[k])}`); }
    bySnap.delete(id);
  }
}
for (const id of bySnap.keys()) noteS(`extra in db: ${id}`);
console.log(`snapshots at ${sample.length} sampled blocks: rows ${snapRows}, fields compared ${snapFields}, differences ${snapDiffs}`);
process.exit(evDiffs + snapDiffs ? 1 : 0);
