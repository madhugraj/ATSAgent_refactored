# Inline server functions: `createServerFn` exports with no exported core (Dev 2, 2026-11-24)

Entry points whose logic lives **inline in the `*.functions.ts` handler** — no `*Core` to move into a
package `/server`. Compiled from the Phase 5/6 prep suites (source PR #96, base `1b30d2e0`); each row
was verified by the suite author reading the file. Consequence for Phases 5/6: **each extraction is its
own change PR** (split before the move), never inside a move PR (brief rule 1). Until a core exists,
the wrapper's behaviour is locked only at source level or not at all — the suites mark these untested.

## requisitions

`src/lib/requisitions.functions.ts` — inline: `deleteRequisition`, `setRequisitionIjpNotes`,
`syncRequisitionFromJd`, `addApplicationsToRequisition`, `saveJobCardOverrides`, `createDepartment`,
`addDepartment`, `applyInternally` (8). The other 10 exports delegate to cores the suite tests
(`createRequisitionCore`, `advanceRequisitionCore`, `sendBackRequisitionCore`, `saveRequisitionWeightsCore`, …).

## candidates

- `src/lib/collaboration.functions.ts` — **every export is a bare handler**, no core anywhere:
  `poolTeam`, `setCandidateOwner`, `referCandidate`, `respondReferral`, `addCandidateNote`,
  `createTalentRequest`, `suggestToRequest`, `closeTalentRequest`, `listPoolShares`,
  `offerPoolShare`, `respondPoolShare` (11). The referral insert with `stage: "sourced"` is locked
  by `pipeline.test.ts`'s known-writers guard only.
- `src/lib/collect.functions.ts` — `collectApplicants` composes local-inbox/linkedin/autoscore
  modules inline (no core).
- `src/lib/queries.functions.ts` — read handlers carry their `eq(orgId)` predicates inline
  (enforced via `sharedFrom`, which is tested); extraction target: the `queries` core in
  `@ats/candidates` (map §4 L3).
- `src/lib/resume.functions.ts` — `getResumeDownloadUrl`'s vault-path prefix check (`<orgId>/…`) is
  handler-only.

## distribution

`src/lib/boards.functions.ts` — `boardWebhookSetup` / `boardWebhookUrl` token rotation is inline (2).
The other 19 fns across `distribution.functions.ts` / `boards.functions.ts` delegate to covered cores
(`publishToBoardImpl`, `closeBoardPostingImpl`, `rotateFeedToken`, …).

## matching

- `screening-queue.functions.ts` — `bucketCounts` (createServerOnlyFn) is an inline CTE aggregate;
  left untested (full triage fixture for little isolation value).
- `importJd` / `parseResume` / `runAiScreening` are thin `aiJson` wrappers — candidates for trivial
  cores at move time.

## offers

`src/lib/offers.functions.ts` — `deleteOfferLetter` has no separate core; `createOffer` /
`advanceOffer` / `sendBackOffer` delegate to locked cores.

## onboarding

`src/lib/onboarding.functions.ts` — `deleteOnboardingDoc` is inline (1); the other exports delegate
to covered cores (`storeOnboardingDocument`, `readinessFor`, `extractDocument`, …).

## Notes for Phase 5/6

1. Total: **~26 inline entry points**, concentrated in `collaboration.functions.ts` and
   `requisitions.functions.ts`. The collaboration file moves to `@ats/candidates` with handler logic
   intact unless cores are extracted first — decide per function; referrals/notes have real business
   rules worth cores, list/read fns arguably don't.
2. Real-AI happy paths remain locked at the vendor-neutral refusal everywhere (BYO-key); they are
   covered by evals, not suites.
3. Mutation-result caveat (reviewer, verified on #96): a mutation on a _second_ org-scoped read
   proves nothing — e.g. `offers.functions.ts:263` (release-gate read) is redundant behind the
   org-scoped load at `:217`; no test can observe removing it. Keep such defence-in-depth checks;
   don't treat "mutation survives" there as a coverage gap.
