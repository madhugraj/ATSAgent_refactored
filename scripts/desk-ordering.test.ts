/**
 * Desk ordering (Phase 4 Gate 4, plan): the domain flows that post status
 * lines to a role's hiring thread keep their order. A scorecard chase posts
 * first, then a candidate's offer answer — both through the real flows
 * (sweepScorecards, respondToOffer), which since the Phase 4 extraction call
 * @ats/desk-core/server's conversation store directly, awaited, at the same
 * point in their flow as before it. The thread must read scorecard, then
 * offer status — message order is the record of what happened first.
 *
 * Run: DATABASE_URL=postgres://…/atsagent_test SESSION_SECRET=… bun test scripts/desk-ordering.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";

const { db } = await import("../apps/web/src/server/db");
const {
  applications,
  candidates,
  hiringConversations,
  hiringMessages,
  interviews,
  offers,
  organizations,
  requisitions,
  users,
} = await import("../apps/web/drizzle/schema");
const { sweepScorecards } = await import("../apps/web/src/lib/scorecard-chase.server");
const { respondToOffer } = await import("../apps/web/src/lib/offer-response.server");

const stamp = Date.now();
let orgId: string;
let userId: string;
let requisitionId: string;
let conversationId: string;
let token: string;

beforeAll(async () => {
  const url = process.env.DATABASE_URL ?? "";
  if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname))
    throw new Error("Refusing non-local database");
  userId = (
    await db
      .insert(users)
      .values({ email: `ordering-${stamp}@test.local` })
      .returning({ id: users.id })
  )[0]!.id;
  orgId = (
    await db
      .insert(organizations)
      .values({ name: "Ordering Org", slug: `ordering-${stamp}`, status: "active" })
      .returning({ id: organizations.id })
  )[0]!.id;
  requisitionId = (
    await db
      .insert(requisitions)
      .values({
        orgId,
        code: `REQ-ORD-${stamp}`,
        title: "QA Engineer",
        status: "approved",
        createdBy: userId,
      } as never)
      .returning({ id: requisitions.id })
  )[0]!.id;
  conversationId = (
    await db
      .insert(hiringConversations)
      .values({
        orgId,
        createdBy: userId,
        title: "QA Engineer",
        status: "active",
        requisitionId,
      })
      .returning({ id: hiringConversations.id })
  )[0]!.id;
  const [candidate] = await db
    .insert(candidates)
    .values({ orgId, fullName: "Asha Verma", email: `asha-${stamp}@x.local` })
    .returning({ id: candidates.id });
  const [application] = await db
    .insert(applications)
    .values({ orgId, requisitionId, candidateId: candidate!.id })
    .returning({ id: applications.id });
  // A round that ended two hours ago with its panelist still to score:
  // the sweep is at chase step 3 — the HR head's desk message.
  await db.insert(interviews).values({
    orgId,
    applicationId: application!.id,
    level: 3,
    status: "completed",
    interviewer: "Ravi Panelist",
    interviewerEmail: `panelist-${stamp}@test.local`,
    panel: [],
    scheduledAt: new Date(Date.now() - 3 * 3600_000),
    durationMins: 60,
  } as never);
  token = `tok-ordering-${stamp}`;
  await db.insert(offers).values({
    orgId,
    applicationId: application!.id,
    status: "released",
    responseToken: token,
    offeredCtc: "120000",
  } as never);
});

afterAll(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(users).where(eq(users.id, userId));
});

const thread = async () =>
  db
    .select({ role: hiringMessages.role, body: hiringMessages.body })
    .from(hiringMessages)
    .where(eq(hiringMessages.conversationId, conversationId))
    .orderBy(asc(hiringMessages.createdAt));

describe("desk message order (Gate 4)", () => {
  test("a scorecard chase, then an offer status, in that order on one thread", async () => {
    // 1. The scorecard chase sweep posts the missing-scorecard line to the desk.
    const chased = await sweepScorecards(orgId);
    expect(chased).toBe(1);
    const afterChase = await thread();
    expect(afterChase.length).toBe(1);
    expect(afterChase[0]!.body).toMatch(/scorecard .* (is )?due and missing|still missing/);

    // 2. The candidate accepts the released offer; the flow posts the status line.
    const answer = await respondToOffer(token, { action: "accept" });
    expect(answer).toMatchObject({ ok: true, status: "accepted" });
    const afterAnswer = await thread();
    expect(afterAnswer.length).toBe(2);
    expect(afterAnswer[1]!.body).toMatch(/accepted the offer/);

    // The record reads in the order things happened: scorecard first, offer second.
    expect(afterAnswer.map((m) => m.body)).toEqual([afterChase[0]!.body, afterAnswer[1]!.body]);
  });

  test("a second offer answer posts nothing (the offer was answered once)", async () => {
    const before = await thread();
    const again = await respondToOffer(token, { action: "decline", reason: "changed mind" });
    expect(again).toMatchObject({ ok: false });
    expect(await thread()).toEqual(before);
  });
});
