# ATSAgent: Module Boundary Map (v2)

**Source:** `ATSAgent` @ `feat/scorecard-rubric` 7990feb, 2026-11-22.
**Method:** full static and dynamic import graph of all 510 files (`scripts/refactor/graph.mjs`), plus a
file-by-file review of every module in four areas: platform, agents/desk/voice, hiring pipeline, and
the remaining domains with UI and tests. Raw evidence is in `docs/refactor/evidence/`. Every claim below
is backed by a file there.

> v1 of this map was wrong in several places. Its domain layering ignored 36 two-way domain dependencies,
> it assigned the pipeline core to "requisitions", and it assumed a separate API app is possible with
> TanStack Start server functions. It isn't (§2).

---

## 1. Facts about the current code

| Item             | Value                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack            | TanStack Start 1.169.4 / Router 1.170, Vite 8 (rolldown), Nitro `node-server`, Drizzle 0.45 + Postgres, Bun tests                                                                      |
| Size             | `src` 510 files ≈ 144k lines; `scripts` 93 files ≈ 38k; schema 3.7k lines, **102 tables**, 74 migrations                                                                               |
| Server functions | 72 files, all named `*.functions.ts` (`createServerFn`)                                                                                                                                |
| HTTP routes      | 24 under `src/routes/api/**` (8 auth, 7 cron, 9 webhook/OAuth/feed/extension) + `/metrics`                                                                                             |
| Runtimes         | ① web server (SSR + server fns + API routes), ② **voice worker** (SIP/RTP over UDP, GKE), ③ **parser worker** (sandboxed CV parsing, Cloud Run), plus the browser extension (plain JS) |
| Path aliases     | `@/*` → `src/*`, `@db/*` → `drizzle/*`                                                                                                                                                 |
| Python           | `ai_interviewer/` is a **gitignored proof of concept**, not used in production                                                                                                         |

### 1.1 Where the code actually lives (by target domain)

| Domain (draft)                           | Files           | Lines                                       |
| ---------------------------------------- | --------------- | ------------------------------------------- |
| UI (routes, components, hooks)           | 183             | 53.0k                                       |
| agents                                   | 48              | 19.1k                                       |
| interviews                               | 36              | 8.5k                                        |
| voice                                    | 33              | 7.7k                                        |
| org                                      | 18              | 7.3k                                        |
| desk                                     | 9               | 7.3k (`desk.server.ts` alone is 4.8k)       |
| db (schema)                              | 3               | 7.0k                                        |
| offers                                   | 19              | 5.4k                                        |
| comms                                    | 32              | 5.0k                                        |
| distribution                             | 16              | 4.4k                                        |
| ai                                       | 12              | 4.3k (`ai-gateway.server.ts` alone is 2.4k) |
| matching                                 | 13              | 3.9k                                        |
| onboarding                               | 9               | 3.2k                                        |
| requisitions / candidates                | 14 / 19         | 3.1k / 3.1k                                 |
| core / auth / catalogue / platform-admin | 22 / 12 / 9 / 2 | 2.2k / 1.0k / 1.6k / 0.6k                   |

### 1.2 Structural problems found (each must be fixed by the refactor)

| #   | Problem                                                                                                                                                                                                                                                                      | Evidence                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| S1  | **Agent-kernel code is stored inside `agents`.** `agents/context.ts` (run scope, 50 lines), `injection.ts`, `events.ts` and `policy.ts` are imported by 9 domains, `ai-usage`, training capture, erase and slo.                                                              | findings-agents §1                            |
| S2  | **`events.ts` hides a cycle.** `emitAgentEvent` dynamically imports `orchestrator.kickAgents`, so every domain that emits an event reaches orchestrator → desk → every domain.                                                                                               | findings-agents §1                            |
| S3  | **Domains call `desk.server.ts`** (≈50 dynamic imports). They only use `conversationForRequisition/ForSubject` + `postMessage`, about 15 lines.                                                                                                                              | findings-agents §2                            |
| S4  | **The pipeline core is misfiled.** `lifecycle.ts`, `pipeline.server.ts`, `stage-events.server.ts` and `assessment-timeline.server.ts` are the application aggregate, used by 10 domains.                                                                                     | findings-pipeline §0                          |
| S5  | **Five `*.functions.ts` files double as server libraries.** `interviews`, `screening`, `matching`, `meetings` and `assessment` export `*Core` functions that other server code imports.                                                                                      | findings-pipeline §1                          |
| S6  | **Foundation imports domains:** `erase→agents/runtime`, `slo→agents/alerts + send-email`, `ai-gateway→voice/debug`, `redteam→screening`, `ai-usage→agents/context`.                                                                                                          | findings-platform §1                          |
| S7  | **Schema imports domain code:** `drizzle/schema.ts` uses `$type<import("../src/lib/…")>` for interview-plan, expert-brief, vtt and panel-assessment.                                                                                                                         | findings-platform §6                          |
| S8  | **Other wrong-way imports:** `local-inbox→intake/cv-text/onboarding`, `integrations→meetings`, `org-profile/org-context→agents runtime`, `requisitions→boards.closePostings`, `hiring-cost` core inside agents, `matching→career.ts`, `legal/*→components/LegalPage` (type). | findings-domains-ui §A8, findings-pipeline §3 |
| S9  | **Misnamed files:** `roi.server`, `ontology.server` and `hr-performance.server` have no deps (they are shared code); `pool-share.ts` is server-only.                                                                                                                         | findings-domains-ui §A                        |
| S10 | **Aggregators sit at domain level:** `notifications.functions` (764 lines) and `nudges.functions` read from agents, offers, interviews and pipeline. `lib/data.ts` is the web's React Query layer.                                                                           | findings-domains-ui §A4/A5                    |
| S11 | **The voice worker bundles almost the whole server** because `call-session` imports `../agents` (all tools). `#tanstack-*` is marked external.                                                                                                                               | findings-agents §3, platform §3               |
| S12 | **UI and server code are separate today but not enforced.** Pages and components import server code only as type-only imports; real server imports are only in `routes/api/**`.                                                                                              | findings-domains-ui §B                        |

