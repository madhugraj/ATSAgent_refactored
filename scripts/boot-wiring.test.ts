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
