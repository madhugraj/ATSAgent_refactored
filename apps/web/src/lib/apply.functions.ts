/**
 * Public job-application intake — createServerFn wrappers (map §11 ruling 2
 * precedent): the cores live in @ats/distribution/server
 * (packages/distribution/src/server/apply.server.ts); the wrappers keep this
 * file name, every export name and no middleware (the public apply path is
 * intentionally unauthenticated — scoping happens inside the core).
 *
 * Every post, feed and portal listing carries the role's apply link, tagged
 * with where it was shared (?src=). Anyone who taps it lands on
 * /apply/<requisition>, uploads a CV, and the CV is parsed and filed into the
 * talent pool plus this requisition's pipeline automatically, recorded under
 * that source — no recruiter download step.
 */
import { createServerFn } from "@tanstack/react-start";

import {
  publicJobCore,
  submitApplicationImpl,
  SubmitInput,
  type PublicJob,
} from "@ats/distribution/server";
import { z } from "zod";

const IdInput = z.object({ requisitionId: z.string().uuid() });

export type { PublicJob };

/** Job summary an applicant is allowed to see. Nothing commercial is exposed. */
export const publicJob = createServerFn({ method: "GET" })
  .validator((data: unknown) => IdInput.parse(data))
  .handler(async ({ data }): Promise<PublicJob | null> => publicJobCore(data.requisitionId));

/**
 * Parse an applicant's CV and file it against the requisition. Scoping is
 * strictly per-organisation: the talent-pool match and the application both
 * live inside the requisition's org, and an existing record is never rewritten
 * by this unauthenticated endpoint.
 */
export const submitApplication = createServerFn({ method: "POST" })
  .validator((data: unknown) => SubmitInput.parse(data))
  .handler(async ({ data }) => submitApplicationImpl(data));

/** Handler body, exported for integration tests of the C2 overwrite-protection fix. */
export { submitApplicationImpl };
