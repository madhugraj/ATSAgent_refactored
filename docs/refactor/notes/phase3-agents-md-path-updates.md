# AGENTS.md path updates for Phase 10 (cut-over)

AGENTS.md still references source-repo paths. Phase 10 rewrites them; collect every moved path here as
packages land, so the cut-over edits are one list. (Phase 3: @ats/ai — this file; other Phase 3 packages
append their own section.)

## @ats/ai (Phase 3, package 3)

| AGENTS.md says (old path)                                                                              | Now lives at                                                            |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `src/lib/ai-gateway.server.ts` (aiJson / aiResearchJson / aiAgentStep, `untrusted`, `INJECTION_RULES`) | `packages/ai/src/server/ai-gateway.server.ts` — import `@ats/ai/server` |
| `src/server/ai-usage.ts` (`AI_FEATURES`, `recordAiUsage`, the `ai_usage_events` ledger)                | `packages/ai/src/server/ai-usage.ts`                                    |
| `src/server/ai-pricing.ts`                                                                             | `packages/ai/src/server/ai-pricing.ts`                                  |
| `src/server/ai-spend-cap.ts`                                                                           | `packages/ai/src/server/ai-spend-cap.ts`                                |
| `src/lib/prompt-echo.ts`                                                                               | `packages/ai/src/server/prompt-echo.ts`                                 |
| `src/server/training/capture.server.ts` (`captureFeedback`)                                            | `packages/ai/src/server/training/capture.server.ts`                     |
| `src/server/training/pseudonymise.ts`                                                                  | `packages/ai/src/server/training/pseudonymise.ts`                       |
| `src/server/redteam/` (check.server.ts, probes.ts)                                                     | `packages/ai/src/server/redteam/`                                       |
| `src/server/agents/context.ts` (run / AI-subject scopes)                                               | `packages/ai/src/server/context.ts`                                     |
| `src/server/agents/injection.ts` (`looksLikeInjection`)                                                | `packages/ai/src/server/injection.ts`                                   |

Until Phase 8, every old path is a one-line shim (`export * from "@ats/ai/server"`), so the AGENTS.md
sentences stay true through the intermediate phases; only the paths change at cut-over.

## @ats/kernel (Phase 3, package 4)

| AGENTS.md says (old path)                                                       | Now lives at                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/server/agents/events.ts` (`emitAgentEvent`)                                | `packages/kernel/src/server/events.ts` — import `@ats/kernel/server` |
| `src/server/agents/policy.ts` (autonomy policy, `decideToolCall`)               | `packages/kernel/src/server/policy.ts`                               |
| `src/server/agents/registry.ts` (agent/tool registry, the approve/hire refusal) | `packages/kernel/src/server/registry.ts`                             |
| `src/server/agents/manifest.server.ts` (manifest hash, `ensureDefinition`)      | `packages/kernel/src/server/manifest.server.ts`                      |
| `src/server/agents/task-liveness.ts` (`taskIsLive`, `subjectGone`)              | `packages/kernel/src/server/task-liveness.ts`                        |
| `src/server/agents/hitl.ts` (`HITL_TOOLS`)                                      | `packages/kernel/src/server/hitl.ts`                                 |
| `src/server/agents/run-messages.ts` (`LEG_LIMIT_MESSAGE`, …)                    | `packages/kernel/src/server/run-messages.ts`                         |

Two deliberate text changes (the map §5 cycle fix, this package's change PR):

- `events.ts` no longer dynamically imports the orchestrator: `emitAgentEvent` inserts the row (identical
  fields, same ordering) and calls only handlers registered with `onAgentEvent(handler)`. The inline kick is
  registered in `apps/web/src/boot.ts` (new composition root, imported first thing by `apps/web/src/server.ts`)
  as `onAgentEvent((e) => kickAgents(e.orgId))` — the app's guards in `kickAgents` (test env,
  `AGENT_INLINE_KICK=0`) are unchanged, so the voice worker's own entry (which never imports boot) behaves
  exactly as before. AGENTS.md's "emitAgentEvent" sentences stay true.
- New `packages/kernel/src/server/ports.ts`: `AgentPort {enqueue, cancelStale, afterSubjectsDeleted, kick}` and
  the `onDomainEvent` / `onSubjectsDeleted` registries — registration API only; implementations register in
  boot in later phases.

Until Phase 8, every old path is a one-line shim (`export * from "@ats/kernel/server"`), so the AGENTS.md
sentences stay true through the intermediate phases; only the paths change at cut-over.
