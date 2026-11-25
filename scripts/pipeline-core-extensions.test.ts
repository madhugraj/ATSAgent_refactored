/**
 * Phase 5 acceptance tests for the pipeline-core extensions, written FIRST
 * (tests only — the cores gain the options in Phase 5's change PRs). Spec:
 * docs/refactor/evidence/stage-writers.md, "Phase 5 order suggestion".
 *
 * Every block below asserts PLANNED behaviour: the option it exercises is not
 * on today's core signatures, so each test is `test.skip(...)` with a COMPLETE
 * body — fixtures, assertions and cleanup — that loads today and becomes the
 * acceptance criteria when it is un-skipped.
 *
 * Un-skip protocol (one block per change PR, in this order):
 *  1. `cause` on moveStageCore                → interviews.functions.ts repoint
 *  2. ai principal + source: "ai"             → autoscore / matching repoint
 *  3. moveStagesCore bulk twin                → lifecycle.functions.ts repoint
 *  4. recordOfferStageCore offer_declined     → offer-response.server.ts repoint
 *  5. addApplicationsCore options             → collaboration / candidates repoint
 *
 *  - Flip ONLY the block your change PR implements: remove `.skip` from its
 *    tests, run `bun test scripts/pipeline-core-extensions.test.ts`, and commit
 *    the un-skipped block in the same PR as the core change. Un-skipping a
 *    block early never silently passes: it fails on the planned-behaviour
 *    assertion (blocks 1, 2, 5), on the bulkCore() guard message (block 3),
 *    or — block 4 — at the core's null-actor read, because the actor-less
 *    candidate variant IS that block's change.
 *  - Blocks are written against today's narrower signatures through typed
 *    aliases (withCause / asAi / skipReusable / asSourced / offerStageCore /
 *    bulkCore) so this file compiles and loads before the change lands; the
 *    alias for a block is deleted when the block is un-skipped.
 *  - When a writer is repointed, remove its KNOWN_STAGE_WRITERS entry in
 *    scripts/pipeline.test.ts in the same PR (stage-writers.md preamble).
 *
 * Runs against a disposable local database (see db URL check below); cleans up
 * every row it created via org/user cascade deletes in afterAll.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Stage } from "../apps/web/src/lib/lifecycle";
import type { LifecycleActor } from "../apps/web/src/lib/requisitions.server";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

beforeAll(async () => {
  const url = process.env.DATABASE_URL ?? "";
  if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname)) {
    throw new Error("Refusing to run against a non-local database host");
  }
});

// ---------------------------------------------------------------------------
// Shared fixtures (modelled on scripts/pipeline.test.ts)
// ---------------------------------------------------------------------------

const { db } = await import("../apps/web/src/server/db");
const schema = await import("../apps/web/drizzle/schema");
const {
  agentEvents,
  applications,
  candidates,
  emailOutbox,
  offers,
  orgMembers,
  organizations,
  requisitions,
  stageEvents,
  trainingFeedback,
  trainingSettings,
  userRoles,
  users,
} = schema;
const pipeline = await import("../apps/web/src/lib/pipeline.server");
const { moveStageCore, addApplicationsCore, recordOfferStageCore } = pipeline;
const { resetCaptureCache } = await import("../apps/web/src/server/training/capture.server");

/**
 * Planned shapes the change PRs land. The aliases below keep every call site
 * loadable against today's narrower signatures.
 */
type MoveStagesCore = (
  actor: LifecycleActor,
  input: {
    applicationIds: string[];
    toStage: Stage;
    reason?: string | null;
    note?: string | null;
  },
) => Promise<{ moved: number; blocked: number }>;

type OfferStageCore = (
  actor: LifecycleActor | null,
  input: {
    applicationId: string;
    toStage: "offer_pending" | "offer_released" | "offer_accepted" | "offer_declined";
    reason?: string | null;
  },
) => Promise<{ from: Stage; to: Stage; unchanged: boolean } | null>;

/** recordOfferStageCore with the candidate variant (null actor) and offer_declined. */
const offerStageCore = recordOfferStageCore as unknown as OfferStageCore;

/** Not exported yet — read off the namespace so the file loads before block 3 lands. */
const moveStagesCore =
  (pipeline as unknown as { moveStagesCore?: MoveStagesCore }).moveStagesCore ?? null;
