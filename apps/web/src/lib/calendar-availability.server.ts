// SHIM: remove in Phase 8 — moved verbatim to @ats/integrations/server
// (packages/integrations/src/server/calendar-availability.server.ts).
export {
  WORKING,
  busyFor,
  zonedTime,
  wallDate,
  workingSlots,
  roundNotBefore,
  assertAfterEarlierRounds,
  findFreeSlots,
  isFree,
} from "@ats/integrations/server";
export type { Busy } from "@ats/integrations/server";
