# Mock paths per domain (Dev 2, 2026-11-24)

Every `mock.module("…")` path in the source repo's tests that points into a Dev 2 domain, plus the
shared-infrastructure mocks every domain test transitively depends on. Bun matches mocks **by resolved
path** (brief rule 7), so each path below breaks when either the test file or the mocked file moves, and
a stale mock silently lets tests hit the real DB or AI.

Sweep of the source repo at `SOURCE_SHA` `3d55eb1` (`git grep -h "mock.module(" -- 'scripts/*.test.ts'`):
**25 call sites across 23 test files, 6 distinct paths.** The refactored repo currently adds 3 more
(listed at the end).

## Distinct mock paths

| Mock path                            | Call sites | Post-move owner                     | Phase where it breaks                      |
| ------------------------------------ | ---------: | ----------------------------------- | ------------------------------------------ |
| `../src/lib/ai-gateway.server`       |         19 | `@ats/ai` (Dev 1, Phase 3)          | Phase 3 move; 19 test files to re-point    |
| `../src/lib/assessment.server.ts`    |          1 | `@ats/interviews` (Dev 2, Phase 6)  | Phase 6 `interviews` move                  |
| `../src/server/ai-usage`             |          1 | `@ats/ai` (Dev 1, Phase 3)          | Phase 3 move                               |
| `../src/server/db`                   |          1 | `@ats/db` (already moved, Phase 2)  | Source-repo tests until Phase 5 test moves |
| `../src/server/safe-fetch`           |          1 | `@ats/security` (already moved, L0) | Source-repo tests until Phase 5 test moves |
| `@tanstack/react-start/server-entry` |          2 | framework — never moves             | none                                       |

## The one path into a Dev 2 domain

- `../src/lib/assessment.server.ts` — mocked by `scripts/assessment-timeline.test.ts`.
  `assessment.server` lands in `@ats/interviews` (map §4 L3, Phase 6). When the file moves, this mock
  must switch to the package specifier **and** the test file moves with it, so the relative prefix
  (`../src/…`) changes at the same time. Note the inconsistency: this one mock carries a `.ts`
  extension, the others don't — keep the extension until the move PR rewrites all of them.

## Shared mocks domain tests transitively rely on

These point outside my domains, but domain tests (existing and the ones I add in Days 1–3) depend on
them not silently going stale:

- `../src/server/db` — mocked once (`agent-gateway.test.ts`) with a `{ __dbMockMarker: true }` probe.
  Any new domain test that mocks the DB must mock **the same specifier the code under test imports**;
  after the Phase 2 move the import is the `@ats/db` package, so the relative `src/server/db` form only
  still matches through the shim.
- `../src/lib/ai-gateway.server` — 19 mocks, all in agent tests. Domain cores that call the gateway
  (org-context, matching autoscore, comms templates, …) will need this mock once their tests exist; mock
  the `@ats/ai/server` specifier from Phase 4 onward.
- `../src/server/ai-usage` (ledger write) and `../src/server/safe-fetch` — same rule.

## Refactored repo (current `main`)

- `../../../apps/web/src/lib/ai-gateway.server` (1) — long relative form; breaks at the Phase 3 `ai` move.
- `@aws-sdk/client-s3` (1) — package specifier, move-safe.
- `@tanstack/react-start/server-entry` (1) — framework, move-safe.

## Standing rule for my Days 1–3 test prep

Every new test I add mocks only at today's source paths and asserts the mock is used (Phase 0.4
assertion style). Each new mock I introduce gets appended to the owning package's row in the phase
handoff so the Phase 4/5/6 move PRs re-point it in the same change. Currently I am adding none — the
domain suites I write exercise real cores against `atsagent_test` without mocking, matching the
existing DB-backed test convention (`panel-access.test.ts`).
