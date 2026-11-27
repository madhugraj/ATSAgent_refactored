/**
 * Role-escalation guard for the moveStageCore extensions (phase-5 review B3,
 * stage-writers.md §3): `source: "ai"` skips assertRole, and `cause` silences
 * candidate-facing effects — so ONLY the server-side writer cores named in
 * stage-writers.md may pass them into moveStageCore. No *.functions.ts file
 * and no agent tool may. Fails listing any offender outside the allow-list.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

/** The only call sites allowed to pass source/cause into moveStageCore. */
const ALLOWED = [
  "apps/web/src/lib/pipeline.server.ts", // the core itself
  "apps/web/src/lib/autoscore.server.ts", // stage-writers §3
  "apps/web/src/lib/matching.functions.ts", // §4 (matching/screening cores)
  "apps/web/src/lib/screening.server.ts", // §4
  "apps/web/src/lib/interviews.functions.ts", // §5
];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

test("addApplicationsCore options reach the core only from the named callers", () => {
  // Phase-5 review P3: skipReusable bypasses the reuse-terms guard;
  // entryStage bypasses the applied default. Only the stage-writers-named
  // callers (onboarding portal-CV attach; createCandidate; collaboration
  // referral accept) may pass them.
  const allowedAddApps = [
    "apps/web/src/lib/onboarding.functions.ts",
    "apps/web/src/lib/candidates.functions.ts",
    "apps/web/src/lib/collaboration.functions.ts",
  ];
  const offenders: string[] = [];
  const scanDirs = ["apps/web/src/lib", "apps/web/src/server"];
  for (const dir of scanDirs) {
    const base = join(ROOT, dir);
    if (!existsSync(base)) continue;
    for (const f of sourceFiles(base)) {
      const rel = f.slice(ROOT.length + 1);
      if (ALLOWED.includes(rel) || allowedAddApps.includes(rel)) continue;
      const text = readFileSync(f, "utf8");
      if (!text.includes("addApplicationsCore")) continue;
      for (const callAt of [...text.matchAll(/addApplicationsCore\s*\(/g)].map(
        (m) => m.index ?? 0,
      )) {
        let depth = 0;
        let end = callAt;
        for (let i = callAt + "addApplicationsCore".length; i < text.length; i++) {
          const ch = text[i];
          if (ch === "(") depth++;
          else if (ch === ")") {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        const args = text.slice(callAt, end);
        if (/\b(skipReusable|entryStage)\s*:/.test(args))
          offenders.push(
            `${rel}: addApplicationsCore call passes ${/\b(skipReusable|entryStage)\s*:/.exec(args)![1]}:`,
          );
      }
    }
  }
  expect(offenders.length ? offenders.join("\n") : "").toBe("");
});

test("source/cause reach moveStageCore only from the named writer cores", () => {
  const offenders: string[] = [];
  const scanDirs = ["apps/web/src/lib", "apps/web/src/server"];
  for (const dir of scanDirs) {
    const base = join(ROOT, dir);
    if (!existsSync(base)) continue;
    for (const f of sourceFiles(base)) {
      const rel = f.slice(ROOT.length + 1);
      if (ALLOWED.includes(rel)) continue;
      const text = readFileSync(f, "utf8");
      // Examine ONLY each moveStageCore call's argument block: source:/cause:
      // keys elsewhere in a file belong to other subsystems (runtime task
      // decisions, panel-review provenance) and are not escalation vectors.
      for (const callAt of [...text.matchAll(/moveStageCore\s*\(/g)].map((m) => m.index ?? 0)) {
        let depth = 0;
        let end = callAt;
        for (let i = callAt + "moveStageCore".length; i < text.length; i++) {
          const ch = text[i];
          if (ch === "(") depth++;
          else if (ch === ")") {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        const args = text.slice(callAt, end);
        if (/\b(source|cause)\s*:/.test(args))
          offenders.push(
            `${rel}: moveStageCore call passes ${/\b(source|cause)\s*:/.exec(args)![1]}:`,
          );
      }
    }
  }
  expect(offenders.length ? offenders.join("\n") : "").toBe("");
});
