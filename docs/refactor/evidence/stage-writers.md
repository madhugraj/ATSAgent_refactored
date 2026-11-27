# Stage writers: one plan per KNOWN_STAGE_WRITERS entry (Dev 2, 2026-11-24)

For each of the 9 files in `KNOWN_STAGE_WRITERS` (`scripts/pipeline.test.ts`, source `3d55eb1`):
what it writes, which pipeline core replaces the write, and the risk. Cores live in
`src/lib/pipeline.server.ts` (`moveStageCore`, `recordOfferStageCore`, `addApplicationsCore`) and
`src/lib/stage-events.server.ts` (`recordStageTransition(s)`). Every "precise small extension" is a
**separate change PR** — move PRs stay pure (brief rule 1). When a writer is repointed, remove its
`KNOWN_STAGE_WRITERS` entry **in the same PR** or the "found exactly once" assertion fails CI.

## Baseline (these ARE the pipeline)

1. **`pipeline.server.ts`** — writes: `moveStageCore` `.set({stage, stageReason, stageNote, lastActivityAt})` (org predicate, canMove, reason-required, screening-call guard, HR assertRole, then journal); `recordOfferStageCore` `.set({stage: offer_pending|released|accepted})` (deliberate canMove bypass, cause `offer`); `addApplicationsCore` inserts without stage (DB default `applied`). Replaces: none — this is the pipeline; endgame needs the offer bypass kept and the `applied` DB default owned by `@ats/pipeline`. Risk: error-string copy is asserted by callers/tests; no `source`/`cause` pass-through yet.
2. **`stage-events.server.ts`** — writes: no `applications.stage` rows (brief-listed for the `stage_events` trail); journals transitions, screening-prep jobs on shortlist, outbox emails (AI rule: `source:"ai"` emails only on shortlisted; `interview_scheduled` silent), agent events, outcome capture, stale-request cleanup. Replaces: none — this is the journal/side-effect choke point. Risk: column write happens in the caller before the journal (non-transactional); funnelling more writers here multiplies that exposure.

## Writers to repoint

3. **`autoscore.server.ts`** — writes: `scoreUnscored` `.set({stage: ai_screened|shortlisted})` for `applied`/`sourced` apps (held vs select gates), journalled with actor/source `ai`. Replaces: `moveStageCore` + a small AI/system-principal + `source:"ai"` pass-through (verified both transitions are canMove-legal). Risk: core re-reads the row fresh → recruiter race becomes a clean no-op instead of a stale overwrite (behaviour improvement, but a change); stageReason/stageNote now populated; five dynamic callers' mock surface shifts; the AI path must never hit `assertRole`.
4. **`matching.functions.ts`** — writes: `persistMatchResult` promotes `applied` → `shortlisted` on server-recomputed `select` + `autoShortlist`, journalled actor/source `ai`, **after** the match_scores insert (ordering load-bearing). Replaces: `moveStageCore` with the same AI-principal/`source` extension; keep the `stage === "applied"` guard and post-score ordering in the caller. Risk: without `source` pass-through, outcome capture records `by: "human"` — corrupts the training reward signal; actor string changes from `ai` to member-email; caller's own journal call must be deleted in the same change or stage_events duplicates.
5. **`interviews.functions.ts`** — writes: three — scorecard progression to the plan target (HR-controlled → already assertRole), scheduling parking apps on `l{n}` with `cause: "interview_scheduled"` (suppresses stage email + advanced agent event — the cause is load-bearing), and AI-interview completion to `ai_screened`; plus a journal-only reschedule row. Replaces: `moveStageCore` for all three, which needs an optional `cause` parameter (separate change PR) so l-stage scheduling stays email/agent-event-silent. Risk: without `cause`, every booking fires the candidate stage email + advanced event (duplicated invite, agents kicked on a non-decision); the core's screening-skip note guard is NEW on the scorecard path and can start blocking round progression; external/private-link pre-checks must stay ahead of the core or link submitters get an opaque role error; ~11 test scripts touch this file.
6. **`offer-response.server.ts`** — writes: `respondToOffer` (anonymous candidate via `/offer/<token>`) sets `offer_accepted`/`offer_declined` (decline reason → stageReason) after the conditional offer-status claim wins; journals actor `candidate`; `ask_changes` writes no stage. Replaces: `recordOfferStageCore` + small extension: add `offer_declined` to its stage union, an actor-less candidate variant carrying **orgId from the offer row**, and an optional reason (else the decline reason vanishes from `applications.stageReason`). Risk: keep the core call strictly after the once-only claim or double-clicks both reach the stage write; journal must not duplicate; no email change (offer stages have no copy) but both are OUTCOME_STAGES — confirm no double captureFeedback.
7. **`lifecycle.functions.ts`** — writes: `moveStage` already delegates to `moveStageCore` (clean); `moveStages` (bulk, ≤200 ids) does one bulk `.set({stage, …})` on the canMove-passing ids + **one batched** `recordStageTransitions` for the whole move; skipped/blocked rows counted, not thrown; `assertStepUp` on bulk reject. Replaces: a new **`moveStagesCore`** bulk twin (separate change PR) doing the same single bulk `.set()` + single batched journal; step-up stays in the server-fn. Risk: looping plain `moveStageCore` would abort the batch on the first blocked row (the `{moved, blocked}` partial-success shape the UI relies on), turn 1 email/prep enqueue into N, and change `stage_events.actor` strings; leftover direct journal call → duplicate stage_events (outbox dedupe would NOT catch it).
8. **`collaboration.functions.ts`** — writes: `respondReferral` accept branch inserts the application at `stage: "sourced"` (`internal_referral`) when the referral named a requisition; pre-check for an existing application is **unscoped**; requisition not re-verified in-org at accept time; no journal, no email. Replaces: `addApplicationsCore` (its existence skip is org-scoped — safer), only the insert; ownership transfer stays. Risk: the core throws on dangling/cross-tenant requisitions where today the referral still accepts silently — decide catch-and-log vs fail (today has no transaction, so a throw after the status flip leaves a half-applied hand-off); `assertReusable` now applies at accept time (changes outcomes for pending role_only referrals); callers must read `{added, skipped}` or duplicates go invisible.

   **Decision (Dev 2, 2026-11-25; Dev 1 agreed; reviewer-directed recording):** re-point with
   **catch-and-log** for failures after the flip, plus a **pre-flip reusability assertion**. The
   org-scoped skip + in-org requisition re-verification come from the core. A dangling/cross-tenant
   requisitionId would make the core throw AFTER the referral status flip + ownership transfer (no
   transaction wraps the branch) — a half-applied hand-off is worse than skipping the attach, so the
   core call is wrapped (log `collaboration.referral_attach_failed`, referral still accepted,
   response unchanged). But the common guard failure — a role_only portal CV referred into another
   role — is asserted BEFORE the flip via `assertReusable` (same as the sibling accept path), so
   nothing is written and the UI shows the terms message; the referral stays pending.
   **Invariant gap (reviewer, 2026-11-24):** the unscoped existence check violates the AGENTS.md rule that every query carries an `orgId` predicate. Not exploitable today (the ids come from a referral org-checked at creation, and only the recipient can answer), but Phase 5's `addApplicationsCore` repoint closes it — **Phase 5 acceptance criteria: the referral-accept existence check is org-scoped, with a test that a second org's application for the same (candidateId, requisitionId) pair does not suppress the insert.**

