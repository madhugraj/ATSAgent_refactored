# Phase 5 move runbook — `requisitions`, `candidates`, `distribution` (Dev 2)

**Written:** 2026-11-25, Dev 2. **Verified against:** `apps/web/src` at `main` `e50d8eb`
(refactor repo). Every count below was produced by resolving every import specifier
(`@/…`, every relative depth, dynamic `import(…)`, `mock.module(…)`) against the real
file paths — not by substring grep. Map references: `01-module-boundary-map.md` §4 L3,
§5 events, §10/§11 rulings; evidence: `inline-server-fns.md`, `stage-writers.md`.

**Start condition:** the moves begin the day Dev 1's `packages/pipeline` PRs land
(`moveStageCore` `cause` param, AI-principal/`source`, `moveStagesCore`,
`recordOfferStageCore` extension, and the `addApplicationsCore` options — stage-writers §
"Phase 5 order suggestion" items 1–5). This runbook makes execution same-day.
`packages/{requisitions,candidates,distribution}` do **not** exist yet — the three
skeleton PRs are Dev 2's first PRs (copy `packages/legal`: `package.json` with
`/shared` + `/server` exports, `tsconfig.json`, `src/server/index.ts`, `src/shared/index.ts`).

**Import styles found in the tree** (checked before counting):
`from "@/lib/X"` and `from "@/server/guards"` (app code, UI, server-fn wrappers) ·
relative `./X` / `../server/boards/publish.server` (inside `lib` and `server`, some
dynamic `await import(...)`) · scripts and package tests use
`../apps/web/src/…` / `../../../apps/web/src/…` dynamic imports. No `@/…` imports in
`scripts/` (zero hits). Importer categories: **app-lib** = `apps/web/src/lib` +
`components` + `boot.ts` + `server` (non-agents, incl. the `*.functions.ts` wrappers);
**routes** = `apps/web/src/routes/**`; **agents** = `apps/web/src/server/agents/**`;
**scripts** = `scripts/**`; **packages** = `packages/**`.

---

## 1. Per-file importer inventory

### 1a. requisitions (6 files, 42 importers)