---

## 2. Architecture decision: what "separate FE and BE" can mean here

The team asked for a React frontend and a Python backend.

**Constraint:** TanStack Start compiles each server function into a browser stub that POSTs to
same-origin `/_serverFn/<id>`. The handler registry is generated **in the same build**. Version 1.169
cannot host server functions in a separate app. Auth middleware (`getRequest()`), CSRF (two layers),
rate-limit keys, CSP and cookies all assume one origin and one build. (findings-platform §2)

| Option                                                | What it means                                                                                                                                            | Cost                              | Verdict                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| **A. One deployable app plus packages (recommended)** | `apps/web` is the only Start app: UI, thin server functions and HTTP routes. All logic moves to `packages/*`. Workers become their own apps.             | Move only, ~8–11 weeks            | Gives clear FE/BE code ownership and boundaries without a rewrite      |
| B. Separate TS REST API                               | Replace 72 server-function files with a Hono/h3 API plus an OpenAPI client. Re-implement the server.ts pipeline (rate limit, CSRF/CORS, metrics, trace). | +6–10 weeks after A               | Possible later. A makes it cheap because logic is already in packages. |
| C. Python backend                                     | Rewrite ~65k lines of server and agent logic, the AI gateway ledger, and every security invariant                                                        | 6–12 months, high regression risk | **Not recommended.** Python only for isolated services (§4 L5).        |

**This map and the plan implement Option A**, and keep Option B open (`platform-http` is extracted
so it can be reused).

---

## 3. Target layout

```
ATSAgent_refactored/
├─ apps/
│  ├─ web/               ONLY TanStack Start app: routes, UI, *.functions.ts (thin), routes/api/**, server.ts, start.ts
│  ├─ voice-worker/      SIP/RTP phone screening worker (from src/server/voice/worker.ts)
│  ├─ parser-worker/     sandboxed CV parser (from src/server/parser/worker.ts)
│  └─ extension/         browser extension (unchanged plain JS)
├─ packages/             (all React-free except ui and comms email templates)
│  ├─ std  config  observability  security  db  storage                     L0
│  ├─ auth  audit  platform-http  ai  kernel                                L1
│  ├─ org  legal  comms  integrations  desk-core                            L2
│  ├─ requisitions  candidates  pipeline  matching  interviews              L3
│  │  offers  onboarding  distribution
│  ├─ agents  desk  voice  analytics  workspace                             L4
│  └─ ui                                                                    (web only)
├─ services/             (Phase 9) Python services (parser, matching-ml, analytics-ml, voice), called only by TS server code
├─ tools/  eslint-config  tsconfig  evals  refactor/
├─ tests/integration/    cross-package + local-e2e
└─ docs/  infra/
```

Each domain package exposes **three entry points**. These are enforced by `package.json#exports`:

| Entry               | Contains                                                                                                                                           | May be imported by                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `@ats/<pkg>/shared` | types, zod schemas, pure functions                                                                                                                 | anyone, including the browser                          |
| `@ats/<pkg>/server` | DB access, `*Core` functions, AI calls. Starts with `import "server-only"`.                                                                        | server code, workers, `apps/web` server-function files |
| _(no rpc entry)_    | `createServerFn` wrappers stay in **`apps/web/src/server-fns/<pkg>/*.functions.ts`**, because the Start compiler must see them inside the app (§2) | web UI                                                 |

---

