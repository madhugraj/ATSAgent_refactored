/**
 * Organisation member administration cores (map §4 L2, org.functions →
 * server): inviting a colleague into the tenant with one approval role, and
 * the notification that tells them access is ready. The createServerFn
 * wrappers (validator + auth middleware) stay in apps/web/src/lib/
 * org.functions.ts with unchanged server-function ids; this module drops the
 * createServerOnlyFn wrapper (map §11 ruling 2 precedent: the /server entry
 * already carries the server-only marker).
 */
import { redactEmail, writeAudit } from "@ats/audit/server";
import { db, orgMembers, organizations } from "@ats/db/server";
import { and, eq, ilike } from "drizzle-orm";

import type { AppRole } from "@ats/auth/server";
import { registrableDomain, workEmailProblem } from "@ats/auth/shared";

const ROLE_LABELS: Record<AppRole, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  department_head: "Department head",
  hr_head: "HR head",
  president_cbo: "President / CBO",
  interviewer: "Interviewer",
};

/**
 * Tell an invited colleague they now have access. Best-effort: the roster
 * entry is already saved, so a mail failure must never fail the invitation.
 * The mail stack lives in @ats/comms (Phase 4, map §11 ruling 4c).
 */
export async function notifyInvitedMember(args: {
  email: string;
  orgName: string;
  role: AppRole;
  title?: string | null;
  inviteeName?: string | null;
  inviterName?: string | null;
  memberId?: string | null;
  orgId?: string | null;
}) {
  try {
    const { sendTemplateEmail } = await import("@ats/comms/server");
    await sendTemplateEmail("member-invited", args.email, {
      idempotencyKey: `member-invited:${args.memberId ?? args.email}`,
      orgId: args.orgId ?? null,
      templateData: {
        orgName: args.orgName,
        roleLabel: ROLE_LABELS[args.role],
        title: args.title ?? undefined,
        inviteeName: args.inviteeName ?? undefined,
        inviterName: args.inviterName ?? undefined,
        email: args.email,
      },
    });
  } catch (e) {
    console.error("invitation email failed", redactEmail(args.email), e);
  }
}

/**
 * Invite a person into the organisation with one approval role (the caller
 * has checked the inviter is an admin). Company-domain gate as before;
 * audited `member.invited` — an invite is a role grant.
 */
export async function inviteMemberCore(
  orgId: string,
  inviterUserId: string,
  data: { email: string; role: AppRole; title: string; fullName: string },
): Promise<{ ok: true; notified: true }> {
  const [org] = await db
    .select({ status: organizations.status })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if ((org?.status ?? "active") !== "active")
    throw new Error(
      "Your organisation is not approved yet — internal users can be added after approval.",
    );
  const email = data.email.toLowerCase();
  const problem = workEmailProblem(email);
  if (problem) throw new Error(problem);

  // The owner's verified domain defines who counts as an internal user.
  const [owner] = await db
    .select({ email: orgMembers.email })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.isOwner, true)))
    .limit(1);
  if (owner?.email && registrableDomain(owner.email) !== registrableDomain(email))
    throw new Error(
      `Only ${registrableDomain(owner.email)} addresses can be invited into this organisation.`,
    );

  const [existingUser] = await db
    .select({ id: orgMembers.id })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), ilike(orgMembers.email, email)))
    .limit(1);
  if (existingUser) throw new Error("That email is already on the roster.");

  const [row] = await db
    .insert(orgMembers)
    .values({
      orgId,
      email,
      fullName: data.fullName.trim() || null,
      title: data.title.trim() || null,
      invitedRole: data.role,
      invitedBy: inviterUserId,
      status: "invited",
    })
    .returning({ id: orgMembers.id });

  const [orgRow] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const [inviter] = await db
    .select({ fullName: orgMembers.fullName, email: orgMembers.email })
    .from(orgMembers)
    .where(and(eq(orgMembers.userId, inviterUserId), eq(orgMembers.orgId, orgId)))
    .limit(1);
  await notifyInvitedMember({
    orgId,
    email,
    orgName: orgRow?.name ?? "your organisation",
    role: data.role,
    title: data.title.trim() || null,
    inviteeName: data.fullName.trim() || null,
    inviterName: inviter?.fullName ?? inviter?.email ?? null,
    memberId: row?.id ?? null,
  });
  await writeAudit({
    actor: inviter?.email ?? `user:${inviterUserId}`,
    actorUserId: inviterUserId,
    orgId,
    action: "member.invited",
    entityType: "org_member",
    entityId: row?.id ?? null,
    detail: { email, role: data.role },
  });
  return { ok: true, notified: true };
}
