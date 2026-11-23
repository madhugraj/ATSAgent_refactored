// Parity check for the sync procedure (phase-1 review C2): every file
// tracked in the source repo at SOURCE_SHA must exist in this repo at its
// new path, or appear on the written exclusion list
// (docs/refactor/sync-exclusions.txt). Exits 1 on any gap.
//
// Usage: node parity.mjs <source-checkout>
import { execSync } from "node:child_process";
import fs from "node:fs";

const SRC = process.argv[2];
if (!SRC) {
  console.error("usage: node parity.mjs <source-checkout-at-SOURCE_SHA>");
  process.exit(2);
}

const git = (dir, cmd) =>
  execSync(`git -C ${dir} ${cmd}`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sourceFiles = git(SRC, "ls-files").trim().split("\n").filter(Boolean);
const newFiles = new Set(git(process.cwd(), "ls-files").trim().split("\n").filter(Boolean));

/**
 * old path -> new path. Everything the bootstrap moved: the app tree into
 * apps/web/, scripts/ to the root, .githooks to the root. Source root
 * dotfiles/config ride with the app.
 */
const mapPath = (p) => {
  if (p === "bun.lock") return "bun.lock"; // replaced by the root lockfile
  // moved to the repo root during bootstrap (configs consolidated, Phase 1)
  if ([".env.example", ".prettierrc", ".prettierignore", "eslint.config.js"].includes(p)) return p;
  if (p === ".github/dependabot.yml" || p === ".github/workflows/ci.yml") return p;
  if (p.startsWith("scripts/")) return p; // root scripts
  if (p === ".githooks/pre-commit") return p; // root hooks
  return `apps/web/${p}`;
};

/** Source paths intentionally not copied, with the reason (review C2). */
const EXCLUDED = {
  ".env":
    "vestigial Lovable/Supabase values; Lovable decoupled 2026-10-05 (roadmap.md); never tracked here",
  ".github/workflows/deploy.yml": "deploy wiring moves in Phase 8 (deviation 7)",
  ".github/workflows/deploy-gke.yml": "deploy wiring moves in Phase 8 (deviation 7)",
  "test_data/Mobile_Application_Developer_JD.docx":
    "refactor rule 5: never copy test_data/; fixture, unreferenced by the suite (89/89 green without it)",
  "test_data/Offer Letter - Template.pdf":
    "refactor rule 5: never copy test_data/; fixture, unreferenced by the suite (89/89 green without it)",
};

const missing = [];
const reasons = new Set();
for (const f of sourceFiles) {
  if (EXCLUDED[f]) {
    reasons.add(f);
    continue;
  }
  const target = mapPath(f);
  if (!target || !newFiles.has(target)) missing.push(`${f}  ->  ${target ?? "(dropped)"}`);
}

const exclusionList = new URL("../../docs/refactor/sync-exclusions.txt", import.meta.url).pathname;
fs.writeFileSync(
  exclusionList,
  [
    "# Source paths (at SOURCE_SHA) intentionally not in this repo. parity.mjs reads this list.",
    ...Object.entries(EXCLUDED).map(([f, why]) => `${f}  # ${why}`),
  ].join("\n") + "\n",
);

console.log(
  `parity: ${sourceFiles.length} source files -> ${sourceFiles.length - missing.length - reasons.size} matched, ` +
    `${reasons.size} excluded, ${missing.length} missing`,
);
if (missing.length) {
  console.error("\nMISSING (in source, not on the exclusion list, absent at the new path):");
  for (const m of missing) console.error("  " + m);
  process.exit(1);
}
console.log("ok — full parity");
