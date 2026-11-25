// SHIM: remove in Phase 8 — moved verbatim to @ats/integrations/server
// (packages/integrations/src/server/linkedin.server.ts). The package index
// pins exchangeCode to this module (the LinkedIn callback route's version).
export {
  linkedinScopes,
  LinkedinAuthError,
  linkedinEnvConfigured,
  redirectUri,
  signState,
  verifyState,
  authorizeUrl,
  exchangeCode,
  refreshAccessToken,
  fetchMember,
  postAsMember,
  linkedinOrgToken,
  REST_VERSION,
  probeCapabilities,
} from "@ats/integrations/server";
export type { TokenSet, LinkedinCapability } from "@ats/integrations/server";
