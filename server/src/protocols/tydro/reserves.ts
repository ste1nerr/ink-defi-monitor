import { rpc, rpcSource } from "../../data/rpc.js";
import type { TydroReserve, TydroReservesSnapshot } from "./types.js";
import { aprToApy, ratio, rayToApr, toUsd, tokenAmount } from "../../domain/units.js";
import { dataProviderAbi, oracleAbi } from "./abi.js";
import { TYDRO_CONTRACTS } from "./contracts.js";

const ORACLE_DECIMALS = 8; // BASE_CURRENCY_UNIT = 1e8, asserted at read time

export async function readReserves(): Promise<TydroReservesSnapshot> {
  const retrievedAt = Date.now();
  const blockNumber = await rpc.getBlockNumber();
  const at = { blockNumber } as const;
  const dp = { address: TYDRO_CONTRACTS.protocolDataProvider, abi: dataProviderAbi, ...at } as const;
  const oracle = { address: TYDRO_CONTRACTS.oracle, abi: oracleAbi, ...at } as const;

  const [tokens, baseUnit] = await Promise.all([
    rpc.readContract({ ...dp, functionName: "getAllReservesTokens" }),
    rpc.readContract({ ...oracle, functionName: "BASE_CURRENCY_UNIT" }),
  ]);
  if (baseUnit !== 10n ** BigInt(ORACLE_DECIMALS)) {
    throw new Error(`Unexpected Tydro oracle base unit ${baseUnit}`);
  }

  const reserves = await Promise.all(
    tokens.map(async ({ symbol, tokenAddress }) => {
      const [data, config, price] = await Promise.all([
        rpc.readContract({ ...dp, functionName: "getReserveData", args: [tokenAddress] }),
        rpc.readContract({ ...dp, functionName: "getReserveConfigurationData", args: [tokenAddress] }),
        rpc.readContract({ ...oracle, functionName: "getAssetPrice", args: [tokenAddress] }),
      ]);
      const [, , totalAToken, totalStableDebt, totalVariableDebt, liquidityRate, variableBorrowRate] = data;
      const [decimalsRaw, ltv, liquidationThreshold, , , usageAsCollateralEnabled, borrowingEnabled, , isActive, isFrozen] =
        config;
      const decimals = Number(decimalsRaw);
      const borrowed = totalStableDebt + totalVariableDebt;
      const available = totalAToken > borrowed ? totalAToken - borrowed : 0n;

      return {
        asset: tokenAddress,
        symbol,
        decimals,
        isActive,
        isFrozen,
        borrowingEnabled,
        usageAsCollateralEnabled,
        ltv: Number(ltv) / 10_000,
        liquidationThreshold: Number(liquidationThreshold) / 10_000,
        supplied: tokenAmount(totalAToken, decimals),
        borrowed: tokenAmount(borrowed, decimals),
        availableLiquidity: tokenAmount(available, decimals),
        utilization: ratio(borrowed, totalAToken),
        supplyApy: aprToApy(rayToApr(liquidityRate)),
        variableBorrowApy: aprToApy(rayToApr(variableBorrowRate)),
        priceUsd: toUsd(10n ** BigInt(decimals), decimals, price, ORACLE_DECIMALS),
        suppliedUsd: toUsd(totalAToken, decimals, price, ORACLE_DECIMALS),
        borrowedUsd: toUsd(borrowed, decimals, price, ORACLE_DECIMALS),
      } satisfies TydroReserve;
    }),
  );

  const suppliedUsd = reserves.reduce((sum, r) => sum + r.suppliedUsd, 0);
  const borrowedUsd = reserves.reduce((sum, r) => sum + r.borrowedUsd, 0);
  const block = blockNumber.toString();

  return {
    blockNumber: block,
    reserves,
    totals: {
      suppliedUsd,
      borrowedUsd,
      availableUsd: suppliedUsd - borrowedUsd,
      utilization: suppliedUsd > 0 ? borrowedUsd / suppliedUsd : null,
    },
    provenance: [
      { source: rpcSource(), reference: TYDRO_CONTRACTS.protocolDataProvider, retrievedAt, blockNumber: block },
      { source: "tydro-oracle", reference: TYDRO_CONTRACTS.oracle, retrievedAt, blockNumber: block },
    ],
  };
}
