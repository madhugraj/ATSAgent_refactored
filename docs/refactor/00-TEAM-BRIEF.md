# ATSAgent Refactor: Team Brief and Execution Prompt

This is the working brief for the refactor team. Read it end to end before touching code. It works for
people, and it can also be pasted whole into an AI coding assistant as its standing instructions (Part A is the
copy-paste prompt; Parts B–F are the detail that prompt refers to).

| Document                    | Role                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `00-TEAM-BRIEF.md` (this)   | How to work, what to do in each phase, how to hand off                                      |
| `01-module-boundary-map.md` | **What** goes where: packages, layers, rules, events, security owners, table owners         |
| `02-implementation-plan.md` | **When and how to prove it**: phases, gates, sync, risks                                    |
| `phase-log.md`              | Progress and sign-offs, one row per phase                                                   |
| `evidence/`                 | The module reviews and import matrix behind the map. Read the relevant file before a phase. |

If this brief and the map/plan disagree, the **map** wins for structure, the **plan** wins for order and gates,
and you raise the conflict in `phase-log.md` (Part F).

---

## Part A: Copy-paste prompt

> Copy everything between the lines into your assistant, or read it aloud at kickoff.

---

You are part of the team refactoring **ATSAgent**, a multi-tenant applicant tracking system with AI hiring agents.
It is a TanStack Start full-stack TypeScript app (React UI + server functions), with Drizzle on Postgres, Bun for
tests, a voice worker (SIP/RTP phone screening) and a parser worker (sandboxed CV parsing). It has about 144k
lines in `src`, 102 database tables and 72 server-function files.

**Goal.** Restructure it, without changing behaviour, into a monorepo in `/Users/yavar/Documents/CoE/ATSAgent_refactored`:

- `apps/web`: the only TanStack Start app (UI, thin server functions, HTTP routes, `server.ts`)
- `apps/voice-worker`, `apps/parser-worker`, `apps/extension`
- `packages/*`: all business logic, in five layers (L0 foundation → L4 orchestration), each package with
  `/shared` (browser-safe) and `/server` (server-only) entry points
- dependency rules enforced in CI

**Why not a separate backend app.** TanStack Start server functions must be served by the same build and origin as the
UI. A separate API, or moving the whole backend to Python, would be a rewrite and is out of scope. Python is used for **services** next to the app (Phase 9). The frontend/backend separation is
achieved by packages and enforced import rules instead.

**Source of truth.** `/Users/yavar/Documents/CoE/ATSAgent` (the "source repo") stays the live product until cut-over. Feature merges stop at the start of Phase 3 (bug fixes only after that).
Never edit it except in Phase 0 and when syncing fixes. All refactor work happens in `ATSAgent_refactored`.

**Read first, in order:** `docs/refactor/00-TEAM-BRIEF.md`, `01-module-boundary-map.md`, `02-implementation-plan.md`,
the source repo's `AGENTS.md` (security invariants; they apply in full), then the `evidence/` file for your area.

**Non-negotiable rules:**

1. **Move or change, never both in one PR.** A move PR contains only file moves, import rewrites and shims.
   Any logic change (splitting a function, adding a hook or event, renaming a symbol) is its own PR.
2. **No behaviour change** until Phase 10. URLs, server-function file and export names, DB schema, emails,
   agent prompts and the order of side effects stay the same.
3. **Keep URL prefixes** `/api/public`, `/api/auth`, `/_serverFn` and `/metrics`. The rate limiter keys on them.
4. **Never run a formatter on agent prompt or definition files** (`src/server/agents/definitions.ts`, `tools*.ts`,
   voice prompts). After every agents-related move, `bun run agents:lock` must produce **no diff**.
5. **Never copy** `ai_interviewer/`, `SECURITY_AUDIT_REPORT*`, `.env*`, `test_data/`, `node_modules`, `.output`
   into the new repo. Never commit secrets. Never commit security audit reports.
