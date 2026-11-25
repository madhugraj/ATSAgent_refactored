/**
 * Inbound-mail CV handler (map §4 L3 candidates server row: "inbound-mail CV
 * handler (from local-inbox)", map §5 onInboundMail). The comms transport
 * resolves the tenant; this module owns the hiring-domain half of the
 * careers-inbox CV branch: pick the CV attachment, read it, match the role
 * named in the mail, parse and file the candidate into the talent pool.
 *
 * Split out of apps/web/src/lib/local-inbox.server.ts (runbook §2 candidates
 * item 3). The app's localInboxHandler keeps the inbox_messages row insert,
 * the provider-dedupe handling and the pre-onboarding document filing, and
 * delegates this CV branch here; registration is unchanged — boot.ts and
 * local-inbox.server.ts still register `localInboxHandler` on the comms
 * single-slot `onInboundMail` registry.
 */
import {
  applicantSender,
  emailInText,
  type InboundAttachment,
  type InboundResult,
  type ResolvedInbound,
} from "@ats/comms/server";
import { and, eq } from "drizzle-orm";

import { db, inboxMessages, requisitions } from "@ats/db/server";
import { channelForSender } from "@ats/std/shared";
import { attachmentText, looksLikeCv } from "@ats/std/server";

import { ingestCandidate, parseCv } from "./intake.server";

function base64ToBytes(data: string): Uint8Array {
  const b64 = data
    .replace(/^data:[^;]+;base64,/, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The source a careers-inbox CV is recorded under: the portal that sent the
 * mail (by its sender's domain — application mails a portal relays), else the
 * careers inbox itself.
 */
export function inboxSource(senderEmail: string | null | undefined): string {
  return channelForSender(senderEmail)?.id ?? "careers_inbox";
}

/** The open role whose title appears in the mail, so the CV joins the right pipeline. */
export async function matchRequisition(orgId: string, haystack: string): Promise<string | null> {
  const rows = await db
    .select({ id: requisitions.id, title: requisitions.title })
    .from(requisitions)
    .where(and(eq(requisitions.orgId, orgId), eq(requisitions.status, "approved")));
  const text = haystack.toLowerCase();
  let best: { id: string; len: number } | null = null;
  for (const r of rows) {
    const title = (r.title ?? "").trim().toLowerCase();
    if (title.length > 3 && text.includes(title) && (!best || title.length > best.len)) {
      best = { id: r.id, len: title.length };
    }
  }
  return best?.id ?? null;
}

/**
 * The CV branch of the careers-inbox handler, verbatim from
 * local-inbox.server.ts: extract the attachment text, match the role, parse
 * the CV and ingest the candidate. `savedId` is the inbox_messages row the
 * caller (the app's localInboxHandler) inserted; this side keeps that row's
 * requisition/attachment bookkeeping exactly as before and returns the final
 * result for the caller's status write. Never throws — every outcome lands in
 * the returned InboundResult so HR can see what happened to the mail.
 */
export async function handleCvInbound(
  mail: ResolvedInbound,
  savedId: string,
  cv: InboundAttachment,
): Promise<InboundResult> {
  const orgId = mail.orgId;
  const sender = mail.sender;
  const { mail: message } = mail;
  try {
    const bytes = base64ToBytes(cv.content);
    const text = await attachmentText(cv.filename, bytes);
    if (text.trim().length < 40) {
      return {
        status: "error",
        detail: "The attachment could not be read.",
        messageId: savedId,
      };
    }
    const requisitionId = await matchRequisition(
      orgId,
      `${message.subject ?? ""} ${message.text ?? ""} ${cv.filename}`,
    );
    const parsed = await parseCv(text, orgId);
    if (!parsed) {
      console.warn(
        `[careers-inbox] CV parse failed for ${cv.filename}; filing from the mail's own identity.`,
      );
    }
    // Identity must survive a failed AI parse: the CV text, then the sender —
    // but only when they plausibly are the applicant, never a board relay.
    const applicant = applicantSender(sender);
    const ingested = await ingestCandidate({
      resumeText: text,
      fileName: cv.filename,
      requisitionId,
      orgId,
      source: inboxSource(sender.email),
      parsed,
      fullName: parsed?.full_name || applicant?.name || null,
      email: parsed?.email ?? emailInText(text) ?? applicant?.email ?? null,
      resumeFile: { filename: cv.filename, bytes },
    });
    await db
      .update(inboxMessages)
      .set({ requisitionId, attachmentBytes: bytes.length })
      .where(eq(inboxMessages.id, savedId));
    return {
      status: ingested.alreadyApplied ? "updated" : "imported",
      detail: `${ingested.name} (${ingested.email})${requisitionId ? " added to the matching role" : " filed in the talent pool"}.`,
      messageId: savedId,
      candidateId: ingested.candidateId,
    };
  } catch (e) {
    return {
      status: "error",
      detail: e instanceof Error ? e.message : "The CV could not be imported.",
      messageId: savedId,
    };
  }
}

/** Which attachment (if any) of a resolved mail is the CV. */
export function cvAttachmentOf(mail: ResolvedInbound): InboundAttachment | null {
  const attachments = (mail.attachments ?? []).filter((a) => looksLikeCv(a.filename ?? ""));
  return attachments[0] ?? null;
}
