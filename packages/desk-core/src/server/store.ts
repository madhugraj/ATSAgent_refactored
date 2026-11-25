/**
 * The hiring-desk conversation store (map §4 L2 desk-core, fixes S3):
 * hiring_conversations / hiring_messages live here, and every domain posts
 * its status lines through {@link postMessage} / {@link notifyRequisitionThread}
 * — at the same synchronous point in its flow as before the extraction, so
 * chat message order is unchanged.
 */
import { and, desc, eq, isNull, notInArray } from "drizzle-orm";

import { db, applications, hiringConversations, hiringMessages } from "@ats/db/server";

import { clipText } from "./text";

export type Conversation = typeof hiringConversations.$inferSelect;
export type DeskCard = Record<string, unknown> & { type: string };

/** Longest message body kept; the thread folds long text behind "Show more". */
const MESSAGE_MAX = 12_000;

export async function postMessage(
  conv: { id: string; orgId: string },
  m: { role: "user" | "desk" | "agent"; body: string; agentType?: string | null; card?: DeskCard },
): Promise<void> {
  await db.insert(hiringMessages).values({
    conversationId: conv.id,
    orgId: conv.orgId,
    role: m.role,
    agentType: m.agentType ?? null,
    body: clipText(m.body, MESSAGE_MAX),
    card: (m.card ?? null) as never,
  });
  await db
    .update(hiringConversations)
    .set({ updatedAt: new Date() })
    .where(eq(hiringConversations.id, conv.id));
}

export async function loadConversation(
  orgId: string,
  id: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<Conversation> {
  const [c] = await db
    .select()
    .from(hiringConversations)
    .where(
      and(
        eq(hiringConversations.id, id),
        eq(hiringConversations.orgId, orgId),
        // A deleted chat is gone for everyone but its restore.
        opts.includeDeleted ? undefined : isNull(hiringConversations.deletedAt),
      ),
    )
    .limit(1);
  if (!c) throw new Error("Conversation not found.");
  return c;
}

/** The thread a requisition belongs to (newest first), if any. */
export async function conversationForRequisition(
  orgId: string,
  requisitionId: string,
): Promise<Conversation | null> {
  const [c] = await db
    .select()
    .from(hiringConversations)
    .where(
      and(
        eq(hiringConversations.orgId, orgId),
        eq(hiringConversations.kind, "hiring"),
        eq(hiringConversations.requisitionId, requisitionId),
        notInArray(hiringConversations.status, ["closed"]),
        isNull(hiringConversations.deletedAt),
      ),
    )
    .orderBy(desc(hiringConversations.createdAt))
    .limit(1);
  return c ?? null;
}

/** Thread for a run's subject: a requisition directly, an application through its requisition. */
export async function conversationForSubject(
  orgId: string,
  subjectType: string | null | undefined,
  subjectId: string | null | undefined,
): Promise<string | null> {
  if (!subjectId) return null;
  let requisitionId: string | null = null;
  if (subjectType === "requisition") requisitionId = subjectId;
  else if (subjectType === "application") {
    const [a] = await db
      .select({ requisitionId: applications.requisitionId })
      .from(applications)
      .where(and(eq(applications.id, subjectId), eq(applications.orgId, orgId)))
      .limit(1);
    requisitionId = a?.requisitionId ?? null;
  }
  if (!requisitionId) return null;
  return (await conversationForRequisition(orgId, requisitionId))?.id ?? null;
}

/**
 * Post a desk status line to a requisition's hiring thread (new helper, map
 * §4 L2: "domains post status lines here"). Same shape as the domain call
 * sites it replaces — find the thread, and when it exists post awaited, so
 * the line lands in the same order as a `conversationForRequisition` +
 * `postMessage` pair. No thread (closed chats included): nothing is posted.
 */
export async function notifyRequisitionThread(
  orgId: string,
  requisitionId: string,
  text: string,
  meta?: { agentType?: string | null; card?: DeskCard },
): Promise<void> {
  const conv = await conversationForRequisition(orgId, requisitionId);
  if (!conv) return;
  await postMessage(conv, {
    role: "desk",
    body: text,
    ...(meta?.agentType ? { agentType: meta.agentType } : {}),
    ...(meta?.card ? { card: meta.card } : {}),
  });
}
