# Refactor phase log

Baseline (`SOURCE_SHA`): `ca7599c` — merge of PR #80 (`chore/p0-fixes`), 2026-11-23, CI green.

**Pre-Phase-0 merge (2026-11-23):** `main` is at `39ce992` (CI green). Merged: #76 offer stage events, #77 scorecard
docs, #67 UI dedup, #65 agent review loop, #64 cost tokens, #73 nav hubs, #74 alert digest (includes #75 email
branding, stacked on it), #68 appearance, #69 workflow chat (stacked on `feat/agent-intelligence`, landed via #78).
**Not merged:** Dependabot #63 and #59 (CI failing). Phase 0 starts from `39ce992`. Re-run `scripts/refactor/graph.mjs`
there, because the map was built at `7990feb` and #69 alone added about 54k lines (workflows, pay terms, labour policy, Voice Guard,
org ontology, ~20 migrations).

Phase 0 notes found during the merge:

- `scripts/agent-interview-slots.test.ts` is **flaky** (an email-outbox race: "sent" vs "suppressed", missing mail row).
  It fails intermittently on `main` too. Fix the race in Phase 0 (add it to 0.4).
- The pre-commit formatter rewrites generated docs. `docs/voice-agents-charter.md` is now in `.prettierignore`. Check
  `docs/er-diagram.md` and `docs/voice-scheduling-call-plan.md` too.
- Migration numbers repeat (0046, 0058, 0069, 0070 each have two files). This works, because `migrate-pg.mjs` tracks file names, but the
  ordering on a fresh DB differs from production. Keep both, and document it.
- A hydration warning appears on every page in dev (probably the theme/text-size setting read on the client). Not investigated.

