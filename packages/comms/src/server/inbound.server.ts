/**
 * Inbound-mail transport (map §4 L2 comms: "mail transport part of
 * local-inbox.server.ts"). Comms owns the wire side of the per-organisation
 * careers inbox: resolving which tenant a mail belongs to and the
 * `onInboundMail(handler)` registry through which the app takes over.
 *
 * What an incoming mail means — a CV to parse into the talent pool, documents
 * to file for a pre-onboarding candidate, a job-board notification — is a
 * hiring-domain decision (intake, onboarding, job channels) and stays in the
 * app (map §11 ruling 4): exactly one handler registers at boot
 * (apps/web/src/boot.ts) and `receiveMail` delegates to it with the resolved
 * organisation. Without a handler the transport has nothing to route to and
 * records the mail as skipped, which is what today's code does when a mail
 * carries no CV and no onboarding documents.
 *
 * Never throws — every outcome is described in the returned InboundResult so
 * HR can see exactly what happened to each mail.
 */
import { ilike, inArray } from "drizzle-orm";

import { db, organizations } from "@ats/db/server";
import { log } from "@ats/observability/server";

export const INBOX_DOMAIN = process.env["INBOUND_EMAIL_DOMAIN"] ?? "careers.atsiq.yavar.ai";

export function inboxAddress(slug: string | null | undefined): string | null {
  const clean = (slug ?? "").trim().toLowerCase();
  return clean ? `${clean}@${INBOX_DOMAIN}` : null;
}

/** Local part of any recipient address, lower-cased. */
export function localPart(address: string): string {
  const m = /<([^>]+)>/.exec(address);
  const bare = (m?.[1] ?? address).trim().toLowerCase();
  const at = bare.indexOf("@");
  return (at === -1 ? bare : bare.slice(0, at)).replace(/\+.*$/, "");
}

/** Every plain address found in a recipient header, lower-cased. */
export function recipientAddresses(header: string): string[] {
  const out: string[] = [];
  for (const chunk of (header ?? "").split(",")) {
    const m = /<([^>]+)>/.exec(chunk);
    const bare = (m?.[1] ?? chunk).trim().toLowerCase();
    if (bare.includes("@")) out.push(bare);
  }
  return out;
}

export function displayName(from: string): { email: string; name: string | null } {
  const m = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/.exec(from);
  if (m) return { email: (m[2] ?? "").trim().toLowerCase(), name: (m[1] ?? "").trim() || null };
  return { email: from.trim().toLowerCase(), name: null };
}

const TEXT_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const RELAY_LOCAL =
  /no-?reply|donotreply|^(notifications?|alerts?|jobs|careers|hr|talent|recruit)/i;

/** First email address found in a document, lower-cased. */
export function emailInText(text: string): string | null {
  return TEXT_EMAIL.exec(text)?.[0]?.toLowerCase() ?? null;
}

/**
 * The sender, when plausibly the applicant themself. Board notifications and
 * mailbox relays (no-reply@, notifications@, careers@…) must never become a
 * candidate's identity — every applicant would collapse into one record.
 */
export function applicantSender(sender: {
  email: string | null | undefined;
  name: string | null | undefined;
}): { email: string; name: string | null } | null {
  const email = (sender.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) return null;
  if (RELAY_LOCAL.test(email.split("@")[0] ?? "")) return null;
  return { email, name: sender.name ?? null };
}

export type InboundAttachment = {
  filename: string;
  content: string;
  contentType?: string | undefined;
};

export type InboundMail = {
  to: string;
  from: string;
  subject?: string | null | undefined;
  text?: string | null | undefined;
  messageId?: string | null | undefined;
  attachments?: InboundAttachment[] | undefined;
};

export type InboundResult = {
  status: "imported" | "updated" | "stored" | "skipped" | "error";
  detail: string;
  messageId: string | null;
  candidateId?: string | null;
};

/**
 * One mail the transport has resolved to a tenant, handed to the registered
 * handler. Attachments arrive raw — extracting text from them is a
 * hiring-domain concern (cv-text) that stays in the app, so the handler
 * decides which attachments are CVs and which are documents.
 */
export type ResolvedInbound = {
  orgId: string;
  mail: InboundMail;
  /** Parsed sender (displayName of the From header). */
  sender: { email: string; name: string | null };
  /** Every plain address on the To header, lower-cased. */
  addresses: string[];
  attachments: InboundAttachment[];
};

type InboundMailHandler = (mail: ResolvedInbound) => Promise<InboundResult>;

let inboundHandler: InboundMailHandler | null = null;

/**
 * Register the app-side handler that routes a resolved mail (CV import,
 * onboarding documents). One handler: last registration wins, so
 * re-registering the same handler from a module load and from boot is a no-op.
 */
export function onInboundMail(handler: InboundMailHandler): void {
  inboundHandler = handler;
}

/**
 * Handle one inbound mail: resolve the tenant from the recipient, then hand
 * the mail to the registered handler. Never throws — every outcome is
 * described in the result so HR can see exactly what happened to each mail.
 */
export async function receiveMail(mail: InboundMail): Promise<InboundResult> {
  const addresses = recipientAddresses(mail.to ?? "");
  const slug = localPart(mail.to ?? "");
  if (!slug)
    return { status: "error", detail: "No recipient address on the mail.", messageId: null };

  // Mail sent straight to the ATSIQ address, or forwarded from the organisation's
  // own careers address (careers@company.com) which it registered here.
  let org: { id: string; status: string | null } | null = null;
  if (addresses.length) {
    const [row] = await db
      .select({ id: organizations.id, status: organizations.status })
      .from(organizations)
      .where(inArray(organizations.careersEmail, addresses))
      .limit(1);
    org = row ?? null;
  }
  if (!org) {
    const [row] = await db
      .select({ id: organizations.id, status: organizations.status })
      .from(organizations)
      .where(ilike(organizations.inboxSlug, slug))
      .limit(1);
    org = row ?? null;
  }
  if (!org) {
    return {
      status: "error",
      detail: `No organisation owns the address ${slug}.`,
      messageId: null,
    };
  }

  if (org.status && org.status !== "active") {
    return { status: "error", detail: "That organisation is not active.", messageId: null };
  }

  const sender = displayName(mail.from ?? "");

  if (!inboundHandler) {
    // Nobody is routing mail for this deployment: a wiring bug, not a normal
    // outcome — surface it loudly instead of hiding it as a skip (reviewer,
    // 2026-11-25). The app registers its handler at boot AND at module import
    // of local-inbox.server, so this is unreachable in the running product.
    log.error("inbound.no_handler", { org_id: org.id });
    return { status: "error", detail: "Inbound mail handler is not registered.", messageId: null };
  }
  try {
    return await inboundHandler({
      orgId: org.id,
      mail,
      sender,
      addresses,
      attachments: mail.attachments ?? [],
    });
  } catch (e) {
    return {
      status: "error",
      detail: e instanceof Error ? e.message : "The CV could not be imported.",
      messageId: null,
    };
  }
}
