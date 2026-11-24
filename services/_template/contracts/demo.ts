/**
 * Demo contract for the Phase 9 contract tooling (tools/contracts/generate.mjs).
 *
 * Contracts are authored as zod schemas (refactor plan Phase 9 rule 5): the TS
 * side validates with this exact schema, and the generator emits its Pydantic
 * twin into the service's `app/contracts_gen/`. Generated files are committed;
 * CI fails when they drift.
 *
 * The shape is the bias-report request the analytics-ml service will serve in
 * 9b (scripts/bias-report.ts is the TS implementation being replaced).
 */
import { z } from "zod";

export const BiasReportRequest = z.object({
  orgId: z.string().uuid(),
  applicationId: z.string().uuid(),
  window: z.object({
    from: z.iso.date(),
    to: z.iso.date(),
  }),
});
