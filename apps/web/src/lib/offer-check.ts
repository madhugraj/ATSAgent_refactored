// SHIM: remove in Phase 8 — the offer check's JSON shape moved to
// @ats/db/server (packages/db/src/server/json-types/offer-check.ts);
// overallVerdict stays until the offers package lands (map §4 L3).
export { OFFER_CHECK_VERDICTS, OfferCheckItem } from "@ats/db/server";
export type { OfferCheckVerdict, OfferCheck } from "@ats/db/server";

import type { OfferCheckItem, OfferCheckVerdict } from "@ats/db/server";

/** The worst verdict wins: a fix outranks counsel, counsel outranks a pass (pure). */
export function overallVerdict(items: Pick<OfferCheckItem, "verdict">[]): OfferCheckVerdict {
  if (items.some((i) => i.verdict === "fix_needed")) return "fix_needed";
  if (items.some((i) => i.verdict === "needs_counsel")) return "needs_counsel";
  return "pass";
}