const bulkCore = (): MoveStagesCore => {
  if (!moveStagesCore) {
    throw new Error(
      "moveStagesCore is not exported by pipeline.server.ts yet — land its change PR before un-skipping this block",
    );
  }
  return moveStagesCore;
};

/** Planned option bags: spreads bypass today's excess-property checks; each is deleted with its block. */
const withCause = { cause: "interview_scheduled" } as const;
const asAi = { source: "ai" } as const;
const skipReusable = { skipReusable: true } as const;
const asSourced = { entryStage: "sourced" } as const;

let orgId: string;
let reqId: string;
let owner: string;
let recruiter: string;
let hrHead: string;
let seq = 0;
/** Orgs created inside a test (the cross-org fixture); deleted before the main org. */
const extraOrgIds: string[] = [];

async function seedUser(email: string, role?: string) {
  const [u] = await db.insert(users).values({ email }).returning({ id: users.id });
  await db.insert(orgMembers).values({
    orgId,
    userId: u!.id,
    email,
    fullName: email.split("@")[0],
    status: "active",
    isOwner: role === "owner",
    joinedAt: new Date(),
  });
  if (role && role !== "owner") {
    await db.insert(userRoles).values({ userId: u!.id, orgId, role: role as never });
  }
  return u!.id;
}

/** One candidate + application per call, each with a unique contact email. */
async function application(stage: string, email?: string | null) {
  const n = ++seq;
  const [c] = await db
    .insert(candidates)
    .values({
      orgId,
      fullName: `Candidate ${n}`,
      // An empty string is the real "no email" shape (the column is not null).
      email: email === null ? "" : (email ?? `cand-${n}-${stamp}@cand.local`),
    })
    .returning({ id: candidates.id });
  const [a] = await db
    .insert(applications)
    .values({ orgId, requisitionId: reqId, candidateId: c!.id, stage: stage as never })
    .returning({ id: applications.id });
  return { appId: a!.id, candidateId: c!.id };
}

/** A talent-pool candidate without an application, with explicit reuse terms. */
async function poolCandidate(poolUse: "pool" | "role_only", poolUseSource: string | null) {
  const n = ++seq;
  const [c] = await db
    .insert(candidates)
    .values({
      orgId,
      fullName: `Pool candidate ${n}`,
      email: `pool-${n}-${stamp}@cand.local`,
      poolUse,
      poolUseSource,
    })
    .returning({ id: candidates.id });
  return c!.id;
}

/** An extra requisition in this org (unique code), for scoped event assertions. */
async function requisition(title: string) {
  const [r] = await db
    .insert(requisitions)
    .values({ orgId, code: `P5-${stamp}-${++seq}`, title, status: "approved" })
    .returning({ id: requisitions.id });
  return r!.id;
}

const actorFor = (userId: string, email: string, via?: "agent"): LifecycleActor => ({
  orgId,
  userId,
  memberEmail: email,
  ...(via ? { via } : {}),
});

const stageEventsOf = (appId: string) =>
  db
    .select()
    .from(stageEvents)
    .where(eq(stageEvents.applicationId, appId))
    .orderBy(stageEvents.createdAt);

const stageEmailsOf = (appId: string) =>
  db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.orgId, orgId), eq(emailOutbox.applicationId, appId)));

const outcomeFeedbackOf = (appId: string) =>
  db
    .select()
    .from(trainingFeedback)
    .where(
      and(
        eq(trainingFeedback.orgId, orgId),
        eq(trainingFeedback.source, "outcome"),
        eq(trainingFeedback.applicationId, appId),
      ),
    );

const agentEventsFor = (requisitionId: string, type: string) =>
  db
    .select()
    .from(agentEvents)
    .where(
      and(
        eq(agentEvents.orgId, orgId),
        eq(agentEvents.type, type),
        eq(agentEvents.subjectId, requisitionId),
      ),
    );

const appStageOf = async (appId: string) => {
  const [app] = await db
    .select({ stage: applications.stage, stageReason: applications.stageReason })
    .from(applications)
    .where(eq(applications.id, appId));
  return app!;
};

