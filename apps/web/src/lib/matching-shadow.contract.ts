/** Wire contract for the matching-ml shadow service (Phase 9b).

The request carries NO candidate text (plan rule 7): a derived features dict
— the AI-extracted semantic scores (produced TS-side through aiJson feature
`candidate_score`), the employment rows the career maths needs, weights,
custom dimensions, the blended social score, the experience band and the
request timestamp. The response is the deterministic arithmetic only —
scores, career metrics/flags and contributions. No recommendation: the gates
never exist in the service.
*/
import { z } from "zod";

export const MatchingShadowRequest = z.object({
  orgId: z.string().uuid(),
  now: z.string().min(10),
  jd: z.object({ experienceMin: z.number(), experienceMax: z.number() }),
  candidate: z.object({ experienceYears: z.number() }),
  weights: z.object({
    skills: z.number(),
    experience: z.number(),
    career: z.number(),
    impact: z.number(),
    education: z.number(),
    social: z.number(),
  }),
  customDimensions: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      hint: z.string(),
      weight: z.number(),
    }),
  ),
  socialScore: z.number(),
  ai: z.object({
    skillsScore: z.number(),
    educationScore: z.number(),
    employmentHistory: z.array(
      z.object({
        // Nulls normalised to "" by the hook: the career port treats an empty
        // end as ongoing and an empty company as unmatched, exactly like null.
        company: z.string(),
        title: z.string(),
        start: z.string(),
        end: z.string(),
      }),
    ),
    skillRecencyYears: z.number().optional(), // absent = never used/unknown; the Python side treats absence as None
    impactScore: z.number(),
    innovationScore: z.number(),
    additionalScores: z.array(
      z.object({ key: z.string(), score: z.number(), evidence: z.string() }),
    ),
  }),
});

export const MatchingShadowResponse = z.object({
  overall: z.number(),
  scores: z.object({
    skills: z.number(),
    experience: z.number(),
    career: z.number(),
    impact_innovation: z.number(),
    education: z.number(),
    social: z.number(),
  }),
  career_flags: z.array(z.string()),
  // career_metrics (the measured dict) is also returned by the service but is
  // diagnostic only — kept out of the wire contract (the generator subset has
  // no open records); the shadow diff reads scores, not metrics.
  custom_scores: z.array(z.object({ key: z.string(), score: z.number() })),
  contributions: z.array(
    z.object({
      label: z.string(),
      raw: z.number(),
      weight: z.number(),
      weighted: z.number(),
    }),
  ),
});

export type MatchingShadowRequest = z.infer<typeof MatchingShadowRequest>;
export type MatchingShadowResponse = z.infer<typeof MatchingShadowResponse>;