## 4. Layers and packages (bottom to top)

A package may import only from **its own layer or lower**. Within one layer, only the edges listed may exist.

### L0: Foundation (no domain knowledge at all)

| Package                                    | Moves from                                                                                                                                                                                                                                                      | Notes                                                                                                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config`                                   | `server/env.ts` + every raw `process.env[...]` read (METRICS_TOKEN, CRON_SECRET, CAPTURE_EXTENSION_IDS, PARSER__, AGENT__, SIP__, VOICE__)                                                                                                                      | Per-app zod schemas: `webEnv`, `voiceEnv`, `parserEnv`                                                                                                                                              |
| `observability`                            | `server/{log,request-context,http-metrics,slo}.ts`, `slo.server.ts` (evaluator), `agents/alerts.server.ts` (signAlert), `voice/debug.ts` (file sink), `lib/error-capture.ts`                                                                                    | SLO alert email arrives through an injected `notify` callback, not by importing comms                                                                                                               |
| `security`                                 | `server/{crypto,safe-fetch,client-ip}.ts`, `lib/document-hidden-text.ts`                                                                                                                                                                                        |                                                                                                                                                                                                     |
| `db`                                       | `drizzle/schema.ts`, `drizzle/pg-migrations/*`, `server/db.ts`, `lib/database.types.ts`, `scripts/{migrate-pg.mjs,gen-er-diagram.mjs,local-db.sh}` + **`db/json-types/`** taking the zod types from `lib/{interview-plan,expert-brief,vtt,panel-assessment}.ts` | **One schema package.** Do not split per domain: FKs, relations and the single ordered migration directory need one module graph. Optionally split into files by domain behind one index. Fixes S7. |
| `storage`                                  | `server/storage.ts`                                                                                                                                                                                                                                             |                                                                                                                                                                                                     |
| shared utils (in `config` or a tiny `std`) | `lib/{utils,money,cost-format,local-time,errors,error-page,public-paths,external-links}`, `mapWithLimit` (from shortlist.ts), `wallDate/zonedTime` (from calendar-availability), `cv-text.server.ts` (document → text)                                          |                                                                                                                                                                                                     |

### L1: Platform services

| Package         | Moves from                                                                                                                                                                                                                                                                                                                                            | Notes                                                                                                                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth`          | `server/{identity,password,step-up,action-token,claims}.ts`, `lib/{oauth-state,password-policy,work-email}.ts`, `actorFor`/`LifecycleActor`/`APPROVER_ROLE` (from requisitions.server)                                                                                                                                                                | **Framework-neutral core** (`resolveOrgContext`, `assertRole`). The TanStack `createMiddleware` adapter (`auth.middleware.ts`) stays in `apps/web`, outside any `server/` folder, because the server-fn compiler must introspect `.middleware([...])`. |
| `audit`         | `server/audit.ts`                                                                                                                                                                                                                                                                                                                                     | `writeAudit`                                                                                                                                                                                                                                           |
| `platform-http` | the pipeline inside `src/server.ts`: error normalising, request context, CSRF guard, rate-limit rules, `/metrics`, SLI flusher start, security headers/CSP nonce; plus `server/{rate-limit,cron-auth}.ts`                                                                                                                                             | Exposed as composable functions. `apps/web/src/server.ts` becomes about 30 lines that call them. Option B can reuse it later.                                                                                                                          |
| `ai`            | `lib/ai-gateway.server.ts` (split into transport / providers / ledger / json), `server/{ai-usage,ai-pricing,ai-spend-cap}.ts`, `lib/prompt-echo.ts`, `server/training/*`, `server/redteam/*`, **`agents/context.ts`** (run and AI-subject AsyncLocalStorage), **`agents/injection.ts`** (`looksLikeInjection`, next to `untrusted`/`INJECTION_RULES`) | Fixes S1/S6 for AI. Redteam targets are registered (`registerRedteamTarget`) by matching at boot, which removes `redteam→screening`. **Must be a single instance in each bundle** (AsyncLocalStorage).                                                 |
| `kernel`        | **`agents/events.ts`** (emit = insert row + call registered hooks only), **`agents/policy.ts`**, `agents/{registry,manifest.server,task-liveness,hitl,run-messages}.ts`; new `ports.ts`: `AgentPort {enqueue, cancelStale, afterSubjectsDeleted, kick}`, `onDomainEvent(type, handler)`, `onSubjectsDeleted(cb)`                                      | Fixes S1/S2/S6. The registry's refusal regex (approve/release/reject/hire/revoke/decline/accept) lives here, so it can never be bypassed by a domain registering a tool.                                                                               |

### L2: Shared business services

| Package        | Moves from                                                                                                                                                                                                                                              | Notes                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `org`          | `lib/{org.functions→server, org-profile*, org-context*, master*, templates*}` (document templates, not email), `server/{org-setup,integration-seeds}.server.ts`, generic credential store from `integrations.server.ts` (`readSecrets/writeSecrets`)    | `org-profile`/`org-context` start agent runs **through `AgentPort`**, never by importing agents. `org-context.server` (1.4k lines) is split into crawl / extract / summarise / persist. |
| `legal`        | `lib/legal/*`, `server/org-agreements.server.ts`, `lib/org-agreements.functions` (core)                                                                                                                                                                 | The `LegalSection` type moves here from `components/LegalPage.tsx` (fixes the lib→UI import).                                                                                           |
| `comms`        | `lib/email-templates/*` (React email, rendered server-side), `send-email.ts`, `email-outbox.server.ts`, `email-settings*`, `ics.ts`, mail transport part of `local-inbox.server.ts`                                                                     | Inbound mail: comms exposes `onInboundMail(handler)`. Candidates and onboarding register handlers. Fixes S8.                                                                            |
| `integrations` | `lib/{meetings.server, meetings-oauth.server, meeting-transcripts.server, meetings.functions→server, linkedin.server, linkedin.functions→server, calendar-availability.server}`, provider-specific part of `integrations.server` / `integrations-oauth` | Meeting/LinkedIn provider clients. Uses the `org` credential store.                                                                                                                     |
| `desk-core`    | from `desk.server.ts`: conversation store, `conversationForRequisition/ForSubject`, `postMessage`, `plainPreview`, thread deletion, new `notifyRequisitionThread()`                                                                                     | Fixes S3. Domains post status lines here. Keep the call **synchronous at the same points** so chat message order doesn't change.                                                        |

### L3: Hiring domains

Allowed edges inside L3, in this order only (left may be imported by right):
`requisitions → candidates → pipeline → matching → interviews → offers → onboarding`, plus
`distribution → {requisitions, candidates}`.

| Package        | shared                                                                                                                                                                     | server                                                                                                                                                                                                                                                                                                                                                                                                                       | Notes                                                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requisitions` | `jd-dedupe, work-mode`                                                                                                                                                     | `requisitions.server, role-profile.server, role-hiring-manager.server`, `guards.ts` (`assertRequisitionInOrg`)                                                                                                                                                                                                                                                                                                               | Closing a role emits `requisition.closed`, which distribution subscribes to. This removes the `requisitions→boards` import.                                            |
| `candidates`   | `cv-extract`, `cv-intake` (client helper → web), `dedupe`, `resume-download`, `Candidate` types (from lib/data.ts)                                                         | `intake.server` (**moved from requisitions**), `capture.server`, `pool-share.server` (renamed), `collect` core, `dedupe` core, `collaboration` core, `queries` core (talent queries), `social.server`, `erase.server` (from core; emits `subjects.deleted`), inbound-mail CV handler (from local-inbox), `server/parser/client.ts`                                                                                           |                                                                                                                                                                        |
| `pipeline`     | `lifecycle.ts` (stage state machine)                                                                                                                                       | `pipeline.server` (`moveStageCore`, `addApplicationsCore`, `addCandidateNoteCore`, `assertReusable`, `screeningOnRecord`), `stage-events.server` (`recordStageTransition`), `assessment-timeline.server`                                                                                                                                                                                                                     | **New package (S4).** It is the **only writer of `applications.stage`.** `recordStageTransition` publishes `stage.changed` through `kernel` instead of calling agents. |
| `matching`     | `shortlist` (rankPool), `logistics`, `screening-coverage`, `expert-brief` types, career metrics (from `career.ts`)                                                         | `matching.server`, `screening.server`, `screening-prep.server`, `autoscore.server`, `bias.server`, `verification.server`, plus the cores split out of `matching.functions` and `screening.functions` (`prepareScreeningKitForPairing`, `gradeScreeningForKit`)                                                                                                                                                               |                                                                                                                                                                        |
| `interviews`   | `interview-plan, interview-with, meeting-ref, panel-assessment, panel-brief, panel-reconcile, vtt` (JSON types re-exported from `db/json-types`)                           | `interview-plan.server, interviewer-brief.server, interviewers.server, panel-brief.server, panelist-links.server, panelists.server, panels.server, slot-offers.server, assessment.server, server/panel/*`, plus cores split from `interviews.functions` (`scheduleInterviewCore, markInterviewOutcomeCore, submitScorecardCore, progressionFor`) and `assessment.functions`. Nudges from notifications (`assessmentNudges`). |                                                                                                                                                                        |
| `offers`       | `offer-letter-pdf` (types made type-only), `career-ladder`                                                                                                                 | cores split from `offers.functions` (973 lines), `offer-response.server, compensation.server, negotiation.server, comp-knowledge.server, market.server, salary-benchmark.server`, **`hiring-cost` core moved out of `server/agents/hiring-cost.server.ts`**, `payNudges`, `negotiationNudges`                                                                                                                                | Offer stage writes go through `pipeline.recordOfferStageCore` (fixed in the source repo, branch `fix/offer-stage-events`).                                             |
| `onboarding`   | `hrms.ts`                                                                                                                                                                  | `onboarding.server` (split: collection / AI check / extraction), `hrms.server`, inbound-mail document handler                                                                                                                                                                                                                                                                                                                | Starts on `offer.accepted` (or a direct downward call from offers).                                                                                                    |
| `distribution` | `job-channels` (also used by candidates and org, so it **moves to a shared catalogue in `config/std`**), `server/distribution/content.ts`, `server/boards/{types,hmac}.ts` | `server/boards/*`, `server/distribution/*`, `apply.functions` core (public career-site apply; **moved from candidates**)                                                                                                                                                                                                                                                                                                     | Subscribes to `requisition.closed`.                                                                                                                                    |

### L4: Orchestration and aggregation (may import any lower package)

| Package     | Moves from                                                                                                                                                                                                                                                                                                             | Notes                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `agents`    | `server/agents/*` minus what moved to kernel/ai/observability: `runtime.server` (2.8k), `orchestrator.server`, `definitions.ts`, `tools*.ts`, `health.server`, `panel-gate`, `expert-gate`, handoff…; `lib/{agents.catalog, eval-catalog}`; agent server-fn cores; `scripts/{agents-lock.ts,agents.lock.json,evals/*}` | Implements `AgentPort` and registers kernel hooks at boot (§6). Tools import domain **`/server`** entries only.              |
| `desk`      | rest of `desk.server.ts`, split into `intake / lifecycle / candidates / run-bridge / progress`, `org-desk.server`, `lib/{copilot, desk-view, user-manual, onboarding.catalogue, manual-export}`                                                                                                                        | `user-manual.ts` stays one source for copilot and help (AGENTS.md).                                                          |
| `voice`     | `server/voice/*` except `debug.ts` and `worker.ts`, `lib/{screening-calls, phone-screening}` cores                                                                                                                                                                                                                     | Imports `agents` only through `kernel` and the agents public API. **It must not import the full tool registry** (fixes S11). |
| `analytics` | `roi.server→roi.ts`, `ontology.server→ontology.ts` (pure), `hr-performance.server→hr-performance.ts`, `career.ts` (rest), bias report, reports queries                                                                                                                                                                 |                                                                                                                              |
| `workspace` | `notifications.functions` core (composes domain nudges), `nudges.functions` core, `platform*.functions` cores (each guarded by `requirePlatformAdmin`, with `writeAudit` kept)                                                                                                                                         | Cross-domain feeds (S10).                                                                                                    |

### L5: Apps (composition roots)

| App                  | Contains                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Must not contain                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `apps/web`           | `src/routes/**` (thin pages), `src/routes/api/**` (24 HTTP routes), `src/server-fns/<pkg>/*.functions.ts` (72 thin wrappers: validator + auth middleware + call into `@ats/<pkg>/server`), `src/server.ts` + `start.ts`, `src/app/` (AppShell, AuthGate split, OrgGate, nav-config, hooks), `src/components/` (generic), `src/features/<domain>/` (feature components, `queries.ts` split from `lib/data.ts`, client exports such as catalogue-export), `src/boot.ts` (registers hooks) | business logic, DB queries                                |
| `apps/voice-worker`  | `voice/worker.ts` + boot; depends on `voice`, `kernel`, `ai`, `db`, `config`                                                                                                                                                                                                                                                                                                                                                                                                            | any `@tanstack/*` import (the build fails if one appears) |
| `apps/parser-worker` | `parser/worker.ts`; depends on `config`, `security`, std `cv-text`                                                                                                                                                                                                                                                                                                                                                                                                                      | DB, secrets other than `PARSER_TOKEN`                     |
| `apps/extension`     | unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                           |

---

## 5. Dependency rules (enforced in CI)

1. Layer rule: an import from a higher layer is a lint error (`eslint-plugin-boundaries` or `dependency-cruiser`).
2. L3 order rule: the list in §4 L3. No other edges between L3 packages.
3. `/shared` entries must not import `/server` entries, `node:*`, `db`, `config` (except shared catalogues) or React.
4. Domain packages are React-free. Only `ui`, `apps/web` and `comms` email templates use React.
5. Only `pipeline` writes `applications.stage`. A test greps for `set({ stage` outside pipeline.
6. Only `ai` imports provider SDKs or calls provider URLs.
7. Only `security.safeFetch` performs outbound `fetch` in `/server` code.
8. `apps/web` UI files (outside `server-fns/` and `routes/api/`) import only `/shared`, `ui` and server-function files.
9. No cycles, at package or file level.
10. `kernel`, `ai` and `observability` must resolve to **one copy** per bundle (`resolve.dedupe`, plus a startup check).

### Cross-cutting events (replace the wrong-way imports)

| Event / port             | Published by                           | Subscribers (registered in `boot.ts`)                               | Replaces                                   |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| `stage.changed`          | pipeline                               | agents (cancelStale + emit), comms (stage emails), training capture | `stage-events→agents/runtime`              |
| `requisition.closed`     | requisitions                           | distribution (close postings), agents                               | `requisitions→boards`                      |
| `subjects.deleted`       | candidates (erase, dedupe merge)       | agents (`afterSubjectsDeleted`)                                     | `erase/dedupe/requisitions→agents/runtime` |
| `agent.event` (emit)     | any domain via `kernel.emitAgentEvent` | agents orchestrator (`kick`)                                        | `events.ts→orchestrator` dynamic import    |
| `AgentPort.enqueue/kick` | org-profile, org-context, desk         | agents                                                              | `org-*→agents runtime/orchestrator`        |
| `onInboundMail`          | comms                                  | candidates (CV), onboarding (documents)                             | `local-inbox→intake/onboarding`            |
| `registerRedteamTarget`  | matching                               | ai/redteam                                                          | `redteam→screening`                        |
| `notify` (SLO alerts)    | observability                          | comms                                                               | `slo→send-email`                           |

---

## 6. Security invariants: where each one lives after the move

| Invariant (AGENTS.md)                                                     | Owner after move                                  | How it is kept                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requireOrg/Role/OrgOwner/PlatformAdmin` on every tenant-scoped server fn | `auth` core + adapter in `apps/web`               | Lint rule: every `createServerFn` in `server-fns/` has an auth middleware or is on the allow-list of public-token functions (apply, slot-offers, panelist-links, compensation, negotiation, offer-response, assessment, catalogue, platform public) |
| `eq(table.orgId, …)` on every query                                       | each `/server`                                    | Existing tenancy tests move with their package                                                                                                                                                                                                      |
| `assertRequisitionInOrg`                                                  | `requisitions/server`                             |                                                                                                                                                                                                                                                     |
| `safeFetch` only                                                          | `security`                                        | Rule 7                                                                                                                                                                                                                                              |
| `untrusted()` + `INJECTION_RULES` + zod-validated `aiJson`                | `ai`                                              | Rule 6                                                                                                                                                                                                                                              |
| Approval transitions server-side with `assertRole`                        | `requisitions`, `offers`                          |                                                                                                                                                                                                                                                     |
| `writeAudit` on privileged actions                                        | `audit`                                           |                                                                                                                                                                                                                                                     |
| `encryptSecret`                                                           | `security`                                        |                                                                                                                                                                                                                                                     |
| Rate limits on public routes and RPCs                                     | `platform-http`, used by `apps/web/src/server.ts` | **Keys use URL paths. Do not change `/api/public`, `/api/auth` or `/_serverFn` prefixes.** Gap to close: `/api/auth/confirm`, `/me` and `/session` are not limited today.                                                                           |
| Every AI call through gateway with `feature` from `AI_FEATURES`           | `ai`                                              |                                                                                                                                                                                                                                                     |
| No vendor/model names to the client                                       | `ai` + server-fn wrappers                         |                                                                                                                                                                                                                                                     |
| Agent manifest, version and `agents.lock.json`                            | `agents`                                          | The lock hashes manifest **content**, not paths. A move gives an empty diff if the text is unchanged.                                                                                                                                               |
| No approve/hire-type agent tools                                          | `kernel/registry`                                 |                                                                                                                                                                                                                                                     |
| Health rules + tests                                                      | `agents/health`                                   |                                                                                                                                                                                                                                                     |
| AI calls attributed to runs                                               | `ai` (context)                                    | One instance only (rule 10)                                                                                                                                                                                                                         |
| Training capture with consent, erasure cascade                            | `ai/training`                                     |                                                                                                                                                                                                                                                     |
| Two CSRF layers (`server.ts` guard + `start.ts` middleware)               | `platform-http` + `apps/web/start.ts`             | Keep both. Defining `start.ts` turns off Start's default CSRF.                                                                                                                                                                                      |
| Vite import protection (`**/server/**` mocked in client bundle)           | `apps/web/vite.config.ts`                         | Must be re-pointed to `@ats/*/server` specifiers and `server-only`. Otherwise moving code out of `server/` folders silently removes the protection.                                                                                                 |

---

## 7. Table ownership (102 tables)

One `db` package. Ownership decides **which package's `/server` may write**; anyone may read through
the owner's server functions or, for reporting, directly.

| Owner                                          | Tables                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auth                                           | users, sessions, platform_admins, notification_states                                                                                                                                                                                                                                               |
| org / legal                                    | organizations, org_members, user_roles, departments, master_items, org_profiles, org_profile_versions, org_context_sources, content_templates, org_pool_shares, org_agreements                                                                                                                      |
| platform (observability, platform-http, audit) | audit_log, rate_limit_hits, service_request_minutes, slo_alerts, service_tokens (added Phase 9, 2026-11-24 — internal service-token storage; review 9a B2)                                                                                                                                          |
| ai                                             | ai_settings, ai_provider_credentials, ai_usage_events, ai_redteam_checks, training_settings, training_inferences, training_feedback, training_eval_results                                                                                                                                          |
| requisitions                                   | requisitions, job_descriptions, role_panels*                                                                                                                                                                                                                                                        |
| candidates                                     | candidates, social_profiles, candidate_notes, candidate_ownership_events, candidate_referrals, talent_requests, talent_request_suggestions, capture_events                                                                                                                                          |
| pipeline                                       | **applications** (sole writer of `stage`), stage_events                                                                                                                                                                                                                                             |
| matching                                       | match_scores, screening_kits, screening_runs, screening_prep_jobs, candidate_verifications                                                                                                                                                                                                          |
| interviews                                     | interviews, interview_slot_offers, round_substitutes, panelists, member_interviewer_profiles, panelist_scorecard_links, evaluations, interview_transcripts, panel_assessments, panel_agent_settings, ai_interviews, candidate_assessments, assessment_settings                                      |
| offers                                         | offers, offer_negotiations, compensation_requests, compensation_details, salary_benchmarks, comp_knowledge, hr_incentive_schemes                                                                                                                                                                    |
| onboarding                                     | onboarding_documents, hrms_employees, hrms_sync_state, hrms_field_mappings                                                                                                                                                                                                                          |
| integrations                                   | source_integrations, integration_credentials, org_linkedin_connections                                                                                                                                                                                                                              |
| comms                                          | email_outbox, email_settings, inbox_messages                                                                                                                                                                                                                                                        |
| distribution                                   | requisition_board_postings, org_job_distribution, job_index_notifications, board_webhook_events, board_sync_state                                                                                                                                                                                   |
| voice                                          | screening_calls, phone_screening_settings, voice_worker_heartbeat                                                                                                                                                                                                                                   |
| analytics                                      | skill_nodes, skill_edges, skill_evidence, ontology_snapshots                                                                                                                                                                                                                                        |
| agents / desk / catalogue                      | agent_policies, agent_events, agent_definitions, agent_runs, agent_steps, agent_tasks, agent_metrics_daily, agent_issues, agent_runtime_heartbeat, agent_telemetry_settings, agent_cost_rates · hiring_conversations, hiring_messages, copilot_messages (desk-core) · product_catalogue_commercials |

\* `role_panels` is written by interviews code today. Decide in Phase 1: keep it in requisitions (written through a requisitions core) or move it to interviews.
Hotspots: `organizations` (89 FK refs), `users` (31), `applications` (22), `candidates` (20), `requisitions` (19), `agent_runs` (9; referenced by training, negotiation, panel and screening-call tables).
`screening_calls` references 10 tables across 6 domains. Leave it as is, and document it as a voice-owned table.

**125 tables** at `SOURCE_SHA` `dcb6a4b` (was 102 at `7990feb`; 23 new from #69/#78 — owners proposed in `scripts/refactor/table-owners.mjs`, approved at Gate 1). Any table added later needs an owner before it merges.

---

## 8. Tests: where they go

- 70 `*.test.ts` files on `main`. CI (`.github/workflows/ci.yml`) lists 55 of them by hand. **15 never run in CI**: hiring-sla,
  interview-confirmations, interviewer-brief, matching-gates, meeting-transcripts, the panel-* tests, scorecard-chase and scorecard-rubric.
  The `package.json` `test` script runs a different, shorter list.
- Tests import `../src/...` and `../drizzle/schema` by relative path (88× schema, 49× db). There are 20+
  `mock.module("../src/…")` calls. **Bun mocks match by path, so a stale path stops applying without any
  error, and the test then hits the real DB or AI.**
- Tiers: pure unit (~11) · DB with mocked AI · DB without AI · may call real AI (env-gated) · evals (manual, real AI) · ops scripts.
- Destination: each test moves to the package it covers (table in evidence/findings-domains-ui §C).
  `integration.verify` + `local-e2e` → `tests/integration`. Evals → `tools/evals`. Ops scripts → `tools/` or `packages/db`.
- Missing tests that must exist **before** the move (they guard the riskiest step): `lifecycle.canMove`
  transitions, `moveStageCore`, the effects of `recordStageTransition`, and "every `applications.stage` write emits a stage event".

---

## 9. Unknowns: decided 2026-11-23 by the product owner (all defaults accepted)

| #   | Question                                                              | Decision                        |
| --- | --------------------------------------------------------------------- | ------------------------------- |
| U1  | `role_panels` owner                                                   | requisitions                    |
| U2  | `social.server` in candidates or matching                             | candidates (enrichment)         |
| U3  | Does `apps/voice-worker` keep sharing one Docker image with web?      | Separate images per app         |
| U4  | Cron routes stay HTTP (Cloud Scheduler) or move to a scheduler worker | Stay HTTP (no behaviour change) |
| U5  | Does Option B (REST API) follow?                                      | Decide after Phase 8            |

## 10. Rulings at `SOURCE_SHA` `ca7599c` (reviewer, 2026-11-23)

The re-run at `ca7599c` found 125 tables, 24 unmapped files and 5 new wrong-way imports. These rulings bind Phase 1's `domains.mjs` and `table-owners.mjs`. The reasoning is in `reviews/phase-0-review.md`.

**New wrong-way imports: fixes (add to §1.2 and §5):**

| Edge                                                             | Ruling                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `desk.server` → voice internals (5 dynamic imports)              | Not an allowed L4 edge. Voice exports a public API (`requestScreeningCall`, open-call status, call brief, settings read). Desk imports only that. |
| `lib/slot-offers.server` → `voice/scheduling-request.server`     | Break the `interviews ↔ voice` cycle with a port that voice registers (same pattern as `AgentPort`), or with an interviews event.                 |
| `lib/copilot.functions` → `components/nav-config` (`NAV_GROUPS`) | Move the nav data to a pure shared module. The UI and the copilot both import it.                                                                 |
| `drizzle/schema.ts:1292` → `lib/offer-check`                     | S7: move the type to the json-types module, like the other four.                                                                                  |
| `server/hiring-sla.server` → `desk.server` + `lib/lifecycle`     | Place `hiring-sla` in desk (L4). The edge is then legal.                                                                                          |

**Placement of the 24 unmapped files:**

| Files                                                                      | Domain                                                                 |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pay-*` (6), `labour-policy`, `offer-check`                                | offers (`policy/` subfolder, no new package)                           |
| `workflow-templates`, agent-intelligence / governance / reports / modality | agents                                                                 |
| copilot server (2)                                                         | desk                                                                   |
| `call-reviews`                                                             | voice                                                                  |
| `hiring-sla`, `hiring-oversight`, `demand-outlook`, `pool-coverage`        | desk / analytics (confirm against imports)                             |
| `iso`, `appearance`, `report-window`, `weight-advice`                      | shared utils, except `weight-advice` → matching if it imports matching |
| `src/server.ts`                                                            | apps/web composition root                                              |

