// SHIM: remove in Phase 8 — moved verbatim to @ats/integrations/server
// (packages/integrations/src/server/meetings.server.ts).
export {
  zoomToken,
  googleToken,
  graphToken,
  msDelegatedToken,
  createMeeting,
  testMeetingProvider,
} from "@ats/integrations/server";
export type { MeetingProviderId, MeetingRequest, MeetingResult } from "@ats/integrations/server";
