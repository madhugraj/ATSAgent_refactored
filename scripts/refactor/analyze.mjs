import fs from "node:fs";
import { domainOf } from "./domains-draft-v1.mjs";
const g = JSON.parse(fs.readFileSync("./graph.json"));
const un = Object.keys(g).filter((f) => domainOf(f) === "UNMAPPED");
console.log("UNMAPPED", un.length, un.join(" "));
const sizes = {};
for (const [f, v] of Object.entries(g)) {
  const d = domainOf(f);
  sizes[d] = sizes[d] || { files: 0, lines: 0 };
  sizes[d].files++;
  sizes[d].lines += v.lines;
}
console.log("SIZES", JSON.stringify(sizes));
const M = {};
const ex = {};
for (const [f, v] of Object.entries(g)) {
  const a = domainOf(f);
  for (const d of v.deps) {
    if (d.startsWith("UNRES")) continue;
    const b = domainOf(d);
    if (a === b) continue;
    const k = a + " -> " + b;
    M[k] = (M[k] || 0) + 1;
    (ex[k] = ex[k] || []).push(f.replace("src/", "") + " => " + d.replace("src/", ""));
  }
}
const keys = Object.keys(M).sort();
for (const k of keys) console.log(String(M[k]).padStart(4), k);
fs.writeFileSync("./edges.json", JSON.stringify(ex, null, 1));
// domain-level cycles (pairs)
console.log("MUTUAL PAIRS:");
const seen = new Set();
for (const k of keys) {
  const [a, b] = k.split(" -> ");
  if (M[b + " -> " + a] && !seen.has(b + a)) {
    seen.add(a + b);
    console.log(`  ${a} <-> ${b}  (${M[k]} / ${M[b + " -> " + a]})`);
  }
}
