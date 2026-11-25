// SHIM: remove in Phase 8 — moved verbatim to @ats/distribution/server
// (packages/distribution/src/server/boards/publish.server.ts). Kept only for
// the requisitions → boards close edge (lib/requisitions.server.ts:254),
// which the requisition.closed change PR deletes; every other importer is
// re-pointed to the package.
export {
  publishToBoardImpl,
  closeBoardPostingImpl,
  closePostingsForRequisition,
} from "@ats/distribution/server";
export type { BoardActor } from "@ats/distribution/server";
