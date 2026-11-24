/**
 * The kernel's event hooks and ports (map §5): an emitted event is inserted
 * exactly as before and the registered handlers — and only those, with no
 * upward agents import anywhere in the package — run in registration order;
 * a handler that throws never fails the emit; run attribution reads the same
 * AsyncLocalStorage instance the AI package owns; the port and domain-event
 * registries register and unsubscribe.
 * Run: DATABASE_URL=... SESSION_SECRET=... bun test packages/kernel/test/
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

process.env["AGENT_INLINE_KICK"] = "0";

const { agentEvents, agentRuns, db, organizations, users } = await import("@ats/db/server");
const { agentRunScope } = await import("@ats/ai/server");
const { emitAgentEvent, onAgentEvent } = await import("../src/server/events");
const {
  agentPort,
  domainEventHandlers,
  onDomainEvent,
  onSubjectsDeleted,
  registerAgentPort,
  subjectsDeletedHandlers,
} = await import("../src/server/ports");

let orgId: string;
let userId: string;
const stamp = Date.now();
const SUBJECT = "00000000-0000-4000-8000-000000000004";

beforeAll(async () => {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname))
    throw new Error("Refusing non-local database");
  const [u] = await db
    .insert(users)
    .values({ email: `kernel-${stamp}@test.local` })
    .returning({ id: users.id });
  userId = u!.id;
  const [o] = await db
    .insert(organizations)
    .values({ name: "Kernel Org", slug: `kernel-${stamp}`, status: "active" })
    .returning({ id: organizations.id });
  orgId = o!.id;
});

afterAll(async () => {
  await db.delete(agentEvents).where(eq(agentEvents.orgId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(users).where(eq(users.id, userId));
});

beforeEach(async () => {
  await db.delete(agentEvents).where(eq(agentEvents.orgId, orgId));
});

const emit = () =>
  emitAgentEvent({
    orgId,
    type: "requisition.status_changed",
    subjectType: "requisition",
    subjectId: SUBJECT,
    actorUserId: userId,
  });

describe("emitAgentEvent hooks", () => {
  test("inserts the row and calls registered handlers in registration order", async () => {
    const seen: string[] = [];
    const off1 = onAgentEvent((e) => {
      expect(e.orgId).toBe(orgId);
      expect(e.type).toBe("requisition.status_changed");
      expect(e.subjectId).toBe(SUBJECT);
      seen.push("first");
    });
    const off2 = onAgentEvent(() => seen.push("second"));
    try {
      await emit();
      expect(seen).toEqual(["first", "second"]);
      const [row] = await db.select().from(agentEvents).where(eq(agentEvents.orgId, orgId));
      expect(row!.type).toBe("requisition.status_changed");
      expect(row!.subjectType).toBe("requisition");
      expect(row!.subjectId).toBe(SUBJECT);
      expect(row!.actorUserId).toBe(userId);
    } finally {
      off1();
      off2();
    }
  });

  test("a handler that throws is swallowed: the emit still resolves and the row stays", async () => {
    const off = onAgentEvent(() => {
      throw new Error("handler exploded");
    });
    try {
      await emit();
      const [row] = await db.select().from(agentEvents).where(eq(agentEvents.orgId, orgId));
      expect(row!.id).toBeTruthy();
    } finally {
      off();
    }
  });

  test("an unsubscribed handler is not called", async () => {
    let calls = 0;
    const off = onAgentEvent(() => {
      calls++;
    });
    off();
    await emit();
    expect(calls).toBe(0);
  });

  test("an event emitted inside a run's scope attributes that run (same scope instance)", async () => {
    const [r] = await db
      .insert(agentRuns)
      .values({
        orgId,
        agentType: "requisition" as never,
        principalUserId: userId,
        goal: "t",
        subjectType: "requisition",
        subjectId: SUBJECT,
        status: "completed",
      } as never)
      .returning({ id: agentRuns.id });
    try {
      await agentRunScope.run({ runId: r!.id, orgId, agentType: "requisition" }, () => emit());
      const [row] = await db.select().from(agentEvents).where(eq(agentEvents.orgId, orgId));
      expect(row!.sourceRunId).toBe(r!.id);
    } finally {
      await db.delete(agentRuns).where(eq(agentRuns.id, r!.id));
    }
  });
});

describe("ports registries", () => {
  test("the agent port registers, reads back and can be replaced", () => {
    const port = {
      enqueue: async () => ({ runId: "r" }),
      cancelStale: async () => 0,
      afterSubjectsDeleted: async () => {},
      kick: () => {},
    };
    registerAgentPort(port);
    expect(agentPort()).toBe(port);
    registerAgentPort({ ...port, kick: () => {} });
    expect(agentPort()).not.toBe(port);
    expect(agentPort()?.kick).toBeInstanceOf(Function);
  });

  test("domain-event handlers are keyed by type and unsubscribe cleanly", () => {
    const seen: string[] = [];
    const off = onDomainEvent("stage.changed", () => {
      seen.push("stage");
    });
    onDomainEvent("requisition.closed", () => {
      seen.push("closed");
    });
    expect(domainEventHandlers("stage.changed").length).toBe(1);
    expect(domainEventHandlers("requisition.closed").length).toBe(1);
    expect(domainEventHandlers("nothing.changed").length).toBe(0);
    for (const h of domainEventHandlers("stage.changed")) h({ orgId, type: "stage.changed" });
    expect(seen).toEqual(["stage"]);
    off();
    expect(domainEventHandlers("stage.changed").length).toBe(0);
  });

  test("subject-deletion handlers register and unsubscribe", () => {
    let calls = 0;
    const off = onSubjectsDeleted(() => {
      calls++;
    });
    expect(subjectsDeletedHandlers().length).toBe(1);
    for (const h of subjectsDeletedHandlers()) h(orgId);
    expect(calls).toBe(1);
    off();
    expect(subjectsDeletedHandlers().length).toBe(0);
  });
});
