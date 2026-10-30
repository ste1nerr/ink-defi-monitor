// Compares every Reserve, PoolEvent and ReserveSnapshot served by a Tydro
// subgraph GraphQL endpoint (graph-node, Goldsky, ...) at one block with the
// rows the HyperIndex port wrote to Postgres, field by field.
//
//   node scripts/parity-subgraph.mjs --url <graphql-url> --block 27500000
//
// Pages by id (first: 1000, id_gt) with a short pause between requests. Reads
// the same ENVIO_PG_* variables as the indexer; needs `psql` on the PATH.
// Run the indexer with ENVIO_END_BLOCK=<block> (or compare a block it has passed).
import { execFileSync } from "node:child_process";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const URL_ = arg("url");
const BLOCK = Number(arg("block"));
const PAUSE_MS = Number(arg("pause-ms", "500"));
if (!URL_ || !BLOCK) { console.error("usage: --url <graphql-url> --block <n>"); process.exit(2); }

const FIELDS = {
  Reserve: ["symbol", "decimals", "firstSeenBlock"],
  PoolEvent: ["type", "reserve { id }", "user", "amount", "caller", "interestRateMode", "usedAsCollateral", "collateralAsset",
    "liquidatedCollateralAmount", "liquidator", "premium", "blockNumber", "timestamp", "txHash", "logIndex"],
  ReserveSnapshot: ["reserve { id }", "blockNumber", "timestamp", "totalSupplied", "totalBorrowed", "liquidityRate", "variableBorrowRate", "priceUsd"],
};
const PLURAL = { Reserve: "reserves", PoolEvent: "poolEvents", ReserveSnapshot: "reserveSnapshots" };
const BLOCK_COL = { Reserve: "firstSeenBlock", PoolEvent: "blockNumber", ReserveSnapshot: "blockNumber" };

async function fetchAll(entity) {
  const rows = [];
  let last = "";
  for (;;) {
    const query = `{ ${PLURAL[entity]}(first: 1000, orderBy: id, where: {id_gt: "${last}"}, block: {number: ${BLOCK}}) { id ${FIELDS[entity].join(" ")} } }`;
    const res = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
    const body = await res.json();
    if (body.errors) throw new Error(JSON.stringify(body.errors));
    const page = body.data[PLURAL[entity]];
    rows.push(...page);
    if (page.length < 1000) return rows;
    last = page[page.length - 1].id;
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
}

function pg(entity) {
  const env = { ...process.env, PGPASSWORD: process.env.ENVIO_PG_PASSWORD ?? "testing" };
  const out = execFileSync("psql", [
    "-h", process.env.ENVIO_PG_HOST ?? "localhost", "-p", process.env.ENVIO_PG_PORT ?? "5432",
    "-U", process.env.ENVIO_PG_USER ?? "postgres", "-d", process.env.ENVIO_PG_DATABASE ?? "envio-dev",
    "-At", "-c", `select coalesce(json_agg(t), '[]') from (select * from "${entity}" where "${BLOCK_COL[entity]}" <= ${BLOCK}) t`,
  ], { env, maxBuffer: 1 << 30 });
  // Quote integers above 2^53 so JSON.parse does not round them to floats.
  return JSON.parse(out.toString().replace(/(?<=[:\[,])(-?\d{16,})(?=[,}\]])/g, '"$1"'));
}

const norm = (v) => (v === null || v === undefined ? null : String(v));
let total = 0, rowsTotal = 0, fieldsTotal = 0;
for (const entity of Object.keys(FIELDS)) {
  const theirs = new Map((await fetchAll(entity)).map((r) => [r.id, r]));
  const ours = new Map(pg(entity).map((r) => [r.id, r]));
  let diffs = 0, fields = 0;
  const note = (m) => { if (diffs++ < 20) console.log("  DIFF", entity, m); };
  for (const [id, t] of theirs) {
    const o = ours.get(id);
    if (!o) { note(`missing in port: ${id}`); continue; }
    for (const f of FIELDS[entity]) {
      const rel = f.startsWith("reserve {");
      const key = rel ? "reserve_id" : f;
      const a = norm(rel ? t.reserve.id : t[f]);
      const b = norm(o[key]);
      fields++;
      if (a !== b) note(`${id} ${key}: subgraph=${a} port=${b}`);
    }
  }
  for (const id of ours.keys()) if (!theirs.has(id)) note(`extra in port: ${id}`);
  console.log(`${entity}: subgraph ${theirs.size}, port ${ours.size}, fields compared ${fields}, differences ${diffs}`);
  total += diffs; rowsTotal += theirs.size; fieldsTotal += fields;
}
console.log(`total: ${rowsTotal} rows, ${fieldsTotal} fields, ${total} differences (at block ${BLOCK})`);
process.exit(total ? 1 : 0);
