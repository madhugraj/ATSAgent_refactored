/**
 * Board webhook token rotation core (inline-server-fns, distribution): the
 * bodies of the app's boardWebhookSetup / boardWebhookUrl server functions,
 * extracted verbatim. The app's boards.functions.ts keeps the createServerFn
 * wrappers, their middleware and every export name, and delegates here.
 */
import { and, eq } from "drizzle-orm";

import { writeAudit } from "@ats/audit/server";
import { env } from "@ats/config/server";
import { db, sourceIntegrations } from "@ats/db/server";
import { decryptSecret, encryptSecret } from "@ats/security/server";

/** Rotate the per-connection webhook delivery token (captured in the audit trail). */
export async function boardWebhookSetupCore(input: {
  orgId: string;
  actor: { memberEmail: string; userId: string };
  provider: "linkedin" | "indeed" | "naukri";
}): Promise<{ webhookUrl: string }> {
  const [row] = await db
    .select({ id: sourceIntegrations.id })
    .from(sourceIntegrations)
    .where(
      and(
        eq(sourceIntegrations.orgId, input.orgId),
        eq(sourceIntegrations.provider, input.provider),
      ),
    )
    .limit(1);
  if (!row) throw new Error(`${PROVIDER_LABEL[input.provider]} is not on the Integrations page.`);

  const { randomBytes, createHash } = await import("node:crypto");
  const token = randomBytes(24).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  await db
    .update(sourceIntegrations)
    .set({
      webhookToken: encryptSecret(token),
      webhookTokenHash: hash,
      webhookConfiguredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(sourceIntegrations.id, row.id), eq(sourceIntegrations.orgId, input.orgId)));

  await writeAudit({
    actor: input.actor.memberEmail,
    orgId: input.orgId,
    actorUserId: input.actor.userId,
    action: "board.webhook.rotate",
    entityType: "integration",
    entityId: row.id,
    detail: { provider: input.provider },
  });

  const base = env.PUBLIC_SITE_URL.replace(/\/$/, "");
  return { webhookUrl: `${base}/api/public/boards/${input.provider}/${token}` };
}

/**
 * The current webhook URL for one board, decrypted server-side. The token in
 * it is a delivery credential — callers are role-checked and it only ever
 * returns to the org's own admins.
 */
export async function boardWebhookUrlCore(
  orgId: string,
  provider: "linkedin" | "indeed" | "naukri",
): Promise<{ webhookUrl: string | null; configuredAt: string | null }> {
  const [row] = await db
    .select({
      webhookToken: sourceIntegrations.webhookToken,
      webhookConfiguredAt: sourceIntegrations.webhookConfiguredAt,
    })
    .from(sourceIntegrations)
    .where(and(eq(sourceIntegrations.orgId, orgId), eq(sourceIntegrations.provider, provider)))
    .limit(1);
  if (!row?.webhookToken) return { webhookUrl: null, configuredAt: null };
  const base = env.PUBLIC_SITE_URL.replace(/\/$/, "");
  return {
    webhookUrl: `${base}/api/public/boards/${provider}/${decryptSecret(row.webhookToken)}`,
    configuredAt: row.webhookConfiguredAt ? row.webhookConfiguredAt.toISOString() : null,
  };
}

const PROVIDER_LABEL: Record<"linkedin" | "indeed" | "naukri", string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  naukri: "Naukri",
};
