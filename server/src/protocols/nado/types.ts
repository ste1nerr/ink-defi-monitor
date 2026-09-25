import type { DataProvenance } from "../../domain/types.js";

/** All Nado notional values are denominated in the quote asset, USDT0 (documented by Nado). */
export const NADO_QUOTE = "USDT0";

export type NadoMarket = {
  productId: number;
  symbol: string;
  name: string;
  type: "perp" | "spot";
  /** Quote (USDT0) notional; perps only. */
  openInterest: number | null;
  /** Traded quote volume over the last ~24h; null if the market has no snapshot 24h ago. */
  volume24h: number | null;
  liquidations24h: number | null;
  trades24h: number | null;
  /** Latest hourly funding rate as a decimal (0.0001 = 0.01%/h); perps only. */
  fundingRate1h: number | null;
  oraclePrice: number | null;
};

export type NadoOverview = {
  quote: typeof NADO_QUOTE;
  snapshotAt: number;
  windowStart: number;
  tvl: number | null;
  dailyActiveUsers: number | null;
  /** Nado counts subaccounts, not unique wallets. */
  cumulativeSubaccounts: number | null;
  totals: { openInterest: number; volume24h: number; liquidations24h: number; trades24h: number };
  markets: NadoMarket[];
  provenance: DataProvenance[];
};

export type NadoHistoryRange = "24h" | "7d" | "30d" | "90d";

export type NadoHistoryPoint = {
  timestamp: number;
  openInterest: number;
  /** Volume traded between the previous point and this one. */
  volume: number;
  liquidations: number;
  tvl: number | null;
};

export type NadoHistory = {
  range: NadoHistoryRange;
  quote: typeof NADO_QUOTE;
  granularitySeconds: number;
  points: NadoHistoryPoint[];
  provenance: DataProvenance;
};
