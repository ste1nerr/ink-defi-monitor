import type { DataProvenance, TokenAmount } from "../../domain/types.js";

/** API contract types; no runtime imports so the web app can share them. */
export type TydroReserve = {
  asset: `0x${string}`;
  symbol: string;
  decimals: number;
  isActive: boolean;
  isFrozen: boolean;
  borrowingEnabled: boolean;
  usageAsCollateralEnabled: boolean;
  ltv: number;
  liquidationThreshold: number;
  supplied: TokenAmount;
  borrowed: TokenAmount;
  availableLiquidity: TokenAmount;
  utilization: number | null;
  supplyApy: number;
  variableBorrowApy: number;
  priceUsd: number;
  suppliedUsd: number;
  borrowedUsd: number;
};

export type TydroReservesSnapshot = {
  blockNumber: string;
  reserves: TydroReserve[];
  totals: { suppliedUsd: number; borrowedUsd: number; availableUsd: number; utilization: number | null };
  provenance: DataProvenance[];
};

export type HistoryRange = "24h" | "7d" | "30d" | "90d";

/** Market totals (or one reserve) at a snapshot block. */
export type HistoryPoint = {
  timestamp: number;
  blockNumber: string;
  suppliedUsd: number;
  borrowedUsd: number;
  utilization: number | null;
  reserves: number;
  /** Reserves excluded from USD sums because the oracle price or decimals were unavailable. */
  unpricedReserves: number;
};

export type TydroHistory = {
  range: HistoryRange;
  asset: string | null;
  /** Snapshots are taken every 3600 blocks (~1 hour). */
  intervalBlocks: number;
  points: HistoryPoint[];
  provenance: DataProvenance;
};
