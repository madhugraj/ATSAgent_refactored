// C3 ratchet (phase-1 review): depcruise must run in CI and the warning count
// may only go DOWN. Each phase lowers WARN_MAX as its boundaries land; when a
// package flips its rules to error (plan, recipe step 5) errors fail directly.
// Usage (from apps/web): node ../../tools/depcruise-check.mjs
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const WARN_MAX = 173; // Phase 1 baseline (692 modules). Lower per phase.

// depcruise runs from apps/web (its tsconfig lives there); this script may
// be invoked from the repo root (CI) or apps/web.
const APP_WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web");
const out = execFileSync("bunx", ["depcruise", "--config", "../../tools/depcruise.cjs", "src"], {
  encoding: "utf8",
  cwd: APP_WEB,
  stdio: ["ignore", "pipe", "inherit"],
  shell: process.platform === "win32",
});
const m = out.match(/(\d+) dependency violations \((\d+) errors?, (\d+) warnings?\)/);
if (!m) {
  console.error("depcruise-check: could not parse depcruise output:\n" + out.slice(-400));
  process.exit(2);
}
const [, total, errors, warnings] = m.map(Number);
console.log(
  `depcruise: ${total} violations (${errors} errors, ${warnings} warnings; ratchet max ${WARN_MAX})`,
);
if (errors > 0) {
  console.error(`depcruise-check: ${errors} errors exceed the allowed 0`);
  process.exit(1);
}
if (warnings > WARN_MAX) {
  console.error(
    `depcruise-check: ${warnings} warnings exceed the ratchet (${WARN_MAX}). Fix the new violations or lower WARN_MAX deliberately with the reviewer.`,
  );
  process.exit(1);
}
console.log("depcruise-check: ok");
