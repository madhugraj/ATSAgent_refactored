/**
 * Collaboration query helpers (app .server module; no client surface).
 * Extracted from collaboration.functions so the respondReferral existence
 * check is testable structurally (drizzle .toSQL()) without executing the
 * server function (Phase 4 acceptance criterion, PR #52 review).
 */
import { and, eq } from "drizzle-orm";

import { db, applications } from "@ats/db/server";

/** The respondReferral accept branch's duplicate-pair lookup, org-scoped:
 *  an application in ANOTHER org for the same (candidateId, requisitionId)
 *  must never suppress the insert (AGENTS.md: every query filtered by org). */
export function findExistingApplicationForPair(
  orgId: string,
  candidateId: string,
  requisitionId: string,
) {
  return db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.orgId, orgId),
        eq(applications.candidateId, candidateId),
        eq(applications.requisitionId, requisitionId),
      ),
    )
    .limit(1);
}
