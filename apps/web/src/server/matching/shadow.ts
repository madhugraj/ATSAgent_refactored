/**
 * Phase 9b shadow mode for the matching scorer: after scoreCandidate's
 * deterministic arithmetic completes, fire the derived features at the
 * matching-ml service and log the per-score diff. The TS result is always
 * the one served — fire-and-forget, never blocks, never throws into the
 * caller.
 *
 * The payload is a derived features dict, NOT the corpus: the AI-extracted
 * semantic scores (produced TS-side through aiJson feature candidate_score —
 * plan rule 4, no AI keys in Python), employment rows for the career maths,
 * weights, custom dimensions, the blended social score, the experience band
 * and the request timestamp. No CV text, no names, no URLs.
 *
 * The diff log carries per-score deltas + a features hash — never the payload
 * itself, never skill lists or evidence strings (plan rule 7: nothing
 * candidate-derived at rest).
 *
 * Raw fetch, not safeFetch, for the documented reason of
 * apps/web/src/server/parser/shadow.ts:7 — the URL is deployment
 * configuration (MATCHING_SHADOW_URL, cluster-internal), never user input.
 * Auth is the service token from SERVICE_TOKENS (matching-ml validates it
 * constant-time, fail-closed).
 */
import { createHash } from "node:crypto";

const TIMEOUT_MS = 20_000;

export type ShadowScoreSet = {
  overall: number;
  skills: number;
  experience: number;
  career: number;
  impactInnovation: number;
  education: number;
  social: number;
};

export type ShadowMatchDiff = {
  featuresSha: string;
  ts: ShadowScoreSet;
  py: ShadowScoreSet;
  deltas: Record<string, number>;
  equal: boolean;
  ms: number;
};

/** SHA-256 prefix of the canonical features JSON — identifies the case
without storing anything candidate-derived. */
export function featuresSha(features: unknown): string {
  return createHash("sha256").update(JSON.stringify(features)).digest("hex").slice(0, 16);
}

export async function shadowMatchCompare(
  features: unknown,
  tsScores: ShadowScoreSet,
): Promise<void> {
  const url = process.env["MATCHING_SHADOW_URL"];
  const token = (process.env["SERVICE_TOKENS"] ?? "").split(",")[0]?.trim();
  if (!url || !token) return;
  const started = Date.now();
  try {
    const res = await fetch(`${url}/score`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(features),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("matching.shadow_unavailable", { status: res.status });
      return;
    }
    const out = (await res.json()) as {
      overall?: number;
      scores?: Record<string, number | undefined>;
    };
    const scores = out.scores ?? {};
    const num = (v: number | undefined, fallback = -1): number =>
      typeof v === "number" ? v : fallback;
    const py: ShadowScoreSet = {
      overall: num(out.overall),
      skills: num(scores["skills"]),
      experience: num(scores["experience"]),
      career: num(scores["career"]),
      impactInnovation: num(scores["impact_innovation"]),
      education: num(scores["education"]),
      social: num(scores["social"]),
    };
    const deltas: Record<string, number> = {};
    let equal = true;
    for (const key of Object.keys(tsScores) as (keyof ShadowScoreSet)[]) {
      const delta = py[key] - tsScores[key];
      deltas[key] = delta;
      if (delta !== 0) equal = false;
    }
    const diff: ShadowMatchDiff = {
      featuresSha: featuresSha(features),
      ts: tsScores,
      py,
      deltas,
      equal,
      ms: Date.now() - started,
    };
    if (equal) console.log("matching.shadow_match", diff);
    else console.warn("matching.shadow_diff", diff);
  } catch (e) {
    console.warn("matching.shadow_unavailable", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
