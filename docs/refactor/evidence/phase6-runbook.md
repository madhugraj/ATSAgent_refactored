# Phase 6 move runbook — `matching`, `interviews`, `offers`, `onboarding` (Dev 2)

**Written:** 2026-11-26, Dev 2. **Verified against:** `apps/web/src` + `packages/*` at `main`
`5bd3e08` (merge of #59). Every count below was produced by resolving every import
specifier (`@/…`, every relative depth, dynamic `import(…)`, `mock.module(…)`) against
the real file paths — not by substring grep. Map references: `01-module-boundary-map.md`
§4 L3, §5 events, §10/§11 rulings; evidence: `inline-server-fns.md`, `stage-writers.md`,
`findings-domains-ui.md`, `phase5-runbook.md` (format model).

**Start condition:** Phase 5's writer series is merged — `respondReferral` onto
`addApplicationsCore` (#56), `createCandidate`/`attachApplication` (#57, `entryStage`

- `skipReusable`), `respondToOffer` onto `recordOfferStageCore` (#59). The remaining
  `KNOWN_STAGE_WRITERS` (`scripts/pipeline.test.ts:556-567`) are exactly the Phase 6
  repoints: `autoscore.server.ts`, `matching.functions.ts`, `interviews.functions.ts`
  (plus the pipeline baselines and the `@ats/ai` test fixture). The writer-repoint
  preconditions are on `main`: `moveStageCore` `cause` + `source:"ai"`
  (`apps/web/src/lib/pipeline.server.ts:43-45`), `moveStagesCore` (:129),
  `recordOfferStageCore` (:229), `addApplicationsCore` (:307).
  `packages/{matching,interviews,offers,onboarding}` do **not** exist yet — the four
  skeleton PRs are Dev 2's first PRs (copy `packages/candidates`: `package.json` with
  `/shared` + `/server` exports, `tsconfig.json` with the alias bridge, `src/server/index.ts`,
  `src/shared/index.ts`, `test/`). **See R1: `packages/pipeline` has not landed** — the
  pipeline cores still live in the app (`src/lib/pipeline.server.ts`).

**Import styles found in the tree** (checked before counting): same set as Phase 5 —
`from "@/lib/X"` (app code, UI, server-fn wrappers, and the packages' alias bridges),
relative `./X` / `../server/...` inside `lib`/`server`, dynamic `await import(...)`
(dominant in `agents/tools*` and `orchestrator`), scripts/packages via
`../apps/web/src/…` relative dynamic imports, `mock.module("../src/…")` in tests. The
L1/L2 packages import the app through the `@/` alias bridge or `../../../../apps/web/src/…`
relative paths — the `SHIM(upward)` set inventoried in §2. Importer categories:
**app-lib** = `apps/web/src/lib` + `components` + `boot.ts` + `server` (non-agents,
incl. the `*.functions.ts` wrappers); **routes** = `apps/web/src/routes/**`;
**agents** = `apps/web/src/server/agents/**`; **scripts** = `scripts/**`;
**packages** = `packages/**`. Counts are resolved import sites (one row per import
statement / dynamic call, the phase5-runbook convention).

File-list source: `scripts/refactor/domains.mjs` rules `matching`
(`matching|screening|autoscore|bias|shortlist|verification|expert-brief|weight-advice|screening-coverage|logistics`),
`interviews` (`interview|panel|slot-offers|vtt|assessment|scorecard-chase|panel-changes`

- `src/server/panel/`), `offers`
  (`offer|negotiation|compensation|comp-knowledge|salary-benchmark|market\.|pay-|labour-policy`),
  `onboarding` (`onboarding|hrms`). Note `domains.mjs` maps every `*.functions.ts` to
  `web/server-fn` first: the wrappers **stay in `apps/web`** (map §3); only their extracted
  cores move. Four list corrections are carried in §5 R7 (`meeting-ref`/`vtt`,
  `career-ladder`, `onboarding.catalogue`, the dead `desk` regex row).

---

## 1. Per-file importer inventory

### 1a. matching (17 files, 62 importers)

| File                                       | app-lib | routes | agents | scripts | packages | Importers                                                                                                                                                                                                                                       |
| ------------------------------------------ | ------- | ------ | ------ | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/matching.server.ts`                   | 2       | 0      | 0      | 6       | 0        | app-lib: `screening-prep.server`, `verification.server` · scripts: `evals/matching-scenarios`, `guardrails.test:14` (dyn), `matching-eval:31` (dyn), `matching-gates.test:123` + `:133` (dyn ×2), `pay-logistics.test`                          |
| `lib/matching.functions.ts` (wrapper)      | 0       | 2      | 3      | 1       | 0        | routes: `candidates.$id.tsx`, `candidates.index.tsx` · agents: `tools.ts:234/:272/:511` (dyn) · scripts: `weight-eval:30` (dyn)                                                                                                                 |
| `lib/screening.server.ts`                  | 2       | 0      | 0      | 1       | 1        | app-lib: `server/voice/call-brief.server`, `server/voice/call-prompt` · scripts: `guardrails.test:207` (dyn) · packages: `ai/src/server/redteam/check.server.ts:138` (dyn — the `SHIM(upward)` mark, §2)                                        |
| `lib/screening.functions.ts` (wrapper)     | 3       | 0      | 1      | 1       | 0        | app-lib: `assessment-timeline.server:351` (dyn), `screening-prep.server`, `server/voice/call-session.server:904` (dyn) · agents: `tools-phase2:441` (dyn) · scripts: `screening-call.test:511` (dyn)                                            |
| `lib/screening-queue.functions.ts` (wrap.) | 2       | 1      | 0      | 0       | 0        | app-lib: `data.ts` (×2) · routes: `screening.tsx`                                                                                                                                                                                               |
| `lib/screening-rationale.functions.ts`     | 0       | 0      | 0      | 0       | 0        | (no importers)                                                                                                                                                                                                                                  |
| `lib/screening-logistics.server.ts`        | 0       | 0      | 1      | 0       | 0        | agents: `runtime.server:667` (dyn)                                                                                                                                                                                                              |
| `lib/screening-prep.server.ts`             | 0       | 1      | 0      | 1       | 0        | routes: `api/public/screening-prep:26` (dyn) · scripts: `integration.verify.test:365` (dyn)                                                                                                                                                     |
| `lib/screening-coverage.ts`                | 4       | 0      | 1      | 1       | 0        | app-lib: `components/ScreeningPanel.tsx`, `screening-rationale.functions`, `server/desk/desk.server:2101` (dyn), `server/voice/call-session.server:1003` (dyn) · agents: `runtime.server:679` (dyn) · scripts: `screening-call.test:26` (dyn)   |
| `lib/autoscore.server.ts`                  | 2       | 1      | 1      | 0       | 1        | app-lib: `collect.functions:110` (dyn), `server/desk/desk.server:2751` (dyn) · routes: `api/public/inbox-sync:21` (dyn) · agents: `tools-phase2:176` (dyn) · packages: `candidates/src/server/capture.server.ts:378` (dyn — `SHIM(upward)`, §2) |
| `lib/bias.server.ts`                       | 0       | 1      | 1      | 1       | 0        | routes: `api/public/sync-candidates:122` (dyn) · agents: `tools-phase3:697` (dyn) · scripts: `bias-report.ts`                                                                                                                                   |
| `lib/expert-brief.ts`                      | 1       | 0      | 2      | 0       | 0        | app-lib: `screening.server:127` (dyn) · agents: `expert-gate.server`, `tools-expert.ts`                                                                                                                                                         |
| `lib/weight-advice.ts`                     | 2       | 0      | 0      | 1       | 0        | app-lib: `matching.functions` (×2) · scripts: `weight-advice.test.ts`                                                                                                                                                                           |
| `lib/shortlist.ts`                         | 1       | 3      | 0      | 0       | 0        | app-lib: `cv-intake.ts` (`mapWithLimit` → std already moved) · routes: `index.tsx`, `matching.tsx`, `requisitions.$id.tsx`                                                                                                                      |
| `lib/logistics.ts`                         | 4       | 0      | 0      | 1       | 0        | app-lib: `autoscore.server`, `matching.functions`, `pay-context.server`, `screening-logistics.server` · scripts: `pay-settings.test:361` (dyn)                                                                                                  |
| `lib/verification.server.ts`               | 1       | 1      | 0      | 0       | 1        | app-lib: `verification.functions` · routes: `api/public/sync-candidates.ts` · packages: `candidates/src/server/capture.server.ts:280` (dyn — `SHIM(upward)`, §2)                                                                                |
| `lib/verification.functions.ts` (wrapper)  | 0       | 2      | 0      | 0       | 0        | routes: `candidates.$id.tsx`, `candidates.index.tsx`                                                                                                                                                                                            |
| **Total**                                  | **24**  | **12** | **10** | **13**  | **3**    | **62**                                                                                                                                                                                                                                          |

Package importers are all in **landed** packages (`@ats/ai`, `@ats/candidates`) — no
unlanded-package flag. The two `capture.server` interims are the reverse problem: a
landed L3 package importing the not-yet-moved app module; they resolve **in the move
PR** by re-pointing to `@ats/matching/server` (marker dead, alias-ratchet −2 relative).

### 1b. interviews (36 files, 247 importers)

| File                                       | app-lib | routes | agents | scripts | packages | Importers (abbreviated: `dyn` = dynamic import; multi-sites listed with `:line`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------ | ------- | ------ | ------ | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/interview-plan.ts` (shared)           | 15      | 1      | 1      | 4       | 0        | app-lib: `CompetencyRating`, `InterviewPlanCard`, `PlanProposals`, `interviews/PanelChanges`, `interviewer-brief.server:295`, `interviews.functions:193/:369`, `panel-assessment`, `panel-brief.server:73`, `panel-reconcile`, `panelist-links.server:192`, `panels.server:82`, `panel/assess.server:80`, `panel/review.server:190` + `:static` · routes: `interviews.index.tsx` · agents: `panel-gate.server:86` · scripts: `agent-interview-panel:33`, `interview-panels:41`, `panel-changes:25`, `scorecard-rubric:15` (all dyn)                                                                            |
| `lib/interview-plan.server.ts`             | 20      | 0      | 9      | 2       | 0        | app-lib: `interview-plan.functions:23/:40`, `interviewer-brief.server:294`, `interviews.functions` ×7 (`:192/:335/:368/:430/:626/:691/:791`), `panel-brief.server:72`, `panel-changes.server:384/:704`, `panelist-links.server:191`, `panels.server:81`, `desk.server:3930`, `panel/assess.server:79`, `panel/review.server:359`, `voice/negotiation-brief.server:157`, `voice/scheduling-brief.server:159` · agents: `expert-gate:109/:139`, `panel-gate:85`, `runtime:596`, `tools-expert:51`, `tools-phase3:120/:591/:663`, `tools-phase4:433` · scripts: `agent-interview-panel:34`, `interview-panels:40` |
| `lib/interview-plan.functions.ts` (wrap.)  | 2       | 1      | 0      | 0       | 0        | app-lib: `InterviewPlanCard`, `PlanProposals` · routes: `interviews.index.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `lib/interview-with.ts` (shared)           | 5       | 0      | 0      | 1       | 0        | app-lib: `interview-reminders.server:87`, `interviews.functions:1099`, `slot-offers.server`, `voice/confirm-call-prompts`, `voice/scheduling-prompt` · scripts: `interview-with.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `lib/interview-confirmations.server.ts`    | 13      | 0      | 2      | 5       | 0        | app-lib: `interview-confirmations.functions` ×4, `interviewer-brief.server:115`, `interviews.functions:1062`, `panel-changes.server:111/:299`, `slot-offers.server:247`, `voice/confirm-calls.server` ×4 · agents: `orchestrator:992`, `panel-gate:387` · scripts: `agent-interview-slots:43`, `confirm-calls:43`, `evals/scenarios:3938`, `interview-confirmations:25`, `scheduling-call:1303`                                                                                                                                                                                                                |
| `lib/interview-confirmations.functions.ts` | 1       | 2      | 0      | 0       | 0        | app-lib: `interviews/ConfirmLine.tsx` · routes: `confirm.$token.tsx`, `interviews.index.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `lib/interview-reminders.server.ts`        | 0       | 0      | 1      | 1       | 0        | agents: `orchestrator:984` · scripts: `interview-reminders.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `lib/interviewer-brief.server.ts`          | 1       | 0      | 1      | 2       | 0        | app-lib: `interviews.functions:1187` · agents: `panel-gate:390` · scripts: `panel-directory:291/:336`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `lib/interviewers.server.ts`               | 3       | 0      | 0      | 1       | 0        | app-lib: `interviewers.functions:21/:35`, `panelists.server:97` · scripts: `interview-panels:37`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `lib/interviewers.functions.ts` (wrapper)  | 1       | 1      | 0      | 0       | 0        | app-lib: `InterviewerProfileCell.tsx` · routes: `team.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `lib/interviews.functions.ts` (wrapper)    | 5       | 2      | 2      | 10      | 0        | app-lib: `interview-confirmations.server:757`, `panel-changes.server:312`, `panelist-links.server:237`, `slot-offers.server:663`, `panel/review.server:360` · routes: `candidates.$id.tsx`, `interviews.index.tsx` · agents: `panel-gate:411`, `tools-phase3:407` · scripts: `agent-handoff:48`, `agent-interview-panel:35`, `agent-interview-slots:626`, `interview-confirmations:26`, `interview-panels:528`, `panel-changes:28`, `panel-review:30`, `panel-simulation:144`, `panel-transcripts:27`, `scorecard-rubric:116` (all dyn)                                                                        |
| `lib/panel-assessment.ts` (shared)         | 1       | 0      | 0      | 2       | 0        | app-lib: `panel/prompts.ts` · scripts: `panel-live-check:47`, `scorecard-rubric:16` (dyn)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `lib/panel-brief.ts` (shared)              | 4       | 0      | 0      | 0       | 0        | `PanelBriefView.tsx`, `panel-brief.server` (×2), `panelist-links.server:169`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `lib/panel-brief.server.ts`                | 2       | 0      | 0      | 1       | 0        | app-lib: `interviews.functions:631`, `panelist-links.server:199` · scripts: `panel-access:30`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `lib/panel-reconcile.ts` (shared)          | 1       | 0      | 0      | 1       | 0        | app-lib: `panel/review.server.ts` · scripts: `panel-assessment:358`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `lib/panel-changes.server.ts`              | 6       | 0      | 0      | 1       | 0        | app-lib: `interview-confirmations.functions` ×4, `interview-plan.functions:69/:86` · scripts: `panel-changes:27`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `lib/panel-agent.functions.ts` (wrapper)   | 1       | 2      | 0      | 0       | 0        | app-lib: `SilentPanelCard.tsx` · routes: `interviews.index.tsx`, `organisation.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `lib/panelist-links.server.ts`             | 5       | 0      | 0      | 2       | 0        | app-lib: `interviewer-brief.server:104`, `panelist-links.functions:15/:41`, `scorecard-chase.server:213`, `panel/assess.server:287` · scripts: `panel-access:31`, `panel-directory:36`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `lib/panelist-links.functions.ts` (wrap.)  | 0       | 1      | 0      | 0       | 0        | routes: `scorecard.$token.tsx` (public token, map §6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `lib/panelist-mobile.server.ts`            | 3       | 0      | 1      | 1       | 0        | app-lib: `interviewer-brief.server:324`, `panelist-mobile.functions:15/:32` · agents: `orchestrator:977` · scripts: `confirm-calls:696`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `lib/panelist-mobile.functions.ts` (wrap.) | 0       | 1      | 0      | 0       | 0        | routes: `panel-mobile.$token.tsx` (public token)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `lib/panelists.server.ts`                  | 5       | 0      | 2      | 1       | 0        | app-lib: `panelists.functions` ×4, `slot-offers.server:123` · agents: `panel-gate:512`, `tools-phase3:362` · scripts: `panel-directory:33`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `lib/panelists.functions.ts` (wrapper)     | 0       | 0      | 0      | 0       | 0        | (no importers)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `lib/panels.server.ts`                     | 4       | 0      | 15     | 3       | 0        | app-lib: `panelists.server:106/:181`, `panels.functions:23/:26` · agents: `health.server:735`, `panel-gate` ×10, `tools-phase3` ×4 · scripts: `interview-panels:354/:526`, `panel-directory:34`                                                                                                                                                                                                                                                                                                                                                                                                                |
| `lib/panels.functions.ts` (wrapper)        | 0       | 1      | 0      | 0       | 0        | routes: `desk.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `lib/scorecard-chase.server.ts`            | 1       | 0      | 1      | 2       | 0        | app-lib: `interview-confirmations.functions:83` · agents: `orchestrator:961` · scripts: `desk-ordering:27`, `scorecard-chase:9`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `lib/slot-offers.server.ts`                | 12      | 0      | 4      | 6       | 0        | app-lib: `interview-confirmations.server:532`, `slot-offers.functions` ×3, `panel/review.server:437`, `voice/scheduling-brief:154`, `voice/scheduling-outcome:31/:54/:181`, `voice/scheduling-request:129/:215`, `voice/scheduling-session:290` · agents: `orchestrator:947/:1000`, `tools-phase3:375/:506` · scripts: `agent-interview-slots:30`, `agent-unhappy-paths:448`, `interview-confirmations:27`, `scheduling-call:617/:765/:786` — **see §2 voice cycle**                                                                                                                                           |
| `lib/slot-offers.functions.ts` (wrapper)   | 0       | 1      | 0      | 0       | 0        | routes: `schedule.$token.tsx` (public token)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `lib/vtt.ts` (shared)                      | 2       | 0      | 0      | 0       | 2        | app-lib: `panel-assessment`, `panel/prompts.ts` · packages: `integrations/src/server/meeting-transcripts.server.ts:28`, `integrations/test/meeting-transcripts.test.ts` (`SHIM(upward)`, §2)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `lib/meeting-ref.ts` (shared)              | 2       | 0      | 0      | 1       | 2        | app-lib: `interviews.functions`, `panel/transcripts.server.ts` · scripts: `spike-transcripts.ts` · packages: `integrations/meeting-transcripts.server.ts:26`, `integrations/test` (`SHIM(upward)`, §2)                                                                                                                                                                                                                                                                                                                                                                                                         |
| `lib/assessment.server.ts`                 | 1       | 0      | 0      | 1       | 0        | app-lib: `assessment.functions` · scripts: `assessment-timeline.test:19` (mock.module)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `lib/assessment.functions.ts` (wrapper)    | 0       | 2      | 1      | 4       | 0        | routes: `assess.$token.tsx` (public token), `candidates.$id.tsx` · agents: `tools-phase2:467` · scripts: `assessment-timeline.test` ×4 (incl. mock at `:19` on assessment.server)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `server/panel/assess.server.ts`            | 0       | 0      | 6      | 1       | 0        | agents: `tools-panel` ×6 · scripts: `panel-assessment:161`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `server/panel/prompts.ts`                  | 1       | 0      | 0      | 1       | 0        | app-lib: `panel/assess.server.ts` · scripts: `panel-live-check:48`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `server/panel/review.server.ts`            | 3       | 0      | 4      | 1       | 0        | app-lib: `interviews.functions:461/:545`, `panel/assess.server:220` · agents: `runtime:244/:463/:856`, `tools-panel:29` · scripts: `panel-review:31`                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `server/panel/transcripts.server.ts`       | 6       | 0      | 1      | 1       | 0        | app-lib: `integrations-oauth.functions:45`, `interviews.functions:1014`, `panel-agent.functions` ×4 · agents: `orchestrator:1016` · scripts: `panel-transcripts:26`                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Total**                                  | **126** | **15** | **46** | **56**  | **4**    | **247**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Note: `assessment-timeline.server` (pipeline domain) is **not** in this package —
`domains.mjs` maps it to `pipeline` before the `interviews` regex can catch the
`assessment` prefix. Its importer sites above (`screening.functions:351`,
`compensation.server`, `notifications.functions:502/:619`) are pipeline-facing, not
interviews-facing.

### 1c. offers (27 files, 170 importers)

| File                                       | app-lib | routes | agents | scripts | packages | Importers (abbrev.)                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ------- | ------ | ------ | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/offers.functions.ts` (wrapper, 1049)  | 2       | 1      | 6      | 8       | 0        | app-lib: `offer-letter-pdf` (×2 — types, make type-only) · routes: `offers.tsx` · agents: `runtime:869/:886`, `tools-phase4` ×4 · scripts: `agent-edge-cases:43`, `agent-hiring-cost-offer:43`, `agent-phase4:71`, `agent-unhappy-paths:46`, `compensation:629`, `offer-stage-events:22`, `pay-offers`, `pay-settings:411` (all dyn)                                                                           |
| `lib/offer-letter-pdf.ts` (shared)         | 2       | 0      | 0      | 0       | 0        | `OfferLetterDialog.tsx`, `offers.functions:160` (dyn) — make the functions import type-only first (§3)                                                                                                                                                                                                                                                                                                         |
| `lib/offer-response.functions.ts` (wrap.)  | 0       | 1      | 0      | 0       | 0        | routes: `offer.$token.tsx` (public token)                                                                                                                                                                                                                                                                                                                                                                      |
| `lib/offer-response.server.ts`             | 2       | 0      | 0      | 3       | 0        | app-lib: `offer-response.functions:14/:37` · scripts: `agent-edge-cases:384`, `agent-hiring-cost-offer:42`, `desk-ordering:28` — internal deps already re-pointed (§6)                                                                                                                                                                                                                                         |
| `lib/compensation.functions.ts` (wrap.)    | 1       | 1      | 0      | 0       | 0        | app-lib: `AgentPopup.tsx` · routes: `pay.$token.tsx` (public token)                                                                                                                                                                                                                                                                                                                                            |
| `lib/compensation.server.ts`               | 14      | 0      | 10     | 3       | 0        | app-lib: `compensation.functions` ×6, `negotiation.functions:48/:127`, `negotiation.server:215/:470`, `notifications.functions:618`, `offers.functions:234`, `voice/call-brief.server:114`, `voice/call-session.server:758` · agents: `orchestrator:1045`, `runtime:513`, `tools-phase2:418`, `tools-phase4` ×6, `tools-screening-call:105` · scripts: `compensation:44`, `negotiation:42`, `pay-settings:320` |
| `lib/negotiation.functions.ts` (wrap.)     | 0       | 1      | 0      | 0       | 0        | routes: `negotiate.$token.tsx` (public token) — imports `voice/negotiation-request.server` at `:99/:134` (§2)                                                                                                                                                                                                                                                                                                  |
| `lib/negotiation.server.ts`                | 7       | 0      | 7      | 2       | 0        | app-lib: `negotiation.functions` ×4, `notifications.functions:692`, `voice/negotiation-brief.server`, `voice/negotiation-request.server` · agents: `orchestrator:1038`, `runtime:522`, `tools-phase4` ×5 · scripts: `negotiation-call-session:40`, `negotiation:41`                                                                                                                                            |
| `lib/comp-knowledge.functions.ts` (wrap.)  | 0       | 0      | 0      | 0       | 0        | (no importers)                                                                                                                                                                                                                                                                                                                                                                                                 |
| `lib/comp-knowledge.server.ts`             | 2       | 0      | 0      | 0       | 0        | `comp-knowledge.functions`, `market.server` (intra-package)                                                                                                                                                                                                                                                                                                                                                    |
| `lib/market.functions.ts` (wrapper)        | 1       | 0      | 0      | 0       | 0        | `MarketBenchmark.tsx`                                                                                                                                                                                                                                                                                                                                                                                          |
| `lib/market.server.ts`                     | 2       | 0      | 1      | 0       | 0        | app-lib: `market.functions` (×2) · agents: `tools.ts:204` (dyn)                                                                                                                                                                                                                                                                                                                                                |
| `lib/salary-benchmark.functions.ts` (wrap) | 3       | 0      | 0      | 0       | 0        | app-lib: `components/salary-benchmark.tsx`, `data.ts` (×2) — holds the model-bearing insert (:96-113, §3)                                                                                                                                                                                                                                                                                                      |
| `lib/salary-benchmark.server.ts`           | 1       | 0      | 0      | 0       | 0        | `salary-benchmark.functions`                                                                                                                                                                                                                                                                                                                                                                                   |
| `lib/hiring-cost.functions.ts` (wrapper)   | 1       | 1      | 0      | 0       | 0        | app-lib: `HiringCost.tsx` · routes: `hiring-cost.tsx` — its **core** moves out of agents (§2)                                                                                                                                                                                                                                                                                                                  |
| `lib/pay-context.server.ts`                | 6       | 0      | 0      | 5       | 0        | app-lib: `autoscore.server:143`, `compensation.server:620`, `offers.functions:75/:314/:981`, `screening-logistics.server:36` · scripts: `pay-logistics`, `pay-offers`, `pay-settings:346/:427/:457`                                                                                                                                                                                                            |
| `lib/pay-convert.ts` (shared)              | 3       | 0      | 0      | 0       | 0        | `logistics.ts` (matching!), `pay-context.server`, `voice/negotiation-call-tools.ts`                                                                                                                                                                                                                                                                                                                            |
| `lib/pay-settings.server.ts`               | 5       | 0      | 6      | 2       | 0        | app-lib: `pay-context.server`, `pay-settings.functions:28/:79/:102/:172` · agents: `runtime:441/:837`, `tools-labour:22`, `tools-org:243/:277`, `tools.ts:407` · scripts: `evals/scenarios:3329`, `pay-settings:26`                                                                                                                                                                                            |
| `lib/pay-settings.ts` (shared)             | 3       | 0      | 1      | 0       | 1        | app-lib: `PayConventionsCard.tsx`, `pay-settings.functions`, `pay-settings.server` · agents: `tools-org:267` · packages: `db/src/server/schema.ts:4722` (`$type` — alias-ratchet-exempt, §2)                                                                                                                                                                                                                   |
| `lib/pay-settings.functions.ts` (wrap.)    | 2       | 1      | 0      | 0       | 0        | app-lib: `PayConventionsCard`, `RequisitionPayTermsCard` · routes: `organisation.tsx`                                                                                                                                                                                                                                                                                                                          |
| `lib/pay-terms.ts` (shared)                | 11      | 0      | 0      | 1       | 0        | app-lib: `compensation.server:621`, `logistics.ts` (matching), `pay-context.server`, `pay-convert`, `pay-settings.functions`, `pay-settings.server:392/:394/:static`, `pay-settings.ts`, `voice/call-brief.server`, `voice/call-prompt:48` · scripts: `pay-logistics.test`                                                                                                                                     |
| `lib/labour-policy.server.ts`              | 10      | 0      | 13     | 3       | 1        | app-lib: `labour-policy.functions` ×8, `offer-check.server:87/:105`, `voice/call-brief.server:115` · agents: `runtime` ×4, `tools-labour` ×9 · scripts: `evals/scenarios:3450`, `labour-policy:25`, `offer-check:61` · packages: `org/src/server/org-context.server.ts:152` (dyn — `SHIM(upward)`, §2)                                                                                                         |
| `lib/labour-policy.functions.ts` (wrap.)   | 0       | 1      | 0      | 0       | 0        | routes: `organisation.tsx`                                                                                                                                                                                                                                                                                                                                                                                     |
| `lib/offer-check.server.ts`                | 4       | 0      | 2      | 1       | 0        | app-lib: `offer-check.functions:26/:49/:59`, `offers.functions:250` · agents: `runtime:522`, `tools-phase4:552` · scripts: `offer-check:60`                                                                                                                                                                                                                                                                    |
| `lib/offer-check.ts` (shared)              | 1       | 0      | 0      | 0       | 0        | `offer-check.server.ts` (schema `$type` already on db json-types, §6)                                                                                                                                                                                                                                                                                                                                          |
| `lib/offer-check.functions.ts` (wrap.)     | 1       | 0      | 0      | 0       | 0        | `OfferPolicyCheck.tsx`                                                                                                                                                                                                                                                                                                                                                                                         |
| `lib/career-ladder.ts` (shared)            | 3       | 0      | 0      | 0       | 0        | `components/salary-benchmark.tsx` (×2), `salary-benchmark.functions` — destination conflict, §5 R7                                                                                                                                                                                                                                                                                                             |
| **Total**                                  | **87**  | **7**  | **46** | **28**  | **2**    | **170**                                                                                                                                                                                                                                                                                                                                                                                                        |

Package importers are landed (`@ats/org`, `@ats/db`). `pay-context`/`pay-terms`/
`pay-convert`/`logistics` cross into matching (`autoscore.server:143`,
`screening-logistics.server:36`, `logistics.ts`) — legal **upward inside the offer→
matching direction is wrong**: matching is _lower_ than offers in the L3 order, so
offers→matching is an inversion. Map §4 puts `logistics` in matching shared; the
pay-side imports of `logistics.ts`/`pay-convert.ts`/`pay-terms.ts` are the shared-type
direction (matching reads offer pay types through the offers `/shared` entry after the
move) — see §5 R12.

### 1d. onboarding (5 files, 18 importers)

| File                                    | app-lib | routes | agents | scripts | packages | Importers (abbrev.)                                                                                                                                                                                                                                                        |
| --------------------------------------- | ------- | ------ | ------ | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/onboarding.functions.ts` (wrapper) | 0       | 1      | 1      | 1       | 1        | routes: `offers.tsx` · agents: `runtime:901` · scripts: `agent-unhappy-paths:337` · packages: `ai/test/training-data.test.ts:343` (dyn)                                                                                                                                    |
| `lib/onboarding.server.ts`              | 3       | 0      | 6      | 2       | 0        | app-lib: `local-inbox.server:305` (dyn — the document branch, §2), `offers.functions:266` (dyn — release gate), `onboarding.functions:147` · agents: `runtime:531/:567`, `tools-phase4:41/:603/:654/:688` · scripts: `agent-edge-cases:161`, `agent-hiring-cost-offer:280` |
| `lib/hrms.ts` (shared)                  | 1       | 1      | 0      | 0       | 0        | app-lib: `hrms.functions` · routes: `integrations.tsx`                                                                                                                                                                                                                     |
| `lib/hrms.server.ts`                    | 0       | 1      | 0      | 0       | 0        | routes: `api/public/sync-hrms:20` (dyn) — imports `integrations.server` at `:24` (legal L3→L2 after the move)                                                                                                                                                              |
| `lib/hrms.functions.ts` (wrapper)       | 0       | 0      | 0      | 0       | 0        | (no importers)                                                                                                                                                                                                                                                             |
| **Total**                               | **4**   | **3**  | **7**  | **3**   | **1**    | **18**                                                                                                                                                                                                                                                                     |

Excluded from the move despite the regex: `onboarding.catalogue.ts` → **desk** (the
first-login journey catalogue; findings-domains-ui A2 — and the `desk` rule in
`domains.mjs` is dead for it because the `onboarding` rule matches first, see R7);
`hr-performance.*` → **analytics** (domains.mjs L4; findings A2 "arguably not
onboarding"); `lib/career.ts` stays analytics except the metrics split (map §4
matching shared row — imported by `matching.server` and `candidates.index.tsx`).

---

## 2. Change-PR dependencies per package (verified against current files)

Every item is its own change PR — **never inside a move PR** (inline-server-fns header;
stage-writers brief rule 1). Items marked **T1** also drop an `alias-ratchet` count
(`scripts/alias-ratchet.test.ts:24` — `MAX_ALIAS_IMPORTS = 7`, TRUE total 5 alias + 2
relative; the six Phase 6 marks below must take it to 1 in the PRs that resolve them;
only `observability alerts → agents.catalog` remains for Phase 7).

### matching

1. **T1 — `capture.server` verification interim.**
   `packages/candidates/src/server/capture.server.ts:278-280` —
   `// SHIM(upward): resolve in Phase 6 … await import("../../../../apps/web/src/lib/verification.server")`.
   Resolves in the verification move PR: re-point to `@ats/matching/server`, delete the
   marker, ratchet −1 (relative). Needs `persistVerification` extracted first (§3 item 2).
2. **T1 — `capture.server` autoscore interim.**
   `packages/candidates/src/server/capture.server.ts:376-378` — same pattern for
   `scoreUnscored`. Resolves in the autoscore move PR (re-point, marker dead, ratchet −1).
3. **Stage-writers row 3: `scoreUnscored` → `moveStageCore`.** Export at
   `apps/web/src/lib/autoscore.server.ts:40`; writes `.set({stage: ai_screened|shortlisted})`.
   The core extension it needs (`cause`/`source:"ai"`) is landed
   (`pipeline.server.ts:43-45`). Remove the `KNOWN_STAGE_WRITERS` entry
   (`pipeline.test.ts:559`) in the same PR. AI path must never hit `assertRole`
   (already handled by `input.source !== "ai"` at `pipeline.server.ts:88`).
4. **Stage-writers row 4: `persistMatchResult` → `moveStageCore`.**
   `apps/web/src/lib/matching.functions.ts:685`. Keep the `stage === "applied"` guard and
   the after-score ordering in the caller; delete the caller's own journal call in the same
   change or `stage_events` duplicates. Remove the `KNOWN_STAGE_WRITERS` entry
   (`pipeline.test.ts:560`). Without `source:"ai"` outcome capture records `by: "human"` —
   pass the AI principal.
5. **T1 — redteam probe.** `packages/ai/src/server/redteam/check.server.ts:137-138`
   imports `gradeScreeningPrompt` from `@/lib/screening.server` — the marker says
   "Phase 5 (candidates)" but screening is **matching**: Phase 6 resolves it. Map §5's
   `registerRedteamTarget` port is the fix: matching registers the fishing probe's grader
   at boot (`boot.ts`), `@ats/ai/redteam` imports nothing app-side. Ratchet −1 (alias).
6. **Cores split out of the wrappers** (§3 items 3-5) — separate small PRs before the move.

### interviews

1. **T1 — meeting-ref + vtt into `@ats/interviews/shared`.**
   `packages/integrations/src/server/meeting-transcripts.server.ts:26` (`MeetingRef`) and
   `:28` (`parseVtt`, `TranscriptSegment`) — both marked
   `// SHIM(upward): resolve in Phase 6 (interviews)` (the "#34 integrations interim").
   The importer side also covers `packages/integrations/test/meeting-transcripts.test.ts`.
   Move both files to interviews/shared, re-point the package, correct `domains.mjs`
   (both sit in the `std` catch-all today), delete the markers: ratchet −2 (alias).
2. **Stage-writers row 5: the three `interviews.functions` stage writes → `moveStageCore`.**
   `scheduleInterviewCore` (`apps/web/src/lib/interviews.functions.ts:906`, l-stage parking
   with `cause: "interview_scheduled"`), `markInterviewOutcomeCore` (:666),
   `submitScorecardCore` (:283, AI-interview completion). The `cause` param exists
   (`pipeline.server.ts:43`); booking stays email/agent-event-silent only if it is passed.
   External/private-link pre-checks stay **ahead of** the core call. Remove the
   `KNOWN_STAGE_WRITERS` entry (`pipeline.test.ts:561`). ~11 script suites touch this
   file (§1b row) — they re-point, not shim (R3).
3. **`slot-offers ↔ voice` cycle** (map §10). Current edges both ways:
   `apps/web/src/lib/slot-offers.server.ts:300` →
   `../server/voice/scheduling-request.server`; and back
   `apps/web/src/server/voice/scheduling-request.server.ts:129` (`roundNotYet`) and
   `:215` (`SLOT_OFFER`) → `@/lib/slot-offers.server`. Break it before the move with the
   map §10 port (voice registers a `requestSchedulingCall`/round-state port, same shape
   as `AgentPort`) or an interviews event — a package-side shim would freeze the cycle
   into `@ats/interviews ↔ @ats/voice`.
4. **Nudge split (map §4 workspace note).** `notifications.functions.ts:498`
   (`assessmentNudges`) moves its body to `@ats/interviews/server`;
   `:614` (`payNudges`) and `:687` (`negotiationNudges`) to `@ats/offers/server`; the
   aggregator (`:461-463`) composes them (workspace, Phase 7). Same PR per domain or one
   PR before both moves — decide at review; the aggregator keeps working against app
   paths until workspace lands.
5. **DB json-types direction.** `interview-plan`/`expert-brief`/`vtt`/`panel-assessment`
   types are **already** in `packages/db/src/server/json-types/`
   (`schema.ts:532/:539/:3851/:3890`) — the S7 fix landed. The app `lib/*.ts` files move
   to `@ats/interviews/shared` **as re-exports** of `@ats/db`'s json-types (map §4
   interviews shared row), so db (L0) never imports interviews (L3).

### offers

1. **`negotiation.functions → voice`** (findings A8 "prefer voice/rpc owns it").
   `apps/web/src/lib/negotiation.functions.ts:99` (`checkNegotiationCall`) and `:134`
   (`requestNegotiationCall`) dynamically import `../server/voice/negotiation-request.server`.
   The wrapper stays in `apps/web` (web/server-fn), so the edge stays app→voice and
   **legal without a change** — but the map ruling prefers voice owning the composition.
   Decision recorded here: keep the app-side composition (no Phase 6 change PR); revisit
   only if the voice move (Phase 7) makes it an upward package edge.
2. **Hiring-cost core out of agents** (findings A1). The core lives in
   `apps/web/src/server/agents/hiring-cost.server.ts` (`roleCost` :303, `candidateCost`
   :370, `OrgHiringCost` :390, `COST_STAGES` :28). Change PR: move the module to
   `@ats/offers/server`; the agents tool re-points (agents wrap it, not own it). Keep the
   `lib/hiring-cost.functions.ts` wrapper in web.
3. **`pay-settings` `$type` interim.** `packages/db/src/server/schema.ts:4722` does
   `$type<import("…/apps/web/src/lib/pay-settings")>` (alias-ratchet-exempt, Phase 2
   deviation 3, `scripts/alias-ratchet.test.ts:35-38`). Resolve in the move PR: the
   shared types land in `@ats/offers/shared` (or db json-types) and the schema import
   re-points; remove the exemption if the import leaves the app tree.
4. **`career-ladder` destination.** Map §4 offers shared includes it; `domains.mjs`
   catch-all routes it to `std`. Move to `@ats/offers/shared` per map §4 and correct
   `domains.mjs` in the same PR (R7). Importers are offers-only (§1c row).
5. **`offer-letter-pdf` type-only first.** `lib/offer-letter-pdf.ts` imports
   `offers.functions` twice for types; make them `import type`, then the file is a pure
   client util for `offers/shared` (findings A1) — one-line PR before the move.
6. **Offers → onboarding release gate.** `apps/web/src/lib/offers.functions.ts:266`
   imports `readinessFor` from `./onboarding.server`. Legal downward **after** both
   packages land (offers → onboarding is the L3 order) — re-point to
   `@ats/onboarding/server` in the onboarding move PR; no event needed (map §4
   onboarding note allows the direct downward call). No separate change PR.
7. **`compensation`/`negotiation → assessment-timeline`** (findings A8): verified sites
   `compensation.server.ts:260/:309/:455/:746`, `negotiation.server.ts:279`. Legal
   downward (pipeline is lower than offers) — blocked only on **R1**
   (`packages/pipeline` landing). No extraction; re-point only.

### onboarding

1. **T1-adjacent — inbound-mail document handler** (map §5 `onInboundMail` row).
   `apps/web/src/lib/local-inbox.server.ts:304-305` still imports `onboarding.server`
   (`docTypeLabel`, `expandUpload`) for the pre-onboarding document-filing branch (the
   comment at `:15` says "onboarding stays Phase 6"). Change PR: move the branch to
   `@ats/onboarding/server` as its own handler, registered in `boot.ts` via
   `onInboundMail` (exact precedent: `packages/candidates/src/server/inbound-cv.handler.ts`
   from Phase 5). Closes the last `local-inbox → onboarding` edge (findings A4, map S8).
2. **`onboarding.server` split (>800 rule).** 1035 lines: collection / AI doc check /
   pdf+zip extraction (findings A2). Split before or in the move PR (as three server
   modules behind one index), never as three packages.
3. **Shim-layer re-points inside the move PR** (no separate PRs): `onboarding.server:403`
   `./cv-text.server` → `@ats/std/server` (the app file is already a Phase 8 shim);
   `:430` `../server/agents/context` → `@ats/ai/server`; `:540`
   `../server/agents/events` → kernel's `emitAgentEvent`. Same for the agents tools'
   dynamic imports (`tools-phase4` ×6, `runtime:531/:567/:901`).
4. **`hrms.server` credential store.** `hrms.server.ts:24` imports
   `readSecrets`/`IntegrationConfig` from `./integrations.server` — re-point to
   `@ats/integrations/server` (landed, L2; legal L3→L2). The `sync-hrms` route
   (`routes/api/public/sync-hrms:20`, dyn) re-points in the same PR.

---

## 3. Core extractions from inline-server-fns (model-bearing DB writes FIRST)

The product owner's queue (inline-server-fns note 0, verified line-by-line at `5bd3e08` —
the `model:` literals are persisted DB columns, not wire returns; none reach the client).
Each extraction is **its own change PR before the move**:

1. **`saveBenchmarkRun`** (offers) — extract from `runSalaryBenchmark`
   (`apps/web/src/lib/salary-benchmark.functions.ts:58`; the insert is `:96-113`:
   `db.insert(salaryBenchmarks).values({… provider, model })`). Wrapper keeps
   `createServerFn`; core exports from the offers server entry (§11 ruling 2 pattern).
2. **`persistVerification`** (matching) — extract from `verifyCandidate`
   (`apps/web/src/lib/verification.functions.ts:19`; insert at `:51-60`) and the bulk
   path `verifyCandidates` (:73; insert at `:108-117`) — **two `.values` sites, one
   core**. Third call-site dedupe in the same PR: the route-level duplicate insert at
   `apps/web/src/routes/api/public/sync-candidates.ts:92-103` switches onto the core
   (inline-server-fns note 0). Unblocks T1 item 1 (capture re-point).
3. **`persistAssessmentResult`** (interviews) — the write **already lives inside a
   covered core**: `submitAssessmentCore`
   (`apps/web/src/lib/assessment.functions.ts:182`; the atomic locked `.set` with
   `model` at `:235-248`). No split needed: the extraction is the move itself
   (`createServerOnlyFn` drops, core exports from the interviews server entry). Same
   for `createAssessmentCore` (:42, `.values` at :100).
4. **`persistDocumentExtraction`** (onboarding) — extract from `reextractOnboardingDoc`
   (`apps/web/src/lib/onboarding.functions.ts:245`; the `.set` with `model` at
   `:267-278`). The review-decision write at `:324` is already inside
   `reviewOnboardingDocCore` (:289) — moves with the core.
5. **Matching trivial cores at move time** (inline-server-fns matching section, verified):
   `bucketCounts` (`screening-queue.functions.ts:249`, createServerOnlyFn CTE aggregate —
   keep untested per the note, extract as-is), `importJd` (:131), `parseResume` (:552),
   `runAiScreening` (:590) — thin `aiJson` wrappers. The real cores exist:
   `generateJdCore` (:90), `suggestWeightsCore` (:237), `draftLinkedinPostCore` (:397);
   screening's `prepareScreeningKitForPairing` (:184) and `gradeScreeningForKit` (:267)
   exist and move with the §11-ruling-2 wrapper-drop.
6. **Interviews cores exist** (map §4 list, verified): `progressionFor` (:45),
   `submitScorecardCore` (:283), `markInterviewOutcomeCore` (:666),
   `interviewerUnavailableCore` (:766), `scheduleInterviewCore` (:906) — no extraction
   PRs needed beyond the §2 stage-writer repoints inside them.
7. **Offers cores exist**: `createOfferCore` (:52), `emailReleasedOffer` (:135),
   `advanceOfferCore` (:200), `sendBackOfferCore` (:405), `generateOfferLetterCore`
   (:742), `reviseOfferCore` (:933) — plus the one genuine inline: **`deleteOfferLetter`**
   (`offers.functions.ts:699`, 1 fn, inline-server-fns offers section) and onboarding's
   **`deleteOnboardingDoc`** (`onboarding.functions.ts:395`, 1 fn) — trivial deletes,
   extract at move time.

---

## 4. Shim plan and same-day execution checklist

Shim precedent (map §11): `// SHIM: remove in Phase 8` re-export at the old app path;
scripts and package importers **always re-point in the same PR** (R3 mock-path hazard).
Every shim stays under a `server/` path or keeps a `.server.ts` name so
`apps/web/vite.config.ts` client-bundle mocking still applies (R6).

| Package    | Shim at old path (importer count)                                                                                                                   | Full re-point (all importers same PR)                                                                                                                                                                                                                                                         | Wrappers (no move)                                                                                                                                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| matching   | `matching.server` (8), `screening.server` (4), `autoscore.server` (5), `verification.server` (3)                                                    | `expert-brief` (3), `weight-advice` (3), `shortlist` (4), `logistics` (5), `screening-coverage` (6), `screening-logistics` (1), `screening-prep` (2), `bias.server` (3)                                                                                                                       | `matching.functions`, `screening.functions`, `screening-queue.functions`, `screening-rationale.functions`, `verification.functions`                                                                                                                                                    |
| interviews | `interview-plan.server` (31), `interviews.functions` (19), `slot-offers.server` (22), `panels.server` (22), `interview-confirmations.server` (20)   | everything else (each ≤8 importers, mostly intra-package or agents dyn — re-point the agents/desk/voice/panel callers)                                                                                                                                                                        | `interview-plan.functions`, `interview-confirmations.functions`, `interviewers.functions`, `panel-agent.functions`, `panelist-links.functions`, `panelist-mobile.functions`, `panelists.functions`, `panels.functions`, `slot-offers.functions`, `assessment.functions`                |
| offers     | `offers.functions` core module (17), `compensation.server` (27), `negotiation.server` (16), `labour-policy.server` (27), `pay-settings.server` (13) | `offer-response.server` (5), `comp-knowledge.server` (2), `market.server` (3), `salary-benchmark.server` (1), `pay-context.server` (11), `offer-check.server` (7), `offer-check` (1), `career-ladder` (3), `offer-letter-pdf` (2), `pay-convert` (3), `pay-settings.ts` (5), `pay-terms` (12) | `offers.functions`, `offer-response.functions`, `compensation.functions`, `negotiation.functions`, `comp-knowledge.functions`, `market.functions`, `salary-benchmark.functions`, `hiring-cost.functions`, `pay-settings.functions`, `labour-policy.functions`, `offer-check.functions` |
| onboarding | `onboarding.server` (11 — incl. `offers.functions:266` and the new inbound-doc handler registration)                                                | `hrms.ts` (2), `hrms.server` (1)                                                                                                                                                                                                                                                              | `onboarding.functions`, `hrms.functions`                                                                                                                                                                                                                                               |

Order: skeletons → change PRs (§2/§3) → moves, one package at a time, **matching first**
(unblocks both capture T1 interims and the redteam mark), `interviews` second (kills the
voice cycle and the integrations marks), `offers` third, `onboarding` fourth (offers'
release gate re-point lands with it). Gates after every PR: `bunx turbo run typecheck`,
`bun run lint`, `bunx prettier --check .`, `node tools/depcruise-check.mjs` (WARN_MAX 95,
`tools/depcruise-check.mjs:9` — may only go **down**; lower it as the L4→L3 dyn edges
die), `node scripts/refactor/table-owners.mjs`, `bunx turbo run test`, every moved
`scripts/*.test.ts`, `bun run agents:lock && git diff --exit-code scripts/agents.lock.json`,
the alias-ratchet (`scripts/alias-ratchet.test.ts` — the cap drops with each T1 PR),
`bunx turbo run build`, worker boot smoke (CI — voice bundles interviews/offer code via
agents tools; a missed specifier shows up exactly there).

### 0. Skeletons (Dev 2's first four PRs)

- [ ] `packages/{matching,interviews,offers,onboarding}` — copy the `@ats/candidates`
      skeleton (exports `./shared` + `./server`; server entry opens with
      `import "@tanstack/react-start/server-only"`; tsconfig alias bridge). Register in
      workspace + turbo + depcruise.
- [ ] **R1 ruling needed:** `packages/pipeline` landing order (Dev 1) before matching/
      interviews move — or the pipeline cores stay app-side and the moved writers'
      wrappers keep calling them (see R1).

### 1. matching

1. [ ] Change PR: `persistVerification` core + `sync-candidates:92` dedupe (§3 item 2).
2. [ ] Change PR: `persistMatchResult` → `moveStageCore` (§2 matching 4; drop
       `pipeline.test.ts:560` entry) and `scoreUnscored` → `moveStageCore` (§2 matching 3;
       drop `:559`) — separate PRs.
3. [ ] Change PR: redteam registers the fishing probe at boot (§2 matching 5; ratchet −1).
4. [ ] Move PR: 12 server/shared modules → `@ats/matching/{server,shared}` + extracted
       cores; shims per §4; **re-point** `capture.server:280/:378` (ratchet −2 relative)
       and every script importer (R3); desk/voice L4 dyn callers re-point same-PR (R5).
5. [ ] Test moves: `matching-gates.test.ts`, `weight-advice.test.ts`,
       `expert-brief.test.ts` → `packages/matching/test/`; `matching-eval.ts` +
       `evals/matching-scenarios.ts` → `tools/evals/` (map §8); `bias-report.ts` →
       `tools/`. Re-point (no move): `guardrails.test.ts`, `guardrails-p1.test.ts`,
       `screening-call.test.ts` (voice), `pay-logistics.test.ts`/`pay-settings.test.ts`
       (offers), `integration.verify.test.ts`.
6. [ ] Gates; depcruise WARN_MAX down (capture→matching, redteam→screening edges die).

### 2. interviews

1. [ ] Change PR: `meeting-ref` + `vtt` → `@ats/interviews/shared`; re-point
       `integrations` package + test; correct `domains.mjs`; ratchet −2 (§2 interviews 1).
2. [ ] Change PR: the three `interviews.functions` writes → `moveStageCore` with
       `cause` (§2 interviews 2; drop `pipeline.test.ts:561` entry).
3. [ ] Change PR: slot-offers↔voice port (§2 interviews 3) — must land **before** the
       move PR or the cycle packages.
4. [ ] Change PR (or folded into 3/4): `assessmentNudges` body → interviews server;
       `payNudges`/`negotiationNudges` bodies → offers server (§2 interviews 4).
5. [ ] Move PR: `server/panel/*` (4 files) + server/shared modules + existing cores →
       `@ats/interviews/{server,shared}`; shared types re-export `@ats/db` json-types;
       shims per §4; agents (`panel-gate` ×10+, `tools-panel`, `tools-phase3`,
       `orchestrator`, `runtime`, `health`) and desk/voice dyn callers re-point same-PR.
6. [ ] Test moves: `interview-panels`, `interview-confirmations`,
       `interview-reminders`, `interview-with`, `interviewer-brief`, `panel-access`,
       `panel-assessment`, `panel-changes`, `panel-directory`, `panel-review`,
       `panel-simulation`, `panel-transcripts`, `scorecard-chase`, `scorecard-rubric`,
       `confirm-calls`, `scheduling-call` → `packages/interviews/test/`;
       `panel-live-check.ts`, `spike-transcripts.ts` → `tools/evals/`. Re-point (no
       move): `agent-interview-panel`, `agent-interview-slots`, `agent-handoff`,
       `assessment-timeline.test` (pipeline!), `desk-ordering.test`,
       `agent-unhappy-paths.test`.
7. [ ] Gates + worker boot smoke; WARN_MAX down again.

### 3. offers

1. [ ] Change PR: `saveBenchmarkRun` extraction (§3 item 1).
2. [ ] Change PR: hiring-cost core → `@ats/offers/server` (§2 offers 2).
3. [ ] Change PR: `offer-letter-pdf` type-only imports (§2 offers 5) +
       `career-ladder` → `@ats/offers/shared` + `domains.mjs` correction (§2 offers 4).
4. [ ] Change PR: `pay-settings` `$type` re-point (§2 offers 3) — same PR as the move
       if the shared types land first.
5. [ ] Move PR: `offer-response.server`, `compensation.server`, `negotiation.server`,
       `comp-knowledge.server`, `market.server`, `salary-benchmark.server`,
       `pay-context.server`, `pay-settings.server`, `labour-policy.server`,
       `offer-check.server`, offer cores → `@ats/offers/{server,shared}` (pay-*/policy
       files into `policy/` per map §10); shims per §4; agents (`tools-phase4`,
       `tools-labour`, `tools-org`, `tools.ts`, `runtime`, `orchestrator`) and voice
       callers re-point same-PR.
6. [ ] Test moves: `compensation`, `negotiation`, `negotiation-call`,
       `negotiation-call-session`, `offer-check`, `offer-stage-events`, `pay-offers`,
       `pay-settings`, `pay-terms`, `pay-logistics`, `labour-policy`,
       `agent-hiring-cost-offer` → `packages/offers/test/`. Re-point (no move):
       `agent-phase4`, `agent-edge-cases`, `agent-unhappy-paths`, `desk-ordering`,
       `evals/scenarios.ts`, `training-data.test` (`@ats/ai`).
7. [ ] Gates + worker boot smoke; WARN_MAX down.

### 4. onboarding

1. [ ] Change PR: inbound-doc handler out of `local-inbox.server` (§2 onboarding 1).
2. [ ] Change PR: `persistDocumentExtraction` extraction (§3 item 4) +
       `deleteOnboardingDoc` core.
3. [ ] Move PR: `onboarding.server` (split into collection / AI check / extraction),
       `hrms.server`, `hrms.ts` + new cores → `@ats/onboarding/{server,shared}`; shim
       `onboarding.server`; re-point `offers.functions:266`, `local-inbox` registration,
       `sync-hrms:20`, `tools-phase4`/`runtime` dyn callers, `training-data.test:343`;
       `hrms.server:24` → `@ats/integrations/server`.
4. [ ] Gates; the `onInboundMail` boot registration verified against the comms
       registry (`packages/comms/src/server/inbound.server.ts`).

---

## 5. Risks and notes

**R1 — `packages/pipeline` has not landed.** The L3 order makes
matching/interviews/offers depend on pipeline (`moveStageCore`, `recordOfferStageCore`,
`stage-events`, `assessment-timeline`) — all still app-side
(`apps/web/src/lib/pipeline.server.ts`). If Phase 6 moves matching cores into
`@ats/matching/server` while the pipeline cores stay in the app, every writer repoint
creates a package→app upward import — exactly what Phase 5 avoided. **Dev 1 must land
`packages/pipeline` (or at least a stable `@ats/pipeline/server` entry) before the
matching move PR**; otherwise the move PRs must keep the repointed writers in the app
wrappers and defer. Confirm at the Phase 6 kickoff; this blocks item ordering.

**R2 — model-bearing writes first.** §3 items 1, 2 and 4 are the product owner's
queue and each is a separate change PR; the `assessment` pair rides existing cores
(§3 item 3). Do not bundle them into move PRs (inline-server-fns header rule).

**R3 — mock-path hazard.** Bun `mock.module` matches by path; a stale path silently
stops applying and the test hits the real DB/AI (map §8). Every script suite listed in
§1 re-points import **and** mock paths in the same PR as the shim. Biggest exposure:
`interviews.functions` (10 script suites), `interview-plan.server` (9 agents files +
2 suites), `compensation.server` (10 agents files + 3 suites).

**R4 — voice edges.** The slot-offers↔voice cycle (§2 interviews 3) must be broken
before the interviews move or it freezes into a package cycle — depcruise errors, CI
red. `negotiation.functions:99/:134` stays app-side (legal; §2 offers 1 records the
decision). Voice's many read-side imports of interviews/offer server modules
(`scheduling-*`, `confirm-calls`, `negotiation-brief`, `call-brief`, `call-session`,
`call-prompt`) re-point same-PR (L4→L3 downward, legal).

**R5 — desk/voice L4 riders.** `desk.server` dyn imports of matching/interviews
modules (`:2101`, `:2751`, `:3930`) and the agents `runtime`/`orchestrator`/`tools-*`
dyn imports re-point in the move PRs — no shims for L4 callers (phase5 R7 pattern).

**R6 — vite import protection.** Shims at old `lib/*.server.ts` paths keep their
`.server.ts` names so `**/server/**` client mocking still applies (phase5 R8);
`server/panel/*` moving into the package is covered by the `@ats/*/server` specifier
rule already in `apps/web/vite.config.ts`.

**R7 — domains.mjs corrections (each in the PR that moves the file).**
(a) `meeting-ref`/`vtt`: the `std` catch-all (`domains.mjs:119`) is superseded by map §4
L3 interviews shared — correct to interviews. (b) `career-ladder`: same catch-all vs
map §4 offers shared — correct to offers. (c) `onboarding.catalogue.ts`: the `desk` rule
(`domains.mjs:111`) is **dead** — the `onboarding` rule (`:101`) matches first, so
`domainOf` returns onboarding today; reorder or special-case it so the file resolves to
desk (it is excluded from the Phase 6 move either way). (d) `career.ts` metrics split
(map §4 matching shared "career metrics (from career.ts)"): `matching.server` imports it
today — if the split is not done in Phase 6, matching's move PR must not claim
`career.ts` and the matching→career edge (S8) stays one more phase.

**R8 — alias ratchet accounting.** Six of the seven counted interims are Phase 6
(matching ×3 incl. the two relative capture marks, interviews ×2, offers ×1); the PRs
above must drop `MAX_ALIAS_IMPORTS` from 7 to 1 step by step, never rise
(`scripts/alias-ratchet.test.ts:24`, header drop-plan). The db-schema `$type`
exemption (`:35-38`) disappears with §2 offers 3.

**R9 — table ownership follows the move** (`scripts/refactor/table-owners.mjs:63-107`,
map §7): matching owns `match_scores`, `screening_kits`, `screening_runs`,
`screening_prep_jobs`, `candidate_verifications`; interviews owns `interviews`,
`interview_slot_offers`, `round_substitutes`, `panelists`, `member_interviewer_profiles`,
`panelist_scorecard_links`, `evaluations`, `interview_transcripts`,
`panel_assessments`, `panel_agent_settings`, `ai_interviews`, `candidate_assessments`,
`assessment_settings`; offers owns `offers`, `offer_negotiations`,
`compensation_requests`, `compensation_details`, `salary_benchmarks`, `comp_knowledge`,
`hr_incentive_schemes`; onboarding owns `onboarding_documents`, `hrms_employees`,
`hrms_sync_state`, `hrms_field_mappings`. Tenancy tests move with their package;
`table-owners.mjs` stays green (CI-gated).

**R10 — public-token RPC wrappers stay in web.** `slot-offers`, `panelist-links`,
`panelist-mobile`, `offer-response`, `compensation`, `negotiation`, `assessment` are on
the map §6 public-token allow-list. Their `createServerFn` wrappers (and token
middleware) never move; only the `.server` cores do. Rate-limit keys use URL paths —
unchanged. The `$token` routes (`schedule`, `scorecard`, `panel-mobile`, `offer`, `pay`,
`negotiate`, `assess`, `confirm`) re-point to the same wrappers, so no route changes.

**R11 — shared type entries must stay browser-safe.** `interview-plan`,
`panel-assessment`, `panel-brief`, `vtt`, `meeting-ref`, `offer-letter-pdf`,
`career-ladder`, `pay-terms`/`pay-settings`/`pay-convert`, `offer-check`, `expert-brief`
types, `hrms` — these land in `/shared` (rule 5: no node:/db/server-only, no React).
The interviews shared types re-export `@ats/db` json-types — verify the export chain
stays browser-safe (db json-types are zod/type-only today).

**R12 — offers↔matching shared-type direction.** `pay-context.server` imports
`autoscore.server:143` and `screening-logistics.server:36`; `logistics.ts` imports
`pay-convert`/`pay-terms` (matching importing offer pay types). The L3 order is
pipeline → matching → interviews → offers, so these read-side edges are only legal as
**shared-type** imports across the boundary (matching's `/shared` may not import
offers' `/shared` either — L3 rule 2 allows only listed edges). Resolution: move the
pure pay types (`pay-terms`, `pay-convert`) to where both can see them — either
`@ats/std/shared` (already hosts catalogues) or keep `logistics`+pay types in offers
and re-point matching's three import sites to offers/shared is **illegal**. Propose at
review: `pay-terms`/`pay-convert`/`logistics` go to `@ats/std/shared` (they are pure
conversions/catalogues), `pay-context` stays offers/server. Flagged for the reviewer —
do not silently shim it.

**R13 — KNOWN_STAGE_WRITERS "found exactly once" guard.** `pipeline.test.ts:610-613`
fails CI if a listed writer file is renamed or lost. The matching/interviews move PRs
must either move the writer file's entry target with it (the guard matches by basename
across scan roots) **after** the repoint PRs removed the entries, or the entries are
already gone — hence §2 ordering: repoints first, moves second.

## Reviewer input needed at kickoff

1. R1 (`packages/pipeline` order) — decides whether matching moves this phase at all.
2. R12 (pay types home: std vs offers).
3. §2 interviews 4 (nudge split: one PR before both moves vs per-domain PRs).
4. R7 (c) — domains.mjs `onboarding.catalogue` dead rule: fix now or in the desk phase.

---

## 6. Cross-check: entries superseded by the merged Phase 5 writer re-points

Verified at `5bd3e08`; the two source evidence docs are **not edited** (this section is
the record):

| Older evidence entry                                                                                                                                   | Status at `5bd3e08`                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| findings-domains-ui A8: "offers/compensation/negotiation .server → desk/desk.server (desk tasks) — **inverted**"                                       | **Closed.** Both re-pointed to the landed desk-core port: `compensation.server.ts:240-242`, `negotiation.server.ts:116-118` (`conversationForRequisition` + `postMessage` via `@ats/desk-core/server`).                                                                |
| findings-domains-ui A8: "offer-response.server → lib/stage-events.server (candidates)"                                                                 | **Updated.** #59 (`ded820d`) re-pointed the stage write onto `recordOfferStageCore` (`offer-response.server.ts:166`); no stage-events import remains. Remaining deps are legal: training capture `:187` (`@ats/ai`), `emitAgentEvent :209` (kernel), desk-core `:231`. |
| stage-writers row 6 (offer-response) + its `recordOfferStageCore` extension item (Phase 5 order item 4)                                                | **Closed** by #59.                                                                                                                                                                                                                                                     |
| stage-writers row 8 (collaboration) + row 9 (candidates.functions) + the org-scope acceptance criterion (stage-writers:33, phase5-runbook R2/B1)       | **Closed** by #56 (`105776e`, `8333f29` — pre-flip `assertReusable`, catch-and-log) and #57 (`f93fb8f` — `entryStage` + `skipReusable`). The two `KNOWN_STAGE_WRITERS` entries are gone (`pipeline.test.ts:556-567`).                                                  |
| stage-writers Phase 5 order items 1-3 (`cause` param, AI principal/`source`, `moveStagesCore`)                                                         | **Closed** — all on `main` (`pipeline.server.ts:43-45`, `:129`). Phase 6's repoints (§2) are unblocked by them.                                                                                                                                                        |
| stage-writers rows 3/4/5 (`autoscore`, `matching.functions`, `interviews.functions`)                                                                   | **Still open** — exactly the Phase 6 repoints (§2); entries remain in `KNOWN_STAGE_WRITERS` (`pipeline.test.ts:559-561`).                                                                                                                                              |
| phase5-runbook R9: "None of §10's 24 unmapped files or 5 wrong-way imports land in requisitions/candidates/distribution (they are offers/desk/voice…)" | **Confirmed** — the §10 files (`pay-*`, `labour-policy`, `offer-check`) are all Phase 6 moves here; the slot-offers↔voice wrong-way import is §2 interviews 3.                                                                                                         |
| inline-server-fns requisitions/candidates/distribution sections (~24 inline entry points)                                                              | **Executed** in Phase 5 (see phase5-runbook §2 change PRs and R1). Not re-verified function-by-function here; Phase 6 touches none of them.                                                                                                                            |
| inline-server-fns matching/offers/onboarding sections + note 0                                                                                         | **Current** — every listed fn verified still inline at `5bd3e08` with the line numbers in §3 (matching `bucketCounts`/`importJd`/`parseResume`/`runAiScreening`; offers `deleteOfferLetter`; onboarding `deleteOnboardingDoc`; the four model-bearing writes).         |
| findings-domains-ui A4: local-inbox inverted "imports intake.server, cv-text.server, onboarding.server"                                                | **Partially closed.** CV branch moved to `@ats/candidates` (`packages/candidates/src/server/inbound-cv.handler.ts`, Phase 5 B3); the onboarding document branch remains (`local-inbox.server.ts:304-305`) — closed by §2 onboarding 1.                                 |
| findings-domains-ui A8: "offers/onboarding/offer-response → training/capture.server" and "→ ai-gateway"                                                | **Confirmed legal** (ai is L1 infra); no action — the imports go through the app shims and re-point to `@ats/ai/server` in the move PRs.                                                                                                                               |

## Reviewer rulings at kickoff (2026-11-25, PR #64 review)

- **R1:** `@ats/pipeline` lands at the END of Phase 5, as a Phase 5 exit item, owned by Dev 1, after the last writer re-point merges (KNOWN_STAGE_WRITERS already empty; the guard then only follows the files). The Phase 5 gate isn't passed until pipeline.server, stage-events and assessment-timeline live in `@ats/pipeline/server`. Matching moves in Phase 6 only after that. No package→app imports for pipeline cores.
- **R12:** pay-terms and pay-convert → `@ats/std/shared`, ONLY because they're pure (types, catalogues, conversion maths: no db, no org policy, no I/O). logistics goes there only if equally pure; if it contains business decisions (thresholds, policy), it stays in offers and matching gets the value through a port or as an input parameter. pay-context stays offers/server. The move PR must state which test proves each file's purity (no imports beyond std/zod).
- **Nudge split** (notifications.functions :498/:614/:687): ONE change PR before both moves, so neither move PR carries a split.
- **R7(c):** the domains.mjs dead desk rule for onboarding.catalogue is fixed in THIS PR (dead alternatives removed; onboarding.catalogue maps to onboarding).
- **Slot-offers ↔ voice cycle:** break it (the port/event per map §10) BEFORE the interviews move — agreed.
