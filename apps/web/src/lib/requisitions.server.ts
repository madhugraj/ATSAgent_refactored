// SHIM: remove in Phase 8 — moved verbatim to @ats/requisitions/server
// (packages/requisitions/src/server/requisitions.server.ts, Phase 5, map §4
// L3). The close no longer touches boards: advanceRequisitionCore emits
// requisition.closed through the kernel and distribution's subscriber closes
// the postings.
export * from "@ats/requisitions/server";
