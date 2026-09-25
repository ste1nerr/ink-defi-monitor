export type ProtocolId = "tydro" | "nado";

export type DataSourceId =
  | "ink-rpc"
  | "alchemy"
  | "blockscout"
  | "goldsky"
  | "nado-gateway"
  | "nado-archive"
  | "tydro-oracle";

/** Where a value came from; attached to every metric and event. */
export type DataProvenance = {
  source: DataSourceId;
  /** Contract address or API endpoint the value was read from. */
  reference: string;
  retrievedAt: number;
  blockNumber?: string;
  txHash?: string;
};

/** Token amount kept as an exact decimal string plus the raw integer. */
export type TokenAmount = {
  raw: string;
  decimals: number;
  formatted: string;
};

export type ProtocolEventType =
  | "supply"
  | "withdraw"
  | "borrow"
  | "repay"
  | "liquidation"
  | "collateral_change"
  | "flash_loan"
  | "unknown";

export type ProtocolEvent = {
  id: string;
  protocol: ProtocolId;
  type: ProtocolEventType;
  timestamp: number;
  blockNumber?: string;
  txHash?: string;
  explorerUrl?: string;
  wallet?: string;
  asset?: { address?: string; symbol: string };
  amount?: TokenAmount;
  /** USD value using the protocol's own oracle at retrieval time; absent if no price. */
  amountUsd?: number;
  metadata?: Record<string, string | number | boolean | null>;
  provenance: DataProvenance;
};
