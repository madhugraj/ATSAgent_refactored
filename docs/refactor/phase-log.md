# Refactor phase log

Baseline (`SOURCE_SHA`): `dcb6a4b` — after the pre-Phase-1 source PRs (#81 whole-repo prettier format,
#83 second interview-panel race, #82 review R1 stage-guard fix), 2026-11-23, CI green.

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

| Phase        | Branch / PRs                                                                                    | Packages touched       | Gate                                                                                                                                                                                                                                                                               | Reviewer sign-off                                                                                                                                            | Date       |
| ------------ | ----------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 0            | `fix/offer-stage-events` (madhugraj/ATSAgent#76) + `chore/p0-fixes` (**#80**, merged `ca7599c`) | source repo            | Gate 0: pass 2026-11-23 (typecheck ✓, lint 0 errors ✓, 89 files / 1367 tests / 0 fail ✓, agents:lock no diff ✓)                                                                                                                                                                    | **Signed off 2026-11-23** (Claude; independent re-run at `ca7599c`: 89 files / 1,367 pass / 0 fail). See `reviews/phase-0-review.md`; R1 due before Phase 2  | 2026-11-23 |
| 1            | ATSAgent_refactored @ `phase-1-bootstrap` (local git, 1 commit)                                 | monorepo shell; tools/ | Gate 1: pass 2026-11-23 (turbo typecheck+build ✓; lint, per-file tests and migrations run through root scripts ✓; app boots + login ✓, inventory 0 unmapped ✓, no forbidden files ✓, 89 files / 1367 tests = source parity ✓, agents:lock no diff ✓, depcruise 0 errors at warn ✓) | **PASS with conditions C1–C4** (Claude, 2026-11-23; independent re-run: 89 files / 1,367 pass / 0 fail, src byte-identical). See `reviews/phase-1-review.md` | 2026-11-23 |
| 2            |                                                                                                 |                        |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |
| 3            |                                                                                                 |                        |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |
| 4            |                                                                                                 |                        |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |
| 5            |                                                                                                 |                        |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |
| 6            |                                                                                                 |                        |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |
| 7            |                                                                                                 |                        |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |
| 8            |                                                                                                 |                        |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |
| 9 (parallel) |                                                                                                 |                        |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |
| 10           |                                                                                                 |                        |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |

<!-- Append one handoff note per phase below, using template E2 in 00-TEAM-BRIEF.md. -->

### Phase 1 handoff: 2026-11-23

- **Branch / PRs:** single commit `phase-1-bootstrap` in `ATSAgent_refactored` (git-inited this phase; no
  remote yet — review checks out this repo directly). Source side before bootstrap: #81 (whole-repo prettier
  format + prompt-file formatter protection + CI format check), #82 (R1: stage-writer guard scans src/apps/
  packages with a ≥300-file floor and basename writer matching), #83 (second interview-panel race: `book()`
  now scores the exact row `scheduleInterviewCore` returns; root cause probed — UUID ids make id-ordering
  random, and inline agent kicks insert placeholder rounds). `SOURCE_SHA` moved `ca7599c` → `dcb6a4b`.
- **Source sync:** bootstrap copied the tree at `dcb6a4b` (`rsync` into `apps/web/`, exclusions per rule 5 +
  `.git`/`node_modules`/`.output`/`.github`/`scripts`; scripts/ moved to the repo root).
- **Packages created/changed:** none yet (Phase 2 starts `packages/*`). Created: root `package.json`
  (workspaces `apps/* packages/* tools/*`, turbo, dependency-cruiser), `turbo.json`, root
  `.github/workflows/ci.yml`, `tools/depcruise.cjs`, `tools/refactor/{domains,inventory,matrix,table-owners}.mjs`.
- **Change PRs (logic):** #81/#82/#83 on the source repo (above). In the new repo, no logic changed — the
  diff vs the source is layout + import paths + the tooling above. `apps/web/src` is byte-identical to the
  source `src/` at `dcb6a4b` (verified with `diff -r`).
