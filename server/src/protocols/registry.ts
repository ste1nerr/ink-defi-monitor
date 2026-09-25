import type { ProtocolId } from "../domain/types.js";
import { nadoAdapter } from "./nado/adapter.js";
import { tydroAdapter } from "./tydro/adapter.js";
import type { ProtocolAdapter } from "./types.js";

export const adapters: Partial<Record<ProtocolId, ProtocolAdapter>> = {
  tydro: tydroAdapter,
  nado: nadoAdapter,
};

export const getAdapter = (id: string): ProtocolAdapter | undefined => adapters[id as ProtocolId];