6. Every tenant query keeps its `eq(table.orgId, …)` predicate. Every tenant server function keeps
   `requireOrg/requireRole/requireOrgOwner/requirePlatformAdmin`. AI calls go only through the `ai` gateway.
   Outbound fetches of user URLs go only through `safeFetch`. Privileged actions keep `writeAudit`.
7. **Bun `mock.module(path)` matches by path.** When you move a file, update every mock of it, and make sure the
   mock-usage assertion passes. A stale mock silently lets tests hit the real DB or AI.
8. `kernel`, `ai` and `observability` must exist **once** per bundle (AsyncLocalStorage). Never copy-paste them into two places.
9. Only `packages/pipeline` may write `applications.stage`.
10. If you find a bug, **do not fix it in the new repo only**. Record it in `phase-log.md`, fix it in the source repo
    (small PR to `main`), then sync it in.
11. If the map does not cover a file or a decision, **stop and ask** (Part F). Do not invent a new package or layer.

**How you work in a phase:**

1. Sync from the source repo (plan §Sync).
2. Work on branch `refactor/pN-<name>`, in PRs of at most ~40 moved files.
3. Run the phase gate locally (plan, "Gate N", plus the standard gate).
4. Fill the phase row and the handoff note in `phase-log.md` (template in Part E).
5. Roles (decided): **an executor session builds each phase; a separate reviewer session reviews it.**
   Never review your own phase. Ask the reviewer: **"review phase N in ATSAgent_refactored"**. The reviewer checks out your branch into a
   separate review folder (`/Users/yavar/Documents/CoE/ATSAgent_refactored-review`, so your working copy is never
   touched), runs the gate independently, and returns findings by severity.
   Fix blockers, then the phase is signed off. Do not start phase N+1 on a package that phase N's review touched
   until sign-off.

**Definition of done for every PR:** typecheck, lint and all tests green. The dependency-cruiser rules for touched
packages pass at their current level (warn or error). `agents:lock` shows no diff. No server code in the client bundle.
Shims are marked `// SHIM: remove in Phase 8`. `inventory.csv` is updated.

---

## Part B: Background the team needs

### B1. How the current app is wired (short version)

- **UI:** `src/routes/*.tsx` (file routes, generated `routeTree.gen.ts`), `src/components/*`, `src/hooks/*`.
- **Server functions:** `src/lib/*.functions.ts`. Each `createServerFn` compiles to a browser stub that POSTs to
  `/_serverFn/<id>`. The id comes from the **file path and export name**, so changing either breaks clients mid-deploy.
- **Server logic:** `src/lib/*.server.ts`, `src/server/**`. Pure shared code: plain `src/lib/*.ts`.
- **HTTP entry:** `src/server.ts` runs error capture → request context → CSRF guard → rate limit → `/metrics` →
  metrics/SLI → security headers/CSP. `src/start.ts` adds a second CSRF layer.
- **Auth:** per server function, via middleware in `src/lib/auth.middleware.ts`. It must stay outside any `server/`
  folder, because Vite import protection mocks `**/server/**` in the client and the compiler must read `.middleware([...])`.
- **Agents:** `src/server/agents/*`, made up of runtime, orchestrator, registry, tools and manifests in `definitions.ts`.
  They are triggered by `agent_events` and by the `/api/public/agent-tick` cron.
- **Desk:** `src/server/desk/desk.server.ts` (4.8k lines), the hiring copilot and requisition chat threads.
- **Workers:** voice (`src/server/voice/worker.ts`, GKE, UDP SIP/RTP) and parser (`src/server/parser/worker.ts`,
  Cloud Run). Both are built by `scripts/build-*-worker.mjs` after `vite build`, in one Docker image.
- **Tests:** `scripts/*.test.ts`. Most need the local disposable Postgres (`atsagent_test`). CI lists tests by hand
  in `.github/workflows/ci.yml`.

### B2. The ten things that make this refactor hard (each is handled in the map)

