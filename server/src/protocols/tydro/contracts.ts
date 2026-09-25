/**
 * Tydro (white-label Aave v3) contract addresses on Ink mainnet.
 * Source: Tydro docs → Developers → Smart Contracts (https://docs.tydro.com/developers/smart-contracts).
 * Pool and PoolAddressesProvider.getPool() cross-checked on-chain 2026-09-25.
 */
export const TYDRO_CONTRACTS = {
  poolAddressesProvider: "0x4172E6aAEC070ACB31aaCE343A58c93E4C70f44D",
  pool: "0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA",
  protocolDataProvider: "0x96086C25d13943C80Ff9a19791a40Df6aFC08328",
  oracle: "0x4758213271BFdC72224A7a8742dC865fC97756e1",
} as const satisfies Record<string, `0x${string}`>;

export const TYDRO_SOURCES = {
  docs: "https://docs.tydro.com",
  contracts: "https://docs.tydro.com/developers/smart-contracts",
  app: "https://tydro.com",
} as const;
