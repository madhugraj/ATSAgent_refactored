/** Wire contract for the parser shadow service (Phase 9b) — response only.

The request is the raw document bytes (application/octet-stream) with
``x-file-name`` and ``x-parser-token`` headers — the same wire the real
parser worker (src/server/parser/worker.ts) speaks, byte-for-byte, so the
shadow call is indistinguishable from the live one. Only the JSON response
is a zod contract:

    services/parser  ←  tools/contracts/generate.mjs  ←  this module
*/
import { z } from "zod";

/** A 200 response body: the extracted text (hidden runs replaced by the
marker line, exactly like the TS worker). */
export const ParserShadowResponse = z.object({
  text: z.string(),
});

export type ParserShadowResponse = z.infer<typeof ParserShadowResponse>;
