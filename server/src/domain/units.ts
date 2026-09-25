import { formatUnits } from "viem";
import type { TokenAmount } from "./types.js";

export const RAY = 10n ** 27n;
export const WAD = 10n ** 18n;
const SECONDS_PER_YEAR = 31_536_000;

export function tokenAmount(raw: bigint, decimals: number): TokenAmount {
  return { raw: raw.toString(), decimals, formatted: formatUnits(raw, decimals) };
}

/** Ratio as a number in [0, 1] computed with bigint precision (6 decimal places). */
export function ratio(numerator: bigint, denominator: bigint): number | null {
  if (denominator === 0n) return null;
  const scale = 1_000_000n;
  return Number((numerator * scale) / denominator) / Number(scale);
}

/**
 * Converts `amount` (token units) × `price` (fixed point with `priceDecimals`) into a USD float.
 * Precision loss only happens at the final conversion to number.
 */
export function toUsd(amount: bigint, tokenDecimals: number, price: bigint, priceDecimals: number): number {
  const scaled = (amount * price) / 10n ** BigInt(tokenDecimals);
  return Number(formatUnits(scaled, priceDecimals));
}

/** Aave rates are per-second-compounded APR in ray; this returns the APR as a fraction. */
export function rayToApr(rateRay: bigint): number {
  return Number(formatUnits(rateRay, 27));
}

/** APR → APY with per-second compounding, as the Aave UI displays. */
export function aprToApy(apr: number): number {
  return (1 + apr / SECONDS_PER_YEAR) ** SECONDS_PER_YEAR - 1;
}

export function fromX18(value: bigint): number {
  return Number(formatUnits(value, 18));
}