beforeAll(async () => {
  const [o] = await db
    .insert(organizations)
    .values({ name: "P5 Core Extensions Org", slug: `p5-core-${stamp}`, status: "active" })
    .returning({ id: organizations.id });
  orgId = o!.id;
  const [r] = await db
    .insert(requisitions)
    .values({ orgId, code: `P5CORE-${stamp}`, title: "Pipeline Core Engineer", status: "approved" })
    .returning({ id: requisitions.id });
  reqId = r!.id;
  owner = await seedUser(`p5-owner-${stamp}@test.local`, "owner");
  recruiter = await seedUser(`p5-recruiter-${stamp}@test.local`, "recruiter");
  hrHead = await seedUser(`p5-hr-${stamp}@test.local`, "hr_head");
  // Outcome capture on, so the training-data hook is observable below.
  await db.insert(trainingSettings).values({ orgId, enabled: true, consentedBy: owner });
  resetCaptureCache(orgId);
});

afterAll(async () => {
  // The cross-org fixture's stray row references this org's (requisition,
  // candidate) pair — drop the extra orgs first, then the main org cascades
  // into applications, candidates, offers, stage_events, outbox, agent events
  // and training settings + feedback.
  for (const id of extraOrgIds.splice(0)) {
    await db.delete(organizations).where(eq(organizations.id, id));
  }
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(users).where(inArray(users.id, [owner, recruiter, hrHead]));
});

const ownerActor = (via?: "agent") => actorFor(owner, `p5-owner-${stamp}@test.local`, via);

// ---------------------------------------------------------------------------
// 1. moveStageCore accepts cause: "interview_scheduled" (order 1 — interviews)
// ---------------------------------------------------------------------------

