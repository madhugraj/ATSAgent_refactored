// Writes docs/refactor/inventory.csv: old_path,new_package,entry for every
// file in the source graph. Exits 1 on any unmapped file (the gate checks
// for 0 unmapped). Usage: node inventory.mjs <source-root>
import fs from "node:fs";
import path from "node:path";
import { domainOf, entryOf } from "./domains.mjs";

const ROOT = process.argv[2];
if (!ROOT) {
  console.error("usage: node inventory.mjs <source-root>");
  process.exit(2);
}
const graphPath = new URL("./graph.json", import.meta.url).pathname;
if (!fs.existsSync(graphPath)) {
  console.error("graph.json missing — run: node graph.mjs <source-root>");
  process.exit(2);
}
const g = JSON.parse(fs.readFileSync(graphPath));

const rows = [];
const unmapped = [];
for (const f of Object.keys(g).sort()) {
  const pkg = domainOf(f);
  if (pkg === "UNMAPPED") {
    unmapped.push(f);
    continue;
  }
  rows.push(`${f},${pkg},${entryOf(f)}`);
}
fs.writeFileSync(
  new URL("../../docs/refactor/inventory.csv", import.meta.url).pathname,
  "old_path,new_package,entry\n" + rows.join("\n") + "\n",
);
console.log(`inventory: ${rows.length} mapped, ${unmapped.length} unmapped`);
if (unmapped.length) {
  console.error("UNMAPPED FILES:");
  for (const f of unmapped) console.error("  " + f);
  process.exit(1);
}
