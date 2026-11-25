// SHIM: remove in Phase 8
// The org-context cores (website, documents, extraction, orgContextFor) live
// in @ats/org/server (Phase 4, map §4 L2). This shim keeps the app's
// existing imports on the exact old surface; it starts no agent runs itself.
export type {
  OrgContextAudience,
  OrgContextPurpose,
  OrgContext,
  WebsiteReadResult,
  DocumentUploadResult,
  ExtractResult,
  ProposeResult,
} from "@ats/org/server";
export {
  ORG_CONTEXT_WORD_CAPS,
  NO_PROFILE_LINE,
  orgContextFor,
  metaText,
  renderPages,
  htmlToText,
  pageLinks,
  parseRobots,
  setWebsiteCore,
  isNotFoundPage,
  readWebsiteCore,
  acceptSourceCore,
  deleteOrgDocumentCore,
  uploadOrgDocumentCore,
  chunkText,
  extractToDraft,
  proposeItemsCore,
  readOrgDocument,
  readOrgRecords,
  readOrgSources,
  orgDeskThread,
} from "@ats/org/server";
