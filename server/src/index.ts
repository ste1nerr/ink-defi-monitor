import { serve } from "@hono/node-server";
import { createApp } from "./api/app.js";
import { env } from "./config/env.js";

serve({ fetch: createApp().fetch, port: env.port }, ({ port }) => {
  console.log(`Ink DeFi Monitor API on http://localhost:${port} (rpc: ${env.rpcProvider})`);
});
