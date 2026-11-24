/**
 * The org-context agent-run halves of the old scripts/org-context.test.ts
 * (the org cores themselves moved to packages/org/test/org-context.test.ts
 * in Phase 4). Against the disposable database, with the real agents runtime
 * and desk wiring:
 *  - a consuming agent's run is stamped with the profile version it read;
 *    the writer's run is not;
 *  - the monthly re-read sweep dispatches only what is due;
 *  - deleting the profile stops the agent's runs, hides its thread and
 *    starts the chat fresh (through the kernel-port wiring boot/the shim
 *    register);
 *  - the org chat asks about empty sections first, then thin ones.
 *
 * Run: DATABASE_URL=postgres://…/atsagent_test SESSION_SECRET=… bun test scripts/org-context-agent-runs.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, isNull } from "drizzle-orm";

process.env["SECRET_ENCRYPTION_KEY"] ??= Buffer.alloc(32, 7).toString("base64");

const { db } = await import("../apps/web/src/server/db");
const {
  agentPolicies,
  agentRuns,
  auditLog,
  hiringConversations,
  hrmsEmployees,
  orgContextSources,
  orgMembers,
  orgProfileVersions,
  orgProfiles,
  organizations,
  sourceIntegrations,
  userRoles,
  users,
} = await import("../apps/web/drizzle/schema");
const core = await import("../apps/web/src/lib/org-profile.server");

const stamp = Date.now();
let orgId: string;
let owner: string;
let hr: string;
let cbo: string;
let recruiter: string;
const as = (userId: string) => ({ orgId, userId });

beforeAll(async () => {
  const url = process.env.DATABASE_URL ?? "";
  if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname))
    throw new Error("Refusing non-local database");
  const mk = async (tag: string, fullName: string | null = null) =>
    (
      await db
        .insert(users)
        .values({ email: `ocrun-${tag}-${stamp}@test.local`, fullName })
        .returning({ id: users.id })
    )[0]!.id;
  [owner, hr, cbo, recruiter] = [
    await mk("owner"),
    await mk("hr", "Priya Raman"),
    await mk("cbo"),
    await mk("rec"),
  ];
  orgId = (
    await db
      .insert(organizations)
      .values({
        name: "Context Run Org",
        slug: `ocrun-${stamp}`,
        status: "active",
        emailDomain: "acme-instruments.test",
      })
      .returning({ id: organizations.id })
  )[0]!.id;
  for (const [u, isOwner, role] of [
    [owner, true, null],
    [hr, false, "hr_head"],
    [cbo, false, "president_cbo"],
    [recruiter, false, "recruiter"],
  ] as const) {
    await db.insert(orgMembers).values({
      orgId,
      userId: u,
      email: `${u}@acme-instruments.test`,
      status: "active",
      isOwner,
    } as never);
    if (role) await db.insert(userRoles).values({ userId: u, orgId, role });
  }
  const [integ] = await db
    .insert(sourceIntegrations)
    .values({ orgId, provider: `hrms-ocrun-${stamp}`, label: "HRMS", category: "hrms" })
    .returning({ id: sourceIntegrations.id });
  await db.insert(hrmsEmployees).values({
    orgId,
    integrationId: integ!.id,
    externalId: "E1",
    fullName: "Arun Kumar",
    email: "arun.kumar@example.com",
  });
  // An approved profile, as the org-core tests leave behind: the run-stamping
  // and sweep tests read it.
  const [v] = await db
    .insert(orgProfileVersions)
    .values({
      orgId,
      version: 1,
      status: "approved",
      sections: {
        about: [
          {
            id: "run-about",
            text: "Acme builds inspection instruments for steel plants.",
            visibility: "candidate",
            source: { kind: "person" },
          },
        ],
      },
      decidedAt: new Date(),
    } as never)
    .returning({ id: orgProfileVersions.id });
  await db
    .insert(orgProfiles)
    .values({ orgId, currentVersionId: v!.id })
    .onConflictDoUpdate({ target: orgProfiles.orgId, set: { currentVersionId: v!.id } });
});

afterAll(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
  for (const u of [owner, hr, cbo, recruiter]) await db.delete(users).where(eq(users.id, u));
});

/* ------------------------------------------------------------- consumers */

test("a consuming agent's run is stamped with the version it read; the writer's is not", async () => {
  const { ensureAgentsRegistered } = await import("../apps/web/src/server/agents");
  const runtime = await import("../apps/web/src/server/agents/runtime.server");
  ensureAgentsRegistered();
  await db.insert(agentPolicies).values([
    { orgId, agentType: "jd", enabled: true },
    { orgId, agentType: "org_context", enabled: true },
  ] as never);
  const versionId = (await core.profileState(orgId)).approved!.id;
  const { runId: consumer } = await runtime.startRun({
    orgId,
    agentType: "jd",
    principalUserId: hr,
    goal: "t",
  });
  const { runId: writer } = await runtime.startRun({
    orgId,
    agentType: "org_context",
    principalUserId: hr,
    goal: "t",
  });
  // One tick: the system prompt is assembled (stamping a consumer) before
  // the model call, which fails here without a key — the stamp stays.
  await runtime.runAgentTick({ orgId, max: 4 });
  const rows = await db
    .select({ id: agentRuns.id, stamped: agentRuns.orgProfileVersionId })
    .from(agentRuns)
    .where(inArray(agentRuns.id, [consumer, writer]));
  const byId = new Map(rows.map((r) => [r.id, r.stamped]));
  expect(byId.get(consumer)).toBe(versionId);
  expect(byId.get(writer)).toBeNull();
});

