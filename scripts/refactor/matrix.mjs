// Package-level import matrix from graph.json, for diffing against
// docs/refactor/evidence/baseline-matrix.txt. Usage: node matrix.mjs
import fs from "node:fs";
import { domainOf } from "./domains.mjs";

const g = JSON.parse(fs.readFileSync(new URL("./graph.json", import.meta.url).pathname));
const M = {};
for (const [f, v] of Object.entries(g)) {
  const a = domainOf(f);
  for (const d of v.deps) {
    if (d.startsWith("UNRES")) continue;
    const b = domainOf(d);
    if (a === b) continue;
    M[`${a} -> ${b}`] = (M[`${a} -> ${b}`] || 0) + 1;
  }
}
for (const k of Object.keys(M).sort()) console.log(String(M[k]).padStart(4), k);
