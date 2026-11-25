/**
 * The erase cascade through the kernel `subjects.deleted` event (map §5,
 * change PR A). eraseCandidatesCore deletes the candidate first, then announces
 * the erasure with the candidate's names, and the boot-registered subscriber —
 * the agents runtime's stale-request sweep, app-side interim until Phase 7 —
 * cleans exactly what the pre-event direct call cleaned:
 *
 *  - a live run whose subject (the erased candidate's application) is gone is
 *    cancelled (status "cancelled", finished_at set, lease cleared) with an
 *    audit trail entry, and its open requests are closed with the sweep's
 *    reason;
 *  - a waiting run on a surviving subject is re-queued and its request is
 *    closed with the field-level stale reason ("the candidate's application it
 *    was about has been deleted");
 *  - a request whose proposed action names the erased candidate closes ("the
 *    candidate it was about has been deleted") even though its run carries on;
 *  - training_inference rows naming the candidate are gone (their candidate_id
 *    FK cascades with the candidate row); rows linked only through a run stay;
 *  - the event log keeps its rows and capture_events loses only the candidate
 *    link — the sweep never touched either, and this pins that unchanged;
 *  - candidates of other organisations, and this org's surviving candidate,
 *    are untouched with their runs and requests.
 *
 * The emit is observed through a subscriber spy: it fires with the erased
 * candidates' ids and full names, and by the time it runs the candidate rows
 * are already deleted — the announcement happens after the delete commits.
 *
 * Run: DATABASE_URL=… SESSION_SECRET=… bun test packages/candidates/test/
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";

process.env["AGENT_INLINE_KICK"] = "0";

// The composition root: registers the real subjects.deleted subscriber (the
// agents runtime's afterSubjectsDeleted) exactly as production does.
await import("../../../apps/web/src/boot.ts");

const {
  agentEvents,
  agentRuns,
  agentTasks,
  applications,
  auditLog,
  candidates,
  captureEvents,
  organizations,
  requisitions,
  trainingInferences,
  users,
} = await import("@ats/db/server");
const { db } = await import("@ats/db/server");
const { eraseCandidatesCore } = await import("@ats/candidates/server");
const { onSubjectsDeleted } = await import("@ats/kernel/server");

const stamp = Date.now();
let orgId: string;
let otherOrgId: string;
let principal: string;
let reqId: string;
let candA: string; // erased
let candB: string; // survives in the same org
let candC: string; // other org
let appA: string;
let appB: string;

/** Every subjects.deleted delivery the erase made, with the DB state at emit time. */
const deliveries: {
  orgId: string;
  subjects: { id: string; fullName: string }[];
  candidateRowsAtEmit: string[];
}[] = [];
const offSpy = onSubjectsDeleted(async (orgId, subjects) => {
  const rows = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(
      inArray(
        candidates.id,
        subjects.map((s) => s.id),
      ),
    );
  deliveries.push({ orgId, subjects, candidateRowsAtEmit: rows.map((r) => r.id) });
});

async function seedCandidate(org: string, fullName: string) {
  const [c] = await db
    .insert(candidates)
    .values({
      orgId: org,
      fullName,
      email: `${fullName.toLowerCase().replace(/\s/g, ".")}-${stamp}-${org.slice(0, 6)}@cand.local`,
    })
    .returning({ id: candidates.id });
  return c!.id;
}

async function seedApplication(candidateId: string) {
  const [a] = await db
    .insert(applications)
    .values({ orgId, requisitionId: reqId, candidateId, stage: "ai_screened", source: "apply" })
    .returning({ id: applications.id });
  return a!.id;
}

/** A run parked on a decision, with one open request. */
async function parked(
  goal: string,
  status: "queued" | "awaiting_human" | "failed",
  subject: { type: string; id: string },
  args: Record<string, unknown>,
) {
  const [run] = await db
    .insert(agentRuns)
    .values({
      orgId,
      agentType: "intake",
      status,
      principalUserId: principal,
      goal,
      subjectType: subject.type,
      subjectId: subject.id,
    })
    .returning({ id: agentRuns.id });
  const [task] = await db
    .insert(agentTasks)
    .values({
      orgId,
      runId: run!.id,
      kind: "approval",
      title: goal,
      proposedAction: { toolCallId: "x", name: "propose_rejections", args },
      assigneeUserId: principal,
    })
    .returning({ id: agentTasks.id });
  return { runId: run!.id, taskId: task!.id };
}

const runOf = async (runId: string) =>
  (await db.select().from(agentRuns).where(eq(agentRuns.id, runId)))[0]!;
const taskOf = async (taskId: string) =>
  (await db.select().from(agentTasks).where(eq(agentTasks.id, taskId)))[0]!;
const taskStatuses = async (org: string) =>
  new Map(
    (
      await db
        .select({ id: agentTasks.id, status: agentTasks.status, response: agentTasks.response })
        .from(agentTasks)
        .where(eq(agentTasks.orgId, org))
    ).map((t) => [t.id, t]),
  );

