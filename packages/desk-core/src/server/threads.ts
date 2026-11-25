/**
 * Hiring-thread lifecycle (map §4 L2 desk-core: "thread deletion"): the
 * dustbin (deletion rules, who may delete, delete / restore / purge) and the
 * fan-out sibling lookup, extracted verbatim from desk.server.ts. The two
 * edges that used to be lazy dynamic imports into the app — the auth
 * helpers (now the @ats/auth core, which auth.middleware re-exports) and the
 * agents runtime (cancelled runs, stale requests) — come in as a direct
 * import and through the registered {@link DeskThreadEffects} respectively.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { writeAudit } from "@ats/audit/server";
import { activeOrgOf, assertRole } from "@ats/auth/server";
import { agentRuns, db, hiringConversations, hiringMessages, requisitions } from "@ats/db/server";

import type { Conversation } from "./store";
import { loadConversation, postMessage } from "./store";
import { deskThreadEffects } from "./effects";

/* ------------------------------------------------------ requisition wording */

export const STATUS_WORDS: Record<string, string> = {
  draft: "draft (not yet submitted)",
  pending_dh: "waiting for the department head's approval",
  pending_hr: "waiting for the HR head's approval",
  pending_cbo: "waiting for the CBO's approval",
  approved: "approved and open",
  rejected: "rejected",
  on_hold: "on hold",
  closed: "closed",
};

/* ------------------------------------------------------------ deleting a chat */

/** How long a deleted chat can be restored before the sweep purges it. */
export const RESTORE_DAYS = 30;

export type ThreadDeletion =
  { kind: "chat" } | { kind: "draft"; requisitionId: string; code: string } | null;

/**
 * What the dustbin would delete (pure on its inputs; unit-tested): a chat
 * still gathering details (no requisition), or a chat with an unused draft
 * requisition. Anything in approval or later is rejected / closed instead,
 * so its trail stays.
 */
export function deletionFor(
  conv: { requisitionId: string | null },
  req: { id: string; code: string; status: string; applications: number } | null,
): ThreadDeletion {
  if (!conv.requisitionId) return { kind: "chat" };
  if (req && req.status === "draft" && req.applications === 0)
    return { kind: "draft", requisitionId: req.id, code: req.code };
  return null;
}

async function threadRequisition(conv: Conversation) {
  if (!conv.requisitionId) return null;
  const [req] = await db
    .select({ id: requisitions.id, code: requisitions.code, status: requisitions.status })
    .from(requisitions)
    .where(and(eq(requisitions.id, conv.requisitionId), eq(requisitions.orgId, conv.orgId)))
    .limit(1);
  if (!req) return null;
  const [a] = (await db.execute(sql`
    select count(*)::int n from applications
    where requisition_id = ${req.id} and org_id = ${conv.orgId}`)) as unknown as { n: number }[];
  return { ...req, applications: a?.n ?? 0 };
}

/**
 * Whether this person may delete this chat now, and what it would delete.
 * A chat only: its starter, or the HR head / CBO / owner. With a draft
 * requisition: HR head / CBO / owner (the Requisitions page's rule).
 */
export async function deletionAllowed(conv: Conversation, userId: string): Promise<ThreadDeletion> {
  const what = deletionFor(conv, await threadRequisition(conv));
  if (!what) return null;
  const leader = await assertRole(userId, conv.orgId, ["hr_head", "president_cbo"]).then(
    () => true,
    () => false,
  );
  if (what.kind === "chat") return leader || conv.createdBy === userId ? what : null;
  return leader ? what : null;
}