| Phase        | Branch / PRs                                                                                    | Packages touched | Gate                                                                                                            | Reviewer sign-off                                                                                                                                           | Date       |
| ------------ | ----------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 0            | `fix/offer-stage-events` (madhugraj/ATSAgent#76) + `chore/p0-fixes` (**#80**, merged `ca7599c`) | source repo      | Gate 0: pass 2026-11-23 (typecheck ✓, lint 0 errors ✓, 89 files / 1367 tests / 0 fail ✓, agents:lock no diff ✓) | **Signed off 2026-11-23** (Claude; independent re-run at `ca7599c`: 89 files / 1,367 pass / 0 fail). See `reviews/phase-0-review.md`; R1 due before Phase 2 | 2026-11-23 |
| 1            |                                                                                                 |                  |                                                                                                                 |                                                                                                                                                             |            |
| 2            |                                                                                                 |                  |                                                                                                                 |                                                                                                                                                             |            |
| 3            |                                                                                                 |                  |                                                                                                                 |                                                                                                                                                             |            |
| 4            |                                                                                                 |                  |                                                                                                                 |                                                                                                                                                             |            |
| 5            |                                                                                                 |                  |                                                                                                                 |                                                                                                                                                             |            |
| 6            |                                                                                                 |                  |                                                                                                                 |                                                                                                                                                             |            |
| 7            |                                                                                                 |                  |                                                                                                                 |                                                                                                                                                             |            |
| 8            |                                                                                                 |                  |                                                                                                                 |                                                                                                                                                             |            |
| 9 (parallel) |                                                                                                 |                  |                                                                                                                 |                                                                                                                                                             |            |
| 10           |                                                                                                 |                  |                                                                                                                 |                                                                                                                                                             |            |

<!-- Append one handoff note per phase below, using template E2 in 00-TEAM-BRIEF.md. -->

### Phase 0 handoff: 2026-11-23

- **Branch / PRs:** `chore/p0-fixes` (based on `main` `39ce992`), merged as **PR #80** → `main` `ca7599c`
  (CI green, 3m40s). 4 commits:
  `ab71e15` test(pipeline): stage-pipeline coverage + CI/test glob (0.2, 0.3) ·
  `746bb09` test: mock-usage assertions + two test-race fixes (0.4) ·
  `a1c73a8` fix(security): rate-limit `/api/auth/confirm`, `/me`, `/session` (0.5) ·
  `fdce7e1` docs: cron table, env example, generated-docs protection (0.6).
- **Source sync:** n/a (this phase edits the source repo itself).
- **Change PRs (logic):**
  - `src/server.ts`: new `isAuthReadPath`; confirm limited on every method (tighter auth budget, shared
    bucket with POST), `session`/`me` limited per caller-per-path on the normal budget (map §6 gap closed).
  - `scripts/agent-interview-slots.test.ts`: `markUnsent()` replaces the outbox row with a fresh
    not-yet-due copy — the old re-queue raced the fire-and-forget outbox drain (root cause of the flake).
  - `scripts/agent-interview-panel.test.ts` (second, pre-existing flake found by the full-suite run):
    `book()` now selects the newest interview row for (application, level); the unordered select raced
    re-bookings of the same level.
  - 14 test files: every `mock.module` now asserts it was applied (counter/marker after the code ran);
    8 more files already asserted and were only verified.
  - CI (`.github/workflows/ci.yml`) and `package.json` "test": every `scripts/*.test.ts` runs, **one bun
    process per file** — see deviation below.
- **Deviations from the brief:**
  - 0.3 is a per-file loop (`for f in scripts/*.test.ts; do bun test "$f"; done`), not the bare
    `bun test scripts/` glob: bun's `mock.module` is process-global, so a single-process run leaks mocks
    across files (`agent-gateway`'s `{ db: {} }` mock breaks every DB-backed file after it). Verified:
    the bare glob fails, the per-file loop passes 89/89.
  - `docs/voice-scheduling-call-plan.md` was **not** added to `.prettierignore`: it is hand-written (only
    referenced by `scripts/scheduling-call.test.ts`), not generated. Generated docs protected: the charter
    (already) and `docs/er-diagram.md` (now), which was also regenerated after the hook had mangled it.
  - Coverage numbers differ from the brief's estimate: 89 test files at `39ce992`; the old CI list covered
    57, `package.json` 36, union 82 — **31 files newly covered, 7 of which ran in neither place before**
    (agent-review-loop, hiring-sla, interview-confirmations, interviewer-brief, panel-changes, panel-directory,
    scorecard-chase…). No test needed an AI-key skip guard (grep found none).
- **Gate output:**
  - `bun run typecheck` → clean. `bun run lint` → 0 errors, 271 pre-existing warnings (none in changed files).
  - Full suite (per-file loop, fresh-migrated `atsagent_test`): **89 files, 1,367 tests, 0 fail**, exit 0.
  - `scripts/pipeline.test.ts`: 26 pass / 256 expects on a from-zero database (verified twice, self-cleaning).
  - `bun run agents:lock` → 23 agents, **no diff**. `rate-limit.test.ts`: 10 pass (6 new dispatch tests
    burst `session`/`me` → 429 on the normal budget, `confirm` GET on the tighter budget).
- **Test count before → after:** `bun run test` ran 36 hand-listed files → runs all 89; 1,367 tests pass
  (26 of them new pipeline coverage; ~30 new mock-liveness/rate-limit assertions).
- **Known gaps / follow-ups:**
  - **Known-writers list grew beyond the brief's list** (encoded in `pipeline.test.ts` as
    `KNOWN_STAGE_WRITERS`): also `src/lib/lifecycle.functions.ts` (bulk stage move bypassing `moveStageCore`),
    `src/lib/matching.functions.ts`, `src/lib/interviews.functions.ts` (two writers), and a second INSERT —
    `src/lib/candidates.functions.ts` create-candidate (`stage: "sourced"`), beside collaboration. Phase 5
    funnels all of these through pipeline cores; target is an empty list.
  - Pre-existing prod observation, no behaviour change made: `processEmailOutbox` writes status by bare
    `where id`, so a concurrent supersede/withdraw can be overwritten (lost update). Recorded, out of scope.
  - Pre-existing cross-file mock leakage is now _documented_ in CI (per-file loop) — if bun ever scopes
    `mock.module` per file, the loop can collapse back to the glob.
  - 20 files fail `prettier --check` for reasons that predate this branch (docs, design html, ci.yml
    comment); CI does not gate formatting. `DEPLOYMENT-GCP.md` was prettier-formatted whole-file in
    `fdce7e1` (it now passes).
  - Hydration warning on every page in dev (merge-session note): still not investigated.
- **Graph re-run at `39ce992` (map-update input; tools live in `ATSAgent_refactored/scripts/refactor/`,
  baseline copies `graph-7990feb.json` / `edges-7990feb.json`, new output `analyze-39ce992.txt`):**
  - 607 src files (+98 / −1, net +32.9k lines). **Schema is now 125 tables / 299 FKs** (map §7 lists 102) —
    23 new tables need owners in Phase 1's `table-owners.mjs`.
  - **New wrong-way imports** (map §1.2 additions):
    - **S7 new instance:** `drizzle/schema.ts:1292` → `$type<import("../src/lib/offer-check").OfferCheck>`
      (`offer-check.ts` is pure zod — same json-types treatment as the other four).
    - `server/hiring-sla.server.ts` (new, draft-domain "core") → `desk.server.ts` + `lib/lifecycle.ts`.
    - `desk.server.ts` → voice internals, 5 dynamic imports (`request.server` OPEN_CALL ×2 + requestScreeningCall,
      `settings.server`, `schedule`, `call-brief.server`) — a within-L4 edge the map does not list.
    - `lib/slot-offers.server.ts` (interviews) → `voice/scheduling-request.server.ts` — completes an
      `interviews ↔ voice` cycle pair (voice→interviews already had 10 edges).
    - `lib/copilot.functions.ts` → runtime import of `NAV_GROUPS` from `components/nav-config` (server-fn → UI).
  - **24 new files (~8.9k lines) are unmapped by `domains-draft-v1.mjs`** — Phase 1's final `domains.mjs`
    must place them: pay-* (6), labour-policy, workflow-templates, agent-intelligence/governance/reports/
    modality, call-reviews, hiring-oversight, iso, appearance, demand-outlook, pool-coverage, report-window,
    weight-advice, copilot server (2), src/server.ts.
  - Candidates for the map: pay-*/labour-policy/offer-check → offers or a new "policy" area (decision needed);
    workflows/agent-intelligence/governance → agents; copilot server → desk; iso/appearance/report-window →
    shared utils; `hiring-sla.server` → org or L4.
- **Questions for reviewer:**
  1. Map updates for the new wrong-way imports above (esp. `desk → voice`: list the edge in §4 L4, or
     require the voice public API?), and the 23 new tables' owners — approve before Phase 1 freezes `domains.mjs`.
  2. ~~Confirm `chore/p0-fixes` merges to `main` as one PR (4 commits)~~ — done: PR #80 merged as one PR;
     `SOURCE_SHA` = `ca7599c`.
  3. The pre-commit hook will keep reformatting hand-written docs that fail `prettier --check` on touch;
     leave as-is (CI doesn't gate it) or a deliberate whole-repo format commit?