beforeAll(async () => {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname))
    throw new Error("Refusing non-local database");
  const [o] = await db
    .insert(organizations)
    .values({ name: "Erase Cascade Org", slug: `erase-cascade-${stamp}`, status: "active" })
    .returning({ id: organizations.id });
  orgId = o!.id;
  const [o2] = await db
    .insert(organizations)
    .values({ name: "Erase Other Org", slug: `erase-other-${stamp}`, status: "active" })
    .returning({ id: organizations.id });
  otherOrgId = o2!.id;
  const [u] = await db
    .insert(users)
    .values({ email: `erase-cascade-${stamp}@test.local` })
    .returning({ id: users.id });
  principal = u!.id;
  const [r] = await db
    .insert(requisitions)
    .values({
      orgId,
      code: `REQ-EC-${Math.random().toString(36).slice(2, 7)}`,
      title: "Platform SRE",
      status: "approved",
      createdBy: principal,
    })
    .returning({ id: requisitions.id });
  reqId = r!.id;
  candA = await seedCandidate(orgId, "Eve Erased");
  candB = await seedCandidate(orgId, "Sam Survives");
  candC = await seedCandidate(otherOrgId, "Omar Other");
  appA = await seedApplication(candA);
  appB = await seedApplication(candB);
});

afterAll(async () => {
  offSpy();
  await db.delete(auditLog).where(inArray(auditLog.orgId, [orgId, otherOrgId]));
  await db.delete(organizations).where(inArray(organizations.id, [orgId, otherOrgId]));
  await db.delete(users).where(eq(users.id, principal));
});