1. Domains import kernel pieces stored inside `agents` (`context`, `events`, `policy`, `injection`) → these move to `kernel` and `ai` (map §4 L1).
2. `events.ts` dynamically imports the orchestrator, which is a hidden cycle → `kernel.emitAgentEvent` + hooks (map §5 events).
3. About 50 domain call sites import `desk.server.ts` for a 15-line "post to thread" → `desk-core` (map §4 L2).
4. The stage pipeline was spread across "requisitions" → new `pipeline` package (map §4 L3).
5. Five `*.functions.ts` files export `*Core` functions used by other server code → split before moving.
6. Foundation imports features (erase, slo, ai-gateway, redteam, schema) → inverted with callbacks and registries.
7. Server functions must stay in `apps/web` (map §2). Packages hold the cores.
8. Vite import protection is path-based → re-point it to `@ats/*/server` + `server-only`.
9. AsyncLocalStorage singletons → single instance + startup check.
10. Tests use relative imports and path-based mocks → rewrite carefully, with assertions.

### B3. Glossary

| Term                    | Meaning                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Core                    | A server-only function holding business logic (`fooCore`). Called by server functions, agents and workers.                 |
| Server-function wrapper | The `createServerFn` in `apps/web/src/server-fns/<pkg>/*.functions.ts`: validator + auth middleware + one call into a core |
| Shim                    | A one-line re-export left at an old path so unmoved code still compiles. Removed in Phase 8.                               |
| Port / hook             | An interface in a lower package (e.g. `AgentPort`, `onDomainEvent`) that a higher package implements at boot               |
| `boot.ts`               | The composition root in each app that wires hooks and ports (`apps/web/src/boot.ts`, `apps/voice-worker/src/boot.ts`)      |
| Gate                    | Commands and checks that must pass before a phase is signed off                                                            |
| Baseline                | The source repo commit recorded in `docs/refactor/SOURCE_SHA`                                                              |

---

## Part C: Environment setup (once per developer)

1. Tools: Bun ≥ 1.3, Node 22, PostgreSQL 14 via `scripts/local-db.sh init` in the source repo (creates a dev DB and
   the disposable `atsagent_test` DB on 127.0.0.1), `git`, `gh`.
2. Env: copy the source repo's `.env.local` locally for running tests. **Never commit it.** For tests, set
   `DATABASE_URL` to the `atsagent_test` database. Tests refuse non-local hosts.
3. Verify the source repo is green before starting:
   ```bash
   cd /Users/yavar/Documents/CoE/ATSAgent && bun install && bun run typecheck && bun run lint
   ```
   ```bash
   DATABASE_URL=postgres://…/atsagent_test bun scripts/migrate-pg.mjs && bun run test
   ```
4. Never work in a checkout another session or teammate is switching branches in. Use your own clone or `git worktree`.

---

## Part D: Phase-by-phase instructions

Each phase lists **Inputs → Steps → Deliverables → Gate → Reviewer focus**. The full gate commands are in the plan;
the steps here are the order to do them in.

### Phase 0: Fix first (source repo, `ATSAgent`)

Inputs: plan Phase 0 table; `evidence/findings-platform.md` §5, §7.

Steps:

