/**
 * WebVTT transcripts from meeting providers (docs/silent-panel-agent-plan.md,
 * S0). Phase 2 (fix S7): the segment type moved here from src/lib/vtt.ts so
 * the schema's `$type<…>` reference stops importing app code; the parser
 * (`parseVtt`) remains in the lib file until the interviews package lands.
 */

export type TranscriptSegment = {
  /** As the provider names them (display name), or null when it does not say. */
  speaker: string | null;
  text: string;
  /** Milliseconds from the start of the transcript. */
  startMs: number;
  endMs: number;
};
