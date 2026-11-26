import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireOrg } from "./auth.middleware";
import { STAGE_LABEL, type Stage } from "./lifecycle";

const STAGES = Object.keys(STAGE_LABEL) as [Stage, ...Stage[]];

const MoveInput = z.object({
  applicationId: z.string().uuid(),
  toStage: z.enum(STAGES),
  reason: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

/**
 * The only sanctioned way to change an application's stage: the transition is
 * validated server-side, HR-controlled stages require the HR head (or owner),
 * and an immutable stage_event is written for the audit trail. The UI never
 * updates `applications.stage` directly.
 */
export const moveStage = createServerFn({ method: "POST" })
  .middleware([requireOrg])
  .validator((data: unknown) => MoveInput.parse(data))
  .handler(async ({ data, context }) => {
    const { moveStageCore } = await import("./pipeline.server");
    const r = await moveStageCore(
      { orgId: context.orgId, userId: context.userId, memberEmail: context.memberEmail },
      {
        applicationId: data.applicationId,
        toStage: data.toStage,
        reason: data.reason ?? null,
        note: data.note ?? null,
      },
    );
    return { ok: true as const, ...r };
  });

/** Same validation, applied to a selection from the talent pool table. */
export const moveStages = createServerFn({ method: "POST" })
  .middleware([requireOrg])
  .validator((data: unknown) =>
    z
      .object({
        applicationIds: z.array(z.string().uuid()).min(1).max(200),
        toStage: z.enum(STAGES),
        reason: z.string().optional().nullable(),
        note: z.string().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Rejecting several candidates at once needs a fresh password (step-up).
    // Request-context only — the core is deliberately free of it (§7).
    if (data.toStage === "rejected" && data.applicationIds.length > 1) {
      const { assertStepUp } = await import("../server/step-up");
      const { getRequest } = await import("@tanstack/react-start/server");
      await assertStepUp(context.userId, getRequest());
    }

    // Role gate (HR-controlled targets), the reason rule, the per-row
    // canMove/screening checks, the bulk column write and the one batched
    // journal all live in the core; skipped/blocked rows are counted, not
    // thrown, so the UI keeps its {moved, blocked} partial-success shape.
    const { moveStagesCore } = await import("./pipeline.server");
    return moveStagesCore(
      { orgId: context.orgId, userId: context.userId, memberEmail: context.memberEmail },
      {
        applicationIds: data.applicationIds,
        toStage: data.toStage,
        reason: data.reason ?? null,
        note: data.note ?? null,
      },
    );
  });