1. **Baseline first: done (2026-11-23).** All shippable PRs are merged. `main` is at `39ce992` with CI green
   (see `phase-log.md`). Re-run `scripts/refactor/graph.mjs` + `analyze.mjs` on that commit and record new files and new
   upward edges in the Phase 0 handoff, so the map is updated before Phase 1. #69 alone added about 54k lines.
   0.1 (#76, offer stage events) is merged.
2. 0.2: add `scripts/pipeline.test.ts`. Cover the `lifecycle.canMove` transition table (every allowed and some
   forbidden pairs), `moveStageCore` (role check for HR-controlled targets, reason required, screening-skipped note),
   the effects of `recordStageTransition` (stage_events row, screening-prep job on shortlist, email outbox row for
   shortlisted/l1–l3/rejected, outcome capture), and a grep test: **no file outside `pipeline.server.ts`,
   `stage-events.server.ts` and the known writers list writes `applications.stage`**. Record the known writers
   list in the test (autoscore, matching shortlist, interviews, offer-response, collaboration insert). Phase 5 shrinks it.
3. 0.3: make CI run every `scripts/*.test.ts`. Replace the hand list with a glob, or add the 15 missing files:
   hiring-sla, interview-confirmations, interviewer-brief, matching-gates, meeting-transcripts, panel-access,
   panel-assessment, panel-changes, panel-directory, panel-review, panel-simulation, panel-transcripts,
   scorecard-chase, scorecard-rubric. Make the `test` script match. Tests that need real AI keys must skip when
   the env var is missing.
4. 0.4: for every `mock.module(...)`, add an assertion that the mock was called, or expose a marker from the mock
   factory and assert on it. Also fix the flaky `scripts/agent-interview-slots.test.ts` (email-outbox race; see `phase-log.md`).
5. 0.5: rate-limit `/api/auth/confirm`, `/api/auth/me` and `/api/auth/session` in `src/server.ts`. Add a test.
6. 0.6: update `DEPLOYMENT-GCP.md` (cron table: add `agent-tick`, `screening-prep`) and `infra/env.production.example`.
7. Merge everything to `main`. Record the merge SHA in `ATSAgent_refactored/docs/refactor/SOURCE_SHA`.

Deliverables: merged PRs, `SOURCE_SHA`, Phase 0 row in `phase-log.md`.
Gate: plan Gate 0.
Reviewer focus: the pipeline test really fails if a stage writer bypasses the pipeline, the mock assertions fail when a mock path is wrong, and every test file runs in CI.

### Phase 1: Bootstrap and tools

Inputs: plan Phase 1; map §3, §5, §9; `scripts/refactor/*`.

Steps:

1. `git init` in `ATSAgent_refactored` (keep the existing `docs/` and `scripts/refactor/`). Add `.gitignore`
   **first** (copy the source's, plus `ai_interviewer/`, `test_data/`, `.env*`, `SECURITY_AUDIT_REPORT*`).
2. Copy the baseline: `rsync -a --exclude-from=<list> ../ATSAgent/ apps/web/` at `SOURCE_SHA`. Exclusion list
   = rule 5 + `.git`. Move `apps/web/scripts/` to the repo root `scripts/` (keep `scripts/refactor/`).
3. Root `package.json`: `"workspaces": ["apps/*","packages/*","tools/*"]`, devDeps `turbo`, `dependency-cruiser`.
   `turbo.json` tasks: `build`, `typecheck`, `lint`, `test`, `test:db`.
4. Make `apps/web` run from its new folder: fix paths in `vite.config.ts`, `tsconfig.json`, `drizzle.config.ts`,
   the build scripts and the CI workflow. Run every test from the new layout.
5. `tools/refactor/`: move `graph.mjs`, `analyze.mjs`, then write
   - `domains.mjs`: the **final** mapping from map §4. Start from `domains-draft-v1.mjs` and apply every correction in the map
     (pipeline package, intake → candidates, shortlist/logistics/screening-coverage → matching, meetings/linkedin → integrations,
     job-channels → shared catalogue, apply → distribution, collaboration/queries → candidates, kernel files, and so on).
   - `inventory.mjs`: writes `docs/refactor/inventory.csv` (`old_path,new_package,entry(shared|server|web|app)`). Exits 1 on any unmapped file.
   - `matrix.mjs`: package-level import counts. Diff against `evidence/baseline-matrix.txt`.
   - `table-owners.mjs`: parses `pgTable("…")` names (they span lines; use a multiline regex) and checks each against map §7.
6. `tools/depcruise.cjs` with all map §5 rules at **warn**.
7. CI workflow for the new repo: install → typecheck → lint → test → test:db (Postgres service + migrate) → `agents:lock` check → build.
8. Answer U1–U5 (map §9) with the product owner, and write the answers into the map.

Deliverables: running monorepo shell, tools, `inventory.csv`, CI, map §9 answers.
Gate: plan Gate 1.
Reviewer focus: a clean clone works, inventory has 0 unmapped files, no forbidden files are tracked, and the test count equals the source repo's.

### Phase 2: L0 foundation (`config`, `observability`, `security`, `storage`, `db`)

Inputs: map §4 L0; `evidence/findings-platform.md` §1, §4, §6.

Steps per package (one PR set each, in this order):

1. Create `packages/<pkg>/` with `package.json` (`name: "@ats/<pkg>"`, `exports: {"./shared": …, "./server": …}`),
   `tsconfig.json` extending `tools/tsconfig`, `src/shared/index.ts`, `src/server/index.ts` (first line `import "server-only";`), `test/`.
2. **Move PR:** `git mv` the files listed in map §4. Leave shims at old paths. Update `inventory.csv`.
3. **Change PRs** (separate), where the map asks for one:
   - `config`: per-app zod env schemas. Replace raw `process.env[...]` reads one area at a time.
   - `observability`: SLO evaluator takes `notify` (wired in `apps/web/src/boot.ts` to comms `send-email`).
     Move `agents/alerts.server.ts` (signAlert), `voice/debug.ts` and `lib/error-capture.ts` here.
   - `db`: create `src/json-types/` from the zod types in `lib/{interview-plan,expert-brief,vtt,panel-assessment}.ts`.
     The old files re-export. `schema.ts` imports types from `./json-types`. Point `drizzle.config.ts`,
     `migrate-pg.mjs` and `gen-er-diagram.mjs` at the package.
4. Re-point Vite `importProtection` in `apps/web/vite.config.ts` to also cover `@ats/*/server`.
5. Move the tests for these files into `packages/<pkg>/test/` and fix imports and mocks.

Deliverables: five packages, shims, updated inventory, tests moved.
Gate: plan Gate 2 (includes running migrations twice, an ER diagram diff, and a client bundle grep).
Reviewer focus: no logic edits in move PRs, the schema typing still holds, and server strings are absent from `.output/public`.

### Phase 3: L1 platform (`audit`, `auth`, `ai`, `kernel`, `platform-http`)

Inputs: map §4 L1, §5 events, §6; `evidence/findings-agents.md`, `findings-platform.md` §2.

Steps:

1. `audit`: move only.
2. `auth`: move `identity, password, step-up, action-token, claims, oauth-state, password-policy, work-email`.
   Extract the framework-neutral `resolveOrgContext` and `assertRole`. **Keep `auth.middleware.ts` in `apps/web`**
   at `src/server-fns/_middleware/auth.middleware.ts` (no `server` segment in the path). Move `actorFor`,
   `LifecycleActor` and `APPROVER_ROLE` from `requisitions.server.ts`.
3. `ai`: move the gateway, usage, pricing, spend-cap, prompt-echo, training and redteam, plus `agents/context.ts` and
   `agents/injection.ts` (shims at the old agent paths). Change PR: `registerRedteamTarget()`. Matching registers
   screening in `boot.ts`, which removes `redteam → screening.server`. Change PR: `ai-gateway` uses the observability debug sink.
4. `kernel`: move `policy, registry, manifest.server, task-liveness, hitl, run-messages`. Change PR for `events.ts`:
   `emitAgentEvent` only inserts the row and calls hooks registered with `onAgentEvent(handler)`. **Remove the
   dynamic import of `orchestrator`.** Add `ports.ts` (`AgentPort`, `onDomainEvent`, `onSubjectsDeleted`).
   `apps/web/src/boot.ts` registers `onAgentEvent(e => orchestrator.kick(e))` and provides the `AgentPort` implementation.
   Keep the voice worker's `AGENT_INLINE_KICK=0` behaviour: its boot does **not** register inline kicks.
5. `platform-http`: extract the `server.ts` steps into named functions with the same order. `apps/web/src/server.ts`
   calls them. Keep `start.ts` CSRF middleware.
6. Add a startup assertion that `kernel`, `ai` and `observability` are each loaded once (a module-level symbol on `globalThis`).

Deliverables: five packages, `boot.ts`, `server.ts` slimmed.
Gate: plan Gate 3 (attribution check, limiter burst, CSRF check, empty agents lock diff).
Reviewer focus: event ordering unchanged, agent runs still attributed, both CSRF layers present, limiter coverage identical.

### Phase 4: L2 shared services (`org`, `legal`, `comms`, `integrations`, `desk-core`)

Inputs: map §4 L2; `evidence/findings-domains-ui.md` §A4–A6; `findings-agents.md` §2.

Steps (three devs can run these in parallel, one package each, with no shared files):

1. `desk-core`: extract from `desk.server.ts` the conversation store, `conversationForRequisition`,
   `conversationForSubject`, `postMessage`, `plainPreview`, thread deletion, and a new
   `notifyRequisitionThread(orgId, requisitionId, text, meta)`. Repoint all ~50 domain call sites. **Same call,
   same position, awaited**, so message order doesn't change.
2. `comms`: move templates, send-email, outbox, settings and ics. Change PR: `onInboundMail(handler)`. Split
   `local-inbox.server.ts` into transport (comms) and handlers (candidates CV handler, onboarding documents handler) registered in `boot.ts`.
3. `integrations`: move the meetings/LinkedIn/calendar provider code. `org` keeps the generic credential store (`readSecrets/writeSecrets`).
4. `org`: move the profile, context (split the 1.4k-line `org-context.server.ts` in a separate change PR), master,
   document templates, org setup and integration seeds. Change PR: org-profile/org-context start runs through `AgentPort`.
5. `legal`: move `lib/legal/*`, org-agreements. Move the `LegalSection` type from `components/LegalPage.tsx` into `legal/shared`.

Deliverables: five packages; inbound mail and desk notifications going through ports.
Gate: standard gate per package + desk ordering test + inbound CV mail e2e.
Reviewer focus: no comms → domain imports remain, thread order unchanged, credentials still encrypted.

### Phase 5: L3 wave 1 (`requisitions`, `candidates`, `pipeline`, `distribution`)

Inputs: map §4 L3, §7; `evidence/findings-pipeline.md` (all sections).

**Standard recipe for every L3/L4 package:**

1. **Split PR:** move `*Core` functions out of `*.functions.ts` into the package's `/server`. Move pure helpers to
   `/shared`. Replace upward imports with events/ports (map §5).
2. **Move PR:** `git mv` into `packages/<pkg>/src/{shared,server}`. Move the thin `*.functions.ts` wrapper to
   `apps/web/src/server-fns/<pkg>/` with **the same file name and the same export names**.
3. **Repoint PR:** importers use `@ats/<pkg>/shared|server`. Delete that package's shims.
4. **Tests:** move them and fix imports and `mock.module` paths. Mock assertions must pass.
5. Switch the package's depcruise rules to **error**.

Package notes:

- `requisitions`: `assertRequisitionInOrg` (from `server/guards.ts`) moves here. Closing a role emits
  `requisition.closed` instead of calling `boards.closePostingsForRequisition`.
- `candidates`: takes `intake.*`, `capture`, `collect`, `dedupe`, `collaboration`, `queries`, `pool-share` (rename
  `.server.ts`), `social.server` (unless U2 decided otherwise), `erase.server` (emits `subjects.deleted`), and the CV inbound-mail handler.
- `pipeline`: `lifecycle.ts`, `pipeline.server.ts` (including `recordOfferStageCore`), `stage-events.server.ts`,
  `assessment-timeline.server.ts`. `recordStageTransition` publishes `stage.changed`. Agents, comms (stage
  emails) and training subscribe in `boot.ts`. Shrink the "known writers" list in `pipeline.test.ts` as each writer
  is repointed to a pipeline core. The target is an empty list by the end of Phase 6.
- `distribution`: takes `apply.functions` core, boards, distribution, and subscribes to `requisition.closed`.
  `job-channels.ts` moves to the shared catalogue (L0).

Gate: plan Gate 5.
Reviewer focus: server-function names and ids unchanged, public token functions still rate-limited, `assertRequisitionInOrg` still called before inserts.

### Phase 6: L3 wave 2 (`matching`, `interviews`, `offers`, `onboarding`)

Inputs: map §4 L3; `evidence/findings-pipeline.md` §1–3, `findings-domains-ui.md` §A1–A2.

Same recipe. Notes:

- `matching`: split `matching.functions` and `screening.functions` (cores `prepareScreeningKitForPairing`,
  `gradeScreeningForKit`). Take shortlist, logistics, screening-coverage, expert-brief and career metrics from `career.ts`.
  Register the redteam target.
- `interviews`: split `interviews.functions` (`scheduleInterviewCore`, `markInterviewOutcomeCore`,
  `submitScorecardCore`, `progressionFor`) and `assessment.functions`. Move `assessmentNudges` out of `notifications.functions`.
- `offers`: split `offers.functions` (973 lines). Move `server/agents/hiring-cost.server.ts` core into offers
  (agents keep a thin tool). Move `payNudges` and `negotiationNudges`.
- `onboarding`: split `onboarding.server` (collection / AI check / extraction). Register the documents inbound-mail handler.

Gate: plan Gate 6 (+ `eval:matching` equal to baseline).
Reviewer focus: the "known writers" list is empty, scorecard/panel tests pass, the approval trails are still built server-side with `assertRole`.

### Phase 7: L4 orchestration (`analytics`, `agents`, `desk`, `voice`, `workspace`)

Inputs: map §4 L4; `evidence/findings-agents.md`.

Steps:

1. `analytics`: rename the pure `roi.server`, `ontology.server` and `hr-performance.server` to `.ts`, and move them with `career.ts`.
2. `agents`: move the rest of `server/agents/*`. It implements `AgentPort` and registers hooks. Tools import domain
   `/server` only. Update the imports in `agents-lock.ts` and `agent-governance.test.ts`. Run `agents:lock` and expect **no diff**.
   If a tool shows up as `missing:true`, its registration was lost.
3. `desk`: split the rest of `desk.server.ts` into `intake`, `lifecycle`, `candidates`, `run-bridge`, `progress`.
   Keep `user-manual.ts` as the one source for copilot and help.
4. `voice`: it must not import `agents/index` (the full tool registry). Use kernel and the agents public API.
5. `workspace`: notifications and nudges aggregators; platform-admin cores (keep `requirePlatformAdmin` + `writeAudit`).

Gate: plan Gate 7 (`agents:lock` no diff, `eval:agents` ≥ baseline, registry refusal test, health tests).
Reviewer focus: the voice worker bundle no longer contains the full server, health rules still fire, and no approve/hire-type tool exists.

### Phase 8: Apps

Inputs: map §4 L5; `evidence/findings-domains-ui.md` §B.

Steps:

1. `apps/web` final layout: `src/routes` (thin), `src/app` (AppShell, OrgGate, nav-config, hooks), `src/components`
   (generic), `src/features/<domain>/` (feature components + `queries.ts` split from `lib/data.ts`), `src/server-fns/`,
   `src/routes/api/`, `src/boot.ts`. shadcn moves to `packages/ui`.
2. UI-only PRs, one per file: split `AuthGate` (login/signup into `features/auth`) and the 15 files over 800 lines
   (`desk.tsx`, `integrations.tsx`, `requisitions.$id.tsx`, `candidates.index.tsx`, `index.tsx`, `matching.tsx`, …).
3. Delete every shim (`grep -rn "SHIM"` must be empty). All depcruise rules at **error**.
4. `apps/voice-worker` and `apps/parser-worker`: own entry, Bun build and Dockerfile. Add a build check that fails on any `@tanstack/` import.
5. Update `Dockerfile`(s), `.github/workflows/deploy.yml`, `scripts/deploy.sh` and the GKE/Cloud Run manifests.

Gate: plan Gate 8 (full UI smoke, voice heartbeat, parser `/parse`).
Reviewer focus: every page renders, no console errors, role-gated nav unchanged, images build.

### Phase 9: Python services (REINSTATED 2026-11-23, parallel track)

Follow plan Phase 9: Python services next to the TypeScript app, **not** a backend rewrite. Python devs scaffold
during Phases 3–4 (9a) and build `parser`, then `matching-ml`, then `analytics-ml` (then optionally `voice`) in shadow
mode during Phases 5–8 (9b). Each switches before Phase 10 only at parity (9c).
Hard rules: no DB access, no AI keys (LLM calls go back through the TS gateway), callable only from TS server code via
`safeFetch` with an encrypted service token, Pydantic models generated from zod.
Gate: plan Gate 9 per service.
Reviewer focus: contract drift, tenant `orgId` flow, no direct provider calls, parity evidence, secrets.

### Phase 10: Cut-over

Follow plan Phase 10. Update AGENTS.md invariant paths, README, SECURITY.md, DEPLOYMENT-GCP.md,
infra/DEPLOYMENT-HANDOFF.md, roadmap.md and the ER diagram **in the same change**.

---

## Part E: Templates

### E1. `phase-log.md` row

```
| N | refactor/pN-<name> (#PR, #PR) | packages touched | Gate: pass/fail + date | Reviewer: <name>, signed off <date> | <date> |
```

### E2. Handoff note (append under the table in `phase-log.md`)

```markdown
### Phase N handoff: <date>

- Branch / PRs: …
- Source sync: SOURCE_SHA moved from <old> to <new>; commits applied: …
- Packages created/changed: …
- Change PRs (logic): list each, one line on what changed and why (map section)
- Deviations from map/plan: … (each needs reviewer approval)
- Gate output: paste the last lines of each gate command (pass counts, depcruise summary, agents:lock diff = none)
- Test count before → after: …
- Known gaps / follow-ups: …
- Questions for reviewer: …
```

### E3. Review request (message to the reviewer)

```
review phase N in ATSAgent_refactored
branch: refactor/pN-<name>   (or PR links)
handoff: docs/refactor/phase-log.md#phase-N-handoff
```

### E4. What the reviewer returns

- **Blocker:** breaks a gate, a security invariant, behaviour, or the map's rules. Must be fixed before sign-off.
- **Major:** a wrong placement or a missing test. Fix in this phase.
- **Minor:** naming or docs. Fix now or log it.
- Each finding has a file:line, what's wrong, and the expected fix. The reviewer may push fixes to `fix/pN-*` for you to merge.

---

## Part F: Escalation and decisions

Stop and write a question in the handoff note (and tell the lead) when:

- a file is not covered by `domains.mjs` / map §4, or seems to belong to two packages;
- you'd need a new package, layer or event that isn't in map §5;
- keeping behaviour identical seems impossible (e.g. the order of side effects would change);
- a gate fails and the fix would need a logic change inside a move PR;
- a test needs a real AI provider or real phone call to pass.

Decisions are recorded by updating the map (with date and reason) in the same PR that relies on them.

## Part G: Common mistakes (check before every PR)

- [ ] I changed logic in a move PR.
- [ ] I renamed a `*.functions.ts` file or an exported server function.
- [ ] I ran prettier/eslint `--fix` across agent definition or prompt files.
- [ ] I moved a file but not its `mock.module` paths.
- [ ] I put React into a domain package.
- [ ] I imported `@ats/<pkg>/server` from UI code (outside `server-fns/` and `routes/api/`).
- [ ] I created a second copy of a kernel, ai or observability module.
- [ ] I wrote `applications.stage` outside `pipeline`.
- [ ] I changed a URL prefix or route path.
- [ ] I fixed a bug only in the new repo.
- [ ] I committed `.env*`, `test_data/`, `ai_interviewer/` or a security report.
- [ ] The client-bundle grep's single known exception: the org-ontology skill-tag UI carries a regex
      literal naming databases ("sql|postgres|mysql|…") — UI data, not a credential (phase-2 review).
