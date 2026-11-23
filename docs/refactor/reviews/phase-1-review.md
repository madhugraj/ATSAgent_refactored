# Phase 1 review

- **Reviewed:** `ATSAgent_refactored` @ `61df2e8` (commits `c6aa095`, `61df2e8`), `SOURCE_SHA` `dcb6a4b`. Also reviewed: source PRs #81, #82, #83.
- **Reviewer:** Claude, in a fresh clone at `../ATSAgent_refactored-review`
- **Date:** 2026-11-23
- **Verdict:** **PASS, with 4 conditions (C1–C4) to fix before the first Phase 2 package PR.** None of them changes app behaviour.

## Gate 1, re-run independently

All checks ran on a fresh clone, with a freshly created `*_test` database and CI-style env.

| Check                                        | Result                                                |
| -------------------------------------------- | ----------------------------------------------------- |
| `bun install --frozen-lockfile`              | ok                                                    |
| `bunx turbo run typecheck build --force`     | green (vite + voice worker + parser worker)           |
| `bun run lint`                               | 0 errors, 271 warnings (same as the source)           |
| `prettier --check .`                         | **fails**, only on `.turbo/cache/*` (see C1)          |
| `migrate-pg.mjs` ×2                          | 96 applied, then "up to date"                         |
| `table-owners.mjs`                           | every table owned, 22 PROPOSED                        |
| depcruise (from `apps/web`)                  | 0 errors, 173 warnings, 692 modules                   |
| Full suite, one process per file             | **89 files, 1,367 pass, 0 fail**. Same as the source. |
| `agents:lock`                                | no diff                                               |
| `apps/web/src` vs source `src/` at `dcb6a4b` | **byte-identical** (`diff -rq`)                       |
| Forbidden files tracked                      | none                                                  |
| Boot / login check                           | not re-run by the reviewer; accepted from the handoff |

**Source PRs #81–#83:** merged, `main` = `dcb6a4b`.

- R1 (from the Phase 0 review) is closed by #82.
- The #83 diagnosis holds. `interviews.id` is a UUID, so ordering by id picks a random row, and the fix scores the exact row returned. This means the Phase 0 fix to the panel test (order by newest id) was wrong, and #83 replaces it correctly.

## Conditions (fix before Phase 2 starts)

**C1. Turbo cache is committed.**

- `.turbo/cache/*` (6 files, ~20 MB) is tracked, and `.turbo` is missing from `.gitignore` and `.prettierignore`.
- Every build dirties the tree and fails `prettier --check`.
- Fix: `git rm -r --cached .turbo`, then add `.turbo/` to both ignore files.

**C2. Files dropped by the copy without being recorded:**

- **`.env.example`:** the new `.gitignore` rule `.env.*` swallows it. Phase 0 (0.6) just completed this file. Add `!.env.example` and restore it.
- **`.github/dependabot.yml`:** restore it now. Security updates shouldn't lapse for 12+ weeks.
- **`.github/workflows/deploy.yml` and `deploy-gke.yml`:** acceptable to defer to Phase 8, but list them as deviation 7 in the handoff.
- **The tracked `.env` (public Supabase values for the Lovable build):** it is now excluded. That's fine unless anything still builds through Lovable. Confirm, and record the decision.
- Add a parity check to the sync procedure: every tracked source path exists in the new repo or appears on a written exclusion list.

**C3. depcruise doesn't run in CI.**

- The map says the dependency rules are "enforced in CI", but no CI step runs depcruise.
- Add a step (`cd apps/web && bunx depcruise --config ../../tools/depcruise.cjs src`) with a ratchet: fail if the warning count goes above 173.
- Each phase lowers that number. This is what makes the boundaries real between now and the move to `error` severity.

**C4. Gate wording and turbo tasks.**

- `apps/web/package.json` has no `test` or `test:db` scripts, so `turbo run test test:db` runs nothing. The "turbo test/test:db ✓" in the gate row checks nothing; the real tests run through the root loop.
- Either add `//#test` root tasks or drop the claim.
- Also, before tests move into packages, declare `DATABASE_URL` and `SESSION_SECRET` in `turbo.json` (`env` / `passThroughEnv`). Turbo 2's strict env mode otherwise hides them from package tasks.

## Advisory

**A1. The `agent-event-lineage` flake diagnosis isn't proven.**

- In autocommit, Postgres commits an `INSERT ... RETURNING` before the client's query resolves. The test's own `chained()` helper also reads the event row it just wrote, straight away on the same pool, and that read works.
- Polling until the expected value appears can hide a real bug, for example a fire-and-forget write, or data from another test in the same org.
- Ask for the actual cause, using the same probe-at-failure method as #83.
- Also land the fix in the source repo too. Otherwise the source stays flaky and the next sync conflicts.

**A2. Branch naming.**

- The handoff names a branch `phase-1-bootstrap`, but the repo has only `master`.
- From Phase 2, use one named branch per package PR set, and use `main` as the default branch.

## Answers to the executor's questions

**1. Table owners.** All 22 proposed owners are **approved**. I checked each table's write sites at `dcb6a4b`, and every one sits in the domain it's assigned to:

- **agents (9):** `platform-agent-studio` / `platform-agent-workflows` / `workflows.server` / `workflow-app.server`
- **interviews (3):** `panel-changes`, `interview-confirmations`, `scorecard-chase`
- **offers (9):** `pay-settings`, `pay-context`, `labour-policy`
- **voice (1):** `voice/guard/review.server` + `call-reviews.functions`

Move them from `PROPOSED` to `OWNERS`, and have the script fail if `PROPOSED` is not empty.

**2. The `std` package and the six deviations.** **Approved.** Deviation 2 (docs, infra and extension stay in `apps/web` until Phase 8) also covers the deploy workflows (see C2).

**3. Remote.** **Set up a private remote before Phase 2.**

- The new `ci.yml` has never run: it includes `bun audit`, gitleaks and the prettier check, and nobody has seen it pass on a runner.
- Do it this way:
  1. Create a private GitHub repo with branch protection on `main` (required CI checks, one approving review).
  2. Push, and get CI green there. That proves C1–C3.
  3. Then run Phase 2 as per-package PRs. Reviews use the PR diff and the local clone.
