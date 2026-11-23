/**
 * Bundle the sandboxed document parser (src/server/parser/worker.ts) for the
 * production image: one ESM file at .output/parser-worker/index.mjs, run as its
 * own Cloud Run service (`node .output/parser-worker/index.mjs`).
 * docs/guardrails.md P2-1. Runs after `vite build`, which empties .output first.
 */
// Entry and outdir are repo-root-relative regardless of the cwd the
// app package.json invokes this with (apps/web).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const out = await Bun.build({
  entrypoints: [join(REPO_ROOT, "apps/web/src/server/parser/worker.ts")],
  outdir: join(REPO_ROOT, ".output/parser-worker"),
  naming: "index.mjs",
  target: "node",
  format: "esm",
  sourcemap: "linked",
  minify: false,
  // Everything is bundled (pdf.js included): the runtime image carries only
  // .output, so the worker must be self-contained.
});
if (!out.success) {
  for (const m of out.logs) console.error(m);
  process.exit(1);
}
console.log(`parser worker: ${out.outputs.map((o) => o.path).join(", ")}`);
