/**
 * Meeting-link core (map §11 ruling 2): the org-scoped provider lookup and
 * meeting creation shared by the Interviews page's server function and the
 * interview coordinator agent. Exported only from ./server (which carries the
 * server-only marker) without a createServerOnlyFn wrapper; the app's
 * meetings.functions.ts keeps the createServerFn wrapper and its requireOrg
 * middleware unchanged and delegates here.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, sourceIntegrations } from "@ats/db/server";
import { readSecrets } from "@ats/org/server";

import { createMeeting } from "./meetings.server";

export const CreateInput = z.object({
  provider: z.enum(["zoom", "google_meet", "teams"]),
  topic: z.string().min(1).max(200),
  startIso: z.string().min(1),
  durationMins: z.number().min(15).max(240),
  attendees: z.array(z.string().email()).max(20).default([]),
  agenda: z.string().max(2000).optional().nullable(),
});

/** Create a real meeting with the HR user's own provider credentials. */
/** Shared by the Interviews page and the Interview coordinator agent. */
export async function createMeetingLinkCore(orgId: string, data: z.infer<typeof CreateInput>) {
  const [row] = await db
    .select({
      id: sourceIntegrations.id,
      enabled: sourceIntegrations.enabled,
      hasCredentials: sourceIntegrations.hasCredentials,
      label: sourceIntegrations.label,
    })
    .from(sourceIntegrations)
    .where(and(eq(sourceIntegrations.orgId, orgId), eq(sourceIntegrations.provider, data.provider)))
    .limit(1);
  if (!row) throw new Error("That meeting provider is not set up yet.");
  if (!row.enabled || !row.hasCredentials)
    throw new Error(
      `${row.label} is not connected — add the credentials on the Integrations page first.`,
    );

  const secrets = await readSecrets(row.id);
  return createMeeting(data.provider, secrets, {
    topic: data.topic,
    startIso: data.startIso,
    durationMins: data.durationMins,
    attendees: data.attendees,
    agenda: data.agenda ?? null,
  });
}
