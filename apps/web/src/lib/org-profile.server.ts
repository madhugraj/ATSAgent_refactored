// SHIM: remove in Phase 8
// The org profile cores live in @ats/org/server (Phase 4, map §4 L2). This
// shim keeps the app's existing imports (server-fn wrappers, scripts tests)
// on the exact old surface.
export type { ProfileActor, ProfileState, SaveResult, ProfileDecision } from "@ats/org/server";
export {
  EDITORS,
  orgNamesOf,
  staffNameKeys,
  profileState,
  startDraftCore,
  saveDraftCore,
  submitDraftCore,
  discardDraftCore,
  authorsOf,
  TWO_PERSON_MESSAGE,
  twoPersonCheck,
  decideVersionCore,
  setRequireProfileCore,
  profileGate,
  PROFILE_REQUIRED_MESSAGE,
  resetProfileCore,
  assertProfileAllowsRequisition,
  pendingVersion,
} from "@ats/org/server";

// The profile cores start and stop agent runs through the kernel ports (map
// §4 L2): the orchestrator kick is the boot-registered AgentPort.kick, and
// resetting a profile cancels its runs through the registered runtime
// effects — the same calls, in the same places, as the pre-move dynamic
// imports. Production registers in boot.ts; this load-time registration
// wires every direct import of the old path (tests, server-fn wrappers)
// exactly like desk.server.ts does for the desk-core effects.
void import("../agent-port.server")
  .then((m) => m.registerAppAgentPort())
  .catch((e) =>
    console.warn("org.run_effects_registration_failed", e instanceof Error ? e.message : e),
  );
