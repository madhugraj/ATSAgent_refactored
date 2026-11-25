/**
 * The generic integration credential store (map §4 L2, org): secrets live in
 * the integration_credentials table, which is never read or written through
 * any client-facing surface — only the requireOrg-gated server functions in
 * the app's integrations.functions.ts and the provider modules reach it.
 * Values at rest are encryptSecret ciphertext (@ats/security); nothing here
 * knows a provider — that stays with the integrations code (Dev 2's package).
 */
import { eq } from "drizzle-orm";

import { db, integrationCredentials } from "@ats/db/server";
import { decryptSecret, encryptSecret } from "@ats/security/server";
import { env } from "@ats/config/server";

/**
 * Integration base URLs are org-member-supplied and the server attaches stored
 * credentials to requests against them — so the host must be https and must be
 * an approved job-board partner domain, or the endpoint becomes an
 * authenticate-and-reflect SSRF. Moved here from the app's integrations.server
 * with the credential store (map §11 ruling 10; the distribution boards assert
 * it via @ats/org/server).
 */
const DEFAULT_INTEGRATION_HOSTS = [
  "api.naukri.com",
  "www.naukri.com",
  "api.indeed.com",
  "providers.indeed.com",
];

export type IntegrationConfig = Record<string, string | number | boolean | null>;

export function assertIntegrationBaseUrl(rawBaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new Error("The API base URL is not a valid URL.");
  }
  if (url.protocol !== "https:") throw new Error("The API base URL must use https.");
  const extra = (env.INTEGRATION_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set([...DEFAULT_INTEGRATION_HOSTS, ...extra]);
  const host = url.hostname.toLowerCase();
  if (!allowed.has(host) && ![...allowed].some((a) => host.endsWith(`.${a}`))) {
    throw new Error("That API base URL is not an approved partner endpoint.");
  }
  if (url.username || url.password) throw new Error("Credentials in URLs are not allowed.");
  return url.toString().replace(/\/$/, "");
}

export async function readSecrets(integrationId: string): Promise<Record<string, string>> {
  const [row] = await db
    .select({ secrets: integrationCredentials.secrets })
    .from(integrationCredentials)
    .where(eq(integrationCredentials.integrationId, integrationId))
    .limit(1);
  const stored = (row?.secrets as Record<string, string> | undefined) ?? {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(stored)) out[k] = decryptSecret(v);
  return out;
}

export async function writeSecrets(integrationId: string, patch: Record<string, string>) {
  const current = await readSecrets(integrationId);
  const merged = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    // An empty string means "leave the stored value alone".
    if (v.trim().length > 0) merged[k] = encryptSecret(v.trim());
  }
  await db
    .insert(integrationCredentials)
    .values({ integrationId, secrets: merged, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: integrationCredentials.integrationId,
      set: { secrets: merged, updatedAt: new Date() },
    });
  return Object.keys(merged);
}

export async function clearSecrets(integrationId: string) {
  await db
    .delete(integrationCredentials)
    .where(eq(integrationCredentials.integrationId, integrationId));
}
