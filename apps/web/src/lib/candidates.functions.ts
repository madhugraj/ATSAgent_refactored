import { poolUseFor } from "./job-channels";
import { eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db } from "../server/db";
import { candidates, users } from "@db/schema";
import { assertRole, requireOrg } from "./auth.middleware";

/**
 * Permanently delete candidates and everything attached to them:
 * applications, match scores, interviews, evaluations, offers, assessments,
 * verifications, social profiles (all cascade), plus the stored CV files.
 * capture_events has a restrictive FK, so its candidate link is cleared first.
 */
export const deleteCandidates = createServerFn({ method: "POST" })
  .middleware([requireOrg])
  .validator((data) =>
    z.object({ candidateIds: z.array(z.string().uuid()).min(1).max(100) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    // Deletion is rare and destructive — HR head or above only.
    await assertRole(
      context.userId,
      context.orgId,
      ["hr_head", "president_cbo"],
      "Only the HR head or the CBO can delete candidates.",
    );
    // Org predicate everywhere: an id from another tenant simply does not match.
    const { eraseCandidatesCore } = await import("@ats/candidates/server");
    const found = await eraseCandidatesCore(context.orgId, data.candidateIds);
    if (found.length === 0)
      throw new Error("No matching candidates found — they may already be deleted.");

    return { deleted: found.length, names: found.map((r) => r.fullName).slice(0, 5) };
  });

/**
 * Attach a talent-pool candidate to a requisition's pipeline (the "Add to
 * pipeline" suggestion on the dashboard). Org comes from the caller's verified
 * context, and both the requisition and the candidate must belong to it — a
 * cross-tenant id simply is not found.
 */
export const attachApplication = createServerFn({ method: "POST" })
  .middleware([requireOrg])
  .validator((data: unknown) =>
    z
      .object({
        requisitionId: z.string().uuid(),
        candidateId: z.string().uuid(),
        source: z.string().min(1).max(60).default("talent_pool"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const [me] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, context.userId))
      .limit(1);
    // The core re-checks the requisition in-org and the candidate in-org and
    // runs assertReusable itself (stage-writers §9) — no entryStage (the DB
    // default "applied" applies) and no skipReusable.
    const { addApplicationsCore } = await import("./pipeline.server");
    const { added } = await addApplicationsCore(
      { orgId: context.orgId, userId: context.userId, memberEmail: me?.email ?? "" },
      { requisitionId: data.requisitionId, candidateIds: [data.candidateId], source: data.source },
    );
    // The (requisition_id, candidate_id) unique index kept repeat attaches
    // out with a raw insert error; the core instead skips duplicates silently.
    // The UI surfaces handler errors as toasts (routes/index.tsx
    // addToPipeline), so a silent skip would show a success toast — keep the
    // throw, with the same text the index raised.
    if (added === 0)
      throw new Error(
        'duplicate key value violates unique constraint "applications_requisition_candidate_key"',
      );
    return { ok: true as const };
  });

// Bounded like the public apply path (apply.functions.ts): an org member can
// still persist garbage, but not an unbounded row that later rides into every
// AI prompt that loads the candidate (2026-11 audit N-6).
const CreateCandidateInput = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().min(1).max(320),
  location: z.string().max(200),
  experienceYears: z.string().max(20),
  education: z.string().max(2000),
  skills: z.string().max(4000),
  linkedinUrl: z.string().max(500),
  githubUrl: z.string().max(500),
  websiteUrl: z.string().max(500),
  xUrl: z.string().max(500),
  source: z.string().min(1).max(60),
  currentEmployer: z.string().max(200),
  noticePeriodDays: z.string().max(20),
  currentCtc: z.string().max(50),
  expectedCtc: z.string().max(50),
  workAuthorization: z.string().max(100),
  willingToRelocate: z.enum(["yes", "no", "unknown"]),
  resumeText: z.string().max(60000),
  requisitionId: z.string().uuid().nullish(),
});

/**
 * Recruiter "add candidate" flow: create the talent-pool record (org from the
 * caller's context), optionally attaching it to a requisition at stage
 * "sourced". The legacy client ignored application-attach failures, so they
 * stay non-fatal.
 */
export const createCandidate = createServerFn({ method: "POST" })
  .middleware([requireOrg])
  .validator((data: unknown) => CreateCandidateInput.parse(data))
  .handler(async ({ data, context }) => {
    const [row] = await db
      .insert(candidates)
      .values({
        orgId: context.orgId,
        fullName: data.fullName,
        email: data.email,
        location: data.location || null,
        experienceYears: String(Number(data.experienceYears) || 0),
        education: data.education || null,
        skills: data.skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        linkedinUrl: data.linkedinUrl || null,
        githubUrl: data.githubUrl || null,
        websiteUrl: data.websiteUrl || null,
        xUrl: data.xUrl || null,
        source: data.source,
        // A CV a portal handed over may be limited to its role (job-channels.ts).
        poolUse: poolUseFor(data.source),
        poolUseSource: poolUseFor(data.source) === "role_only" ? data.source : null,
        currentEmployer: data.currentEmployer || null,
        noticePeriodDays: data.noticePeriodDays ? Number(data.noticePeriodDays) : null,
        currentCtc: data.currentCtc ? String(Number(data.currentCtc)) : null,
        expectedCtc: data.expectedCtc ? String(Number(data.expectedCtc)) : null,
        workAuthorization: data.workAuthorization || null,
        willingToRelocate:
          data.willingToRelocate === "unknown" ? null : data.willingToRelocate === "yes",
        resumeText: data.resumeText || null,
      })
      .returning({ id: candidates.id });
    if (!row) throw new Error("Could not save the candidate");

    if (data.requisitionId) {
      const { assertRequisitionInOrg } = await import("../server/guards");
      await assertRequisitionInOrg(data.requisitionId, context.orgId);
      try {
        // skipReusable BY DESIGN (stage-writers §9): the requisition IS the
        // role this portal CV was captured for — assertReusable must not
        // reject the CV's own originating requisition.
        const { addApplicationsCore } = await import("./pipeline.server");
        const [me] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, context.userId))
          .limit(1);
        await addApplicationsCore(
          { orgId: context.orgId, userId: context.userId, memberEmail: me?.email ?? "" },
          {
            requisitionId: data.requisitionId,
            candidateIds: [row.id],
            source: data.source,
            entryStage: "sourced",
            skipReusable: true,
          },
        );
      } catch (e) {
        console.error("[createCandidate] could not attach the application:", e);
      }
    }
    return { id: row.id };
  });
