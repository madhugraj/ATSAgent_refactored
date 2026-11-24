/**
 * The app's agent-side implementations of the kernel ports (map §4 L1/§5):
 * AgentPort (enqueue/cancelStale/afterSubjectsDeleted/kick over
 * runtime.startRun / cancelStaleRequests / afterSubjectsDeleted and the
 * orchestrator's kickAgents) plus the org run effects (runtime.cancelRun,
 * which is not on the port — @ats/org registers it separately, the same
 * contract as @ats/desk-core's thread effects).
 *
 * boot.ts calls this once in the composition root; the org-profile shim
 * registers the same pair at load so direct imports of the old path are
 * wired too. Registering twice is safe — both registries store the last
 * implementation, and the implementations are the same functions.
 */
import { registerAgentPort } from "@ats/kernel/server";
import { registerOrgRunEffects } from "@ats/org/server";
import {
  afterSubjectsDeleted,
  cancelRun,
  cancelStaleRequests,
  startRun,
} from "./server/agents/runtime.server";
import { kickAgents } from "./server/agents/orchestrator.server";

export function registerAppAgentPort(): void {
  registerAgentPort({
    enqueue: (input) => startRun(input),
    cancelStale: (orgId, applicationId, fromStage, toStage) =>
      cancelStaleRequests(orgId, applicationId, fromStage, toStage),
    afterSubjectsDeleted: (orgId) => afterSubjectsDeleted(orgId),
    kick: (orgId) => kickAgents(orgId),
  });
  registerOrgRunEffects({ cancelRun: (input) => cancelRun(input) });
}
