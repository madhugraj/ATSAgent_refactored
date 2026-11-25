/**
 * T1 ratchet (phase-4 review): workspace packages must not import the app
 * through the "@/" or "@db/" tsconfig aliases — those are layer inversions.
 * The count may only go DOWN: 6 known upward imports remain (each marked
 * // SHIM(upward) with its target phase), 0 by Phase 8. Any NEW alias import
 * under packages/**\/src fails this audit.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const PACKAGES = join(import.meta.dir, "..", "packages");
const MAX_ALIAS_IMPORTS = 6; // T1 baseline; lower as each SHIM(upward) resolves.

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

test("packages import the app only through the 6 marked upward shims", () => {
  const offenders: string[] = [];
  const total = sourceFiles(PACKAGES).reduce<string[]>((acc, f) => {
    const rel = f.slice(PACKAGES.length + 1);
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(
      /from ["'](@\/|@db\/)[^"']+["']|import\(["'](@\/|@db\/)[^"']+["']\)/g,
    )) {
      // A marked line is a known, tracked inversion — still counted, but
      // reported with its marker so the list and the count stay in step.
      const lineNo = text.slice(0, m.index ?? 0).split("\n").length;
      acc.push(
        `${rel}:${lineNo} (${text.split("\n")[lineNo - 2]?.includes("SHIM(upward)") ? "marked" : "UNMARKED"})`,
      );
    }
    return acc;
  }, offenders);
  expect(
    offenders.length
      ? `alias imports under packages/**/src: ${offenders.length} (max ${MAX_ALIAS_IMPORTS})\n${offenders.join("\n")}`
      : "",
  ).toBe("");
  expect(offenders.length).toBeLessThanOrEqual(MAX_ALIAS_IMPORTS);
});
