/**
 * Distribution's domain-event subscriptions (map §5, runbook §2 distribution
 * item 1). Registered once from apps/web/src/boot.ts; never imported for its
 * side effects anywhere else.
 *
 * `requisition.closed` — when a requisition is closed, its job-board postings
 * come down with it. This is the no-op-safe prerequisite for the change PR
 * that replaces requisitions.server.ts's direct closePostingsForRequisition
 * call with an emitted event: until that PR lands nothing emits the event and
 * this subscriber simply never fires.
 *
 * Double-close is harmless (verified): closePostingsForRequisition only
 * updates rows with status "pending" (→ withdrawn) and only closes rows with
 * status "published"; a row closed by a first pass is "closed" and matches
 * neither predicate, so a second delivery performs no writes and no vendor
 * calls. closeBoardPostingImpl applies the same status guard before any
 * vendor call.
 */
import { onDomainEvent } from "@ats/kernel/server";

import { closePostingsForRequisition } from "./boards/publish.server";

async function requisitionClosed(e: { orgId: string; payload?: Record<string, unknown> }) {
  const requisitionId =
    typeof e.payload?.["requisitionId"] === "string" ? e.payload["requisitionId"] : null;
  // No requisition in the event — nothing to close (no-op safe).
  if (!requisitionId) return;
  const payloadActor = e.payload?.["actor"] as
    { memberEmail?: unknown; userId?: unknown } | undefined;
  const actor = {
    memberEmail:
      typeof payloadActor?.memberEmail === "string" ? payloadActor.memberEmail : "system",
    userId: typeof payloadActor?.userId === "string" ? payloadActor.userId : "system",
  };
  // Best-effort, exactly like the direct call it fronts: never blocks the
  // requisition transition; failures are recorded per posting row.
  await closePostingsForRequisition({
    orgId: e.orgId,
    actor,
    requisitionId,
  }).catch(() => undefined);
}

/** Register the distribution subscribers. Called once from boot.ts. */
export function registerDistributionDomainEvents() {
  onDomainEvent("requisition.closed", requisitionClosed);
}
