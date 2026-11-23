// SHIM: remove in Phase 8 — the panel assessment's stored JSON shapes moved
// to @ats/db/server (packages/db/src/server/json-types/panel-assessment.ts);
// the transcript and view builders stay until the interviews package lands
// (map §4 L3).
export { PROTECTED_TOPICS, AssessOutput, SummaryOutput } from "@ats/db/server";
export type { CandidateView, PanelView } from "@ats/db/server";

import { overallRating } from "./interview-plan";

import type { AssessOutput, CandidateView, PanelView, SummaryOutput } from "@ats/db/server";
import type { TranscriptSegment } from "./vtt";

/* ------------------------------------------------------------ transcript */

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** One line per turn: `[mm:ss] Speaker: text` — what the model reads (inside untrusted()). */
export function formatTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${mmss(s.startMs)}] ${s.speaker ?? "Unknown speaker"}: ${s.text}`)
    .join("\n");
}

export function speakersOf(segments: TranscriptSegment[]): string[] {
  return [...new Set(segments.map((s) => s.speaker).filter((x): x is string => Boolean(x)))];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * The speaker who is the candidate: the label the model named, when it is
 * really one of the transcript's speakers; else a label sharing a word of the
 * candidate's name. null when neither — talk time is then not counted.
 */
export function candidateSpeakerOf(
  segments: TranscriptSegment[],
  named: string | null,
  candidateName: string,
): string | null {
  const speakers = speakersOf(segments);
  const exact = named ? speakers.find((s) => norm(s) === norm(named)) : undefined;
  if (exact) return exact;
  const words = norm(candidateName)
    .split(" ")
    .filter((w) => w.length > 2);
  return (
    speakers.find((s) =>
      norm(s)
        .split(" ")
        .some((w) => words.includes(w)),
    ) ?? null
  );
}

/** Speaking-time shares and the panel's questions, counted from the transcript. */
export function talkStats(segments: TranscriptSegment[], candidateSpeaker: string | null) {
  const length = (s: TranscriptSegment) =>
    s.endMs > s.startMs ? s.endMs - s.startMs : s.text.split(/\s+/).length * 400;
  const total = segments.reduce((n, s) => n + length(s), 0);
  const last = segments[segments.length - 1];
  const minutes = Math.round((last?.endMs ?? 0) / 60_000);
  if (!candidateSpeaker || !total)
    return { candidateTalkShare: null, panelTalkShare: null, panelQuestions: null, minutes };
  const mine = segments.filter((s) => s.speaker === candidateSpeaker);
  const theirs = segments.filter((s) => s.speaker !== candidateSpeaker);
  const share = (xs: TranscriptSegment[]) =>
    Math.round((xs.reduce((n, s) => n + length(s), 0) / total) * 100) / 100;
  return {
    candidateTalkShare: share(mine),
    panelTalkShare: share(theirs),
    panelQuestions: theirs.reduce((n, s) => n + (s.text.match(/\?/g)?.length ?? 0), 0),
    minutes,
  };
}

/** Only quotes that are really in the transcript (ignoring case and punctuation). */
export function keepQuotes(quotes: string[], transcript: string): string[] {
  const body = norm(transcript);
  return quotes.filter((q) => {
    const n = norm(q);
    return n.length >= 8 && body.includes(n);
  });
}

/* ------------------------------------------------------------- the view */

/**
 * The stored view from the model's output: competencies limited to the
 * round's, evidence and off-limits quotes checked against the transcript,
 * talk time counted in code.
 */
export function buildAssessment(
  out: AssessOutput,
  segments: TranscriptSegment[],
  roundCompetencies: string[],
  candidateName: string,
  /** The round's weights; the overall follows the same rule as a panellist's scorecard. */
  weights: Record<string, number> = {},
): {
  rating: number;
  verdict: AssessOutput["verdict"];
  candidate: CandidateView;
  panel: PanelView;
  injectionSuspected: boolean;
} {
  const transcript = segments.map((s) => s.text).join("\n");
  const allowed = new Map(roundCompetencies.map((c) => [norm(c), c]));
  const own = (name: string) => (allowed.size ? allowed.get(norm(name)) : name);
  const candidateSpeaker = candidateSpeakerOf(segments, out.candidate_speaker, candidateName);
  const offLimits = out.panel.off_limits.filter((o) => keepQuotes([o.quote], transcript).length);
  // Same overall as a panellist: the weighted average of the competencies it
  // could rate from the call; the model's own overall only when it rated none.
  const rated = out.competencies
    .map((c) => ({ name: own(c.name), rating: c.rating }))
    .filter((c): c is { name: string; rating: number } => Boolean(c.name) && c.rating != null);
  const rating = rated.length ? overallRating(rated, { weights }) : out.rating;
  return {
    rating,
    verdict: out.verdict,
    candidate: {
      competencies: out.competencies
        .map((c) => ({ ...c, name: own(c.name) }))
        .filter((c): c is typeof c & { name: string } => Boolean(c.name))
        .map((c) => ({
          name: c.name,
          rating: c.rating,
          evidence: keepQuotes(c.evidence, transcript),
          note: c.note,
        })),
      strengths: out.strengths,
      gaps: out.gaps,
      openQuestions: out.open_questions,
    },
    panel: {
      covered: out.panel.covered.map(own).filter((x): x is string => Boolean(x)),
      missed: out.panel.missed.map(own).filter((x): x is string => Boolean(x)),
      offLimits,
      notes: out.panel.notes,
      candidateSpeaker,
      ...talkStats(segments, candidateSpeaker),
    },
    injectionSuspected: out.suspected_prompt_injection,
  };
}

/* -------------------------------------------------------------- summary */

/** Words that would carry a judgement into the panel's factual summary. */
const JUDGEMENT =
  /\b(scores?|scored|rating|rated|recommend\w*|verdict|reject\w*|shortlist\w*|hire|hiring decision|strong(est)? candidate|weak(est)? candidate|out of (five|5))\b|\b\d\s*\/\s*5\b/i;

/**
 * The summary the panel receives: sentences that carry a judgement are
 * dropped, so it can never anchor the panel before they score.
 */
export function scrubSummary(s: SummaryOutput): SummaryOutput {
  const clean = (text: string) =>
    text
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !JUDGEMENT.test(sentence))
      .join(" ")
      .trim();
  return {
    ...s,
    overview: clean(s.overview),
    topics: s.topics
      .map((t) => ({ topic: t.topic, asked: clean(t.asked), answered: clean(t.answered) }))
      .filter((t) => t.asked || t.answered),
  };
}
