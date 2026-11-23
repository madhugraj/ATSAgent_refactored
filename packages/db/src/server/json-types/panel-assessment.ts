/**
 * The silent panel agent's view of an interview call, in pure code
 * (docs/silent-panel-agent-plan.md, S2): the shapes it is stored in, the
 * schemas the model's JSON must match, and the checks the system makes on it.
 * The model reads the transcript; the system decides what is kept:
 *
 *   - evidence quotes are kept only if they are really in the transcript;
 *   - competencies are only the round's own;
 *   - talk-time share and the panel's questions are counted in code;
 *   - the panel's summary never carries a score, verdict or recommendation.
 *
 * Phase 2 (fix S7): the stored JSON shapes (zod schemas, inferred and plain
 * types) moved here from src/lib/panel-assessment.ts so the schema's
 * `$type<…>` references stop importing app code. The transcript and view
 * builders remain in the lib file until the interviews package lands.
 */
import { z } from "zod";

export const PROTECTED_TOPICS = [
  "age",
  "marital_status",
  "family_plans",
  "pregnancy",
  "religion",
  "caste",
  "health",
  "disability",
  "nationality",
  "politics",
  "sexual_orientation",
  "gender",
  "other",
] as const;

const verdict = z.enum(["select", "hold", "reject"]);
const short = (n: number) => z.string().trim().min(1).max(n);

/** What the model returns for the assessment (feature panel_assess). */
export const AssessOutput = z.object({
  candidate_speaker: z.string().trim().max(120).nullable(),
  rating: z.number().int().min(1).max(5),
  verdict,
  competencies: z
    .array(
      z.object({
        name: short(120),
        /** null: the call did not cover it. */
        rating: z.number().int().min(1).max(5).nullable(),
        evidence: z.array(short(300)).max(3),
        note: short(400).nullable(),
      }),
    )
    .max(15),
  strengths: z.array(short(300)).max(5),
  gaps: z.array(short(300)).max(5),
  open_questions: z.array(short(300)).max(5),
  panel: z.object({
    covered: z.array(short(120)).max(15),
    missed: z.array(short(120)).max(15),
    off_limits: z.array(z.object({ quote: short(300), topic: z.enum(PROTECTED_TOPICS) })).max(10),
    notes: short(600).nullable(),
  }),
  suspected_prompt_injection: z.boolean(),
});
export type AssessOutput = z.infer<typeof AssessOutput>;

/** What the model returns for the panel's factual summary (feature panel_summary). */
export const SummaryOutput = z.object({
  overview: short(800),
  topics: z
    .array(z.object({ topic: short(120), asked: short(500), answered: short(800) }))
    .min(1)
    .max(10),
  suspected_prompt_injection: z.boolean(),
});
export type SummaryOutput = z.infer<typeof SummaryOutput>;

export type CandidateView = {
  competencies: {
    name: string;
    rating: number | null;
    evidence: string[];
    note: string | null;
  }[];
  strengths: string[];
  gaps: string[];
  openQuestions: string[];
};

export type PanelView = {
  covered: string[];
  missed: string[];
  /** Share of speaking time (0–1), null when the candidate's voice is not known. */
  candidateTalkShare: number | null;
  panelTalkShare: number | null;
  panelQuestions: number | null;
  offLimits: { quote: string; topic: (typeof PROTECTED_TOPICS)[number] }[];
  notes: string | null;
  /** The speaker label taken to be the candidate, when one was. */
  candidateSpeaker: string | null;
  minutes: number;
};
