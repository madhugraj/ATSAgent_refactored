/**
 * The offer check's shape and verdict (docs/labour-policy-agent-plan.md, L3).
 * Pure; shared by server and client. Phase 2 (fix S7, ruling §10): the JSON
 * shape moved here from src/lib/offer-check.ts so the schema's `$type<…>`
 * reference stops importing app code; `overallVerdict` remains in the lib
 * file until the offers package lands.
 */
import { z } from "zod";

export const OFFER_CHECK_VERDICTS = ["pass", "fix_needed", "needs_counsel"] as const;
export type OfferCheckVerdict = (typeof OFFER_CHECK_VERDICTS)[number];

export const OfferCheckItem = z.object({
  /** What was checked, in plain words ("Probation length", "Pay floor"). */
  check: z.string().min(2).max(120),
  verdict: z.enum(OFFER_CHECK_VERDICTS),
  /** Why, in plain words. */
  detail: z.string().min(2).max(800),
  /** The approved rule it rests on, when it rests on one. */
  ruleId: z.string().uuid().nullable().default(null),
  /** For a fix: wording the letter could use instead. */
  suggestion: z.string().max(800).nullable().default(null),
});
export type OfferCheckItem = z.infer<typeof OfferCheckItem>;

export type OfferCheck = {
  at: string;
  verdict: OfferCheckVerdict;
  items: OfferCheckItem[];
  /** The rules and letter it was run against: a change makes the check stale. */
  key: string;
  zone: string | null;
  rules: { id: string; area: string; rule: string; url: string; quote: string }[];
};