| File                                | app-lib | routes | agents | scripts | packages | Importers                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------- | ------- | ------ | ------ | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/requisitions.server.ts`        | 3       | 0      | 7      | 6       | 2        | app-lib: `pipeline.server.ts`, `requisitions.functions.ts` (11 import statements), `server/desk/desk.server.ts` · agents: `runtime.server`, `tools.ts`, `tools-distribution`, `tools-org`, `tools-phase2`, `tools-phase3`, `tools-phase4` · scripts: `agent-edge-cases`, `agent-phase1`, `matching-gates`, `pipeline.test`, `requisition-changes`, `weight-advice` (.test.ts) · packages: `org/test/org-context.test.ts:49`, `org/test/org-profile.test.ts:39` |
| `lib/role-profile.server.ts`        | 1       | 0      | 0      | 0       | 0        | `role-profile.functions.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `lib/role-hiring-manager.server.ts` | 1       | 0      | 0      | 1       | 0        | app-lib: `role-hiring-manager.functions.ts` · scripts: `interview-panels.test.ts`                                                                                                                                                                                                                                                                                                                                                                              |
| `lib/jd-dedupe.ts`                  | 0       | 1      | 0      | 0       | 0        | `routes/requisitions.index.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `lib/work-mode.ts`                  | 3       | 1      | 1      | 1       | 0        | app-lib: `server/boards/publish.server.ts`, `server/desk/desk.server.ts`, `server/voice/call-brief.server.ts` · routes: `requisitions.$id.tsx` · agents: `tools.ts` · scripts: `requisition-changes.test.ts:36`                                                                                                                                                                                                                                                |
| `server/guards.ts`                  | 12      | 0      | 2      | 0       | 0        | app-lib: `candidates.functions`, `capture.server`, `collaboration.functions`, `comp-knowledge.functions`, `hiring-cost.functions`, `hiring-desk.functions`, `intake.server`, `interview-plan.functions`, `panels.functions`, `role-hiring-manager.functions`, `boards/publish.server`, `distribution/distribution.server` · agents: `tools-expert.ts`, `tools-phase3.ts`                                                                                       |
| **Total**                           | **20**  | **2**  | **10** | **8**   | **2**    | **42**                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Requisition cores already exist and are suite-tested: `createRequisitionCore` (:83),
`updateRequisitionDraftCore` (:177), `advanceRequisitionCore` (:202),
`sendBackRequisitionCore` (:284), `updateRequisitionCompensationCore` (:375),
`saveRequisitionWeightsCore` (:436), `setRequisitionIjpCore` (:553),
`saveJobDescriptionCore` (:553ff), `approveJobDescriptionCore` (:668),
`requestJdChangesCore` (:668ff), `editRequisitionInApprovalCore` (:707) — line numbers in
`apps/web/src/lib/requisitions.server.ts` at `e50d8eb`. No core extraction is a
precondition for the requisitions move beyond the inline fns in §5.

### 1b. candidates (17 modules, 75 importers)

| File                                                      | app-lib | routes | agents | scripts | packages | Importers                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------- | ------- | ------ | ------ | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/intake.server.ts`                                    | 4       | 0      | 0      | 3       | 0        | app-lib: `capture.server`, `intake.functions`, `local-inbox.server:30`, `server/boards/ingest.server` · scripts: `agent-hiring-cost-offer`, `distribution-agent:37`, `integration.verify` (.test.ts)                                                                                                                                                                                                          |
| `lib/capture.server.ts`                                   | 1       | 2      | 0      | 1       | 0        | app-lib: `capture.functions` · routes: `api/public/capture.ts`, `api/public/distribution.ts` · scripts: `integration.verify.test.ts`                                                                                                                                                                                                                                                                          |
| `lib/pool-share.ts`                                       | 1       | 0      | 0      | 1       | 0        | app-lib: `queries.functions` · scripts: `distribution-agent.test.ts:216`                                                                                                                                                                                                                                                                                                                                      |
| `lib/dedupe.ts`                                           | 0       | 2      | 0      | 0       | 0        | `routes/candidates.index.tsx`, `routes/index.tsx` (`dedupe.functions.ts` does **not** import it — self-contained)                                                                                                                                                                                                                                                                                             |
| `lib/collect.functions.ts`                                | 0       | 1      | 0      | 0       | 0        | `routes/integrations.tsx`                                                                                                                                                                                                                                                                                                                                                                                     |
| `lib/collaboration.functions.ts`                          | 1       | 2      | 0      | 0       | 0        | app-lib: `components/CandidateCollab.tsx` · routes: `candidates.index.tsx`, `collaboration.tsx`                                                                                                                                                                                                                                                                                                               |
| `lib/queries.functions.ts`                                | 1       | 1      | 0      | 0       | 0        | app-lib: `lib/data.ts` · routes: `desk.tsx`                                                                                                                                                                                                                                                                                                                                                                   |
| `lib/social.server.ts`                                    | 3       | 0      | 0      | 0       | 0        | `capture.server`, `matching.functions`, `matching.server`                                                                                                                                                                                                                                                                                                                                                     |
| `server/erase.server.ts`                                  | 1       | 0      | 1      | 1       | 0        | app-lib: `candidates.functions` · agents: `distribution-agent.server.ts` · scripts: `agent-phase2.test.ts`                                                                                                                                                                                                                                                                                                    |
| `lib/cv-extract.ts`                                       | 1       | 4      | 0      | 0       | 0        | app-lib: `cv-intake.ts` · routes: `apply.$id.tsx`, `matching.tsx`, `requisitions.$id.tsx`, `templates.tsx`                                                                                                                                                                                                                                                                                                    |
| `lib/cv-intake.ts`                                        | 1       | 1      | 0      | 0       | 0        | app-lib: `components/CvUpload.tsx` · routes: `desk.tsx` (map §4: client helper → **web**, not the package)                                                                                                                                                                                                                                                                                                    |
| `lib/resume-download.ts`                                  | 0       | 3      | 0      | 0       | 0        | `candidates.$id.tsx`, `candidates.index.tsx`, `screening.tsx`                                                                                                                                                                                                                                                                                                                                                 |
| `lib/resume.functions.ts`                                 | 0       | 3      | 0      | 0       | 0        | same three routes (stays in web as the wrapper)                                                                                                                                                                                                                                                                                                                                                               |
| `lib/candidates.functions.ts`                             | 0       | 2      | 0      | 0       | 0        | `candidates.index.tsx`, `index.tsx` (stays in web)                                                                                                                                                                                                                                                                                                                                                            |
| `lib/data.ts` (Candidate types only)                      | 11      | 14     | 0      | 0       | 0        | app-lib: `components/{CandidateCollab,CommandPalette,LeadershipBoard,OfferLetterDialog,RolePeek,ScreeningPanel,StageMover,pickers,salary-benchmark}`, `lib/dedupe.ts`, `lib/shortlist.ts` · routes: `candidates.$id`, `candidates.index`, `collaboration`, `ijp`, `index`, `interviews.index`, `masters`, `matching`, `offers`, `reports`, `requisitions.$id`, `requisitions.index`, `screening`, `templates` |
| `lib/local-inbox.server.ts` (CV-handler part; whole file) | 3       | 1      | 1      | 2       | 0        | app-lib: `boot.ts:45`, `collect.functions`, `local-inbox.functions` · routes: `api/public/inbound-email.ts` · agents: `sourcing.server.ts` (uses `inboxSource`) · scripts: `distribution-agent.test.ts:36`, `inbound-cv-e2e.test.ts:20`                                                                                                                                                                       |
| `server/parser/client.ts`                                 | 1       | 0      | 0      | 0       | 0        | `lib/cv-text.server.ts:24` (dynamic)                                                                                                                                                                                                                                                                                                                                                                          |
| **Total**                                                 | **29**  | **36** | **2**  | **8**   | **0**    | **75**                                                                                                                                                                                                                                                                                                                                                                                                        |

