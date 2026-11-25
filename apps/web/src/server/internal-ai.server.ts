/**
 * Internal service-to-service auth and tenancy for the Phase 9 Python
 * services (refactor plan Phase 9 rules 2, 3 and 8). The route in
 * routes/api/internal/ai uses this; the platform console rotates tokens
 * through the server functions in lib/platform-service-tokens.functions.ts.
 *
 * - Tokens live in `service_tokens` (added by migration 0092), stored through
 *   encryptSecret so a database dump yields no live credential. The
 *   SERVICE_TOKENS env list bootstraps access before the first rotation.
 * - Comparison is constant-time over every active token (a mismatch on a
 *   short candidate must not leak token length or prefix).
 * - Rotation generates a fresh token, encrypts it, and appends to audit_log.
 * - "AI consent" for an org means the org exists AND has saved its own AI
 *   provider credential (strict BYO-key — ai_provider_credentials). That is
 *   the only opt-in signal the app has; the gateway refuses without a key
 *   anyway, but this check turns that into an explicit refusal instead of a
 *   confusing gateway failure.
 * - In production the /api/internal prefix must not be reachable from the
 *   public load balancer: infra denies /api/internal/* there (Cloud Armor /
 *   BackendConfig — see apps/web/infra/gke/20-ingress.yaml), and the route
 *   refuses any request that carries X-Forwarded-For — an in-cluster caller
 *   connects directly and carries none, anything proxied through the public
 *   LB does. No IP heuristics: clientIp() is "unknown" for the real callers.
 *   Dev and test (NODE_ENV !== production) allow any ingress.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import { aiProviderCredentials, organizations, serviceTokens } from "@db/schema";

import { db } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { writeAudit } from "./audit";

/**
 * The env bootstrap list (comma-separated) accepted before the first rotation.
 * Its feature scope comes from SERVICE_TOKEN_FEATURES (same format) — an empty
 * or missing list authorises no feature at all (review 9a follow-up: allow
 * lists are explicit; empty denies everything). Lifecycle: once every service
 * has a stored token, the operator deletes both env vars — from then on only
 * encrypted `service_tokens` rows authenticate.
 */
function envServiceTokens(): string[] {
  return (process.env["SERVICE_TOKENS"] ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function envServiceTokenFeatures(): string[] {
  return (process.env["SERVICE_TOKEN_FEATURES"] ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function constantTimeMatch(candidates: string[], given: string): boolean {
  const a = Buffer.from(given);
  return candidates.some((t) => {
    const b = Buffer.from(t);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export type ServiceAuth =
  { authorized: false } | { authorized: true; allowedFeatures: string[]; service: string };

/**
 * Resolve `given` against the env bootstrap list and the stored service
 * tokens. allowedFeatures is always an explicit allow-list — an empty list
 * allows no feature — and the route enforces it on every call.
 */
export async function resolveServiceToken(given: string): Promise<ServiceAuth> {
  if (constantTimeMatch(envServiceTokens(), given)) {
    // The env bootstrap token is a dev/first-rotation artifact (deleted after
    // the first stored token); it has no per-service row to name itself from.
    return {
      authorized: true,
      allowedFeatures: envServiceTokenFeatures(),
      service: "env-bootstrap",
    };
  }
  const rows = await db
    .select({
      tokenEncrypted: serviceTokens.tokenEncrypted,
      allowed: serviceTokens.allowedFeatures,
      service: serviceTokens.service,
    })
    .from(serviceTokens);
  const stored = rows.filter((r) => {
    const plain = decryptSecret(r.tokenEncrypted);
    return plain.length > 0 && constantTimeMatch([plain], given);
  });
  if (!stored.length) return { authorized: false };
  const allowed = (stored[0]!.allowed ?? []) as string[];
  return {
    authorized: true,
    allowedFeatures: Array.isArray(allowed) ? allowed : [],
    service: stored[0]!.service,
  };
}

/**
 * The org exists and has opted into AI (its own saved provider credential —
 * strict bring-your own-key). Generic false for both "no such org" and "no
 * consent" so the caller cannot probe which orgs exist.
 */
export async function orgHasAiConsent(orgId: string): Promise<boolean> {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return false;
  const [cred] = await db
    .select({ orgId: aiProviderCredentials.orgId })
    .from(aiProviderCredentials)
    .where(eq(aiProviderCredentials.orgId, orgId))
    .limit(1);
  return Boolean(cred);
}

/**
 * Generate, store (encrypted) and audit a fresh token for `service`. The
 * allow-list restricts which AI_FEATURES slugs the token may call; empty or
 * omitted allows nothing (lists are always explicit). Returns the plaintext once — it is
 * never recoverable from the database again, so the caller must show it to
 * the operator immediately.
 */
export async function rotateServiceToken(input: {
  service: string;
  actorEmail: string;
  actorUserId?: string | null;
  allowedFeatures?: string[];
}): Promise<string> {
  const token = `svc_${randomBytes(32).toString("base64url")}`;
  const encrypted = encryptSecret(token);
  const allowed = input.allowedFeatures ?? [];
  await db
    .insert(serviceTokens)
    .values({
      service: input.service,
      tokenEncrypted: encrypted,
      allowedFeatures: allowed,
      rotatedBy: input.actorUserId ?? null,
    })
    .onConflictDoUpdate({
      target: serviceTokens.service,
      set: {
        tokenEncrypted: encrypted,
        allowedFeatures: allowed,
        rotatedAt: new Date(),
        rotatedBy: input.actorUserId ?? null,
      },
    });
  await writeAudit({
    actor: input.actorEmail,
    actorUserId: input.actorUserId ?? null,
    action: "internal.service_token.rotated",
    entityType: "service_token",
    entityId: input.service,
    detail: { service: input.service, allowedFeatures: allowed },
  });
  return token;
}

/**
 * In production, /api/internal is only legitimate from direct in-cluster
 * callers — those carry no X-Forwarded-For; anything that passed the public
 * load balancer does. (Review 9a B1: no IP heuristics — clientIp() is
 * "unknown" for the real callers, so an IP check 404s the services it is
 * meant to protect.)
 */
export function internalIngressAllowed(request: Request): boolean {
  if (process.env["NODE_ENV"] !== "production") return true;
  return request.headers.get("x-forwarded-for") === null;
}
