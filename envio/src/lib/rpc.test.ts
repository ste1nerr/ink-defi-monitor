import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeFunctionResult, parseAbi } from "viem";
import { concatI32 } from "./constants";
import { decodeSnapshot } from "./rpc";

const providerAbi = parseAbi([
  "function getReserveData(address asset) view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint40)",
]);
const oracleAbi = parseAbi(["function getAssetPrice(address asset) view returns (uint256)"]);

const reserveData = (v: bigint[]) => ({
  success: true,
  returnData: encodeFunctionResult({
    abi: providerAbi,
    functionName: "getReserveData",
    result: v as never,
  }),
});
const price = (p: bigint) => ({
  success: true,
  returnData: encodeFunctionResult({ abi: oracleAbi, functionName: "getAssetPrice", result: p }),
});
const revert = { success: false, returnData: "0x" as const };

const A = "0x4200000000000000000000000000000000000006";
const B = "0x73E0C0D45E048D25FC26FA3159B0AA04BFA4DB98";

describe("ids", () => {
  it("matches graph-ts concatI32 (little-endian int32)", () => {
    // Snapshot ids end with the block number: 26821425 = 0x01994331 -> 31439901
    expect(concatI32(A, 26821425)).toBe(`${A}31439901`);
    // PoolEvent ids end with the log index: 4 -> 04000000, 842 -> 4a030000
    const tx = "0x765ab196aa01b97dd574808a5d30f553b41b3043ca00c568a6bbe5865b550971";
    expect(concatI32(tx, 4)).toBe(`${tx}04000000`);
    expect(concatI32(tx, 842)).toBe(`${tx}4a030000`);
  });
  it("lowercases the bytes", () => {
    expect(concatI32(B, 1)).toBe(`${B.toLowerCase()}01000000`);
  });
});

describe("decodeSnapshot", () => {
  const data = [1n, 2n, 1000n, 40n, 60n, 111n, 222n, 3n, 4n, 5n, 6n, 7n];

  it("maps totals, rates and price; borrowed is stable + variable debt", () => {
    const [row] = decodeSnapshot([A], [reserveData(data), price(417287500000n)]);
    expect(row).toEqual({
      asset: A,
      totalSupplied: 1000n,
      totalBorrowed: 100n,
      liquidityRate: 111n,
      variableBorrowRate: 222n,
      priceUsd: 417287500000n,
    });
  });

  it("keeps the reserve with a null price when the oracle reverts", () => {
    const [row] = decodeSnapshot([A], [reserveData(data), revert]);
    expect(row?.priceUsd).toBeUndefined();
    expect(row?.totalSupplied).toBe(1000n);
  });

  it("skips a reserve whose getReserveData reverted, keeps the others", () => {
    const rows = decodeSnapshot([A, B], [revert, price(1n), reserveData(data), price(2n)]);
    expect(rows.map((r) => r.asset)).toEqual([B.toLowerCase()]);
  });

  it("treats undecodable return data as a revert", () => {
    const junk = { success: true, returnData: encodeAbiParameters([{ type: "uint256" }], [1n]) };
    expect(decodeSnapshot([A], [junk, price(1n)])).toEqual([]);
  });
});
