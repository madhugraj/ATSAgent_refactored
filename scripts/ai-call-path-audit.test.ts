/**
 * AI call-path audit (map §5 rules 6-7, phase-3 review criteria): every AI
 * call goes through the gateway with an AI_FEATURES slug, providers are only
 * contacted from the gateway's own files, and no server function returns a
 * vendor model/engine field. Scans apps/web/src and every packages dir; fails
 * with the offending file:line list.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SCAN_DIRS = ["apps/web/src", "packages"];
const GATEWAY_ALLOW = /packages\/ai\/src\/(server\/)?(ai-gateway\.server|providers)/;

/** Provider endpoints and SDK markers that must never appear outside the gateway. */
const PROVIDER_MARKERS = [
  "api.openai.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
  "openai/api",
  "@anthropic-ai/sdk",
  "openai",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

function scan(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return sourceFiles(dir).map((f) => ({
    path: f.slice(ROOT.length + 1),
    text: readFileSync(f, "utf8"),
  }));
}

import { existsSync } from "node:fs";

describe("ai call-path audit", () => {
  test("providers are contacted only inside the ai gateway", () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      const base = join(ROOT, dir);
      if (!existsSync(base)) continue;
      for (const f of sourceFiles(base)) {
        const rel = f.slice(ROOT.length + 1);
        if (GATEWAY_ALLOW.test(rel)) continue;
        if (/\.test\.ts$/.test(rel)) continue; // tests assert provider URLs deliberately
        if (rel.startsWith("packages/db/")) continue; // stored provider enum values, not calls
        // The invariant's carve-out: the BYO-key settings page names vendors by design.
        if (
          rel === "apps/web/src/lib/ai-settings.functions.ts" ||
          rel === "apps/web/src/routes/integrations.tsx"
        )
          continue;
        const text = readFileSync(f, "utf8");
        for (const marker of PROVIDER_MARKERS) {
          if (text.includes(marker)) offenders.push(`${rel}: provider marker "${marker}"`);
        }
      }
    }
    expect(offenders.length ? offenders.join("\n") : "").toBe("");
  });

  test("gateway calls carry an AI_FEATURES slug, never a bare literal", async () => {
    // Parsed from the source text so this audit needs no env (importing the
    // module would trigger env validation).
    const usage = readFileSync(join(ROOT, "packages/ai/src/server/ai-usage.ts"), "utf8");
    const block = usage.slice(usage.indexOf("AI_FEATURES = ["), usage.indexOf("] as const"));
    const known: string[] = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(known.length).toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      const base = join(ROOT, dir);
      if (!existsSync(base)) continue;
      for (const f of sourceFiles(base)) {
        const rel = f.slice(ROOT.length + 1);
        const text = readFileSync(f, "utf8");
        const re = /(aiJson|aiResearchJson|aiAgentStep)\s*\([^)]*?feature:\s*"([^"]+)"/g;
        for (const [, , literal] of text.matchAll(re)) {
          if (!known.includes(literal))
            offenders.push(`${rel}: feature literal "${literal}" is not in AI_FEATURES`);
        }
      }
    }
    expect(offenders.length ? offenders.join("\n") : "").toBe("");
  });

  test("server functions return no vendor model or engine fields", () => {
    const offenders: string[] = [];
    const fnDir = join(ROOT, "apps/web/src/lib");
    if (existsSync(fnDir))
      for (const f of readdirSync(fnDir)) {
        if (!f.endsWith(".functions.ts")) continue;
        const rel = `apps/web/src/lib/${f}`;
        const text = readFileSync(join(fnDir, f), "utf8");
        const re = /^\s*(?:\.\.\.|["'\w]+)?\b(model|engine)\s*:/gm;
        // BASELINE (vendor-leak candidates; any NEW site fails this audit).
        // 2026-11-25 review: salary-benchmark / onboarding / verification /
        // assessment entries are VERIFIED FALSE POSITIVES — the model: hits
        // are persisted DB columns, the wire returns were already clean
        // (reviewer; corrected in the Phase 3 review file, PR #18). They stay
        // listed until their Phase 6 core extractions clear the files.
        const baseline = [
          "apps/web/src/lib/salary-benchmark.functions.ts", // DB column write, not returned (verified false positive)
          "apps/web/src/lib/onboarding.functions.ts", // DB column write, not returned (verified false positive)
          "apps/web/src/lib/platform-ai-usage.functions.ts", // APPROVED CARVE-OUT (product owner via Dev 2, 2026-11-25): model names on the platform-admin usage page — requirePlatformAdmin-gated operator console, not a tenant surface
          "apps/web/src/lib/ontology.functions.ts", // stats.model: engine (may be a non-vendor label)
          "apps/web/src/lib/ai-settings.functions.ts", // BYO-key settings page (invariant carve-out)
          "apps/web/src/lib/matching.functions.ts", // echoes the org's own BYO config model (carve-out rationale)
          "apps/web/src/lib/screening.functions.ts", // the screening domain's own engine labels, not vendor models
          "apps/web/src/lib/verification.functions.ts", // DB column write, not returned (verified false positive)
          "apps/web/src/lib/assessment.functions.ts", // DB column write, not returned (verified false positive)
        ];
        if (baseline.includes(rel)) continue;
        for (const m of text.matchAll(re))
          offenders.push(`${rel}: returned/constructed "${m[1]}:" field`);
      }
    expect(offenders.length ? offenders.join("\n") : "").toBe("");
  });
});
