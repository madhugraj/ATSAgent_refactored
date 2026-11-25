// SHIM: remove in Phase 8 — moved verbatim to @ats/candidates/server (map §4 L3).
export {
  cleanRoleTitle,
  orgForCaptureToken,
  DISTRIBUTION_TOKEN_MESSAGE,
  distributionTokenOf,
  orgForDistributionToken,
  capture,
} from "@ats/candidates/server";
export type { CaptureKind, CaptureInput, CaptureResult } from "@ats/candidates/server";
