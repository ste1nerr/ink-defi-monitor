import { describe, expect, it } from "vitest";
import { aprToApy, fromX18, ratio, rayToApr, toUsd, tokenAmount } from "../src/domain/units.js";

describe("units", () => {
  it("formats token amounts exactly, beyond float precision", () => {
    expect(tokenAmount(123456789012345678901234567n, 18)).toEqual({
      raw: "123456789012345678901234567",
      decimals: 18,
      formatted: "123456789.012345678901234567",
    });
    expect(tokenAmount(0n, 6).formatted).toBe("0");
  });

  it("computes ratios with bigint precision and handles zero denominators", () => {
    // truncated (not rounded) to 6 decimals: 0.8607567…
    expect(ratio(11_262_311_582_090n, 13_084_202_218_370n)).toBe(0.860756);
    expect(ratio(1n, 0n)).toBeNull();
  });

  it("converts to USD with oracle decimals", () => {
    // 2.5 WETH at $2726.1172 (1e8 base unit)
    expect(toUsd(2_500_000_000_000_000_000n, 18, 272_611_720_000n, 8)).toBeCloseTo(6815.293, 3);
    // 146.456766 USDC at $0.99989041
    expect(toUsd(146_456_766n, 6, 99_989_041n, 8)).toBeCloseTo(146.440716, 5);
  });

  it("converts Aave ray rates to APR/APY", () => {
    const apr = rayToApr(50_000_000_000_000_000_000_000_000n); // 5% in ray
    expect(apr).toBeCloseTo(0.05, 12);
    expect(aprToApy(apr)).toBeCloseTo(0.051271, 5);
  });

  it("parses Nado x18 values", () => {
    expect(fromX18(84_911_850_000_000_011_440_227n)).toBeCloseTo(84911.85, 2);
  });
});