/* ---------------------------------------------------------------- sweep */

describe("monthly re-read sweep", () => {
  test("a due organisation starts one run and books the next month; a not-due one starts none", async () => {
    const orchestrator = await import("../apps/web/src/server/agents/orchestrator.server");
    await db
      .insert(agentPolicies)
      .values({ orgId, agentType: "org_context", enabled: true })
      .onConflictDoNothing();
    const state = await core.profileState(orgId);
    const versionId = state.approved!.id;
    await db
      .update(orgProfiles)
      .set({ websiteUrl: "https://www.acme-instruments.test/", nextRereadAt: null })
      .where(eq(orgProfiles.orgId, orgId));
    await db.delete(agentRuns).where(eq(agentRuns.orgId, orgId));
    await orchestrator.scheduleSweeps({ orgId });
    const started = await db
      .select({ goal: agentRuns.goal, type: agentRuns.agentType })
      .from(agentRuns)
      .where(and(eq(agentRuns.orgId, orgId), eq(agentRuns.agentType, "org_context")));
    expect(started.length).toBe(1);
    expect(started[0]!.goal).toContain("Monthly website re-read");
    const [p] = await db
      .select({ next: orgProfiles.nextRereadAt })
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, orgId));
    expect(p!.next!.getTime()).toBeGreaterThan(Date.now() + 29 * 864e5);
    void versionId;
    await db.delete(agentRuns).where(eq(agentRuns.orgId, orgId));
    await orchestrator.scheduleSweeps({ orgId });
    const after = await db
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(and(eq(agentRuns.orgId, orgId), eq(agentRuns.agentType, "org_context")));
    expect(after).toHaveLength(0);
  });
});

/* ----------------------------------------------------- deleting the profile */

describe("deleting the profile", () => {
  test("HR head or owner only, reason required, every version gone", async () => {
    // Seed an approved version so there is something real to delete.
    const [v] = await db
      .insert(orgProfileVersions)
      .values({
        orgId,
        version: 90,
        status: "approved",
        sections: {
          about: [
            {
              id: "del",
              text: "Soon to be deleted.",
              visibility: "candidate",
              source: { kind: "person" },
            },
          ],
        },
        decidedAt: new Date(),
      } as never)
      .returning({ id: orgProfileVersions.id });
    await db
      .insert(orgProfiles)
      .values({ orgId, currentVersionId: v!.id, requireProfile: true })
      .onConflictDoUpdate({
        target: orgProfiles.orgId,
        set: { currentVersionId: v!.id, requireProfile: true },
      });

    await expect(
      core.resetProfileCore(as(recruiter), { reason: "recruiters cannot delete" }),
    ).rejects.toThrow(/HR head/);
    await expect(core.resetProfileCore(as(hr), { reason: "no" })).rejects.toThrow(/why/);

    // An old chat thread with a message: the reset must clear it too.
    const oldThread = (
      await db
        .insert(hiringConversations)
        .values({ orgId, createdBy: hr, kind: "org_profile" })
        .returning({ id: hiringConversations.id })
    )[0]!.id;

    const res = await core.resetProfileCore(as(hr), { reason: "Starting over with new material." });
    expect(res.versions).toBeGreaterThanOrEqual(1);
    const after = await core.profileState(orgId);
    expect(after.approved).toBeNull();
    expect(after.open).toBeNull();
    expect(after.requireProfile).toBe(false);
    // A clean slate: the saved website and its read pages are gone too.
    const [p] = await db
      .select({ websiteUrl: orgProfiles.websiteUrl, lastRereadAt: orgProfiles.lastRereadAt })
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, orgId));
    expect(p?.websiteUrl ?? null).toBeNull();
    expect(p?.lastRereadAt ?? null).toBeNull();
    const liveSources = await db
      .select({ id: orgContextSources.id })
      .from(orgContextSources)
      .where(and(eq(orgContextSources.orgId, orgId), isNull(orgContextSources.deletedAt)));
    expect(liveSources).toHaveLength(0);
    expect(
      (
        await db
          .select({ a: auditLog.action })
          .from(auditLog)
          .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, "org_profile.reset")))
      ).length,
    ).toBeGreaterThan(0);

    // The chat starts fresh: a new thread, only the greeting in it.
    const { ensureAgentsRegistered } = await import("../apps/web/src/server/agents");
    ensureAgentsRegistered();
    const { ensureOrgThread } = await import("../apps/web/src/server/desk/org-desk.server");
    const fresh = await ensureOrgThread(orgId, hr);
    expect(fresh.id).not.toBe(oldThread);
    const [hidden] = await db
      .select({ deletedAt: hiringConversations.deletedAt })
      .from(hiringConversations)
      .where(eq(hiringConversations.id, oldThread));
    expect(hidden?.deletedAt).not.toBeNull(); // hidden with the rest of the reset
    await db.delete(hiringConversations).where(eq(hiringConversations.id, fresh.id));
    await db.delete(orgProfiles).where(eq(orgProfiles.orgId, orgId));
    await db.delete(orgProfileVersions).where(eq(orgProfileVersions.orgId, orgId));
  });
});

/* --------------------------------------------------------------- org chat */

test("the org chat asks about empty sections first, then thin ones", async () => {
  const { sectionsToAsk } = await import("../apps/web/src/server/desk/org-desk.server");
  const ask = sectionsToAsk({ about: 5, products: 1, customers: 0, domain: 4 });
  expect(ask[0]).toBe("customers");
  expect(ask).toContain("products");
  expect(ask).not.toContain("about");
  expect(ask).not.toContain("domain");
});
