// SHIM: remove in Phase 8 — moved verbatim to @ats/integrations/server
// (packages/integrations/src/server/meetings-oauth.server.ts). This module's
// own exchangeCode is not re-exported here (it was only used internally and
// the package index pins exchangeCode to linkedin.server's).
export {
  oauthConfigured,
  oauthCredentials,
  callbackPath,
  callbackUrl,
  buildAuthorizeUrl,
  normaliseAccountEmail,
  emailDomainOf,
  finishProviderConnect,
} from "@ats/integrations/server";
export type { MeetingOAuthProvider } from "@ats/integrations/server";
