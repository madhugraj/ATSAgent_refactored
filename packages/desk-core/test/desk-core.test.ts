/**
 * Test for @ats/desk-core (map §4 L2): the conversation store extracted from
 * desk.server.ts. Against the disposable database:
 *  - two posted messages keep their insert order (awaited, one at a time);
 *  - loadConversation / conversationForRequisition / conversationForSubject
 *    resolve the right thread (org-scoped, closed chats excluded);
 *  - plainPreview keeps its documented output (ids and markdown out, cut at
 *    a word) and clipText keeps long text whole up to the limit;
 *  - notifyRequisitionThread lands its line on the requisition's thread with
 *    its card, after the messages already there — and posts nothing when no
 *    open thread exists.
 *
 * Run: DATABASE_URL=postgres://…/atsagent_test SESSION_SECRET=… bun test packages/desk-core/test/
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import {
  db,
  hiringConversations,
  hiringMessages,
  organizations,
  requisitions,
  users,
} from "@ats/db/server";
import {
  clipText,
  conversationForRequisition,
  conversationForSubject,
  loadConversation,
  notifyRequisitionThread,
  plainPreview,
  postMessage,
} from "@ats/desk-core/server";

const stamp = Date.now();
let orgId: string;
let userId: string;
let conversationId: string;
let requisitionId: string;

beforeAll(async () => {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname))
    throw new Error("Refusing non-local database");
  userId = (
    await db
      .insert(users)
      .values({ email: `deskcore-${stamp}@test.local` })
      .returning({ id: users.id })
  )[0]!.id;
  orgId = (
    await db
      .insert(organizations)
      .values({ name: "Desk Core Org", slug: `deskcore-${stamp}`, status: "active" })
      .returning({ id: organizations.id })
  )[0]!.id;
  requisitionId = (
    await db
      .insert(requisitions)
      .values({
        orgId,
        code: `REQ-DC-${stamp}`,
        title: "Data Analyst",
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
        title: "Data Analyst",
        status: "active",
        requisitionId,
      })
      .returning({ id: hiringConversations.id })
  )[0]!.id;
});

afterAll(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(users).where(eq(users.id, userId));
});

const threadBodies = async (conversationId_: string) =>
  (
    await db
      .select({ role: hiringMessages.role, body: hiringMessages.body, card: hiringMessages.card })
      .from(hiringMessages)
      .where(eq(hiringMessages.conversationId, conversationId_))
      .orderBy(asc(hiringMessages.createdAt))
  ).map((m) => ({ role: m.role, body: m.body }));

describe("@ats/desk-core store", () => {
  test("two posted messages land in order, awaited", async () => {
    const conv = await loadConversation(orgId, conversationId);
    await postMessage(conv, { role: "user", body: "I need a data analyst" });
    await postMessage(conv, { role: "desk", body: "Where will this role be located?" });
    expect(await threadBodies(conversationId)).toEqual([
      { role: "user", body: "I need a data analyst" },
      { role: "desk", body: "Where will this role be located?" },
    ]);
  });

  test("thread lookup is org-scoped and resolves through the requisition", async () => {
    expect((await conversationForRequisition(orgId, requisitionId))?.id).toBe(conversationId);
    expect(await conversationForRequisition(orgId, crypto.randomUUID())).toBeNull();
    expect(await conversationForSubject(orgId, "requisition", requisitionId)).toBe(conversationId);
    expect(await conversationForSubject(orgId, "requisition", crypto.randomUUID())).toBeNull();
    expect(await conversationForSubject(orgId, "application", null)).toBeNull();
    await expect(loadConversation(orgId, crypto.randomUUID())).rejects.toThrow(/not found/i);
  });

  test("plainPreview and clipText keep their documented output", () => {
    const id = "b701a84d-f47e-4217-b65a-8a12986ab159";
    expect(
      plainPreview(
        `The candidate for application ${id} (REQ-2026-001) shared their CTC.\nRequisition id: ${id}\n### Supply Verdict **Starving** — only \`1\` applicant\n- Added: none`,
        200,
      ),
    ).toBe(
      "The candidate for application (REQ-2026-001) shared their CTC. Supply Verdict Starving — only 1 applicant Added: none",
    );
    expect(plainPreview("word ".repeat(100), 50)!.endsWith("word…")).toBe(true);
    expect(plainPreview(null, 10)).toBeNull();
    const long = Array.from({ length: 20 }, () => "Word ".repeat(200).trim()).join("\n\n");
    const clipped = clipText(long, 5000);
    expect(clipped.length).toBeLessThan(5000);
    expect(clipped.endsWith("… The full text is in Agent activity.")).toBe(true);
    expect(clipText("short", 5000)).toBe("short");
  });

  test("notifyRequisitionThread lands a message on the requisition's thread", async () => {
    await notifyRequisitionThread(orgId, requisitionId, "Scorecard chase: one round is due.", {
      card: { type: "scorecard_due" },
    });
    const rows = await db
      .select({ role: hiringMessages.role, body: hiringMessages.body, card: hiringMessages.card })
      .from(hiringMessages)
      .where(eq(hiringMessages.conversationId, conversationId))
      .orderBy(asc(hiringMessages.createdAt));
    expect(rows.at(-1)).toEqual({
      role: "desk",
      body: "Scorecard chase: one round is due.",
      card: { type: "scorecard_due" },
    });
  });

  test("no open thread: nothing is posted", async () => {
    const before = await threadBodies(conversationId);
    await notifyRequisitionThread(orgId, crypto.randomUUID(), "Nobody hears this.");
    expect(await threadBodies(conversationId)).toEqual(before);
    // A closed chat is excluded from conversationForRequisition, so the notify skips it.
    const [closed] = await db
      .insert(hiringConversations)
      .values({
        orgId,
        createdBy: userId,
        title: "Closed need",
        status: "closed",
        requisitionId,
      })
      .returning({ id: hiringConversations.id });
    await db
      .update(hiringConversations)
      .set({ status: "closed" })
      .where(eq(hiringConversations.id, conversationId));
    await notifyRequisitionThread(orgId, requisitionId, "Not to the closed thread either.");
    expect(await threadBodies(conversationId)).toEqual(before);
    expect(await threadBodies(closed!.id)).toEqual([]);
    await db
      .update(hiringConversations)
      .set({ status: "active" })
      .where(eq(hiringConversations.id, conversationId));
  });
});
