/**
 * Kernel event wiring spec (Phase 3 hardening).
 *
 * Contract (docs/refactor/01-module-boundary-map.md §5, cross-cutting events):
 * `kernel.emitAgentEvent` inserts the agent_events row and then triggers the
 * REGISTERED handlers — replacing today's hard-coded events.ts→orchestrator
 * dynamic import — and apps/web/src/boot.ts registers the orchestrator's
 * kickAgents as the "agent.event" subscriber ("agents orchestrator (kick)").
 *
 * INTENTIONAL STATE — fail-before / pass-after (leave it failing): boot.ts
 * does not exist yet, so this test fails with a clean message today
 * ("boot.ts not present (Phase 3 kernel wiring)") and passes once the kernel
 * wiring lands. The orchestrator module is replaced by a recording stub
 * BEFORE boot is imported, so the spec observes exactly what the wiring
 * calls — the real tick machinery never runs.
 *
 * Run: DATABASE_URL=… SESSION_SECRET=… bun test scripts/boot-wiring.test.ts
 * (the database is needed only once boot.ts exists — today the test fails
 * before any query; expected today: 1 fail with the clean message).
 */
import { expect, mock, test } from "bun:test";
import { join as joinPath } from "node:path";

const BOOT_MODULE = joinPath(import.meta.dir, "../apps/web/src/boot.ts");

/** Every orchestrator kick the wiring fires, in order. */
const kicks: string[] = [];

// Registered BEFORE boot is imported: the wiring (and emitAgentEvent's own
// notification) resolves this stub, never the real orchestrator.
mock.module("../apps/web/src/server/agents/orchestrator.server", () => ({
  kickAgents: (orgId: string) => kicks.push(orgId),
  processAgentEvents: async () => 0,
  pendingEventCount: async () => 0,
  scheduleSweeps: async () => 0,
}));

test("emitAgentEvent triggers the registered handlers; boot.ts registers the orchestrator kick", async () => {
  if (!(await Bun.file(BOOT_MODULE).exists())) {
    throw new Error("boot.ts not present (Phase 3 kernel wiring)");
  }
  await import(BOOT_MODULE);

  const { sql } = await import("../apps/web/src/server/db");
  const { emitAgentEvent } = await import("../apps/web/src/server/agents/events");

  const [org] = (await sql`
    insert into organizations (name, slug)
    values ('Boot Wiring Spec', 'boot-wiring-spec')
    returning id`) as { id: string }[];
  try {
    await emitAgentEvent({
      orgId: org.id,
      type: "requisition.created",
      subjectType: "requisition",
      subjectId: crypto.randomUUID(),
      actorUserId: null,
      payload: { bootWiringSpec: true },
    });
    // The insert half: the event row exists for the org.
    const [row] = (await sql`
      select count(*)::int as n from agent_events
      where org_id = ${org.id} and type = 'requisition.created'`) as { n: number }[];
    expect(row.n).toBe(1);
    // The trigger half: the registered handler kicked the orchestrator for
    // the right org, exactly once (the hard-coded import is gone).
    expect(kicks).toEqual([org.id]);
  } finally {
    await sql`delete from agent_events where org_id = ${org.id}`;
    await sql`delete from organizations where id = ${org.id}`;
  }
});

test("boot registers a requisition.closed handler; emitting one closes the postings", async () => {
  await import(BOOT_MODULE);

  const { sql } = await import("../apps/web/src/server/db");
  const { emitDomainEvent } = await import("../packages/kernel/src/server/ports");
  const { domainEventHandlers } = await import("../packages/kernel/src/server/ports");

  // Registration half: importing boot registered a requisition.closed handler.
  expect(domainEventHandlers("requisition.closed").length).toBeGreaterThanOrEqual(1);

  const slug = `boot-wiring-close-${Date.now()}`;
  let orgId: string;
  let reqId: string;
  try {
    orgId = (
      await sql`
        insert into organizations (name, slug)
        values ('Boot Wiring Close Spec', ${slug})
        returning id`
    )[0]!.id;
    reqId = (
      await sql`
        insert into requisitions (org_id, code, title, status, created_by)
        values (${orgId}, 'REQ-BOOT-CLOSE', 'Boot wiring close spec', 'approved', null)
        returning id`
    )[0]!.id;
    // A published vendor posting and a planned hand posting for the role.
    const [published] = (await sql`
        insert into requisition_board_postings (org_id, requisition_id, provider, status, payload)
        values (${orgId}, ${reqId}, 'linkedin', 'published', '{}')
        returning id`) as { id: string }[];
    const [pending] = (await sql`
        insert into requisition_board_postings (org_id, requisition_id, provider, status, payload)
        values (${orgId}, ${reqId}, 'naukri', 'pending', '{}')
        returning id`) as { id: string }[];
    await emitDomainEvent({
      orgId,
      type: "requisition.closed",
      payload: { requisitionId: reqId, actor: "system" },
    });

    // The published vendor posting is closed; the planned hand posting is
    // withdrawn. (The vendor-side close call fails without credentials —
    // best-effort, same as the direct call it replaced.)
    const [pub] = (await sql`
        select status from requisition_board_postings where id = ${published.id}`) as {
      status: string;
    }[];
    expect(pub.status).toBe("closed");
    const [pen] = (await sql`
        select status from requisition_board_postings where id = ${pending.id}`) as {
      status: string;
    }[];
    expect(pen.status).toBe("withdrawn");
  } finally {
    if (orgId) await sql`delete from requisition_board_postings where org_id = ${orgId}`;
    if (reqId) await sql`delete from requisitions where id = ${reqId}`;
    if (orgId) await sql`delete from organizations where id = ${orgId}`;
  }
});
