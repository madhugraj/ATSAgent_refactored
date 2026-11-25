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
  // Agent requests about these candidates' applications can no longer be decided.
  // SHIM(upward): interim import of the app's agents runtime, moved verbatim
  // (map §5 subjects.deleted: this becomes a kernel `subjects.deleted` emit +
  // boot-registered subscriber in the follow-up change PR, not in this move).
  // Relative interim so the alias ratchet (scripts/alias-ratchet.test.ts) is
  // not consumed; resolved by that change PR.
  const { afterSubjectsDeleted } =
    await import("../../../../apps/web/src/server/agents/runtime.server");
  await afterSubjectsDeleted(orgId);
  return found.map(({ id, fullName }) => ({ id, fullName }));
}
