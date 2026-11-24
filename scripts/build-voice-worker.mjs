/**
 * Bundle the voice worker (src/server/voice/worker.ts) for the production
 * image: one ESM file at .output/voice-worker/index.mjs that runs on Node 22
 * beside the web server (`node .output/voice-worker/index.mjs`). Runs after
 * `vite build`, which empties .output first.
 */
// Entry and outdir are repo-root-relative regardless of the cwd the
// app package.json invokes this with (apps/web).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The runtime image copies only .output — no node_modules — and Node links
// static imports even when the code is never called. The (dead) Start
// server-function machinery carries one static "#tanstack-*" package import;
// emit a package.json whose "imports" map resolves every such specifier to a
// stub, so the bundle boots without node_modules. Phase 7 removes this whole
// class of problem by de-scoping the Start server from the worker.
function emitHashImportStubs(OUTDIR) {
  const text = readFileSync(join(OUTDIR, "index.mjs"), "utf8");
  const names = new Map();
  for (const [, bindings, spec] of text.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*["'](#[^"']+)["']/g,
  )) {
    const list = names.get(spec) ?? new Set();
    for (const b of bindings.split(",")) {
      const n = b
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();
      if (n) list.add(n);
    }
    names.set(spec, list);
  }
  for (const [spec] of text.matchAll(/import\s*["'](#[^"']+)["']/g))
    if (!names.has(spec)) names.set(spec, new Set());
  if (!names.size) return;
  const all = new Set([...names.values()].flatMap((s) => [...s]));
  const stub = [...all]
    .map(
      (n) =>
        `export const ${n} = () => {\n  throw new Error("${n}: server functions are not available in the voice worker");\n};`,
    )
    .join("\n");
  writeFileSync(join(OUTDIR, "tanstack-hash-stubs.mjs"), (stub || "export {};") + "\n");
  writeFileSync(
    join(OUTDIR, "package.json"),
    JSON.stringify({
      type: "module",
      imports: Object.fromEntries([...names.keys()].map((s) => [s, "./tanstack-hash-stubs.mjs"])),
    }) + "\n",
  );
  console.log(`voice worker: stubbed ${names.size} "#" import(s): ${[...names.keys()].join(", ")}`);
}

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
  // The runtime image copies only .output — no node_modules — so everything
  // the worker needs must be IN the bundle, exactly as before Phase 2:
  // @tanstack/react-start is bundled (the graph imports it for the request
  // context), while the Start entry internals, the browser driver stack and
  // the tanstack-start package remain external.
  external: ["#tanstack-*", "tanstack-start-*", "playwright", "playwright-core", "chromium-bidi"],
  plugins: [
    {
      // The @ats/* package server entries open with the Start marker import;
      // alias it to an empty module so the bundle never references the
      // @tanstack package for it (it is a 0-byte stub in the app too).
      name: "server-only-empty",
      setup(build) {
        build.onResolve({ filter: /@tanstack\/react-start\/server-only/ }, () => ({
          path: "server-only-stub",
          namespace: "server-only-stub",
        }));
        build.onLoad({ filter: /.*/, namespace: "server-only-stub" }, () => ({
          contents: "export {};",
          loader: "js",
        }));
      },
    },
  ],
});
if (!out.success) {
  for (const m of out.logs) console.error(m);
  process.exit(1);
}
emitHashImportStubs(
  join(dirname(fileURLToPath(import.meta.url)), "..", ".output/voice-worker"),
  "index.mjs",
);
console.log(`voice worker: ${out.outputs.map((o) => o.path).join(", ")}`);