- **Deviations from map/plan (need reviewer approval):**
  1. `std` package chosen over utils-in-`config` (map §4 left it open). Recorded in the map §4 with reason.
  2. `docs/`, `infra/`, `extension/` sit inside `apps/web/` for now (the plan's rsync target); they move to
     their final homes in Phase 8.
  3. Matrix baseline re-cut: the old `evidence/baseline-matrix.txt` was computed with the _draft_ domain
     names at `7990feb`, so it was incomparable to the final mapping. It is kept as
     `baseline-matrix-draft-7990feb.txt`; the new baseline is the source at `dcb6a4b` under the final
     `domains.mjs`. Future phases diff against that.
  4. CI runs `table-owners.mjs` but not inventory/graph (they map source paths that don't exist in this
     repo; they run locally against the source checkout at `SOURCE_SHA`).
  5. `postgres` declared as a root dependency (migrate-pg runs from the root; moves to `packages/db` in
     Phase 2).
  6. `bunfig.toml` at the root sets `linker = "hoisted"` (bun otherwise isolates workspace deps and root
     scripts can't resolve app packages).
  7. Source deploy workflows (`deploy.yml`, `deploy-gke.yml`) are excluded until Phase 8 rebuilds them
     per-app (phase-1 review C2; approved with deviation 2). The tracked source `.env` (public Supabase
     values for the Lovable build) is excluded too: Lovable decoupling completed 2026-10-05 (roadmap.md),
     nothing builds through it. Sync parity is enforced by `scripts/refactor/parity.mjs` against
     `docs/refactor/sync-exclusions.txt` (C2).
- **Gate output:** `bunx turbo run typecheck lint` → clean, 0 lint errors (271 pre-existing warnings, same
  as source). `node scripts/migrate-pg.mjs` ×2 → second run no-op. Full suite: **89 files / 1,367 tests /
  0 fail** — equals the source repo's counts. `bun run agents:lock` → 23 agents, no diff. `depcruise` →
  0 errors, 173 warn (the §1.2 cycles, armed at warn per plan). `bunx turbo run build` → vite + voice
  worker + parser worker bundles green. Boot check: dev server on :9101, `POST /api/auth/login` 200 with a
  local admin, `/api/auth/me` 200 with the session cookie. `inventory.mjs`: 607 mapped, 0 unmapped.
  Forbidden-file grep over `git ls-files`: 0 hits.
- **Test count before → after:** identical (89 / 1,367) — layout moved, nothing added or dropped.
  Third interview-suite flake found and fixed in the new repo's scripts (`agent-event-lineage`:
  `INSERT..RETURNING` resolves before the implicit commit is visible on another pooled connection; the two
  governance-chains tests now poll for visibility). `governance.server.ts` itself untouched (verified
  pristine vs `dcb6a4b`).
- **Known gaps / follow-ups:**
  - The 22 PROPOSED table owners (9 agents, 3 interviews, 9 offers, 1 voice) in `table-owners.mjs` await
    Gate 1 approval (§10).
  - `scripts/evals/*.ts` and `scripts/local-e2e/*` paths were rewritten like the rest of scripts/; the evals
    that need real AI keys still skip cleanly when env is absent.
  - dev server env: root `.env.local` is written by `scripts/local-db.sh` but Vite loads env from
    `apps/web/`; boot checks should pass `DATABASE_URL`/`SESSION_SECRET` in the shell until Phase 2's
    `config` package settles env loading.
  - `apps/web/bun.lock` removed; the root `bun.lock` is authoritative (CI installs `--frozen-lockfile`).
  - **A1 root cause (found, phase-1 conditions):** the lineage flake is a **clock-boundary race**, not an
    insert-visibility race. `computeHarness`'s default window is `to: new Date()` (JS clock) while the
    just-written rows carry `createdAt` from the Postgres clock; same-millisecond writes land after `to`
    and the read drops them. Proven with paired timestamps at failure; visibility ruled out first (75/75
    immediate reads). The governance-chains tests now read with an explicit window past their writes; the
    polling workaround was removed. Same fix landed in the source repo (branch `fix/lineage-clock-window`).
- **Questions for reviewer:**
  1. Approve the 22 proposed table owners (`scripts/refactor/table-owners.mjs`, §10 rule: writer owns).
  2. Approve the `std` package decision (map §4, dated note) and the six deviations above.
  3. Confirm the phase-flow preference for Phase 2: per-package PR sets in this same local repo (no remote
     yet), or set up a remote first?

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
