import { defineChain } from "viem";

export const INK_CHAIN_ID = 57073;
export const INK_EXPLORER_URL = "https://explorer.inkonchain.com";

/** Public Ink RPC caps `eth_getLogs` at 1000 blocks per request (verified 2026-09-25). */
export const MAX_LOG_BLOCK_RANGE = 1000n;

export const ink = defineChain({
  id: INK_CHAIN_ID,
  name: "Ink",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc-gel.inkonchain.com"] } },
  blockExplorers: { default: { name: "Ink Explorer", url: INK_EXPLORER_URL } },
});

export const explorerTxUrl = (txHash: string) => `${INK_EXPLORER_URL}/tx/${txHash}`;
export const explorerAddressUrl = (address: string) => `${INK_EXPLORER_URL}/address/${address}`;
