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
function emitHashImportStubs(outdir, bundleFile) {
  const text = readFileSync(join(outdir, bundleFile), "utf8");
  const names = new Map(); // specifier -> imported binding names
  const re = /import\s*\{([^}]*)\}\s*from\s*["'](#[^"']+)["']/g;
  for (const [, bindings, spec] of text.matchAll(re)) {
    const list = names.get(spec) ?? [];
    for (const b of bindings.split(",")) {
      const n = b
        .trim()
        .split(/\s+as\s+/)
        .pop()
        .trim();
      if (n) list.push(n);
    }
    names.set(spec, list);
  }
  if (!names.size) return;
  const stub = [...names.entries()]
    .flatMap(([spec, list]) =>
      list.map((n) => `export const ${n} = undefined; // dead code in the worker; never called`),
    )
    .join("\n");
  writeFileSync(join(outdir, "tanstack-hash-stubs.mjs"), stub + "\n");
  writeFileSync(
    join(outdir, "package.json"),
    JSON.stringify({
      type: "module",
      imports: Object.fromEntries(
        [...names.keys()].map((spec) => [spec, "./tanstack-hash-stubs.mjs"]),
      ),
    }) + "\n",
  );
  console.log(`hash-import stubs: ${names.size} specifier(s) -> tanstack-hash-stubs.mjs`);
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
