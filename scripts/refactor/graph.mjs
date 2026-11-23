import fs from "node:fs";
import path from "node:path";
const ROOT = process.argv[2];
const SRC = path.join(ROOT, "src");
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|mjs)$/.test(e.name)) files.push(p);
  }
})(SRC);
const extra = [path.join(ROOT, "drizzle/schema.ts")];
for (const f of extra) if (fs.existsSync(f)) files.push(f);
const set = new Set(files);
function resolve(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else if (spec.startsWith("@db/")) base = path.join(ROOT, "drizzle", spec.slice(4));
  else return null;
  for (const c of [
    base,
    base + ".ts",
    base + ".tsx",
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    base.replace(/\.js$/, ".ts"),
  ])
    if (set.has(c)) return c;
  return "UNRESOLVED:" + spec;
}
const out = {};
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  const deps = new Set();
  const ext = new Set();
  const re =
    /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;
  let m;
  while ((m = re.exec(s))) {
    const spec = m[1] || m[2] || m[3];
    const r = resolve(f, spec);
    if (r) deps.add(path.relative(ROOT, r));
    else
      ext.add(
        spec
          .split("/")
          .slice(0, spec.startsWith("@") ? 2 : 1)
          .join("/"),
      );
  }
  out[path.relative(ROOT, f)] = {
    lines: s.split("\n").length,
    deps: [...deps],
    ext: [...ext],
    serverFn: /createServerFn/.test(s),
    nodeImports: /from ['"]node:/.test(s),
  };
}
fs.writeFileSync("./graph.json", JSON.stringify(out, null, 1));
const un = Object.entries(out).flatMap(([f, v]) =>
  v.deps.filter((d) => d.includes("UNRESOLVED")).map((d) => f + " -> " + d),
);
console.log("files", Object.keys(out).length, "unresolved", un.length);
console.log(un.slice(0, 15).join("\n"));
