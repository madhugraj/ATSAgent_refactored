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
