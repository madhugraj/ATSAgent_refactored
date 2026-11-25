/**
 * Framework-neutral authorization core (map §4 L1, auth row).
 *
 * Everything here is plain async logic over the database — no TanStack
 * middleware. The TanStack adapter (`requireOrg` / `requireRole` /
 * `requireOrgOwner` / `requirePlatformAdmin`) stays in the app
 * (`apps/web/src/lib/auth.middleware.ts`) and composes on top of
 * `activeOrgOf` / `assertRole`; the server-fn compiler must introspect its
 * `.middleware([...])` chains there.
 *
 * `LifecycleActor` / `ReqStatus` / `APPROVER_ROLE` / `actorFor` move with the
 * core (map: from `requisitions.server`): agent tools act through `actorFor`
 * and the approval chain is checked with the same `assertRole` semantics, so
 * the actor vocabulary lives next to the role check it feeds.
 * `@ats/requisitions/server` re-exports them (its app shim keeps the old
 * import surface until Phase 8).
 */
import { and, eq, inArray } from "drizzle-orm";

import { db, orgMembers, userRoles } from "@ats/db/server";

/** The verified-identity claim shape the rest of the app reads. */
export type IdentityClaims = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  email_confirmed_at?: string | null;
};

export type AppRole =
  | "recruiter"
  | "hiring_manager"
  | "department_head"
  | "hr_head"
  | "president_cbo"
  /** Panel only: their own interview rounds and scorecards, nothing else. */
  | "interviewer";

export type OrgContext = {
  orgId: string;
  isOwner: boolean;
  memberEmail: string;
  /** Holds only the interviewer role: may reach `requirePanel` functions and nothing else. */
  panelOnly: boolean;
};

/**
 * True when a member's only roles are `interviewer` (and they are not the
 * owner). Such a member is denied everywhere except `requirePanel` functions.
 */
export async function isPanelOnly(
  userId: string,
  orgId: string,
  isOwner: boolean,
): Promise<boolean> {
  if (isOwner) return false;
  const roles = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.orgId, orgId)));
  return roles.length > 0 && roles.every((r) => r.role === "interviewer");
}

/**
 * Resolve the caller's active organisation. First membership wins, matching
 * the legacy `current_org_id()`. A panel-only member resolves to null (no
 * organisation) unless the caller is a panel function (`allowPanel`) — deny
 * by default, so every existing tenant function stays closed to them.
 */
export async function activeOrgOf(
  userId: string,
  opts: { allowPanel?: boolean } = {},
): Promise<OrgContext | null> {
  const [membership] = await db
    .select({ orgId: orgMembers.orgId, isOwner: orgMembers.isOwner, email: orgMembers.email })
    .from(orgMembers)
    .where(and(eq(orgMembers.userId, userId), eq(orgMembers.status, "active")))
    .orderBy(orgMembers.createdAt)
    .limit(1);
  if (!membership) return null;
  const panelOnly = await isPanelOnly(userId, membership.orgId, membership.isOwner);
  if (panelOnly && !opts.allowPanel) return null;
  return {
    orgId: membership.orgId,
    isOwner: membership.isOwner,
    memberEmail: membership.email,
    panelOnly,
  };
}

/** Throws when the member holds only the interviewer role — for code that resolves membership itself. */
export async function assertNotPanelOnly(
  userId: string,
  orgId: string,
  isOwner = false,
): Promise<void> {
  if (await isPanelOnly(userId, orgId, isOwner))
    throw new Error("You are not part of an organisation yet.");
}

/** Imperative role assertion for use inside handlers (input-dependent checks). */
export async function assertRole(
  userId: string,
  orgId: string,
  role: AppRole | AppRole[],
  message = "You do not have permission to perform this action.",
): Promise<void> {
  const org = await activeOrgOf(userId);
  if (!org || org.orgId !== orgId) throw new Error(message);
  if (org.isOwner) return;
  const wanted = Array.isArray(role) ? role : [role];
  const [row] = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.orgId, orgId),
        inArray(userRoles.role, wanted),
      ),
    )
    .limit(1);
  if (!row) throw new Error(message);
}

export type LifecycleActor = {
  orgId: string;
  userId: string;
  memberEmail: string;
  /** Set when an agent performs the action for this member (recorded in trails). */
  via?: "agent";
};

export type ReqStatus =
  | "draft"
  | "pending_dh"
  | "pending_hr"
  | "pending_cbo"
  | "approved"
  | "rejected"
  | "on_hold"
  | "closed";

/** Which role approves a requisition waiting at `status`. */
export const APPROVER_ROLE: Partial<Record<ReqStatus, AppRole>> = {
  pending_dh: "department_head",
  pending_hr: "hr_head",
  pending_cbo: "president_cbo",
};

/** Resolve the member identity an agent acts as. */
export async function actorFor(orgId: string, userId: string): Promise<LifecycleActor> {
  const org = await activeOrgOf(userId);
  if (!org || org.orgId !== orgId)
    throw new Error("The person this agent works for has left the organisation.");
  return { orgId, userId, memberEmail: org.memberEmail, via: "agent" };
}
