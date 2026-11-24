/**
 * Authorization seam.
 *
 * `requireIdentity` (authn) verifies the caller's identity. Everything on
 * top of it here is authorization, computed from the verified identity only —
 * never from client input. Every tenant-scoped server function must use
 * `requireOrg` (or `requireRole`), and every query it issues must carry an
 * explicit `org_id` predicate. `requireIdentity` reads the
 * database-backed session cookie.
 *
 * The framework-neutral core (types, `isPanelOnly` / `activeOrgOf` /
 * `assertNotPanelOnly` / `assertRole`, and the actor vocabulary) lives in
 * `@ats/auth/server`; this file stays the thin TanStack adapter — the
 * server-fn compiler must introspect these `.middleware([...])` chains, so
 * the path and export surface must not change.
 */
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";

import {
  activeOrgOf,
  assertNotPanelOnly,
  assertRole,
  emailVerified,
  isPanelOnly,
  type AppRole,
  type IdentityClaims,
  type OrgContext,
} from "@ats/auth/server";
import { db } from "../server/db";
import { platformAdmins, userRoles } from "@db/schema";

export { activeOrgOf, assertNotPanelOnly, assertRole, isPanelOnly };
export type { AppRole, IdentityClaims, OrgContext };

/** Authn only: the atsiq_session httpOnly cookie.
 *  The definition lives in this client-reached module; the server-only
 *  resolution (server/identity.ts) is imported lazily inside the .server()
 *  body, so the client bundle never pulls it in. */
export const requireIdentity = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { resolveSession } = await import("../server/identity");
  const request = getRequest();
  const session = request ? await resolveSession(request) : null;
  if (!session) throw new Error("Unauthorized: No authorization header provided");
  return next({
    context: {
      userId: session.userId,
      // A cookie session carries no JWT — fabricate the claim shape the
      // rest of the app reads (sub / email / email_verified).
      claims: {
        sub: session.userId,
        email: session.email,
        email_verified: true,
      } satisfies IdentityClaims,
    },
  });
});

/** Authn + tenant resolution. Context gains a verified `orgId`; queries must scope on it. */
export const requireOrg = createMiddleware({ type: "function" })
  .middleware([requireIdentity])
  .server(async ({ context, next }) => {
    const org = await activeOrgOf(context.userId);
    if (!org) throw new Error("You are not part of an organisation yet.");
    return next({ context: { ...context, ...org } });
  });

/**
 * Authn + tenant for panel work: like `requireOrg`, but also admits a
 * panel-only member (context.panelOnly). Use only for functions that are
 * already limited to the caller's own interview rounds.
 */
export const requirePanel = createMiddleware({ type: "function" })
  .middleware([requireIdentity])
  .server(async ({ context, next }) => {
    const org = await activeOrgOf(context.userId, { allowPanel: true });
    if (!org) throw new Error("You are not part of an organisation yet.");
    return next({ context: { ...context, ...org } });
  });

/** Authn + tenant + role. An org owner passes every role; otherwise a matching user_roles row must exist. */
export function requireRole(role: AppRole) {
  return createMiddleware({ type: "function" })
    .middleware([requireIdentity])
    .server(async ({ context, next }) => {
      const org = await activeOrgOf(context.userId);
      if (!org) throw new Error("You are not part of an organisation yet.");
      if (!org.isOwner) {
        const [row] = await db
          .select({ role: userRoles.role })
          .from(userRoles)
          .where(
            and(
              eq(userRoles.userId, context.userId),
              eq(userRoles.orgId, org.orgId),
              eq(userRoles.role, role),
            ),
          )
          .limit(1);
        if (!row) throw new Error("You do not have permission to perform this action.");
      }
      return next({ context: { ...context, ...org } });
    });
}

/** Authn + org-owner check (membership `is_owner` flag, verified server-side). */
export const requireOrgOwner = createMiddleware({ type: "function" })
  .middleware([requireIdentity])
  .server(async ({ context, next }) => {
    const org = await activeOrgOf(context.userId);
    if (!org) throw new Error("You are not part of an organisation yet.");
    if (!org.isOwner) throw new Error("Only an organisation owner can do this.");
    return next({ context: { ...context, ...org } });
  });

/** Authn + platform super-user allowlist (keyed by verified email, case-insensitive). */
export const requirePlatformAdmin = createMiddleware({ type: "function" })
  .middleware([requireIdentity])
  .server(async ({ context, next }) => {
    const claims = (context.claims ?? {}) as Record<string, unknown>;
    const email = typeof claims["email"] === "string" ? claims["email"].toLowerCase() : undefined;
    if (!email) throw new Error("Your account has no email address.");
    // The allowlist is keyed by email, so the email must be verified — an
    // unverified marker must never match the super-user allowlist.
    if (!emailVerified(claims))
      throw new Error("Verify your email address before using the super-user console.");
    const [row] = await db
      .select({ id: platformAdmins.id })
      .from(platformAdmins)
      .where(eq(platformAdmins.email, email))
      .limit(1);
    if (!row) throw new Error("Super-user access only.");
    return next({ context: { ...context, email } });
  });
