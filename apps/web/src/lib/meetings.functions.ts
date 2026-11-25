import { and, asc, eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";

import { db } from "../server/db";
import { sourceIntegrations } from "@db/schema";
import { requireOrg } from "./auth.middleware";
// Meeting-link core (map §11 ruling 2): lives in @ats/integrations/server,
// exported only from its server entry; the createServerFn wrappers below keep
// their middleware unchanged and delegate to it.
import { CreateInput, createMeetingLinkCore } from "@ats/integrations/server";

export type MeetingProviderRow = {
  id: string;
  provider: "zoom" | "google_meet" | "teams";
  label: string;
  enabled: boolean;
  ready: boolean;
  last_test_status: string;
};

/** Meeting providers the HR admin has configured on the Integrations page. */
export const meetingProviders = createServerFn({ method: "GET" })
  .middleware([requireOrg])
  .handler(async ({ context }): Promise<MeetingProviderRow[]> => {
    const rows = await db
      .select({
        id: sourceIntegrations.id,
        provider: sourceIntegrations.provider,
        label: sourceIntegrations.label,
        enabled: sourceIntegrations.enabled,
        hasCredentials: sourceIntegrations.hasCredentials,
        lastTestStatus: sourceIntegrations.lastTestStatus,
      })
      .from(sourceIntegrations)
      .where(
        and(
          eq(sourceIntegrations.orgId, context.orgId),
          eq(sourceIntegrations.category, "meeting"),
        ),
      )
      .orderBy(asc(sourceIntegrations.label));
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider as MeetingProviderRow["provider"],
      label: r.label,
      enabled: r.enabled,
      ready: r.enabled && r.hasCredentials,
      last_test_status: r.lastTestStatus,
    }));
  });

// Same file name and export names as before the move; the core now lives in
// @ats/integrations/server (ruling 2) and this re-export keeps the old import
// surface for callers that reach it through this file.
export { createMeetingLinkCore };

/** Create a real meeting with the HR user's own provider credentials. */
export const createMeetingLink = createServerFn({ method: "POST" })
  .middleware([requireOrg])
  .validator((data: unknown) => CreateInput.parse(data))
  .handler(async ({ data, context }) => createMeetingLinkCore(context.orgId, data));
