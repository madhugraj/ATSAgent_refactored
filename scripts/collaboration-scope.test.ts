/**
 * respondReferral's duplicate-pair existence check is org-scoped (Phase 4
 * acceptance criterion). Structural: the helper's built query carries the
 * org_id predicate with the referral's org (drizzle .toSQL()). Behavioural
 * (no DDL — the schema's pair unique index makes cross-org duplicates
 * unreachable through real data, so they are not forced): same-org
 * duplicates suppress the insert; a referral for another org's user is
 * refused. The RPC-level cases run through the shared server-fn harness
 * (scripts/helpers/server-fn-harness.ts — mirrors @tanstack/react-start
 * 1.169.4; its self-test guards the internals).
 *
 * Run: DATABASE_URL=postgres://…/atsagent_test SESSION_SECRET=… bun test scripts/collaboration-scope.test.ts
 */
import { and, eq } from "drizzle-orm";

const { db } = await import("../apps/web/src/server/db");
const { applications, candidateReferrals, candidates, organizations, requisitions, users } =
  await import("../apps/web/drizzle/schema");
const { createSession, SESSION_COOKIE } = await import("../apps/web/src/server/identity");
const harness = await import("./helpers/server-fn-harness");

const stamp = Date.now();
const domain = `cscope${stamp}.test`;
let orgAId: string;
let orgBId: string;
let recipientId: string;
let referrerId: string;
let candidateOneId: string;
let requisitionId: string;
let referralOneId: string;
const { module: collaboration, cleanup } = await harness.createExecutableServerFn(
  new URL("../apps/web/src/lib/collaboration.functions.ts", import.meta.url),
);
const respondReferral = collaboration.respondReferral as {
  __executeServer: (opts: { data: unknown; context?: unknown }) => Promise<{
    result?: unknown;
    error?: unknown;
  }>;
};

async function respondAs(token: string, referralId: string, accept: boolean) {
  return harness.executeAsUser(respondReferral as never, `${SESSION_COOKIE}=${token}`, {
    referralId,
    accept,
  });
}