**Packages not yet landed — importer flag:** no importer of any candidates file lives in
an unlanded package. The one package hit in §1a is the reverse problem:
`packages/org/test/*` (L2, landed) imports the L3 requisitions module — see §5 R6.

### 1c. distribution (16 files + the `job-channels` catalogue, 77 importers)

| File                                                        | app-lib | routes | agents | scripts | packages | Importers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | ------- | ------ | ------ | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/boards/hmac.ts`                                     | 2       | 0      | 0      | 0       | 0        | `boards/indeed.ts`, `boards/naukri.ts` (intra-package)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `server/boards/indeed.ts`                                   | 1       | 0      | 0      | 0       | 0        | `boards/registry.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `server/boards/ingest.server.ts`                            | 1       | 1      | 0      | 0       | 0        | app-lib: `boards/poll.server.ts` · routes: `api/public/boards/$provider.$token.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `server/boards/linkedin.ts`                                 | 1       | 0      | 0      | 0       | 0        | `boards/registry.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `server/boards/naukri.ts`                                   | 1       | 0      | 0      | 0       | 0        | `boards/registry.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `server/boards/partner.ts`                                  | 3       | 0      | 0      | 0       | 0        | `boards/indeed.ts`, `boards/ingest.server.ts`, `boards/naukri.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `server/boards/poll.server.ts`                              | 0       | 1      | 0      | 0       | 0        | `api/public/board-sync.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `server/boards/publish.server.ts`                           | 3       | 0      | 1      | 2       | 0        | app-lib: `boards.functions`, `requisitions.server.ts:254` (dynamic), `distribution/distribution.server` · agents: `tools.ts` · scripts: `distribution-agent.test.ts:42`, `job-distribution.test.ts:49`                                                                                                                                                                                                                                                                                                                                      |
| `server/boards/registry.ts`                                 | 4       | 0      | 1      | 0       | 0        | app-lib: `boards.functions`, `boards/ingest.server`, `boards/poll.server`, `boards/publish.server` · agents: `sourcing.server.ts`                                                                                                                                                                                                                                                                                                                                                                                                           |
| `server/boards/types.ts`                                    | 8       | 0      | 0      | 0       | 0        | all other `boards/*` files (intra-package)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `server/distribution/content.ts`                            | 3       | 0      | 0      | 2       | 0        | app-lib: `apply.functions`, `labour-policy.server.ts`, `distribution.server` · scripts: `job-distribution.test.ts:44`, `pay-offers.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                 |
| `server/distribution/distribution.server.ts`                | 2       | 2      | 3      | 2       | 0        | app-lib: `apply.functions`, `distribution.functions` · routes: `api/public/distribution.ts`, `api/public/feeds/$token.$format.ts` · agents: `distribution-agent.server`, `orchestrator.server`, `tools-distribution` · scripts: `distribution-agent:45`, `job-distribution:45` (.test.ts)                                                                                                                                                                                                                                                   |
| `server/distribution/google-indexing.server.ts`             | 1       | 0      | 1      | 1       | 0        | app-lib: `distribution.server` · agents: `orchestrator.server` · scripts: `job-distribution.test.ts:46`                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `lib/apply.functions.ts`                                    | 0       | 1      | 0      | 3       | 0        | routes: `apply.$id.tsx` (wrapper stays in web) · scripts: `guardrails-p1`, `integration.verify`, `job-distribution` (.test.ts)                                                                                                                                                                                                                                                                                                                                                                                                              |
| `lib/boards.functions.ts`                                   | 3       | 1      | 0      | 0       | 0        | app-lib: `components/{board-connect-panel,board-enterprise-panel,requisition-job-boards}.tsx` · routes: `integrations.tsx` (stays in web)                                                                                                                                                                                                                                                                                                                                                                                                   |
| `lib/distribution.functions.ts`                             | 1       | 1      | 0      | 0       | 0        | app-lib: `components/requisition-distribution.tsx` · routes: `distribution.tsx` (stays in web)                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `lib/job-channels.ts` → **std catalogue**, not distribution | 11      | 3      | 4      | 2       | 0        | app-lib: `components/requisition-distribution.tsx`, `apply.functions`, `candidates.functions`, `capture.server`, `intake.server`, `integrations.functions`, `local-inbox.server`, `pipeline.server`, `server/desk/desk.server`, `distribution/distribution.server`, `voice/call-brief.server` · routes: `candidates.index.tsx`, `distribution.tsx`, `reports.tsx` · agents: `distribution-agent.server`, `health.server`, `sourcing.server`, `tools-distribution` · scripts: `distribution-agent.test.ts:35`, `job-distribution.test.ts:43` |
| **Total** (excl. `job-channels`)                            | **34**  | **7**  | **6**  | **10**  | **0**    | **57**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

`job-channels.ts` is import-free (verified) — a pure catalogue, which is why the map
sends it to the shared `std` catalogue (§4 L3 distribution note) with 20 importers
across all four categories. **Blocker:** the `std` package does not exist yet
(`packages/` has no `std`; `config` holds only `env`). See §5 R5.

---

## 2. Change-PR dependencies per package (verified against current files)

Every item below is its own change PR — **never inside a move PR** (inline-server-fns
header; stage-writers brief rule 1). Precondition: Dev 1's `packages/pipeline` is on
`main`, including the `addApplicationsCore` options (`skipReusable`, `entryStage`,
org-scoped existence skip) — stage-writers items (5)/(8)/(9).

### requisitions

1. **`requisition.closed` event replaces the boards call.** Call site verified:
   `apps/web/src/lib/requisitions.server.ts:252-261` inside `advanceRequisitionCore` —
   `:254` `const { closePostingsForRequisition } = await import("../server/boards/publish.server");`
   (best-effort, `.catch(() => undefined)`). Change PR: publish `requisition.closed`
   through the kernel (`packages/kernel/src/server/ports.ts:73` `onDomainEvent` already
   exists); delete the dynamic import. The distribution subscriber registers in
   `apps/web/src/boot.ts` — the placeholder comment at `boot.ts:103-104`
   ("the remaining domain-event (onDomainEvent) … subscribers register here") marks the
   exact spot. Removes the last `requisitions→boards` edge (map §1.2 S8).
2. **Inline-fn extractions** (§5 R1): 8 fns in `requisitions.functions.ts` verified
   still inline at `e50d8eb` (`deleteRequisition`, `setRequisitionIjpNotes`,
   `syncRequisitionFromJd`, `addApplicationsToRequisition`, `saveJobCardOverrides`,
   `createDepartment`, `addDepartment`, `applyInternally`). Split before the move;
   the 10 delegating exports need nothing.

### candidates

1. **`subjects.deleted` replaces the erase→runtime wrong-way import** (map §1.2 S6).
   Verified: `apps/web/src/server/erase.server.ts:39`
   `const { afterSubjectsDeleted } = await import("./agents/runtime.server");`.
   Change PR: erase publishes `subjects.deleted` via the kernel; the agents'
   `afterSubjectsDeleted` becomes a kernel subscriber registered in `boot.ts`
   (`boot.ts:38` already imports it for `registerDeskThreadEffects`; the pair moves to
   the kernel placeholder at `boot.ts:103`). Dedupe merge publishes the same event
   (map §5 table).
2. **`addApplicationsCore` repoints + invariant fix** (stage-writers rows 8/9):
   `collaboration.functions.ts` `respondReferral` accept branch and
   `candidates.functions.ts` (`attachApplication`, `createCandidate`). Acceptance
   criterion carried into Phase 5 (stage-writers:23): **the referral-accept existence
   check is org-scoped** — the unscoped query is at
   `apps/web/src/lib/collaboration.functions.ts:259-267` (selects `applications` by
   `candidateId` + `requisitionId` only, no `orgId` predicate; insert at :269-275 with
   `stage: "sourced"`) — with a test that a second org's application for the same
   (candidateId, requisitionId) pair does not suppress the insert. Land this **in the
   same Phase 5 change** as the repoint, not later.
3. **Inbound-mail CV handler** (map §5 `onInboundMail` row). Current state: comms
   transport is live and `boot.ts:45-50` registers `onInboxHandler → localInboxHandler`
   (`local-inbox.server.ts:93`); the CV branch imports the candidates side at
   `local-inbox.server.ts:30` (`ingestCandidate`, `parseCv` from `./intake.server`).
   Change PR: move the CV-parse/talent-pool branch into `@ats/candidates/server` and
   register it as its own `onInboundMail` handler in `boot.ts`; `local-inbox.server`
   keeps the mail-store + retry pieces (comms-owned) and drops the `./intake.server`
   import (fixes the last `local-inbox→intake` edge, map §1.2 S8).
4. **Inline-fn extractions**: `collaboration.functions.ts` — all 11 exports are bare
   handlers (verified present at `e50d8eb`: `poolTeam`, `setCandidateOwner`,
   `referCandidate`, `respondReferral`, `addCandidateNote`, `createTalentRequest`,
   `suggestToRequest`, `closeTalentRequest`, `listPoolShares`, `offerPoolShare`,
   `respondPoolShare`); `collect.functions.ts` `collectApplicants` (1);
   `resume.functions.ts` `getResumeDownloadUrl` vault-path check (1); `queries.functions`
   read handlers' org-scoped predicates → the `queries` core. Decide per function
   (inline-server-fns note 1: referrals/notes worth cores; list/read fns arguably not).

### distribution

1. **Boot subscription.** `distribution.server` registers the `requisition.closed`
   subscriber in `boot.ts` (placeholder at :103) that calls the old
   `closePostingsForRequisition` behaviour (`boards/publish.server`). Same PR as
   requisitions item 1 or immediately after — CI is red between the two if the event is
   emitted with no subscriber (make the subscriber a no-op-safe registration first).
2. **`apply.functions` core extraction.** `apply.functions.ts` is the public career-site
   apply (public-token allow-list, map §6). Its core (incl. `submitApplicationImpl`,
   which `job-distribution.test.ts:47` already imports) moves to
   `@ats/distribution/server`; the `createServerFn` wrapper + its token middleware stay
   in `apps/web/src/lib/apply.functions.ts`. Same wrapper-drops-`createServerOnlyFn`
   pattern as map §11 ruling 2.
3. **`boardWebhookSetup`/`boardWebhookUrl` token rotation** (inline-server-fns
   distribution section, verified at `boards.functions.ts:212` and `:364`) — extract
   cores before the move. The other 19 fns already delegate to covered cores
   (`publishToBoardImpl`, `closeBoardPostingImpl`, `rotateFeedToken`, …).
4. **`job-channels` → shared catalogue.** Blocked on the `std` skeleton (§5 R5); if std
   does not land in time, ship it as `@ats/distribution/shared` temporarily and move the
   module again in the std PR (20 importers would re-point twice — prefer waiting for
   std).

---

## 3. Shim plan per file

Precedent (legal/comms/integrations, map §11): shims at the old app path, marked
`// SHIM: remove in Phase 8`, re-exporting from the package; importers untouched where
re-pointing is cheap. Bun `mock.module` matches by path — **every test mock of a moved
path must be updated in the same PR or the mock silently stops applying** (map §8).

| File                                                                                                                                                                                                                                     | Decision                                                                                                                                                                            | Reason                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/requisitions.server.ts`                                                                                                                                                                                                             | **Shim** (18 importers incl. 7 agents files + 2 package tests)                                                                                                                      | cheap re-point only for `pipeline.server` (legal L3 edge) and `requisitions.functions`; shim the rest                                           |
| `lib/role-profile.server.ts`, `lib/role-hiring-manager.server.ts`                                                                                                                                                                        | **Full re-point** (1–2 importers each)                                                                                                                                              | trivial                                                                                                                                         |
| `lib/jd-dedupe.ts`, `lib/work-mode.ts`                                                                                                                                                                                                   | **Full re-point** (≤6 importers)                                                                                                                                                    | work-mode's three server callers are one-line edits; UI route + agent tool included                                                             |
| `server/guards.ts`                                                                                                                                                                                                                       | **Shim** (14 importers, 12 of them `*.functions.ts` wrappers)                                                                                                                       | wrappers re-point mechanically in Phase 8 cleanup; `assertRequisitionInOrg` must keep working through the shim — it is the AGENTS.md guard      |
| `lib/intake.server.ts`, `lib/capture.server.ts`                                                                                                                                                                                          | **Shim** (7 + 4 importers, incl. `boards/ingest.server` and public routes)                                                                                                          | public routes re-point same-PR (they are the security boundary); desk/agent/scripts callers ride the shim                                       |
| `lib/pool-share.ts`, `lib/social.server.ts`, `lib/erase.server.ts`, `lib/dedupe.ts`                                                                                                                                                      | **Full re-point** (≤3 importers each)                                                                                                                                               | note `matching.functions`/`matching.server` import `social.server` — matching is Phase 6, so those two re-point to `@ats/candidates/server` now |
| `lib/cv-extract.ts`                                                                                                                                                                                                                      | **Shim** (5 importers, 4 UI routes)                                                                                                                                                 | shared entry is browser-safe; routes re-point in Phase 8                                                                                        |
| `lib/cv-intake.ts`                                                                                                                                                                                                                       | **Move to apps/web features, not the package** (map §4: client helper → web); update `CvUpload.tsx` + `desk.tsx`                                                                    | 2 importers                                                                                                                                     |
| `lib/resume-download.ts`                                                                                                                                                                                                                 | **Full re-point** (3 routes)                                                                                                                                                        | shared entry                                                                                                                                    |
| `lib/data.ts`                                                                                                                                                                                                                            | **No move of the file.** Extract `Candidate` types to `@ats/candidates/shared`; `data.ts` re-exports them (shim by construction)                                                    | 25 importers are React Query/UI code that stays in web                                                                                          |
| `lib/collect.functions.ts`, `lib/collaboration.functions.ts`, `lib/queries.functions.ts`, `lib/resume.functions.ts`, `lib/candidates.functions.ts`, `lib/apply.functions.ts`, `lib/boards.functions.ts`, `lib/distribution.functions.ts` | **No move** — wrappers stay in web (map §3); only their extracted cores move                                                                                                        | wrapper imports are UI + routes                                                                                                                 |
| `lib/local-inbox.server.ts`                                                                                                                                                                                                              | **Split, no shim**: CV branch → `@ats/candidates/server`, rest stays (comms); `boot.ts` registration updated same-PR                                                                | 7 importers; `inboxSource` consumers (`sourcing.server`) re-point to the candidates export                                                      |
| `server/parser/client.ts`                                                                                                                                                                                                                | **Full re-point** — but see §5 R4: its only importer is `cv-text.server` (std), so it likely stays at std level, not candidates                                                     | 1 importer                                                                                                                                      |
| `server/boards/*` internals (`hmac`, `indeed`, `linkedin`, `naukri`, `partner`, `types`, `registry`, `ingest.server`, `poll.server`)                                                                                                     | **Full re-point** — external importers are only `boards.functions`, `distribution.server`, `api/public/{board-sync,boards/*}` routes and `agents/{tools,sourcing}.server` (7 files) | everything else is intra-package                                                                                                                |
| `server/boards/publish.server.ts`                                                                                                                                                                                                        | **Shim** (6 importers incl. `requisitions.server:254` until change-PR item 1 lands, agents `tools.ts`)                                                                              | the requisitions edge dies in the change PR; the rest rides the shim                                                                            |
| `server/distribution/content.ts`, `google-indexing.server.ts`                                                                                                                                                                            | **Full re-point** (`content`: 5; `google`: 3)                                                                                                                                       | includes `labour-policy.server` (offers, Phase 6) and `pay-offers.test.ts` — re-point now, they are app files                                   |
| `server/distribution/distribution.server.ts`                                                                                                                                                                                             | **Shim** (9 importers incl. 3 agents + 2 public routes)                                                                                                                             | public routes re-point same-PR                                                                                                                  |
| `lib/job-channels.ts`                                                                                                                                                                                                                    | **Move to std catalogue + shim at old path** (20 importers)                                                                                                                         | biggest importer fan-out of the wave; shim until Phase 8                                                                                        |

---

## 4. Same-day execution checklist

Order: skeletons → change PRs → moves, one package at a time, `requisitions` first (its
event unblocks distribution), `candidates` second (erase/dedupe events are
self-contained), `distribution` third. Gates after every PR: `bunx turbo run typecheck`,
`bun run lint`, `bunx prettier --check .`, `node tools/depcruise-check.mjs`
(WARN_MAX = 106 may only go **down** — lower it as edges die),
`node scripts/refactor/table-owners.mjs`, `bunx turbo run test`, every
`scripts/*.test.ts` (CI runs each in its own bun process), `bun run agents:lock &&
git diff --exit-code scripts/agents.lock.json`, `bunx turbo run build`, worker boot
smoke (CI).

### 0. Skeletons (Dev 2's first three PRs, before Dev 1 lands)

- [ ] `packages/requisitions`, `packages/candidates`, `packages/distribution` — copy the
      `packages/legal` skeleton: `package.json` (exports `./shared`, `./server`;
      `server` entry opens with `import "@tanstack/react-start/server-only"`), `tsconfig.json`,
      empty `src/{server,shared}/index.ts`, `test/`. Register in workspace + turbo + depcruise.
- [ ] Decide the `std` skeleton (§5 R5) — needed before `job-channels` can move.

### 1. requisitions

1. [ ] Change PR A1: `requisition.closed` published from `advanceRequisitionCore`
       (`requisitions.server.ts:252-261`), delete the `closePostingsForRequisition`
       dynamic import at :254; temporary in-app subscriber in `boot.ts` that calls
       `closePostingsForRequisition` (keeps behaviour identical; distribution takes the
       subscription over in step 3).
2. [ ] Change PR A2 (may be pre-landed): extract the 8 inline fns from
       `requisitions.functions.ts` into cores.
3. [ ] Move PR: 6 files → `@ats/requisitions/{server,shared}` (`jd-dedupe`, `work-mode`
       → shared; `requisitions.server`, `role-profile.server`, `role-hiring-manager.server`,
       `guards.ts` → server); shims per §3; re-point `pipeline.server`, the three UI touchpoints
       and the suites below.
4. [ ] Test moves: `scripts/requisition-changes.test.ts` →
       `packages/requisitions/test/` (fix imports at :33/:36 → package paths; its
       desk/runtime imports at :34-35 stay app-side via dynamic import). Re-point (no move):
       `matching-gates.test.ts:18` + `weight-advice.test.ts:10` (`weightsProblem`),
       `agent-phase1.test.ts:90`, `agent-edge-cases.test.ts:277`, `pipeline.test.ts:24`
       (type-only `LifecycleActor` — see §5 R6), `interview-panels.test.ts`
       (`role-hiring-manager.server`), `packages/org/test/{org-context,org-profile}.test.ts`.
5. [ ] Gates + depcruise WARN_MAX lowered (requisitions→boards and guards fan-in edges die).

### 2. candidates

1. [ ] Change PR B1 (needs Dev 1's core options): repoint `respondReferral`
       (`collaboration.functions.ts`) and `attachApplication`/`createCandidate`
       (`candidates.functions.ts`) to `addApplicationsCore`; **org-scope the referral-accept
       existence check** (:259-267) in the same PR + the cross-org test (stage-writers:23).
       Remove both `KNOWN_STAGE_WRITERS` entries in the same PR.
2. [ ] Change PR B2: erase publishes `subjects.deleted` (kill `erase.server.ts:39`
       dynamic import); agents register `afterSubjectsDeleted` as the kernel subscriber in
       `boot.ts`; dedupe merge publishes the same event.
3. [ ] Change PR B3: CV branch of `local-inbox.server` → `@ats/candidates/server`
       handler, registered in `boot.ts` via `onInboundMail`; delete the
       `local-inbox.server:30` intake import.
4. [ ] Change PR B4 (parallel, per function): collaboration cores (start with
       `referCandidate`/`respondReferral`/`addCandidateNote`/`setCandidateOwner`), `collect`
       core, `queries` core, `resume` vault-path check.
5. [ ] Move PR: `intake.server`, `capture.server`, `pool-share`→`pool-share.server`
       (rename, map §4), `dedupe`, `social.server`, `erase.server`, `cv-extract`,
       `resume-download` + the new cores → `@ats/candidates`; `cv-intake` → web features;
       `Candidate` types → `@ats/candidates/shared` with `data.ts` re-exporting; shims per §3.
6. [ ] Test moves: `scripts/inbound-cv-e2e.test.ts` → `packages/candidates/test/`
       (imports at :14/:20 → package paths) — alternatively `tests/integration/` per map §8;
       decide at review. Re-point (no move): `agent-phase2.test.ts` (erase),
       `agent-hiring-cost-offer.test.ts`, `distribution-agent.test.ts:37/:216`,
       `integration.verify.test.ts`, `guardrails-p1.test.ts` (apply core is distribution's —
       re-point again in step 3 if needed).
7. [ ] Gates; verify the stage-writer guard still finds `KNOWN_STAGE_WRITERS` exactly once.

### 3. distribution

1. [ ] Change PR C1: `boot.ts` subscriber for `requisition.closed` moves the
       `closePostingsForRequisition` call from A1's temporary subscriber into
       `@ats/distribution/server`; extract `boardWebhookSetup`/`boardWebhookUrl` cores
       (`boards.functions.ts:212`, `:364`) and the `apply.functions` core (incl.
       `submitApplicationImpl`) — separate PRs, then:
2. [ ] Move PR: `server/boards/*` (10 files), `server/distribution/*` (3 files), the
       extracted cores → `@ats/distribution/{server,shared}` (`boards/types`,
       `boards/{types,hmac}` per map §4 shared); wrappers (`boards.functions`,
       `distribution.functions`, `apply.functions`) stay in web; shims for
       `publish.server` + `distribution.server` per §3; re-point the 2 public routes, the 3
       board components and the agents callers same-PR.
3. [ ] `job-channels` → `std` catalogue + shim (if std landed; else deferred, §5 R5).
4. [ ] Test moves: `scripts/job-distribution.test.ts` → `packages/distribution/test/`
       (imports at :43-49 → package paths; `job-channels` import follows its destination).
       Re-point (no move): `distribution-agent.test.ts`, `pay-offers.test.ts`
       (`distribution/content`), `guardrails-p1.test.ts`, `integration.verify.test.ts`.
5. [ ] Gates + worker boot smoke (boards code is pulled by the voice-worker bundle via
       agents tools — a missed specifier shows up exactly there); WARN_MAX lowered again.

---

## 5. Risks and notes

**R1 — the ~26 inline entry points.** 24 of them sit in these three packages:
requisitions 8, candidates 14 (`collaboration` 11, `collect` 1, `resume` 1, plus the
`queries` read-handler predicates), distribution 2 (`boardWebhookSetup`,
`boardWebhookUrl`). All verified still inline at `e50d8eb`. The remaining
(matching `bucketCounts` + 3 trivial `aiJson` wrappers, offers `deleteOfferLetter`,
onboarding `deleteOnboardingDoc`) are Phase 6. Each extraction is its own change PR;
`collaboration.functions` moves with handler logic intact where no core is decided
(inline-server-fns note 1) — record the per-function decision in the move PR description.

**R2 — collaboration unscoped check.** `collaboration.functions.ts:259-267` violates the
AGENTS.md every-query-carries-orgId rule. Phase 5 acceptance criterion (stage-writers:23):
org-scope it in the same change as the `addApplicationsCore` repoint, with the cross-org
test. Note the behavioural deltas recorded there (core throws on dangling/cross-tenant
requisitions; `assertReusable` now applies at accept time; callers must read
`{added, skipped}`).

**R3 — mock-path hazard.** `scripts/` mocks (`mock.module`) and dynamic imports match by
path. Suites that stay but re-point (`agent-phase1/2`, `agent-edge-cases`,
`agent-hiring-cost-offer`, `distribution-agent`, `matching-gates`, `weight-advice`,
`pipeline.test`, `integration.verify`, `guardrails-p1`, `pay-offers`,
`interview-panels`) must switch import + mock paths in the same PR as the shim, or the
mock silently stops applying and the test hits the real DB/AI (map §8). Prefer re-pointing
over shimming for every script importer for exactly this reason.

**R4 — `parser/client` layer conflict.** Map §4 L3 puts `server/parser/client.ts` in
candidates, but its only importer is `cv-text.server.ts:24` (std, L0) — a std→candidates
upward import. Recommend: `parser/client` lands at std/security level next to `cv-text`
(it is provider plumbing: `PARSER_URL` + signed ID token, no domain knowledge), and the
map row is corrected at review. `domains.mjs` already maps it there via
`^src\/server\/(parser|erase\.server)` → candidates, so this needs an explicit ruling.

**R5 — `std` does not exist yet.** `domains.mjs` assigns 15+ modules (incl.
`job-channels`, `cv-text.server`) to `std`, but `packages/std` is not created and
`config` holds only `env`. Dev 2 needs a ruling: tiny `std` package (phase-log Phase 1
handoff says resolved to a package) or fold the catalogue into `config/shared`. Until
then `job-channels` stays put and distribution's move PR must not claim it.

**R6 — `LifecycleActor` upward imports.** `packages/org/test/*` (L2, landed) imports
`requisitions.server` (:39/:49), and `pipeline.test.ts:24` imports the same type.
Map §4 L1 already moves `actorFor`/`LifecycleActor`/`APPROVER_ROLE` to `@ats/auth` —
re-point all of them there, **not** to `@ats/requisitions` (an L2→L3 import would be a
new violation). Confirm the auth move landed before Phase 5; if not, this blocks the
org tests the day requisitions moves.

**R7 — voice/desk riders.** `voice/call-brief.server` imports `work-mode` +
`job-channels`; `desk.server` imports `requisitions.server` + `work-mode` +
`job-channels`. Both domains are L4 (Phase 6/7) and stay in the app — their imports
re-point to `@ats/*` same-PR; no shims needed for them (§3 already counts them).

**R8 — vite import protection.** `apps/web/vite.config.ts:93` mocks `**/server/**` and
the `@ats/*/server` specifiers in the client bundle. `guards.ts` and `boards/*` leave
`src/server/` in this phase — the `@ats/*/server` specifier rule already covers the
package side, but the **shims** at old paths must stay under a `server/` directory (or
carry a `.server.ts` name) until Phase 8, or the client bundle stops mocking them.

**R9 — map §10/§11 items still open for these packages.** None of §10's 24 unmapped
files or 5 wrong-way imports land in requisitions/candidates/distribution (they are
offers/desk/voice/shared-utils rows). §11 ruling 4's inbound-mail sequence (a)→(b) is
done (boot.ts registration exists); Phase 5 completes (c)-equivalent for the CV handler
(B3). The §11 ruling 5 lazy-import shim pattern is the template for the §3 shims.
`role_panels` owner (U1: requisitions) is unaffected by the move — the table owner
follows the package.

**R10 — table ownership follows the move** (map §7): requisitions owns `requisitions`,
`job_descriptions`, `role_panels*`; candidates owns `candidates`, `social_profiles`,
`candidate_notes`, `candidate_ownership_events`, `candidate_referrals`, `talent_requests`,
`talent_request_suggestions`, `capture_events`; distribution owns
`requisition_board_postings`, `org_job_distribution`, `job_index_notifications`,
`board_webhook_events`, `board_sync_state`. The tenancy tests move with their package;
`table-owners.mjs` must stay green (it is CI-gated).

## Reviewer rulings on R4/R5 (2026-11-25, PR #39 review)

- **R4:** `server/parser/client.ts` goes WITH cv-text into `@ats/std/server` — its imports are
  L0-legal (log only), cv-text (its only importer) is std per map §4, and apps/parser-worker already
  depends on std cv-text. Mapping it to candidates was a domains.mjs error; correct domains.mjs in
  the same PR that moves it.
- **R5:** `@ats/std` is created NOW, in Phase 5, as an L0 package (the Phase 1 "std over
  utils-in-config" decision, never executed). Shape: framework-free; `./shared` (browser-safe:
  job-channels catalogue, money/iso/local-time/report-window etc. per map §4 L0 row) + `./server`
  (cv-text, parser client); depends only on config/observability/security. Owner Dev 1 (L0 + shared
  files); Dev 2 authors the skeleton PR + the job-channels move with Dev 1's one-line ack.
  job-channels → `@ats/std/shared` as the intended shared catalogue (config stays env-only).
- **Order:** std skeleton → job-channels + cv-text + parser client into std → then
  distribution/candidates open. The T1 org→cv-text mark resolves to `@ats/std` in this step.
