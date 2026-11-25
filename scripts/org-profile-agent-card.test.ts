/**
 * The organisation profile's agent-gate card (the app-level half of the old
 * scripts/org-profile.test.ts; the org cores themselves moved to
 * packages/org/test/org-profile.test.ts in Phase 4). Against the disposable
 * database, with the real agents runtime:
 *  - an agent's approval request (gate subject org_profile) is decided
 *    through resolveTask as the person, never by the agent;
 *  - a decision taken on the Profile page closes the waiting request;
 *  - the card states the changes and every candidate-visible line.
 *
 * Run: DATABASE_URL=postgres://…/atsagent_test SESSION_SECRET=… bun test scripts/org-profile-agent-card.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";

const { db } = await import("../apps/web/src/server/db");
const {
  agentRuns,
  agentTasks,
  orgMembers,
  orgProfileVersions,
  orgProfiles,
  organizations,
  userRoles,
  users,
} = await import("../apps/web/drizzle/schema");
const core = await import("../apps/web/src/lib/org-profile.server");
const runtime = await import("../apps/web/src/server/agents/runtime.server");

const stamp = Date.now();
let orgId: string;
let owner: string;
let hr: string;
let cbo: string;
let recruiter: string;
const as = (userId: string) => ({ orgId, userId });
const item = (
  text: string,
  visibility: "candidate" | "internal" = "candidate",
  id = crypto.randomUUID(),
) => ({ id, text, visibility, source: { kind: "person" as const } });

beforeAll(async () => {
  const url = process.env.DATABASE_URL ?? "";
  if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname))
    throw new Error("Refusing non-local database");
  const mk = async (tag: string) =>
    (
      await db
        .insert(users)
        .values({ email: `opcard-${tag}-${stamp}@test.local` })
        .returning({ id: users.id })
    )[0]!.id;
  [owner, hr, cbo, recruiter] = [
    await mk("owner"),
    await mk("hr"),
    await mk("cbo"),
    await mk("rec"),
  ];
  orgId = (
    await db
      .insert(organizations)
      .values({ name: "Profile Card Org", slug: `opcard-${stamp}`, status: "active" })
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
      email: `${u}@x.local`,
      status: "active",
      isOwner,
    } as never);
    if (role) await db.insert(userRoles).values({ userId: u, orgId, role });
  }
  // An approved profile, as the lifecycle tests leave behind (the next draft
  // copies its sections, so submissions pass the About gate).
  const [v] = await db
    .insert(orgProfileVersions)
    .values({
      orgId,
      version: 1,
      status: "approved",
      sections: {
        about: [
          {
            id: "card-about",
            text: "A bank for small businesses.",
            visibility: "candidate",
            source: { kind: "person" },
          },
        ],
        structure: [
          {
            id: "card-structure",
            text: "The instrumentation team reports to the director of engineering.",
            visibility: "internal",
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

const reload = async (id: string) =>
  (await db.select().from(orgProfileVersions).where(eq(orgProfileVersions.id, id)))[0]!;

/* ------------------------------------------------------- the approval card */

describe("an agent's request is decided by a person", () => {
  async function gate(versionId: string) {
    const [run] = await db
      .insert(agentRuns)
      .values({
        orgId,
        agentType: "copilot",
        principalUserId: hr,
        goal: "keep the profile current",
        status: "awaiting_human",
      } as never)
      .returning({ id: agentRuns.id });
    const [task] = await db
      .insert(agentTasks)
      .values({
        orgId,
        runId: run!.id,
        kind: "gate",
        title: "Organisation profile approval",
        assigneeRole: "hr_head",
        proposedAction: {
          toolCallId: "t1",
          name: "request_approval",
          args: { subject: { type: "org_profile", versionId, expects: "pending" } },
        },
      } as never)
      .returning({ id: agentTasks.id });
    return { runId: run!.id, taskId: task!.id };
  }

  test("sent back from the card: the person's words on the task and the version", async () => {
    const d = await core.startDraftCore(as(hr));
    await core.submitDraftCore(as(hr), { versionId: d.id });
    const { taskId, runId } = await gate(d.id);
    await expect(
      runtime.resolveTask({
        orgId,
        taskId,
        userId: recruiter,
        decision: { status: "approved" },
      }),
    ).rejects.toThrow();
    expect((await reload(d.id)).status).toBe("pending");
    await runtime.resolveTask({
      orgId,
      taskId,
      userId: hr,
      decision: { status: "rejected", reason: "Add the policies", changes: true },
    });
    const v = await reload(d.id);
    expect(v.status).toBe("changes_requested");
    expect(v.decisionNote).toBe("Add the policies");
    const [t] = await db.select().from(agentTasks).where(eq(agentTasks.id, taskId));
    expect(t!.status).toBe("rejected");
    expect(t!.response).toMatchObject({ reason: "Add the policies", changes: true });
    const [r] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId));
    expect(r!.status).toBe("queued");
  });

  test("approved on the Profile page: the waiting request closes", async () => {
    const open = (await core.profileState(orgId)).open!;
    await core.submitDraftCore(as(hr), { versionId: open.id });
    const { taskId } = await gate(open.id);
    await core.decideVersionCore(as(owner), { versionId: open.id, decision: "approve" });
    const [t] = await db.select().from(agentTasks).where(eq(agentTasks.id, taskId));
    expect(t!.status).toBe("approved");
  });

  test("the card states the changes and every candidate-visible line", () => {
    const text = runtime.orgProfileDetail(
      { about: [item("Old", "candidate", "a")] },
      {
        version: 3,
        injectionFlagged: true,
        sections: {
          about: [item("A bank for small businesses", "candidate", "a")],
          tone: [item("Warm and plain")],
        },
      },
    );
    expect(text).toContain("About: 1 changed");
    expect(text).toContain("Candidates may hear or read (1)");
    expect(text).toContain("A bank for small businesses");
    expect(text).not.toContain("Warm and plain");
    expect(text).toContain("looks like instructions");
  });
});
