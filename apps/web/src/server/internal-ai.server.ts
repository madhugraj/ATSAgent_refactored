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
 * - In production the /api/internal prefix must only be reachable over
 *   internal ingress (Cloud Run ingress=internal / GKE internal LB): requests
 *   whose client IP is public never arrive through those paths, so a public
 *   client IP here is either a misconfigured ingress or a bypass attempt —
 *   both get a bare 404. Dev and test (NODE_ENV !== production) allow any IP.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import { aiProviderCredentials, organizations, serviceTokens } from "@db/schema";

import { db } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { clientIp } from "./client-ip";
import { writeAudit } from "./audit";

/** The env bootstrap list (comma-separated) accepted before the first rotation. */
function envServiceTokens(): string[] {
  return (process.env["SERVICE_TOKENS"] ?? "")
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

/** True when `given` matches the env bootstrap list or a stored service token. */
export async function serviceTokenAuthorized(given: string): Promise<boolean> {
  if (constantTimeMatch(envServiceTokens(), given)) return true;
  const rows = await db
    .select({ tokenEncrypted: serviceTokens.tokenEncrypted })
    .from(serviceTokens);
  const stored = rows.map((r) => decryptSecret(r.tokenEncrypted)).filter(Boolean);
  return constantTimeMatch(stored, given);
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
 * Generate, store (encrypted) and audit a fresh token for `service`. Returns
 * the plaintext once — it is never recoverable from the database again, so
 * the caller must show it to the operator immediately.
 */
export async function rotateServiceToken(input: {
  service: string;
  actorEmail: string;
  actorUserId?: string | null;
}): Promise<string> {
  const token = `svc_${randomBytes(32).toString("base64url")}`;
  const encrypted = encryptSecret(token);
  await db
    .insert(serviceTokens)
    .values({
      service: input.service,
      tokenEncrypted: encrypted,
      rotatedBy: input.actorUserId ?? null,
    })
    .onConflictDoUpdate({
      target: serviceTokens.service,
      set: {
        tokenEncrypted: encrypted,
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
    detail: { service: input.service },
  });
  return token;
}

/** IPv4 private/loopback/link-local/CGNAT and IPv6 loopback/unique-local. */
const PRIVATE_CLIENT =
  /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|[fF][cCdD]|localhost$)/;

/** In production, /api/internal is only legitimate from internal ingress. */
export function internalIngressAllowed(request: Request): boolean {
  if (process.env["NODE_ENV"] !== "production") return true;
  return PRIVATE_CLIENT.test(clientIp(request));
}
