// SHIM: remove in Phase 8 — moved verbatim to @ats/candidates/shared (map §4 L3).
export {
  normEmail,
  normPhone,
  normName,
  findDuplicateGroups,
  duplicateIndex,
  FRESH_DAYS,
  STALE_DAYS,
  freshness,
  mergeCandidateFields,
  mergeCandidates,
} from "@ats/candidates/shared";
export type { DuplicateReason, DuplicateGroup, Freshness } from "@ats/candidates/shared";
