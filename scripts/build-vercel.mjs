// Builds the app into Vercel's Build Output API layout (.vercel/output):
//   static/                  → the Vite web build
//   functions/api.func/      → the Hono server bundled into one Node.js function
//   config.json              → routes: /api/* → function, everything else → static with SPA fallback
// Docs: https://vercel.com/docs/build-output-api/v3
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const OUT = ".vercel/output";
const FUNC = `${OUT}/functions/api.func`;

rmSync(OUT, { recursive: true, force: true });

execSync("npm run build -w web", { stdio: "inherit" });
mkdirSync(`${OUT}/static`, { recursive: true });
cpSync("web/dist", `${OUT}/static`, { recursive: true });

await build({
  entryPoints: ["server/src/vercel.ts"],
  outfile: `${FUNC}/index.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  minify: false,
  sourcemap: false,
  // Some dependencies are CommonJS and call require(); give the ESM bundle one.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

writeFileSync(
  `${FUNC}/.vc-config.json`,
  JSON.stringify(
    {
      runtime: "nodejs20.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      // Nado archive history requests can take several seconds when the cache is cold.
      maxDuration: 30,
      shouldAddHelpers: false,
    },
    null,
    2,
  ),
);

writeFileSync(
  `${OUT}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "^/api/(.*)$", dest: "/api" },
        { handle: "filesystem" },
        // Client-side routes (/protocols/tydro, /events, …) are served by the SPA.
        { src: "^/(.*)$", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);

console.log(`Vercel output written to ${OUT}`);