/** Delete a chat (and its unused draft): hidden now, restorable for 30 days; audited. */
export async function deleteThread(
  conv: Conversation,
  userId: string,
  reason: string,
  now = new Date(),
): Promise<{ kind: "chat" | "draft"; code: string | null; restoreUntil: string }> {
  const org = await activeOrgOf(userId);
  if (!org || org.orgId !== conv.orgId)
    throw new Error("You are not a member of this organisation.");
  const what = await deletionAllowed(conv, userId);
  if (!what) {
    const req = await threadRequisition(conv);
    throw new Error(
      req && req.status !== "draft"
        ? `${req.code} is ${STATUS_WORDS[req.status] ?? req.status}, so this chat cannot be deleted — reject or close the role instead; the chat then stays as its record.`
        : req && req.applications > 0
          ? `${req.code} already has applications, so this chat cannot be deleted.`
          : "Only the person who started this chat, the HR head, the CBO or an owner can delete it.",
    );
  }
  const why = reason.replace(/\s+/g, " ").trim().slice(0, 500);
  if (what.kind === "draft" && why.length < 3)
    throw new Error("Say why — the draft requisition is deleted with the chat.");
  // Nothing keeps working for a deleted chat.
  const active = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.orgId, conv.orgId),
        eq(agentRuns.conversationId, conv.id),
        inArray(agentRuns.status, ["queued", "running", "awaiting_human"]),
      ),
    );
  const fx = deskThreadEffects();
  if (fx) for (const r of active) await fx.cancelRun({ orgId: conv.orgId, runId: r.id, userId });
  const hidden = await db
    .update(hiringConversations)
    .set({ deletedAt: now, deletedBy: userId, deleteReason: why || null, updatedAt: now })
    .where(and(eq(hiringConversations.id, conv.id), isNull(hiringConversations.deletedAt)))
    .returning({ id: hiringConversations.id });
  if (!hidden.length) throw new Error("This chat was already deleted.");
  if (what.kind === "draft") {
    await db
      .delete(requisitions)
      .where(
        and(
          eq(requisitions.id, what.requisitionId),
          eq(requisitions.orgId, conv.orgId),
          eq(requisitions.status, "draft"),
        ),
      );
    await writeAudit({
      actor: org.memberEmail,
      actorUserId: userId,
      orgId: conv.orgId,
      action: "requisition.delete",
      entityType: "requisition",
      entityId: what.requisitionId,
      detail: { code: what.code, reason: why, via: "hiring_desk", conversation_id: conv.id },
    });
    if (fx) await fx.afterSubjectsDeleted(conv.orgId);
  }
  const [m] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(hiringMessages)
    .where(eq(hiringMessages.conversationId, conv.id));
  await writeAudit({
    actor: org.memberEmail,
    actorUserId: userId,
    orgId: conv.orgId,
    action: "desk.thread_deleted",
    entityType: "hiring_conversation",
    entityId: conv.id,
    detail: {
      title: conv.title,
      messages: Number(m?.n ?? 0),
      stage: what.kind,
      requisition: what.kind === "draft" ? what.code : null,
      reason: why || null,
      runsStopped: active.length,
    },
  });
  return {
    kind: what.kind,
    code: what.kind === "draft" ? what.code : null,
    restoreUntil: new Date(now.getTime() + RESTORE_DAYS * 864e5).toISOString(),
  };
}

/**
 * Delete a thread — and with scope "split", the other tracks of its fan-out.
 * Each sibling passes the same rules as a single delete (deletionAllowed:
 * the starter or HR leadership; a draft only by leadership); one that may
 * not go is kept and named with the reason, never silently skipped.
 */
export async function deleteThreads(
  conv: Conversation,
  userId: string,
  reason: string,
  scope: "track" | "split",
  now = new Date(),
): Promise<
  Awaited<ReturnType<typeof deleteThread>> & {
    alsoDeleted: number;
    kept: { title: string; why: string }[];
  }
> {
  // Read the group before this thread leaves it (siblings skip deleted ones).
  const siblings = scope === "split" ? await deskSiblings(conv.orgId, conv.id) : [];
  const res = await deleteThread(conv, userId, reason, now);
  const kept: { title: string; why: string }[] = [];
  let alsoDeleted = 0;
  for (const sib of siblings) {
    try {
      await deleteThread(await loadConversation(conv.orgId, sib.id), userId, reason, now);
      alsoDeleted++;
    } catch (e) {
      kept.push({ title: sib.title, why: e instanceof Error ? e.message : "Not deleted." });
    }
  }
  return { ...res, alsoDeleted, kept };
}

/** Chats deleted in the last 30 days (owners restore them). */
export async function deletedThreads(orgId: string, now = new Date()) {
  return db
    .select({
      id: hiringConversations.id,
      title: hiringConversations.title,
      deletedAt: hiringConversations.deletedAt,
      reason: hiringConversations.deleteReason,
    })
    .from(hiringConversations)
    .where(
      and(
        eq(hiringConversations.orgId, orgId),
        eq(hiringConversations.kind, "hiring"),
        sql`${hiringConversations.deletedAt} > ${new Date(now.getTime() - RESTORE_DAYS * 864e5).toISOString()}::timestamptz`,
      ),
    )
    .orderBy(desc(hiringConversations.deletedAt));
}

/**
 * An owner restores a chat within 30 days; audited. A draft deleted with it is
 * not brought back — the chat says so and the details are still there to raise it again.
 */