9. **`candidates.functions.ts`** — writes: `attachApplication` inserts without stage (DB default `applied`); `createCandidate` inserts at `stage: "sourced"` when a requisitionId is supplied, non-fatally inside try/catch. Note today's inconsistency: attach lands at `applied`, create at `sourced`; neither journals. Replaces: `addApplicationsCore` for both. Risk: **the subtle one** — the core's `assertReusable` would reject attaching a fresh `role_only` portal CV to its own originating requisition (today's flow depends on skipping that check), so the core needs a `skipReusable` option or the write stays; duplicate attaches change from a raw unique-index error to a silent `{added: 0}`; if the core never sets a stage, `createCandidate`'s entries silently drift `sourced` → `applied` — needs an `entryStage` option if `sourced` is intended.

10. **`candidates.functions.ts`** — writes: `attachApplication` inserts without stage (DB default `applied`); `createCandidate` inserts at `stage: "sourced"` when a requisitionId is supplied, non-fatally inside try/catch. Note today's inconsistency: attach lands at `applied`, create at `sourced`; neither journals. Replaces: `addApplicationsCore` for both. Risk: **the subtle one** — the core's `assertReusable` would reject attaching a fresh `role_only` portal CV to its own originating requisition (today's flow depends on skipping that check), so the core needs a `skipReusable` option or the write stays; duplicate attaches change from a raw unique-index error to a silent `{added: 0}`; if the core never sets a stage, `createCandidate`'s entries silently drift `sourced` → `applied` — needs an `entryStage` option if `sourced` is intended.

    **Onboarding portal-CV attach (Dev 2, 2026-11-26; needs Dev 1 ratification):** the ingest attach
    (`packages/candidates/src/server/intake.server.ts`, the `tx.insert(applications)` inside
    `ingestCandidateInner`) is **structurally blocked** from re-pointing to `addApplicationsCore`: the
    attach runs inside the ingest transaction where the candidate row is inserted and not yet
    committed, and the core queries `candidates` through the non-tx `db`, so its existence/org check
    cannot see the fresh row — a mid-tx call would throw "not in this organisation's talent pool" on
    the main path, and a post-commit call (option B) would break today's atomicity, where an attach
    failure rolls the candidate back too (a committed role_only candidate against no role is a
    retention liability, not a harmless half-write). So the ruling was implemented as the assertion
    only: the attach now refuses to file a `role_only` CV against a requisition that is not
    provably its originating role — fresh records pass by construction (created by the same call,
    `poolUseSource` === this arrival's source); existing records pass only when the SAME limiting
    portal handed the CV over again (an existing record's originating role is recorded nowhere —
    `pool_use_source` names the portal, not the role). The same-portal case is the legitimate
    re-apply flow the retention rule already contemplates ("back in an open role"). **Behaviour
    tightened** in one narrow case: an existing `role_only` candidate's CV arriving through a
    DIFFERENT channel (careers inbox, browser capture, manual upload) for a NEW role used to attach
    silently; it is now refused with the assertReusable-style terms message and nothing is written.
    If a tx-aware core variant (`addApplicationsCore` taking a tx / accepting the caller's
    candidate proof) is ever built, this assertion is exactly what its `skipReusable` gate must
    encode — the proof lives in one place, at the attach.

## Phase 5 order suggestion (feeds Dev 1)

Hardest extensions first, so cores stabilise before the wave of pure repoints: (1) `cause` param on
`moveStageCore` (interviews), (2) AI-principal/`source` (autoscore, matching), (3) `moveStagesCore`
(lifecycle bulk), (4) `recordOfferStageCore` extension (offer-response), (5) `addApplicationsCore`
options (`skipReusable`, `entryStage`, org-scoped skip) — then collaboration/candidates repoints, and
the `KNOWN_STAGE_WRITERS` entries removed in the same PRs.
