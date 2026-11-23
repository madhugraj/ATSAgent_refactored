# ATSAgent_refactored: Phased Implementation Plan (v2)

Read `01-module-boundary-map.md` first: it defines the packages, layers, rules and events. This plan
says **in what order** to build it, **how to prove** each phase, and **how review works**.

**Approach:** move and split, not rewrite (Option A, map §2). Behaviour, URLs, server-function
names, DB schema and security invariants stay identical until cut-over. Every phase ends with a
**gate**: commands plus checks that the reviewer (Claude) runs before the phase is closed.

---

## 0. Ground rules

1. **`../ATSAgent` stays the live product** until Phase 10. Every phase starts with a sync (§Sync).
   **Decided 2026-11-23:** before the baseline, every open feature PR that will ship (plus `feat/scorecard-rubric`
   and #76) is merged to `main`. Features may merge during Phases 0–2. **From the start of Phase 3 until cut-over,
   only bug fixes merge to `main`.**
2. **A PR either moves code or changes code, never both.** Move PRs show only renames and import
   rewrites. Any logic change (splitting a function, adding a hook) is a separate PR.
3. **Fix bugs in the source repo first** (Phase 0), then carry the fix over. Never fix bugs only in the new repo.
4. **No formatter runs on agent prompt or definition files** during moves, because it would change `agents.lock.json` hashes.
5. **Keep URL prefixes** `/api/public`, `/api/auth`, `/_serverFn` and `/metrics` unchanged. The rate limiter keys on them.
6. **Never copy:** `ai_interviewer/` (gitignored POC with live SIP password and Google key), `SECURITY_AUDIT_REPORT*`,
   `.env*`, `test_data/` (real CVs), `node_modules`, `.output`. Copy the `.gitignore` rules for these first.
7. One branch per phase, `refactor/pN-<name>`. PRs of at most ~40 moved files.
8. AGENTS.md applies in full. Copy it into the new repo in Phase 1 and update its paths in Phase 10.

## Tooling

Bun workspaces · Turborepo (affected-only, cached tasks) · TypeScript project references ·
`dependency-cruiser` (layer, order and cycle rules) · `server-only` package · existing ESLint/Prettier.
Package scope `@ats/*`.

---

## Phase 0: Fix things in the source repo first (3–4 days, team in `ATSAgent`)

These are real gaps found during evaluation. Fixing them first means the refactor starts from a correct baseline.

| #   | Task                                                                                                                                                                                                        | Why                                                                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1 | ✅ **Done:** branch `fix/offer-stage-events` (a3d893b). Offer stage writes now go through `pipeline.server.recordOfferStageCore`. Test: `scripts/offer-stage-events.test.ts`.                               | They skipped `stage_events` (timeline/reports), the `offer_accepted` outcome capture and stale agent request cleanup. Offer stages send no candidate stage email and no agent stage event by design.                                                                                                                     |
| 0.2 | Add `scripts/pipeline.test.ts`: `canMove` table, `moveStageCore`, `recordStageTransition` effects, and a grep test that only pipeline files write `applications.stage`                                      | No direct coverage exists for the riskiest code in the move                                                                                                                                                                                                                                                              |
| 0.3 | Make CI run **every** `scripts/*.test.ts` (glob, not a hand list). Bring the `test` script in line with CI. Mark env-gated AI tests to skip cleanly.                                                        | On `main`, CI lists 55 of 70 test files; 15 never run in CI (hiring-sla, interview-confirmations, interviewer-brief, matching-gates, meeting-transcripts, panel-access/assessment/changes/directory/review/simulation/transcripts, scorecard-chase, scorecard-rubric). The `test` script runs a different, shorter list. |
| 0.4 | Mock audit: every `mock.module(path)` gets an assertion that the mock was actually used                                                                                                                     | After files move, a stale mock stops applying without error                                                                                                                                                                                                                                                              |
| 0.5 | Rate-limit `/api/auth/confirm`, `/api/auth/me`, `/api/auth/session`                                                                                                                                         | Security invariant gap                                                                                                                                                                                                                                                                                                   |
| 0.6 | Docs: add `agent-tick` and `screening-prep` to the cron table in `DEPLOYMENT-GCP.md`. Add SIP__, VOICE__, PARSER__, AGENT__, CAPTURE_EXTENSION_IDS and GOOGLE_INDEXING_* to `infra/env.production.example`. | Docs drift                                                                                                                                                                                                                                                                                                               |
| 0.7 | Optional: rotate the Google service-account key and SIP password in the local `ai_interviewer/`                                                                                                             | Live secrets on developer disks                                                                                                                                                                                                                                                                                          |

**Gate 0:** CI and `bun run test` run all test files and all pass, typecheck and lint are green, and the new pipeline tests pass.
Record the commit SHA as the **baseline** in `docs/refactor/SOURCE_SHA`.

---

## Phase 1: Bootstrap and measuring tools (1 week)

1. `git init` `ATSAgent_refactored`. Copy `.gitignore` first (rule 6), then `rsync` the baseline into
   **`apps/web/`** unchanged, except `scripts/` → repo root `scripts/` (moved in later phases).
2. Root `package.json` with workspaces `apps/*`, `packages/*`, `tools/*`. Add `turbo.json` with `build`, `typecheck`, `lint`, `test`, `test:db`.
3. `tools/tsconfig` (base, strict as today). Keep the aliases `@/` and `@db/` working inside `apps/web` for now.
4. `tools/refactor/` (start from `scripts/refactor/graph.mjs` + `analyze.mjs` in this folder):
   - `domains.mjs`: **final** file → package mapping from map §4. The draft is `domains-draft-v1.mjs`; correct it.
   - `inventory`: prints every file with its target package. **Fails if any file is unmapped.** Output goes to `docs/refactor/inventory.csv`.
   - `matrix`: cross-package import counts. Baseline is `docs/refactor/evidence/baseline-matrix.txt`.
   - `table-owners`: checks that every `pgTable` has an owner from map §7.
5. `dependency-cruiser` config with all rules from map §5, set to **warn**.
6. CI: install, typecheck, lint, test (unit), test:db (Postgres service + `migrate-pg`), `agents:lock` check, build.
7. Settle unknowns U1–U5 (map §9) and write the answers into the map.

**Gate 1:** clean clone → `bun install && bunx turbo run typecheck lint test test:db build` green.
The app boots and login works. `inventory` reports 0 unmapped files. `git ls-files | grep -Ei 'ai_interviewer|SECURITY_AUDIT|\.env$|test_data'` prints nothing.

---

## Phase 2: L0 foundation (1 week, 2 devs)

Order: `config` → `observability` → `security` → `storage` → `db`.

- Each package gets `package.json` with `exports: {"./shared","./server"}`, its own tests, and `import "server-only"` in `/server`.
- **Shims:** leave one-line re-exports at old paths (`src/server/log.ts` → `export * from "@ats/observability/server"`)
  so the rest of the app compiles unchanged. Every shim has a comment `// SHIM: remove in Phase 8`.
- `config`: create per-app zod schemas. Replace raw `process.env[...]` reads (this is a code change, so it gets its own PR).
- `observability`: bring in `alerts.server` (signAlert), `voice/debug.ts` and `error-capture`. The SLO evaluator takes an injected `notify`.
- `db`: schema + migrations + client + `json-types/` (from interview-plan, expert-brief, vtt, panel-assessment zod files;
  the old files re-export). Point `drizzle.config.ts`, `migrate-pg.mjs` and `gen-er-diagram.mjs` at the package.
- Re-point Vite `importProtection` to cover `@ats/*/server` specifiers.

**Gate 2:**

```
bunx turbo run typecheck lint test --filter="./packages/*"
bunx turbo run test test:db build --filter=web
node packages/db/scripts/migrate-pg.mjs && node packages/db/scripts/migrate-pg.mjs   # second run is a no-op
node packages/db/scripts/gen-er-diagram.mjs && git diff --exit-code docs/er-diagram.md
```

Plus: the client bundle contains no `postgres`, `node:crypto` or `SECRET_ENCRYPTION_KEY` strings (`grep -r` on `.output/public`).

---

## Phase 3: L1 platform (1.5 weeks, 2–3 devs)

Order: `audit` → `auth` → `ai` → `kernel` → `platform-http`.

- `auth`: framework-neutral core. `auth.middleware.ts` stays in `apps/web/src/server-fns/_middleware/`, outside any `server/` folder.
- `ai`: move gateway, usage, pricing, spend cap, training, redteam, plus **`agents/context.ts`** and **`agents/injection.ts`**.
  Leave shims in `server/agents/` for the old paths. Add `registerRedteamTarget` and register screening from `boot.ts`.
- `kernel`: move `events.ts` (strip the dynamic `orchestrator` import and call registered hooks instead), `policy.ts`,
  `registry.ts`, `manifest.server.ts`, `task-liveness.ts`, `hitl.ts`, `run-messages.ts`, and add `ports.ts`.
  `apps/web/src/boot.ts` wires agents into the hooks (`onAgentEvent → orchestrator.kick`, `AgentPort` impl).
  Voice-worker boot honours `AGENT_INLINE_KICK=0`, as today.
- `platform-http`: extract the `server.ts` pipeline into functions. `apps/web/src/server.ts` keeps the same order of steps.
  Keep both CSRF layers.
- Add a startup assertion that `kernel`, `ai` and `observability` each have exactly one module instance.

**Gate 3:**

- All tests are green, and `bun run agents:lock && git diff --exit-code` shows no change (move only).
- **Attribution check:** run one agent with a mocked AI provider. Every `ai_usage_events` row has `agent_run_id` set, and `training_inferences` rows carry the candidate.
- **Limiter check:** a burst of 70 requests on `/api/public/agent-tick`, `/_serverFn/<any>` and `/api/auth/login` returns 429. `/metrics` without a token returns 404.
- **CSRF check:** a cross-site POST to `/_serverFn/*` is rejected.

---

## Phase 4: L2 shared services (1.5 weeks, 3 devs in parallel)

`org` · `legal` · `comms` · `integrations` · `desk-core`.

- `desk-core`: extract the chat store and `notifyRequisitionThread` from `desk.server.ts`. Change the ~50 domain call sites
  from `import("…/desk.server")` to `@ats/desk-core/server`. **The call stays synchronous at the same point**, so message order is unchanged.
- `comms`: add `onInboundMail` registry. Split `local-inbox.server` into transport (comms) and handlers (candidates/onboarding, registered in boot).
- `integrations`: meetings/LinkedIn provider code. `org` keeps a generic credential store.
- `legal`: move the `LegalSection` type out of `components/LegalPage.tsx`.
- `org-profile` / `org-context` start runs through `AgentPort`.

**Gate 4:** standard gate (below) for each package, plus the desk ordering test (post a scorecard, then an offer status, and check the thread order) and an inbound mail e2e (CV mail → candidate created).

---

## Phase 5: L3 hiring domains, wave 1 (2 weeks)

Order: `requisitions` → `candidates` → `pipeline`, then `distribution`.

For **each** package, use the standard recipe:

1. **Split PR (code change):** separate `*Core` functions out of `*.functions.ts` into `/server`. Move pure code to `/shared`.
   Fix the wrong-way imports with the events in map §5 (`requisition.closed`, `subjects.deleted`, `stage.changed`).
2. **Move PR (move only):** files go into `packages/<pkg>/src/{shared,server}`. The thin `*.functions.ts` goes to
   `apps/web/src/server-fns/<pkg>/`, **keeping the same file name and export names** so server-function ids and the client stay stable.
3. **Repoint PR:** update importers to `@ats/<pkg>/…` and delete that package's shims.
4. Move tests and fix `mock.module` specifiers. The mock-usage assertions from 0.4 must pass.
5. Switch that package's dependency-cruiser rules from warn to **error**.

Domain-specific notes:

- `pipeline`: becomes the only writer of `applications.stage` (rule 5 is a test).
- `candidates`: takes `intake.*`, `erase.server`, `collaboration`, `queries` and `pool-share` (renamed `.server`).
- `distribution`: takes `apply.functions` core. `job-channels` moves to the shared catalogue.

**Gate 5:** standard gate plus the pipeline tests and `bun run test:e2e`.

---

## Phase 6: L3 hiring domains, wave 2 (2 weeks)

Order: `matching` → `interviews` → `offers` → `onboarding`. Same recipe.

- `matching`: split `matching.functions` and `screening.functions`. Take shortlist, logistics, screening-coverage and career metrics.
- `interviews`: split `interviews.functions` (1.2k lines) and `assessment.functions`. Take `assessmentNudges`.
- `offers`: split `offers.functions` (973 lines). Move the hiring-cost core out of `server/agents/`. Take pay and negotiation nudges.
- `onboarding`: split `onboarding.server` (1k lines).

**Gate 6:** standard gate plus panel/scorecard/negotiation/compensation tests and `eval:matching` (same scores as baseline).

---

## Phase 7: L4 orchestration (2 weeks)

Order: `analytics` → `agents` → `desk` → `voice` → `workspace`.

- `agents`: the rest of `server/agents/*`. It implements `AgentPort` and registers its hooks. Tools import domain `/server` only.
  Update hard-coded imports in `agents-lock.ts` and `agent-governance.test.ts`. Every tool must still be registered
  (a missing tool hashes as `missing:true`).
- `desk`: split the rest of `desk.server.ts` into intake / lifecycle / candidates / run-bridge / progress.
- `voice`: must not import the full agents tool registry. It uses the kernel plus the agents public API.
- `workspace`: notifications and nudges aggregators, platform-admin cores (`requirePlatformAdmin` + `writeAudit` kept).

**Gate 7:**

```
bun run agents:lock && git diff --exit-code packages/agents/agents.lock.json   # MUST be empty
bun run eval:agents        # pass rate ≥ baseline (needs EVAL_* env, manual)
bunx turbo run test test:db --filter=@ats/agents --filter=@ats/desk --filter=@ats/voice
```

Plus registry refusal test (approve/hire/… tools are rejected) and health-rule tests.

---

## Phase 8: Apps (1.5 weeks)

- `apps/web`: final layout (map §4 L5). Routes become thin. Feature components go to `src/features/<domain>/`.
  `lib/data.ts` splits into per-feature `queries.ts`. shadcn goes to `packages/ui`. Split `AuthGate` (login/signup) and the 15 files over 800 lines
  (one PR per file, UI only). **Delete all shims.** Every dependency-cruiser rule is set to **error**.
- `apps/voice-worker`: own entry, bundle and Dockerfile. **Build fails on any `@tanstack/*` import.**
- `apps/parser-worker`: own entry, bundle and Dockerfile.
- Build: per-app outputs. Update `Dockerfile`(s), `.github/workflows/deploy.yml`, `scripts/deploy.sh` and GKE/Cloud Run manifests.

**Gate 8:**

```
bunx turbo run typecheck lint test test:db build
bunx depcruise --config tools/depcruise.cjs packages apps    # 0 errors
grep -rn "SHIM" packages apps                                 # nothing
```

Plus full UI smoke run by the reviewer: login → create requisition → JD approval → upload CV → match →
shortlist → schedule interview → panelist scorecard link → offer raise/approve/release → candidate accepts →
onboarding docs → agent desk run → phone-screening call queued. Also: voice worker heartbeat in staging, and parser `/parse` returns text.

---

## Phase 9: Python services (REINSTATED 2026-11-23, parallel track, ~4 weeks)

**Decision (product owner, 2026-11-23):** Python backend services are required. The reasons are team skills, the AI/ML
ecosystem, a client/org mandate, and scale. **Scope: Python services next to the TypeScript app, not a full backend
rewrite.** TypeScript keeps auth, sessions, tenancy (`requireOrg`), the database schema and migrations, the hiring
lifecycle cores, agent governance and the AI gateway ledger. Python takes compute-, ML- and media-heavy work.

**Python stack:** Python 3.12, FastAPI + Uvicorn, Pydantic v2, `uv` (lockfile), `pytest`, `ruff`, `mypy --strict`.
Each service has its own Dockerfile and Cloud Run service on GCP.

**Layout:** `services/<name>/` in the monorepo, with `pyproject.toml`, `uv.lock`, `app/`, `tests/` and `Dockerfile`.
Turborepo runs its lint, type and test tasks through `package.json` script shims.

**When:** a parallel track run by 1–2 Python devs.

- **9a (during Phases 3–4):** scaffold the shared template (`services/_template`), contract tooling, CI job, auth and the
  AI callback.
- **9b (during Phases 5–8):** build the services in shadow mode.
- **9c (before Phase 10):** switch each service only at agreed parity.

The TypeScript critical path is unchanged.

**Services, in order:**

| #   | Service            | Replaces / adds                                                                                | Parity check                                                                                                            |
| --- | ------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | `parser`           | `apps/parser-worker` CV/JD extraction (PDF, Word, hidden-text detection)                       | `hidden-text.test.ts` + `parser-sandbox.test.ts` cases replayed as pytest fixtures; field-level diff on a 200-CV corpus |
| 2   | `matching-ml`      | feature extraction and scoring behind `matching` (scores only; gates and decisions stay in TS) | `eval:matching` within an agreed tolerance                                                                              |
| 3   | `analytics-ml`     | bias report, demand outlook, pool coverage computations                                        | same numbers as the TS output on a fixed snapshot                                                                       |
| 4   | `voice` (optional) | the media and telephony path of `apps/voice-worker`, starting from the `ai_interviewer` POC    | voice heartbeat + scheduling-call evals                                                                                 |

**Non-negotiable rules.** These carry over the AGENTS.md invariants. CI and review enforce them.

1. **No database access.** A service never connects to Postgres. TS sends it the data it needs and stores its results.
   This keeps `requireOrg` plus explicit `orgId` predicates as the only tenant boundary.
2. **Called only from TS server code**, through `safeFetch`, with a per-service token stored via `encryptSecret`.
   Services run on a private network (Cloud Run internal ingress) and are never reachable by browsers.
3. **Every request carries `orgId` and `requestId`.** Services are stateless, and their logs include both.
4. **No AI provider keys in Python.** Any LLM call goes back through an internal TS endpoint that calls
   `aiJson` / `aiResearchJson` with an `AI_FEATURES` slug. That way the ledger, spend caps, consent, training capture,
   agent-run attribution and vendor stripping all still apply. Untrusted text still goes through `untrusted(...)` on the TS side.
5. **Contracts come from zod.** TS zod schemas → JSON Schema (`tools/contracts`) → Pydantic models (`datamodel-codegen`).
   Generated files are committed. CI fails if they drift, and runs contract tests on both sides.
6. **Agents don't call Python directly.** Agent tools call TS lifecycle cores, which may call a service.
   Agent manifests and the lock rules are unchanged.
7. **Erasure:** services hold no candidate data at rest. Temp files are deleted per request.
8. **Rate limits and audit:** the internal TS endpoints are covered by the limiter. Token rotation goes through `writeAudit`.
9. **Secrets:** never commit `ai_interviewer/google-credentials.json` or any key. Use Secret Manager. Rotate the POC
   credential before reusing anything from it.

**Shadow mode:**

- TS calls both paths, keeps serving the TS result, and logs the diffs.
- The product owner and reviewer approve the switch per service.
- The TS fallback stays for one release after the switch.

**Gate 9 (per service):**

- `ruff`, `mypy --strict` and `pytest` are green.
- Contract drift check is green.
- The service's parity check is met.
- An integration test: TS → service → result stored with the right `orgId`.
- Shadow diff report attached.
- `DEPLOYMENT-GCP.md` and `SECURITY.md` updated in the same change.

## Phase 10: Cut-over (1 week)

1. Freeze merges in `ATSAgent`. Final sync (§Sync).
2. Staging deploy. Run the full Gate 8 smoke, `eval:agents`, a security spot check (map §6 table, one by one), and confirm the cron jobs in Cloud Scheduler point at the same paths.
3. Production deploy. Watch SLO burn rates for 48 hours. Archive the old repo as read-only.
4. Update `README.md`, `SECURITY.md`, `DEPLOYMENT-GCP.md`, `infra/DEPLOYMENT-HANDOFF.md`, `roadmap.md` (mark old paths as pre-monorepo), `docs/er-diagram.md`, and **AGENTS.md invariant paths** (auth.middleware, guards, crypto, safe-fetch, ai-gateway, ai-usage, audit, definitions.ts, health.server, capture.server, evals/scenarios.ts, agents.lock.json).

---

## Standard gate (every package PR set)

```
bunx turbo run typecheck lint test --filter=@ats/<pkg>...
bunx turbo run test test:db build --filter=web
bunx depcruise --config tools/depcruise.cjs packages/<pkg>          # 0 errors once switched
node tools/refactor/matrix.mjs > /tmp/m.txt                          # no new upward edges vs previous phase
bun run agents:lock && git diff --exit-code                          # unless an agent changed on purpose (then bump version)
```

Plus the mock-usage assertions pass, and no server code shows up in the client bundle (`grep` on `.output/public`).

## Sync procedure (start of every phase)

```
cd ../ATSAgent && git log --oneline $(cat ../ATSAgent_refactored/docs/refactor/SOURCE_SHA)..main
```

For each commit, apply the same change at the new path (`inventory.csv` maps old → new). Migrations keep
their number. Agent changes keep their version bump. Then update `SOURCE_SHA`. If more than ~30 commits are
pending, sync before starting new moves. After syncing, run `node scripts/refactor/parity.mjs <source-checkout>`:
every tracked source path must exist at its new path or sit on the written exclusion list
(`docs/refactor/sync-exclusions.txt`) — added at Phase 1 review (C2).

## Review protocol (team ↔ Claude)

1. The team finishes a phase and fills one row in `phase-log.md`: phase, PRs/branch, packages touched, deviations from the map, known gaps.
2. Ask Claude: _"review phase N in ATSAgent_refactored"_. Claude checks the branch out into a **separate review
   folder** (`/Users/yavar/Documents/CoE/ATSAgent_refactored-review`, a git worktree), so the team's working copy is
   never touched. In that folder, Claude will:
   - run the gate commands and the extra checks for that phase,
   - compare against the baseline (test counts, matrix, agents lock, eval scores),
   - check the map's rules and the security invariants table (map §6) for the touched packages,
   - report findings by severity and either fix them on `fix/pN-*` or list them for the team.
3. The phase closes only when the gate is green and the sign-off is written in `phase-log.md`.
   The map is updated if a decision changed.

## Effort and staffing (3–4 TS devs + 1–2 Python devs on the Phase 9 parallel track)

| Phase       | Weeks             | Parallelism                                                                                       |
| ----------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| 0 Fix first | 0.7               | 2 devs                                                                                            |
| 1 Bootstrap | 1                 | 1–2                                                                                               |
| 2 L0        | 1                 | 2                                                                                                 |
| 3 L1        | 1.5               | 2–3                                                                                               |
| 4 L2        | 1.5               | 3                                                                                                 |
| 5 L3 wave 1 | 2                 | 3–4                                                                                               |
| 6 L3 wave 2 | 2                 | 3–4                                                                                               |
| 7 L4        | 2                 | 3                                                                                                 |
| 8 Apps      | 1.5               | 3–4                                                                                               |
| 10 Cut-over | 1                 | all                                                                                               |
| **Total**   | **≈ 14–15 weeks** | Phase 9 runs in parallel (≈4 weeks of Python work); +1 week at the end if a service misses parity |

v1 estimated 8–10 weeks. The extra time pays for the Phase 0 fixes, the hook and event inversions, and the splits of
the five mixed server-function files, `desk.server` and `ai-gateway`, which v1 didn't account for.

## Top risks

| Risk                                                   | Signal                                                 | Mitigation                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| AsyncLocalStorage split by a duplicate package copy    | `agent_run_id` NULL in `ai_usage_events`               | Single-instance check at startup, attribution check in Gate 3               |
| Server-function ids change                             | 404 on `/_serverFn/*` after deploy                     | Keep file names and export names. Staging smoke run.                        |
| Import protection lost, server code reaches the client | secrets or `postgres` in `.output/public`              | `server-only` + re-pointed importProtection + bundle grep in every gate     |
| Stale `mock.module` paths                              | tests hit real DB/AI, or pass without testing anything | Phase 0.4 assertions                                                        |
| Rate limiter coverage drops                            | no 429 in burst test                                   | Rule 5, Gate 3 check                                                        |
| Desk message order changes                             | thread shows events out of order                       | Synchronous `notifyRequisitionThread` at the same call sites, ordering test |
| Drift from ongoing feature work                        | sync backlog grows                                     | Sync each phase. Freeze only at cut-over.                                   |
| SLO alerts stop                                        | no alerts in staging drill                             | The evaluator still runs on agent-tick, with `notify` injected              |
