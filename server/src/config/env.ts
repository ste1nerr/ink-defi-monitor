import { z } from "zod";

const PUBLIC_INK_RPC = "https://rpc-gel.inkonchain.com";

const EnvSchema = z.object({
  INK_RPC_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  GOLDSKY_TYDRO_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

const parsed = EnvSchema.parse(process.env);

export const env = {
  inkRpcUrl: parsed.INK_RPC_URL ?? PUBLIC_INK_RPC,
  /** Which RPC provider backs `inkRpcUrl`; surfaced in provenance. */
  rpcProvider: parsed.INK_RPC_URL?.includes("alchemy.com") ? "alchemy" : "ink-public-rpc",
  goldskyTydroUrl: parsed.GOLDSKY_TYDRO_URL,
  port: parsed.PORT,
  corsOrigin: parsed.CORS_ORIGIN,
} as const;