describe("eraseCandidatesCore → kernel subjects.deleted", () => {
  test(
    "the delete commits first; the emit names the candidates; the boot subscriber " +
      "cleans the runs, requests, capture links and training rows exactly as before",
    async () => {
      // Runs and requests around the doomed candidate …
      const waiting = await parked(
        "Waiting on Eve",
        "awaiting_human",
        {
          type: "requisition",
          id: reqId,
        },
        { applicationId: appA },
      );
      const doomed = await parked(
        "Working Eve's application",
        "queued",
        {
          type: "application",
          id: appA,
        },
        { requisitionId: reqId },
      );
      // An already-stopped run's open request is swept too, with the
      // run-stopped reason (same erase-triggered sweep, closeStaleTasks).
      const stopped = await parked(
        "Failed on Eve",
        "failed",
        {
          type: "requisition",
          id: reqId,
        },
        { requisitionId: reqId },
      );
      const namesEve = await parked(
        "Ask about Eve",
        "queued",
        {
          type: "candidate",
          id: candA,
        },
        { candidateId: candA },
      );
      // … and around the survivor.
      const surviving = await parked(
        "Working Sam's application",
        "queued",
        {
          type: "application",
          id: appB,
        },
        { applicationId: appB },
      );

      // Rows naming the candidate outside the runs: the append-only event log,
      // a capture row, and two training inferences (one by candidate, one by run).
      await db.insert(agentEvents).values([
        {
          orgId,
          type: "application.shortlisted",
          subjectType: "candidate",
          subjectId: candA,
          payload: { fullName: "Eve Erased" },
        },
        {
          orgId,
          type: "application.advanced",
          subjectType: "application",
          subjectId: appA,
          payload: {},
        },
      ]);
      const [capture] = await db
        .insert(captureEvents)
        .values({ orgId, kind: "cv_screen", candidateId: candA })
        .returning({ id: captureEvents.id });
      const [byCandidate] = await db
        .insert(trainingInferences)
        .values({
          orgId,
          callKind: "json",
          feature: "cv_parse",
          provider: "test",
          model: "test",
          request: { candidate: "Eve Erased" },
          status: "succeeded",
          requestHash: `erase-cascade-${stamp}-a`,
          candidateId: candA,
        })
        .returning({ id: trainingInferences.id });
      const [byRun] = await db
        .insert(trainingInferences)
        .values({
          orgId,
          callKind: "agent_step",
          feature: "screening",
          provider: "test",
          model: "test",
          request: { goal: "screen Eve" },
          status: "succeeded",
          requestHash: `erase-cascade-${stamp}-b`,
          agentRunId: doomed.runId,
        })
        .returning({ id: trainingInferences.id });

      const erased = await eraseCandidatesCore(orgId, [candA]);

      // The core returns exactly whom it erased, and the announcement carried
      // the same names — the erasure cascades by identity, not by re-query.
      expect(erased).toEqual([{ id: candA, fullName: "Eve Erased" }]);
      expect(deliveries).toEqual([
        { orgId, subjects: [{ id: candA, fullName: "Eve Erased" }], candidateRowsAtEmit: [] },
      ]);

      // The candidate and her application are gone; the survivors are intact.
      const candidateIds = new Set(
        (
          await db
            .select({ id: candidates.id })
            .from(candidates)
            .where(inArray(candidates.id, [candA, candB, candC]))
        ).map((r) => r.id),
      );
      expect(candidateIds.has(candA)).toBe(false);
      expect(candidateIds.has(candB)).toBe(true);
      expect(candidateIds.has(candC)).toBe(true);
      expect((await db.select().from(applications).where(eq(applications.id, appA))).length).toBe(
        0,
      );
      expect((await db.select().from(applications).where(eq(applications.id, appB))).length).toBe(
        1,
      );

      // Live run whose subject (her application) is gone: cancelled, lease
      // cleared, finished stamp, audit trail — the sweep's exact effect.
      const doomedRun = await runOf(doomed.runId);
      expect(doomedRun.status).toBe("cancelled");
      expect(doomedRun.finishedAt).not.toBeNull();
      expect(doomedRun.leaseUntil).toBeNull();
      const runCancelAudits = await db
        .select({ id: auditLog.id, detail: auditLog.detail })
        .from(auditLog)
        .where(
          and(eq(auditLog.action, "agent.run.cancelled"), eq(auditLog.entityId, doomed.runId)),
        );
      expect(
        runCancelAudits.filter(
          (a) => (a.detail as { reason?: string } | null)?.reason === "subject_deleted",
        ).length,
      ).toBe(1);

      // The waiting run on the surviving requisition carries on — re-queued.
      const waitingRun = await runOf(waiting.runId);
      expect(waitingRun.status).toBe("queued");
      expect(waitingRun.finishedAt).toBeNull();

      // Field-level request closures, one reason per shape:
      const statuses = await taskStatuses(orgId);
      expect(statuses.get(waiting.taskId)!.status).toBe("cancelled");
      expect((statuses.get(waiting.taskId)!.response as { reason: string }).reason).toContain(
        "the candidate's application it was about has been deleted",
      );
      expect(statuses.get(doomed.taskId)!.status).toBe("cancelled");
      // The run's own subject (her application) is what the run-stopped
      // request is about, so the sweep states the subject, not the stop.
      expect((statuses.get(doomed.taskId)!.response as { reason: string }).reason).toContain(
        "the candidate's application it was about has been deleted",
      );
      // A stopped run's leftover request is swept with the run-stopped reason.
      expect(statuses.get(stopped.taskId)!.status).toBe("cancelled");
      expect((statuses.get(stopped.taskId)!.response as { reason: string }).reason).toContain(
        "the agent working on it stopped with an error",
      );
      // A request naming only the candidate closes; its run carries on
      // (unchanged behaviour: the sweep's run cancellation matches record
      // subjects, not candidate subjects).
      expect(statuses.get(namesEve.taskId)!.status).toBe("cancelled");
      expect((statuses.get(namesEve.taskId)!.response as { reason: string }).reason).toContain(
        "the candidate it was about has been deleted",
      );
      expect((await runOf(namesEve.runId)).status).toBe("queued");
      // The survivor's request is untouched.
      expect(statuses.get(surviving.taskId)!.status).toBe("open");

      // Training data: the row naming the candidate is gone (its candidate_id
      // cascade went with her); the row tied to the cancelled run stays.
      const inferenceIds = (
        await db
          .select({ id: trainingInferences.id })
          .from(trainingInferences)
          .where(inArray(trainingInferences.id, [byCandidate!.id, byRun!.id]))
      ).map((r) => r.id);
      expect(inferenceIds).toEqual([byRun!.id]);
      expect((await runOf(doomed.runId)).id).toBe(doomed.runId); // its run row remains

      // Unchanged by the cascade, pinned: the append-only event log keeps its
      // rows and capture_events loses only the candidate link.
      const events = await db
        .select({ subjectType: agentEvents.subjectType, subjectId: agentEvents.subjectId })
        .from(agentEvents)
        .where(eq(agentEvents.orgId, orgId));
      expect(events.length).toBe(2);
      expect(await captureEventsLink(capture!.id)).toBeNull();
    },
  );

  test("nothing to erase: no announcement, nothing cleaned", async () => {
    const before = deliveries.length;
    const erased = await eraseCandidatesCore(orgId, [crypto.randomUUID()]);
    expect(erased).toEqual([]);
    expect(deliveries.length).toBe(before);
  });

  test("another org's candidate is not erased through this org's call", async () => {
    const before = deliveries.length;
    const erased = await eraseCandidatesCore(orgId, [candC]);
    expect(erased).toEqual([]);
    expect(deliveries.length).toBe(before);
    expect(
      (await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.id, candC)))
        .length,
    ).toBe(1);
  });
});

async function captureEventsLink(id: string): Promise<string | null> {
  const [row] = await db
    .select({ candidateId: captureEvents.candidateId })
    .from(captureEvents)
    .where(eq(captureEvents.id, id));
  return row?.candidateId ?? null;
}
