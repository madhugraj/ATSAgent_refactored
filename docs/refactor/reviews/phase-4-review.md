# Phase 4 review: L2 shared services (combined)

- **Reviewed:** refactored `main` @ `2756626`, with every Phase 4 PR merged: #23 (`desk-core`, `org`), #20 (sync `bca8574`), #21 (`legal`), #28 and #32 (`comms`), #34 (`integrations`), #35 (Gate 4 e2e), #36 (handoff)
- **Reviewer:** Claude, fresh checkout with its own install and a fresh DB
- **Date:** 2026-11-25
- **Verdict:** **PHASE 4 SIGNED OFF**, with one tracking condition (T1). Phase 5 may start.

## Gate 4, re-run on merged `main`

| Check                                                                                                 | Result                                       |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| install, `turbo typecheck --force`, lint (0 errors), prettier, table owners                           | ✅                                           |
| migrations (fresh DB)                                                                                 | ✅ 100 applied                               |
| depcruise                                                                                             | ✅ 106 / 106                                 |
| package tests (turbo) and every test file one process each                                            | ✅ **114 files, 1,508 pass, 0 fail**         |
| `agents:lock`, `turbo build --force`                                                                  | ✅                                           |
| worker boot smoke (web, voice, parser without `node_modules`)                                         | ✅                                           |
| **dev server boots** (`vite dev`)                                                                     | ✅ `/terms` 200, zero `ERR_MODULE_NOT_FOUND` |
| Gate 4 behaviour: desk ordering (#23); inbound CV mail end-to-end, including duplicate delivery (#35) | ✅                                           |

The individual verdicts are on record: #21, #28, #32 and #34 (in the messages to Dev 2), and #23 and #20 (`phase-4a-9a-8prep-review.md`).

**A real bug was found and fixed source-first:** inbound mail dedupe was dead since drizzle 0.45 (madhugraj/ATSAgent#108). It ships in Wednesday's production release.

## Ratchet note

`WARN_MAX` is 106 = 89 + 17 temporary #87/#90 edges. That's above the ~96 estimated in the #20 ruling, but each of the 17 is a sync edge listed in map §10 and resolved in Phase 7, so it's **accepted**. It can't go up again without a new reviewer ruling.

## T1. Track the remaining upward `@/` imports from packages into the app

Six package files still import app code (L3/L4) through the `@/` alias. They work, because Vite maps `@` globally and package tsconfigs map it too, but they are layer inversions:

| Package file                                              | Imports                          | Resolves in                                           |
| --------------------------------------------------------- | -------------------------------- | ----------------------------------------------------- |
| `ai/server/redteam/check.server.ts:135`                   | `@/lib/screening.server`         | Phase 5 (candidates/screening)                        |
| `observability/server/alerts.server.ts:346`               | `@/lib/agents.catalog`           | Phase 7 (agents), or inject the label map at boot now |
| `org/server/org-context.server.ts:149`                    | `@/lib/labour-policy.server`     | Phase 6 (offers)                                      |
| `org/server/org-context.server.ts:896`                    | `@/lib/cv-text.server`           | Phase 5 (candidates)                                  |
| `integrations/server/meeting-transcripts.server.ts:26-27` | `@/lib/meeting-ref`, `@/lib/vtt` | Phase 6 (interviews)                                  |

**Required by Gate 5 (Dev 1, shared-file owner):**

1. Mark each line `// SHIM(upward): resolve in Phase N`.
2. Add a CI ratchet: count `@/` and `@db/` imports under `packages/**/src`, fail if the count goes above **6**, and lower it as each one is resolved.
3. Phase 8's exit criterion is **0**.

## Phase 5 readiness

- The acceptance specs are waiting on `test/p5-core-specs` (Dev 1).
- The suites are on source `main` (#96, 391 tests).
- `stage-writers.md` gives the order: core extensions first, then each writer re-pointed, removing its `KNOWN_STAGE_WRITERS` entry in the same PR.
- **Go.**
