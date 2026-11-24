/**
 * Domain events that drive the agent chain (docs/agentic-plan.md §3.1).
 * Written by the lifecycle cores after a successful change; never blocks the
 * change.
 */
import { currentAgentRun } from "@ats/ai/server";
import { agentEvents, db } from "@ats/db/server";
import { log } from "@ats/observability/server";

export const AGENT_EVENT_TYPES = [
  "requisition.created",
  "requisition.status_changed",
  "jd.submitted",
  "jd.approved",
  "jd.changes_requested",
  "application.shortlisted",
  "application.advanced",
  "scorecard.submitted",
  "hiring.selected",
  "offer.status_changed",
  "onboarding.document_received",
  "onboarding.document_rejected",
  "interview.missed",
  "interview.panellist_unavailable",
  "interview.slots_unanswered",
  "interview.panel_times_rejected",
  "interview.slots_no_reply",
  "interview.transcript_ready",
  "panel.review_due",
  "assessment.completed",
  "compensation.submitted",
  "negotiation.agreed",
  "negotiation.needs_call",
  "screening_call.ended",
] as const;

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

/** The event as emitted (and stored): the same shape the lifecycle cores pass. */
export type AgentEvent = {
  orgId: string;
  type: AgentEventType;
  subjectType: "requisition" | "jd" | "application" | "offer";
  subjectId: string;
  actorUserId: string | null;
  payload?: Record<string, unknown>;
};

/**
 * Subscribers to inserted agent events (map §5): the composition root (the
 * app's boot) wires the inline kick here, so this module — and every domain
 * that emits events — never imports upward into the agents runtime.
 */
export type AgentEventHandler = (e: AgentEvent) => void;

const handlers: AgentEventHandler[] = [];

/** Register a handler for inserted agent events; returns the unsubscribe function. */
export function onAgentEvent(handler: AgentEventHandler): () => void {
  handlers.push(handler);
  return () => {
    const i = handlers.indexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
  };
}

export async function emitAgentEvent(e: AgentEvent): Promise<void> {
  // The run executing on this call chain published the event (a tool calling a
  // lifecycle core); null when a person or the system did. Never cross orgs.
  const run = currentAgentRun();
  const sourceRunId = run && run.orgId === e.orgId ? run.runId : null;
  try {
    await db.insert(agentEvents).values({
      orgId: e.orgId,
      sourceRunId,
      type: e.type,
      subjectType: e.subjectType,
      subjectId: e.subjectId,
      actorUserId: e.actorUserId,
      payload: e.payload ?? {},
    });
    // The row is in; tell the subscribers in registration order (the inline
    // kick that advances the org's runs is one of them, registered at boot).
    for (const handler of [...handlers]) handler(e);
  } catch (err) {
    log.error("agent.event.emit_failed", { org_id: e.orgId, type: e.type, error: err as Error });
  }
}