**The 23 new tables:** the executor proposes owners in `table-owners.mjs` using the same rule as §7 (the writer owns the table). The reviewer approves them at Gate 1. §7's count becomes 125.

**Before Phase 2:** fix review finding R1, so the stage-writer guard scans `src`, `apps` and `packages` and asserts a minimum file count.

## 11. Rulings from the Phase 4 dry runs (reviewer, 2026-11-24)

Rehearsed the legal/comms/integrations moves against the Phase 3 branch (`a4008c4`); findings and
reasoning in `notes/dev2-phase4-dryruns.md` (PR #17).

| #   | Topic                                  | Ruling                                                                                                                                                                                                          |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `email-brand.server`                   | Moves to `@ats/comms/server` (L0 imports only; `send-email` needs it).                                                                                                                                          |
| 2   | `createMeetingLinkCore` wrapper        | Drops `createServerOnlyFn`: exported only from `./server` (server-only marker there); the app wrapper keeps `createServerFn` + its middleware unchanged.                                                        |
| 3   | `ics`                                  | Split: `buildIcs` (pure) → `@ats/comms/shared`; `downloadIcs` (Blob/document) stays an apps/web UI helper — domain packages are DOM-free.                                                                       |
| 4   | comms move order                       | (a) transport + `onInboundMail(handler)` registry change PR → (b) intake/onboarding/job-channel handlers stay in the app, registered in `boot.ts` → (c) the `email-outbox` move. (a) is a prerequisite for (c). |
| 5   | integrations ↔ web `readSecrets` cycle | Temporary: lazy import only, `// SHIM: remove when the credential store moves to @ats/org`, counted in depcruise warnings (WARN_MAX must not rise). Prefer Dev 1 landing `@ats/org`'s credential store first.   |
| 6   | `server-only` in `shared` entries      | `@ats/*/shared` entries must be browser-safe (rule 5); checked at the Phase 3 review before #15 merges.                                                                                                         |
