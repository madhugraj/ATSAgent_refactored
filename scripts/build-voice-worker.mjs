/**
 * Bundle the voice worker (src/server/voice/worker.ts) for the production
 * image: one ESM file at .output/voice-worker/index.mjs that runs on Node 22
 * beside the web server (`node .output/voice-worker/index.mjs`). Runs after
 * `vite build`, which empties .output first.
 */
// Entry and outdir are repo-root-relative regardless of the cwd the
// app package.json invokes this with (apps/web).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const out = await Bun.build({
  entrypoints: [join(REPO_ROOT, "apps/web/src/server/voice/worker.ts")],
  outdir: join(REPO_ROOT, ".output/voice-worker"),
  naming: "index.mjs",
  target: "node",
  format: "esm",
  sourcemap: "linked",
  minify: false,
  // Virtual modules of the web build, reached only through TanStack Start's HTTP
  // handler (server-function modules the worker shares); never loaded here.
  // playwright runs from node_modules at runtime (the website reader's
  // renderer); bundling it pulls in chromium-bidi paths that cannot resolve.
  external: ["#tanstack-*", "tanstack-start-*", "playwright", "playwright-core", "chromium-bidi"],
});
if (!out.success) {
  for (const m of out.logs) console.error(m);
  process.exit(1);
}
console.log(`voice worker: ${out.outputs.map((o) => o.path).join(", ")}`);
