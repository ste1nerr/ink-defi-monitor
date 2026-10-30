export const CHAIN_ID = 57073;
export const POOL = "0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA";
export const POOL_START_BLOCK = 26821425;
/** About one hour at Ink's 1s block time. */
export const SNAPSHOT_EVERY = 3600;

// Tydro docs → Smart Contracts; the same addresses the subgraph hard-codes.
export const DATA_PROVIDER = "0x96086C25d13943C80Ff9a19791a40Df6aFC08328";
export const ORACLE = "0x4758213271BFdC72224A7a8742dC865fC97756e1";

/** graph-ts `bytes.concatI32(n)`: the bytes followed by a little-endian int32. */
export function concatI32(hex: string, n: number): string {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n);
  return hex.toLowerCase() + b.toString("hex");
}