export async function restoreThread(
  orgId: string,
  userId: string,
  id: string,
  now = new Date(),
): Promise<{ ok: true }> {
  const org = await activeOrgOf(userId);
  if (!org || org.orgId !== orgId || !org.isOwner)
    throw new Error("Only an owner can restore a deleted chat.");
  const conv = await loadConversation(orgId, id, { includeDeleted: true });
  if (!conv.deletedAt) throw new Error("This chat is not deleted.");
  if (now.getTime() - conv.deletedAt.getTime() > RESTORE_DAYS * 864e5)
    throw new Error(
      `Deleted chats can be restored for ${RESTORE_DAYS} days; this one has passed that.`,
    );
  await db
    .update(hiringConversations)
    .set({ deletedAt: null, deletedBy: null, deleteReason: null, updatedAt: now })
    .where(and(eq(hiringConversations.id, conv.id), eq(hiringConversations.orgId, orgId)));
  await writeAudit({
    actor: org.memberEmail,
    actorUserId: userId,
    orgId,
    action: "desk.thread_restored",
    entityType: "hiring_conversation",
    entityId: conv.id,
    detail: { title: conv.title, deletedAt: conv.deletedAt.toISOString() },
  });
  const restored = await loadConversation(orgId, id);
  if (conv.requisitionId === null && restored.status !== "gathering") {
    // Its draft was deleted with it (the link is cleared): back to gathering details.
    await db
      .update(hiringConversations)
      .set({ status: "gathering" })
      .where(eq(hiringConversations.id, conv.id));
    await postMessage(restored, {
      role: "desk",
      body: 'This chat was restored. Its draft requisition was deleted with it and is not brought back — the hiring details are still here; say "create it" to raise a new draft.',
    });
  } else await postMessage(restored, { role: "desk", body: "This chat was restored." });
  return { ok: true };
}

/** Chats deleted more than 30 days ago are removed for good (scheduler sweep); audited. */
export async function purgeDeletedThreads(now = new Date()): Promise<number> {
  const gone = await db
    .delete(hiringConversations)
    .where(
      sql`${hiringConversations.deletedAt} <= ${new Date(now.getTime() - RESTORE_DAYS * 864e5).toISOString()}::timestamptz`,
    )
    .returning({
      id: hiringConversations.id,
      orgId: hiringConversations.orgId,
      title: hiringConversations.title,
    });
  for (const g of gone)
    await writeAudit({
      actor: "system:desk-retention",
      orgId: g.orgId,
      action: "desk.thread_purged",
      entityType: "hiring_conversation",
      entityId: g.id,
      detail: { title: g.title, afterDays: RESTORE_DAYS },
    });
  return gone.length;
}

/* ------------------------------------------------- tracks chip (siblings) */

export type DeskTrackView = {
  id: string;
  title: string;
  status: string;
  /** Open agent requests waiting for the person in this thread. */
  needsYou: number;
  /** This is the thread being viewed. */
  self: boolean;
};

/**
 * The other threads of the same fan-out, with what needs the person in each.
 * Threads created before `split_group_id` existed are linked lazily from
 * their fan-out card's track list, so older splits get the chip too.
 */
export async function deskSiblings(
  orgId: string,
  conversationId: string,
): Promise<DeskTrackView[]> {
  const [conv] = await db
    .select({ splitGroupId: hiringConversations.splitGroupId })
    .from(hiringConversations)
    .where(and(eq(hiringConversations.id, conversationId), eq(hiringConversations.orgId, orgId)))
    .limit(1);
  if (!conv) return [];
  let groupId = conv.splitGroupId;
  if (!groupId) {
    // Write-behind: derive the group from this thread's fan-out card.
    const msgs = await db
      .select({ id: hiringMessages.id, card: hiringMessages.card })
      .from(hiringMessages)
      .where(eq(hiringMessages.conversationId, conversationId));
    const fanout = msgs.find((m) => (m.card as { type?: string } | null)?.type === "needs_fanout");
    const items =
      (fanout?.card as { items?: { id: string }[] } | null)?.items ?? ([] as { id: string }[]);
    if (items.length < 2) return [];
    // The fan-out card's message id IS the group id: deterministic, so every
    // thread of the split derives and stamps the same value whenever it runs.
    groupId = fanout!.id;
    await db
      .update(hiringConversations)
      .set({ splitGroupId: groupId })
      .where(
        and(
          eq(hiringConversations.orgId, orgId),
          inArray(hiringConversations.id, [conversationId, ...items.map((i) => i.id)]),
        ),
      );
  }
  const rows = (await db.execute(sql`
    select hc.id, hc.title, hc.status, hc.created_by,
      (select count(*)::int from agent_tasks t
         join agent_runs r on r.id = t.run_id
        where r.conversation_id = hc.id and t.status = 'open') as needs_you
    from hiring_conversations hc
    where hc.org_id = ${orgId} and hc.split_group_id = ${groupId}
      and hc.id <> ${conversationId} and hc.deleted_at is null
    order by hc.created_at`)) as unknown as {
    id: string;
    title: string;
    status: string;
    created_by: string;
    needs_you: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    needsYou: r.needs_you,
    self: false,
  }));
}
