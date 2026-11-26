/**
 * Phase 9b shadow mode for the parser: after the TS parse completes, fire
 * the same payload at the Python shadow service and log the field-level
 * diff. The TS result is always the one served — this never blocks, never
 * throws into the caller, and never replaces the live path.
 *
 * The fetch is a raw fetch, not safeFetch, for the documented reason of
 * src/server/parser/client.ts:7 — the URL is deployment configuration
 * (PARSER_SHADOW_URL, cluster-internal), never user input. Auth is the same
 * ``x-parser-token`` credential the real worker gets.
 *
 * Logging: only lengths and a hash, never document content or the extracted
 * text (erasure, plan rule 7 — the shadow service holds nothing at rest and
 * the diff log must not become a copy of the corpus). A matching SHA-256
 * means the engines agree; a mismatch names the length delta so the §9
 * parity report can size the gap.
 */
import { createHash } from "node:crypto";

const TIMEOUT_MS = 45_000;

export type ShadowDiff = {
  filenameLen: number;
  tsChars: number;
  pyChars: number;
  tsSha: string;
  pySha: string;
  equal: boolean;
  ms: number;
};

/** SHA-256 prefix of a string — identifies equality without storing content. */
function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export async function shadowParseCompare(
  filename: string,
  bytes: Uint8Array,
  tsResult: string,
): Promise<void> {
  const url = process.env["PARSER_SHADOW_URL"];
  const token = process.env["PARSER_TOKEN"];
  if (!url || !token || !bytes.byteLength) return;
  const started = Date.now();
  try {
    const res = await fetch(`${url}/parse`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-file-name": encodeURIComponent(filename.slice(0, 300)),
        "x-parser-token": token,
      },
      body: bytes as unknown as BodyInit,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("parser.shadow_unavailable", {
        status: res.status,
        filenameLen: filename.length,
      });
      return;
    }
    const out = (await res.json()) as { text?: unknown };
    const pyText = typeof out.text === "string" ? out.text : "";
    const diff: ShadowDiff = {
      filenameLen: filename.length,
      tsChars: tsResult.length,
      pyChars: pyText.length,
      tsSha: sha(tsResult),
      pySha: sha(pyText),
      equal: tsResult === pyText,
      ms: Date.now() - started,
    };
    if (diff.equal) console.log("parser.shadow_match", diff);
    else console.warn("parser.shadow_diff", diff);
  } catch (e) {
    console.warn("parser.shadow_unavailable", {
      error: e instanceof Error ? e.message : String(e),
      filenameLen: filename.length,
    });
  }
}
