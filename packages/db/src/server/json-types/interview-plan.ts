/**
 * A role's interview plan (client-safe): how many rounds, what each round is
 * for, the competencies interviewers rate (built from the role's must-haves so
 * scores line up across interviewers), how many people sit on each panel, and
 * what an interviewer's verdict does.
 *
 * verdictPolicy:
 * - "recommend" (default): a round advances only when every panel member
 *   selects; a hold or reject is a recommendation the hiring manager decides.
 * - "immediate": the round's verdict moves the candidate at once (the
 *   earlier behaviour) — select only when everyone selects, otherwise the
 *   most cautious verdict (reject over hold).
 * The hiring decision itself (select → offer) always comes after the final
 * round, from the hiring manager.
 *
 * Rubric (per round, keyed by competency name so every reader of the plain
 * `competencies` list keeps working):
 * - weights: how much each competency counts toward the overall (×1–×5,
 *   or a percent split from an approved panel change; default 1 = all equal). The overall is always the weighted average of
 *   the competency ratings, computed on the server (`overallRating`).
 * - anchors: what a 1, a 3 and a 5 look like for that competency in this
 *   role, shown on the scorecard so interviewers read the scale the same way.
 *
 * Phase 2 (fix S7): the zod schemas and inferred types moved here from
 * src/lib/interview-plan.ts so the schema's `$type<…>` references stop
 * importing app code. The plan's pure helpers remain in the lib file until
 * the interviews package lands (map §4 L3).
 */
import { z } from "zod";

export const Anchor = z.object({
  low: z.string().trim().max(200).default(""),
  mid: z.string().trim().max(200).default(""),
  high: z.string().trim().max(200).default(""),
});

export const PlanRound = z.object({
  level: z.number().int().min(1).max(3),
  name: z.string().trim().min(2).max(60),
  focus: z.string().trim().max(300).default(""),
  competencies: z.array(z.string().trim().min(2).max(60)).min(1).max(8),
  panelSize: z.number().int().min(1).max(3).default(1),
  /**
   * Competency → weight; missing = 1. The hiring team picks ×1–×5; a panel
   * change approved by the hiring manager stores the split in percent (1–100).
   * Only the ratios count.
   */
  weights: z.record(z.string(), z.number().int().min(1).max(100)).optional(),
  /** Competency → what a 1, 3 and 5 look like in this role. */
  anchors: z.record(z.string(), Anchor).optional(),
});

export const InterviewPlanSchema = z
  .object({
    rounds: z.array(PlanRound).min(1).max(3),
    verdictPolicy: z.enum(["recommend", "immediate"]).default("recommend"),
  })
  .refine((p) => p.rounds.every((r, i) => r.level === i + 1), {
    message: "Rounds must be numbered 1, 2, 3 in order.",
  });

export type InterviewPlan = z.infer<typeof InterviewPlanSchema>;
export type PlanRoundT = z.infer<typeof PlanRound>;
export type AnchorT = z.infer<typeof Anchor>;

/** The AI's review of a proposed change (stored; shown to the approver). */
export const PlanReviewSchema = z.object({
  verdict: z.enum(["fits", "concerns"]).catch("concerns"),
  summary: z
    .string()
    .trim()
    .transform((t) => t.slice(0, 600)),
  findings: z
    .array(
      z.object({
        kind: z.enum(["coverage", "relevance", "fairness", "clarity"]).catch("relevance"),
        text: z
          .string()
          .trim()
          .transform((t) => t.slice(0, 300)),
      }),
    )
    .default([])
    .transform((f) => f.slice(0, 8)),
});
export type PlanReview = z.infer<typeof PlanReviewSchema>;
