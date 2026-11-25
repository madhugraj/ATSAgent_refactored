/**
 * Permanently erasing candidates: applications, match scores, interviews,
 * evaluations, offers, assessments, verifications and social profiles (all
 * cascade), plus the stored CV files. capture_events has a restrictive FK, so
 * its candidate link is cleared first. Storage deletions must actually happen
 * — a failed delete aborts instead of silently orphaning a CV. Callers check
 * who may erase; every id is org-scoped here.
 */
import { and, eq, inArray } from "drizzle-orm";

import { candidates, captureEvents } from "@ats/db/server";
import { db } from "@ats/db/server";
import { emitSubjectsDeleted } from "@ats/kernel/server";
import { deleteObject } from "@ats/storage/server";

export async function eraseCandidatesCore(
  orgId: string,
  candidateIds: string[],
): Promise<{ id: string; fullName: string }[]> {
  if (!candidateIds.length) return [];
  const found = await db
    .select({
      id: candidates.id,
      fullName: candidates.fullName,
      resumeFilePath: candidates.resumeFilePath,
    })
    .from(candidates)
    .where(and(inArray(candidates.id, candidateIds), eq(candidates.orgId, orgId)));
  if (!found.length) return [];
  const ids = found.map((r) => r.id);
  await db
    .update(captureEvents)
    .set({ candidateId: null })
    .where(inArray(captureEvents.candidateId, ids));
  for (const file of found) {
    if (file.resumeFilePath) await deleteObject(file.resumeFilePath);
  }
  await db.delete(candidates).where(and(inArray(candidates.id, ids), eq(candidates.orgId, orgId)));
  // The delete has committed; announce the erasure (map §5 subjects.deleted) to
  // the subscribers registered in the composition root — the agents runtime's
  // stale-request sweep until Phase 7. The payload names the candidates so a
  // subscriber can cascade the erasure into its own records (AGENTS.md
  // training-data invariant) without re-querying the gone rows. A subscriber
  // that throws never fails the erase.
  await emitSubjectsDeleted(
    orgId,
    found.map(({ id, fullName }) => ({ id, fullName })),
  );
  return found.map(({ id, fullName }) => ({ id, fullName }));
}