describe("moveStageCore cause: interview_scheduled (order 1)", () => {
  test("an l-stage move with the cause writes the trail row, and no stage email or advanced agent event", async () => {
    // Assertions read agent_events on reqId — the requisition every fixture
    // application attaches to. Earlier tests emit no advanced events on it.
    const scheduled = await application("shortlisted");
    const res = await moveStageCore(ownerActor(), {
      applicationId: scheduled.appId,
      toStage: "l1",
      note: "Panel slot booked",
      ...withCause,
    });
    expect(res).toEqual({ from: "shortlisted", to: "l1", unchanged: false });
    expect((await appStageOf(scheduled.appId)).stage).toBe("l1");

    // The trail row IS written — with the cause recorded on it (the planned
    // extension persists the journal input's cause on the stage_events row).
    const events = await stageEventsOf(scheduled.appId);
    expect(events.length).toBe(1);
    expect(events[0]!.fromStage).toBe("shortlisted");
    expect(events[0]!.toStage).toBe("l1");
    expect(events[0]!.reason).toBe("Screening skipped: Panel slot booked");
    expect((events[0] as unknown as Record<string, unknown>).cause).toBe("interview_scheduled");

    // No stage email: the invite email covers the scheduling (§5).
    expect((await stageEmailsOf(scheduled.appId)).length).toBe(0);
    // No application.advanced agent event: booking a round is not a decision.
    expect((await agentEventsFor(reqId, "application.advanced")).length).toBe(0);

    // The cause is load-bearing: the same move without it emails and advances.
    const decided = await application("shortlisted");
    await moveStageCore(ownerActor(), {
      applicationId: decided.appId,
      toStage: "l1",
      note: "Strong panel feedback",
    });
    expect((await stageEmailsOf(decided.appId)).length).toBe(1);
    const advanced = await agentEventsFor(reqId, "application.advanced");
    expect(advanced.length).toBe(1);
    expect((advanced[0]!.payload as { applicationIds?: string[] }).applicationIds ?? []).toContain(
      decided.appId,
    );
  });

  test("every interview round accepts the cause and stays email-silent", async () => {
    for (const stage of ["l1", "l2", "l3"] as const) {
      const { appId } = await application("shortlisted");
      const res = await moveStageCore(ownerActor(), {
        applicationId: appId,
        toStage: stage,
        note: "Round scheduled",
        ...withCause,
      });
      expect(res.to).toBe(stage);
      // The trail row is written, the email is not.
      expect((await stageEventsOf(appId)).length).toBe(1);
      expect((await stageEmailsOf(appId)).length).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. AI principal + source: "ai" (order 2 — autoscore, matching)
// ---------------------------------------------------------------------------

describe("moveStageCore ai principal + source (order 2)", () => {
  // The autoscore and matching paths call the core with an ai/system principal
  // and source: "ai" (stage-writers.md §3-4): the journal actor is "ai", the
  // source rides into the journal so outcome capture records by: "ai", and the
  // HR-controlled assertRole gate is never reached on the ai path.
  const aiActor = (userId: string): LifecycleActor => ({ orgId, userId, memberEmail: "ai" });

  test("an ai move journals actor ai, and outcome capture records by ai", async () => {
    const screened = await application("applied");
    const res = await moveStageCore(aiActor(recruiter), {
      applicationId: screened.appId,
      toStage: "ai_screened",
      ...asAi,
    });
    expect(res).toEqual({ from: "applied", to: "ai_screened", unchanged: false });
    const [event] = await stageEventsOf(screened.appId);
    expect(event!.actor).toBe("ai");
    // AI transitions email only on shortlisted; ai_screened stays silent.
    expect((await stageEmailsOf(screened.appId)).length).toBe(0);

    // An AI-reached outcome is captured with by: "ai" — not "human" (§4:
    // without the source pass-through the training reward signal is corrupted).
    const rejected = await application("applied");
    await moveStageCore(aiActor(recruiter), {
      applicationId: rejected.appId,
      toStage: "rejected",
      reason: "Score below the shortlist band",
      ...asAi,
    });
    const [feedback] = await outcomeFeedbackOf(rejected.appId);
    expect(feedback!.label).toBe("rejected");
    expect((feedback!.original as { by?: string }).by).toBe("ai");
  });

  test("a non-HR ai principal may move into an HR-controlled target (assertRole is never reached)", async () => {
    // Today this throws: the recruiter fails the HR head/owner gate. The test
    // documents the planned behaviour — the ai path never hits assertRole (§3:
    // "the AI path must never hit assertRole").
    const { appId } = await application("applied");
    const res = await moveStageCore(aiActor(recruiter), {
      applicationId: appId,
      toStage: "offer_pending",
      ...asAi,
    });
    expect(res).toEqual({ from: "applied", to: "offer_pending", unchanged: false });
    expect((await appStageOf(appId)).stage).toBe("offer_pending");
    const [event] = await stageEventsOf(appId);
    expect(event!.actor).toBe("ai");
  });
});

// ---------------------------------------------------------------------------
// 3. moveStagesCore — the bulk twin (order 3 — lifecycle.functions.ts)
// ---------------------------------------------------------------------------

describe("moveStagesCore bulk twin (order 3)", () => {
  test("a mixed valid/invalid batch returns {moved, blocked} without throwing", async () => {
    const core = bulkCore();
    const ok = await application("shortlisted");
    const closed = await application("rejected"); // rejected → l1 is not an allowed transition
    const missing = crypto.randomUUID(); // not this org's row: counted neither way, never thrown
    const res = await core(ownerActor(), {
      applicationIds: [ok.appId, closed.appId, missing],
      toStage: "l1",
      note: "Batch panel",
    });
    expect(res).toEqual({ moved: 1, blocked: 1 });
    expect((await appStageOf(ok.appId)).stage).toBe("l1");
    expect((await appStageOf(closed.appId)).stage).toBe("rejected");
  });

  test("one batched journal write and one email enqueue per batch — not one per move", async () => {
    const core = bulkCore();
    const first = await application("shortlisted");
    const second = await application("shortlisted");
    const res = await core(ownerActor(), {
      applicationIds: [first.appId, second.appId],
      toStage: "l1",
      note: "Batch panel",
    });
    expect(res).toEqual({ moved: 2, blocked: 0 });

    // Exactly one stage_events row per moved application — a leftover direct
    // journal call would duplicate these (the outbox dedupe would NOT catch it, §7).
    const events = [...(await stageEventsOf(first.appId)), ...(await stageEventsOf(second.appId))];
    expect(events.length).toBe(2);
    expect(events.map((e) => e.applicationId).sort()).toEqual([first.appId, second.appId].sort());
    for (const e of events) {
      expect(e.fromStage).toBe("shortlisted");
      expect(e.toStage).toBe("l1");
    }

    // One stage_update email per moved application, keyed on the batch's own
    // journal rows (stage:<eventId>) — one enqueue for the batch, not N calls.
    const emails = [...(await stageEmailsOf(first.appId)), ...(await stageEmailsOf(second.appId))];
    expect(emails.length).toBe(2);
    expect(emails.map((e) => e.idempotencyKey).sort()).toEqual(
      events.map((e) => `stage:${e.id}`).sort(),
    );
  });

  test("stage_events.actor strings are preserved per move", async () => {
    const core = bulkCore();
    const human = await application("shortlisted");
    await core(actorFor(recruiter, `p5-recruiter-${stamp}@test.local`), {
      applicationIds: [human.appId],
      toStage: "l1",
      note: "Batch panel",
    });
    const [humanEvent] = await stageEventsOf(human.appId);
    expect(humanEvent!.actor).toBe(`p5-recruiter-${stamp}@test.local`);

    const via = await application("shortlisted");
    await core(actorFor(owner, `p5-owner-${stamp}@test.local`, "agent"), {
      applicationIds: [via.appId],
      toStage: "l1",
      note: "Batch panel",
    });
    const [viaEvent] = await stageEventsOf(via.appId);
    expect(viaEvent!.actor).toBe(`p5-owner-${stamp}@test.local (via agent)`);
  });

  test("the core batches the journal, never enqueues directly, and stays out of step-up", async () => {
    const core = bulkCore();
    expect(core).toBeTruthy();
    const source = readFileSync(
      join(import.meta.dir, "..", "apps/web/src/lib/pipeline.server.ts"),
      "utf8",
    );
    // One batched recordStageTransitions call for the whole batch (§7) — the
    // singular per-move call in moveStageCore does not match this name.
    expect(source.match(/recordStageTransitions\(/g)?.length ?? 0).toBe(1);
    // Email goes through the journal choke point; the core never enqueues.
    expect(source).not.toContain("enqueueStageUpdates");
    // The step-up on bulk reject stays in the server-fn layer (§7).
    expect(source).not.toContain("assertStepUp");
  });
});

// ---------------------------------------------------------------------------
// 4. recordOfferStageCore — offer_declined (order 4 — offer-response.server.ts)
// ---------------------------------------------------------------------------

describe("recordOfferStageCore offer_declined (order 4)", () => {
  /** An offer row on the application, released so the private link is live. */
  async function releasedOffer(appId: string) {
    const [o] = await db
      .insert(offers)
      .values({ orgId, applicationId: appId, status: "released" })
      .returning({ id: offers.id, orgId: offers.orgId });
    return o!;
  }

  test.skip("the candidate variant records offer_declined with the offer row's org and the decline reason", async () => {
    const { appId } = await application("offer_released");
    const offer = await releasedOffer(appId);
    // The candidate answers through the private link: no actor at all — the
    // core takes orgId from the OFFER row (§6), not from a member.
    const res = await offerStageCore(null, {
      applicationId: appId,
      toStage: "offer_declined",
      reason: "Accepted a counter offer",
    });
    expect(res).toEqual({ from: "offer_released", to: "offer_declined", unchanged: false });
    const app = await appStageOf(appId);
    expect(app.stage).toBe("offer_declined");
    expect(app.stageReason).toBe("Accepted a counter offer");
    const [event] = await stageEventsOf(appId);
    expect(event!.actor).toBe("candidate");
    expect(event!.toStage).toBe("offer_declined");
    expect(event!.reason).toBe("Accepted a counter offer");
    // orgId came from the offer row, not from an actor.
    expect(event!.orgId).toBe(offer.orgId);
  });

  test.skip("a double call journals once — the once-only claim stays ahead of the stage write", async () => {
    // respondToOffer claims the answer in the offer update itself (where
    // status = "released") BEFORE calling the core, so a double click reaches
    // the stage write at most once (§6). The core's same-stage guard is the
    // backstop: a repeated call can never add a second trail row or a second
    // outcome capture (offer_declined is an OUTCOME stage).
    const { appId } = await application("offer_released");
    await releasedOffer(appId);
    const decline = {
      applicationId: appId,
      toStage: "offer_declined" as const,
      reason: "Moving with another offer",
    };
    const first = await offerStageCore(null, decline);
    expect(first).toEqual({ from: "offer_released", to: "offer_declined", unchanged: false });
    const second = await offerStageCore(null, decline);
    expect(second).toEqual({ from: "offer_declined", to: "offer_declined", unchanged: true });
    expect((await stageEventsOf(appId)).length).toBe(1);
    const feedback = await outcomeFeedbackOf(appId);
    expect(feedback.length).toBe(1);
    expect(feedback[0]!.label).toBe("offer_declined");
  });
});

// ---------------------------------------------------------------------------
// 5. addApplicationsCore options (order 5 — collaboration, candidates)
// ---------------------------------------------------------------------------

describe("addApplicationsCore options (order 5)", () => {
  test.skip("skipReusable: a fresh role_only portal CV may attach to its own originating requisition", async () => {
    const candidate = await poolCandidate("role_only", "naukri");

    // Without the option the reuse-terms guard refuses the attach (§9: today's
    // unconditional assertReusable).
    await expect(
      addApplicationsCore(ownerActor(), {
        requisitionId: reqId,
        candidateIds: [candidate],
        source: "naukri",
      }),
    ).rejects.toThrow(/limit the CV to the role/);

    // With it, the portal CV lands back on the role it came in for.
    const res = await addApplicationsCore(ownerActor(), {
      requisitionId: reqId,
      candidateIds: [candidate],
      source: "naukri",
      ...skipReusable,
    });
    expect(res).toEqual({ added: 1, skipped: [] });
    const [app] = await db
      .select({ id: applications.id, stage: applications.stage, source: applications.source })
      .from(applications)
      .where(and(eq(applications.candidateId, candidate), eq(applications.requisitionId, reqId)));
    expect(app).toBeTruthy();
    expect(app!.stage).toBe("applied"); // no entryStage given: the DB default stands
  });

  test.skip("entryStage: sourced matches createCandidate; the default keeps the applied DB default", async () => {
    const plain = await poolCandidate("pool", null);
    const res = await addApplicationsCore(ownerActor(), {
      requisitionId: reqId,
      candidateIds: [plain],
      source: "talent_pool",
    });
    expect(res.added).toBe(1);
    const [plainApp] = await db
      .select({ stage: applications.stage })
      .from(applications)
      .where(and(eq(applications.candidateId, plain), eq(applications.requisitionId, reqId)));
    expect(plainApp!.stage).toBe("applied"); // the DB default the core owns (§1)

    const sourced = await poolCandidate("pool", null);
    const sourcedRes = await addApplicationsCore(ownerActor(), {
      requisitionId: reqId,
      candidateIds: [sourced],
      source: "internal_referral",
      ...asSourced,
    });
    expect(sourcedRes.added).toBe(1);
    const [sourcedApp] = await db
      .select({ stage: applications.stage })
      .from(applications)
      .where(and(eq(applications.candidateId, sourced), eq(applications.requisitionId, reqId)));
    expect(sourcedApp!.stage).toBe("sourced"); // createCandidate parity (§9)
  });

  test.skip("a second org's application for the same (candidate, requisition) pair does not suppress the insert", async () => {
    // Phase-2 review acceptance criterion (stage-writers.md §8): the
    // referral-accept existence check is org-scoped. Another org's row for the
    // same (candidateId, requisitionId) pair must not make the core report the
    // candidate as already in this requisition's pipeline — today the
    // unscoped pre-check in respondReferral does exactly that. (The physical
    // second row is absorbed by the (requisition, candidate) unique index;
    // what the criterion pins is the check's scoping — what the caller is told.)
    const [otherOrg] = await db
      .insert(organizations)
      .values({ name: "P5 Other Org", slug: `p5-other-${stamp}`, status: "active" })
      .returning({ id: organizations.id });
    extraOrgIds.push(otherOrg!.id);
    const stray = await poolCandidate("pool", null);
    // The stray cross-org row: another org's application for this org's pair.
    await db.insert(applications).values({
      orgId: otherOrg!.id,
      candidateId: stray,
      requisitionId: reqId,
      source: "direct",
    });

    const res = await addApplicationsCore(ownerActor(), {
      requisitionId: reqId,
      candidateIds: [stray],
      source: "talent_pool",
    });
    expect(res).toEqual({ added: 1, skipped: [] });

    // The scoping is two-sided: this org's own duplicate still skips.
    const own = await application("applied");
    const dup = await addApplicationsCore(ownerActor(), {
      requisitionId: reqId,
      candidateIds: [own.candidateId],
      source: "talent_pool",
    });
    expect(dup.added).toBe(0);
    expect(dup.skipped.length).toBe(1);
    expect(dup.skipped[0]!.candidateId).toBe(own.candidateId);
    expect(dup.skipped[0]!.reason).toBe("Already in this requisition's pipeline");
  });
});