async function acceptReferralRaw(token: string, referralId: string, accept: boolean) {
  // Same as respondAs, but surfaces middleware failures as values (for the
  // refusal assertions — the wrapper throws the error).
  try {
    return { ok: true, result: await respondAs(token, referralId, accept) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

beforeAll(async () => {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname))
    throw new Error("Refusing non-local database");

  orgAId = (
    await db
      .insert(organizations)
      .values({ name: "Scope Org A", slug: `cscope-a-${stamp}`, status: "active" })
      .returning({ id: organizations.id })
  )[0]!.id;
  orgBId = (
    await db
      .insert(organizations)
      .values({ name: "Scope Org B", slug: `cscope-b-${stamp}`, status: "active" })
      .returning({ id: organizations.id })
  )[0]!.id;
  recipientId = (
    await db
      .insert(users)
      .values({ email: `rec-${domain}` })
      .returning({ id: users.id })
  )[0]!.id;
  referrerId = (
    await db
      .insert(users)
      .values({ email: `ref-${domain}` })
      .returning({ id: users.id })
  )[0]!.id;
  candidateOneId = (
    await db
      .insert(candidates)
      .values({ orgId: orgAId, fullName: "Scope Candidate", email: `cand-${domain}` })
      .returning({ id: candidates.id })
  )[0]!.id;
  requisitionId = (
    await db
      .insert(requisitions)
      .values({
        orgId: orgAId,
        code: `REQ-CS-${stamp}`,
        title: "Head of AI",
        status: "approved",
        createdBy: referrerId,
      })
      .returning({ id: requisitions.id })
  )[0]!.id;
});

afterAll(async () => {
  await cleanup();
  if (referralOneId)
    await db.delete(candidateReferrals).where(eq(candidateReferrals.id, referralOneId));
  if (candidateOneId) await db.delete(candidates).where(eq(candidates.id, candidateOneId));
  for (const id of [orgAId, orgBId])
    if (id) await db.delete(organizations).where(eq(organizations.id, id));
  if (recipientId) await db.delete(users).where(eq(users.id, recipientId));
  if (referrerId) await db.delete(users).where(eq(users.id, referrerId));
});

describe("respondReferral duplicate-pair existence check is org-scoped", () => {
  test("structural: the built query carries the org_id predicate with the referral's org", async () => {
    const { findExistingApplicationForPair } =
      await import("../apps/web/src/lib/collaboration.server");
    const q = findExistingApplicationForPair(orgAId, candidateOneId, requisitionId);
    const sql = q.toSQL();
    expect(sql.sql).toContain("org_id");
    expect(sql.sql).toContain("candidate_id");
    expect(sql.sql).toContain("requisition_id");
    // The org filter is a parameter, not a literal — org A's id is bound.
    expect(sql.params).toContain(orgAId);
  });

  test("behavioural: another org's user is refused — only the recipient responds", async () => {
    // A referral in org A is targeted at org A's recruiter (toUser). A user
    // from org B attempting to accept it must be refused by the existing
    // recipient/org checks, and the referral stays pending.
    const other = (
      await db
        .insert(users)
        .values({ email: `other-${domain}` })
        .returning({ id: users.id })
    )[0]!.id;
    const otherToken = await createSession(other);
    const referralTwoId = (
      await db
        .insert(candidateReferrals)
        .values({
          orgId: orgAId,
          candidateId: candidateOneId,
          fromUser: referrerId,
          toUser: recipientId,
          status: "pending",
          note: "Gate 4 recipient test",
        })
        .returning({ id: candidateReferrals.id })
    )[0]!.id;
    const out = await acceptReferralRaw(otherToken, referralTwoId, true);
    expect(out.ok).toBe(false);
    expect((out as { error: string }).error).toBe("Only the recruiter it was sent to can respond.");
    const [ref] = await db
      .select({ status: candidateReferrals.status })
      .from(candidateReferrals)
      .where(eq(candidateReferrals.id, referralTwoId));
    expect(ref!.status).toBe("pending");
    await db.delete(candidateReferrals).where(eq(candidateReferrals.id, referralTwoId));
    await db.delete(users).where(eq(users.id, other));
  });

  test("a role_only portal CV referred into another role is refused pre-flip", async () => {
    // Portal terms limit a role_only CV to the role it was captured for.
    // The reusability assertion runs BEFORE the ownership transfer and the
    // referral status flip, so nothing is written and the referral stays
    // pending for a different outcome.
    await db
      .update(candidates)
      .set({ poolUse: "role_only", poolUseSource: "portal" })
      .where(eq(candidates.id, candidateOneId));
    const referralRoleOnlyId = (
      await db
        .insert(candidateReferrals)
        .values({
          orgId: orgAId,
          candidateId: candidateOneId,
          requisitionId: requisitionId,
          fromUser: referrerId,
          toUser: recipientId,
          status: "pending",
          note: "Gate 4 role_only test",
        })
        .returning({ id: candidateReferrals.id })
    )[0]!.id;
    // The accepting user IS the referral's recipient — the refusal comes
    // from the reusability assertion, not the recipient check.
    const sessionToken = await createSession(recipientId);
    await expect(respondAs(sessionToken, referralRoleOnlyId, true)).rejects.toThrow(
      /whose terms limit the CV to the role it was for/,
    );
    const [ref] = await db
      .select({ status: candidateReferrals.status })
      .from(candidateReferrals)
      .where(eq(candidateReferrals.id, referralRoleOnlyId));
    expect(ref!.status).toBe("pending"); // nothing changed
    const apps = await db
      .select({ id: applications.id, requisitionId: applications.requisitionId })
      .from(applications)
      .where(and(eq(applications.orgId, orgAId), eq(applications.candidateId, candidateOneId)));
    expect(apps.some((a) => a.requisitionId === requisitionId)).toBe(false); // no attach
    await db.delete(candidateReferrals).where(eq(candidateReferrals.id, referralRoleOnlyId));
  });
});

describe("same-org duplicate suppression (behavioural, via the shared harness)", () => {
  test("an existing same-org pair suppresses the insert; the referral is accepted", async () => {
    referralOneId = (
      await db
        .insert(candidateReferrals)
        .values({
          orgId: orgAId,
          candidateId: candidateOneId,
          fromUser: referrerId,
          toUser: recipientId,
          status: "pending",
          note: "Gate 4 scope test",
        })
        .returning({ id: candidateReferrals.id })
    )[0]!.id;
    // A same-org application already exists for the pair.
    await db.insert(applications).values({
      orgId: orgAId,
      candidateId: candidateOneId,
      requisitionId,
      stage: "sourced",
      source: "internal_referral",
    });
    const before = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.orgId, orgAId), eq(applications.candidateId, candidateOneId)));

    const sessionToken = await createSession(recipientId);
    const out = await respondAs(sessionToken, referralOneId, true);
    expect((out as { ok: boolean }).ok).toBe(true);

    const after = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.orgId, orgAId), eq(applications.candidateId, candidateOneId)));
    expect(after.length).toBe(before.length);
    const [ref] = await db
      .select({ status: candidateReferrals.status })
      .from(candidateReferrals)
      .where(eq(candidateReferrals.id, referralOneId));
    expect(ref!.status).toBe("accepted");
  });
});
