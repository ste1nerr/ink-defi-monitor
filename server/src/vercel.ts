import { getRequestListener } from "@hono/node-server";
import { createApp } from "./api/app.js";

/** Vercel Node.js function entry: the same Hono app as the local server, as a (req, res) listener. */
export default getRequestListener(createApp().fetch);
