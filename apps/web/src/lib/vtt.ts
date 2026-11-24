// SHIM: remove in Phase 8 — TranscriptSegment moved to @ats/db/server
// (packages/db/src/server/json-types/vtt.ts); parseVtt stays until the
// interviews package lands (map §4 L3).
export type { TranscriptSegment } from "@ats/db/server";

import type { TranscriptSegment } from "@ats/db/server";

/** WebVTT transcripts from meeting providers (docs/silent-panel-agent-plan.md, S0). */

const MAX_SEGMENTS = 5_000;

function vttTime(t: string): number {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(t.trim());
  if (!m) return 0;
  const [, h, min, s, ms] = m;
  return ((Number(h ?? 0) * 60 + Number(min)) * 60 + Number(s)) * 1000 + Number(ms!.padEnd(3, "0"));
}

/**
 * WebVTT as Zoom (`Name: text`) and Teams (`<v Name>text</v>`) write it.
 * Consecutive cues from the same speaker are merged.
 */
export function parseVtt(vtt: string): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  const blocks = vtt.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0) continue;
    const [from, to] = lines[at]!.split("-->").map((x) => x.trim().split(/\s+/)[0] ?? "");
    let body = lines
      .slice(at + 1)
      .join(" ")
      .trim();
    if (!body) continue;
    let speaker: string | null = null;
    const voice = /^<v(?:\.[^\s>]*)?\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/.exec(body);
    if (voice) {
      speaker = voice[1]!.trim();
      body = voice[2]!.trim();
    } else {
      const named = /^([^:]{1,80}):\s+([\s\S]+)$/.exec(body);
      if (named) {
        speaker = named[1]!.trim();
        body = named[2]!.trim();
      }
    }
    body = body.replace(/<[^>]+>/g, "").trim();
    if (!body) continue;
    const seg = { speaker, text: body, startMs: vttTime(from ?? ""), endMs: vttTime(to ?? "") };
    const last = out[out.length - 1];
    if (last && last.speaker === seg.speaker && seg.startMs - last.endMs < 2_000) {
      last.text = `${last.text} ${seg.text}`;
      last.endMs = seg.endMs;
    } else {
      out.push(seg);
    }
    if (out.length >= MAX_SEGMENTS) break;
  }
  return out;
}
