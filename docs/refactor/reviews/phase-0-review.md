# Phase 0 review

- **Reviewed:** `ca7599c` (madhugraj/ATSAgent#80, merge of `chore/p0-fixes`, 4 commits on `39ce992`)
- **Reviewer:** Claude, in a separate checkout at `../ATSAgent_refactored-review` (detached at `ca7599c`)
- **Date:** 2026-11-23
- **Verdict:** **PASS.** Phase 1 can start. One fix (R1) must land before Phase 2 moves any file.

## Gate, re-run independently

The suite ran CI-style: no local `.env` files, the CI session secret, and a freshly migrated database.

| Check                            | Result                                                               |
| -------------------------------- | -------------------------------------------------------------------- |
| `bun install --frozen-lockfile`  | ok                                                                   |
| `bun run typecheck`              | clean                                                                |
| `bun run lint`                   | 0 errors                                                             |
| `bun run agents:lock`            | 23 agents, no diff                                                   |
| Migrations, fresh DB             | 96 applied                                                           |
| Full suite, one process per file | **89 files, 1,367 pass, 0 fail**                                     |
| `SOURCE_SHA`                     | `ca7599c997398773338fad6f79a374e517bce87e`, matches the merge commit |

Note: `integration.verify.test.ts` refuses to wipe a database unless its name contains test, ci, verify, tmp or scratch. My first database name didn't qualify. Re-run on `*_test`, it gave 21 pass.

## Claims verified

- **CI coverage:** nothing was lost. Every removed CI step was a `bun test` of a file the new loop runs. No step ran something other than a `*.test.ts` file. The `package.json` test script uses the same loop.
- **Per-file loop deviation:** justified. Bun's `mock.module` is process-global, so separate processes are needed.
- **Mock liveness:** all 23 files that use `mock.module` assert their mock actually ran. Most use an `afterAll` counter; `workflow-assistant` checks call counts instead.
- **Slots flake fix:** correct. `markUnsent` replaces the outbox row with one that isn't due yet, so the fire-and-forget drain can't claim it. The same test also targets its row by idempotency key, not an unordered select across the org.
- **Panel flake fix:** correct. It now orders by `interviews.id desc`.
- **Rate limits:** correct order and scope.
  - `confirm` gets 10 per minute on every method.
  - `session` and `me` get 60 per minute, keyed per IP and path.
  - OPTIONS is exempt, and CSRF still runs first.
  - Auth mutations keep their existing branch.
- **Generated docs:** `docs/er-diagram.md` is now in `.prettierignore`. I agree that `voice-scheduling-call-plan.md` is hand-written.

## Findings

### R1. Required before Phase 2: the stage-writer guard goes blind after file moves

`scripts/pipeline.test.ts:568-590` scans only `join(root, "src")`. `KNOWN_STAGE_WRITERS` also holds `src/...` paths.

Once Phase 2 moves code to `packages/*` or `apps/web`, two things break:

- Writers in moved files are never scanned, so the test passes with nothing checked.
- Listed writers that move become "unknown" only if they stay under `src/`.

This test is the Phase 5 safety net, so it has to keep working through the moves.

**Fix:**

- Scan `src`, `apps` and `packages`. Skip any root that doesn't exist.
- Assert that the scan found at least 300 `.ts`/`.tsx` files.
- Match known writers by a stable key, not a fixed path. For example, use the file basename, or a `// stage-writer: <reason>` marker that the test requires in each listed file.

### Advisory (no action needed to pass)

- **A1. CI stops at the first failing file.** The loop uses `|| exit 1`, so it hides any failures after the first. Better: collect the failures, print them all, then exit non-zero.
- **A2. `confirm` is now limited to 10 per minute per IP.** Staff behind one corporate NAT who click e-mail links at the same moment could get a 429. That's low risk at current volumes, but watch for 429s on `/api/auth/confirm` after deploy.
- **A3. The stage-writer regex is a heuristic.** `SET_STAGE` (`[^}]*?`) misses `.set({ meta: { … }, stage: … })`. It's acceptable as a tripwire. Phase 5 should prove there are no writers using query-level checks, not this regex.
- **A4. The product race is still open.** `processEmailOutbox` updates by bare id, so a lost update is possible. The test fix is correct, but the product race remains. The handoff records it. Track it as a bug fix; it's allowed under the freeze.
- **A5. Outside this phase:** the tracked `.env` holds Supabase project id, URL and publishable key. Those are public-by-design values, but confirm nothing secret is ever added there.

## Answers to the executor's questions

1. **Map updates.** The reviewer updates the map before Phase 1 freezes `domains.mjs`. Proposed rulings:
   - **`desk → voice` (5 dynamic imports):** don't list it as an allowed L4 edge. Voice exposes a small public API (`requestScreeningCall`, open-call status, call brief, settings read). Desk imports only that.
   - **`slot-offers → voice/scheduling-request`:** break the `interviews ↔ voice` cycle. Either voice listens for an interviews event, or interviews calls a port that voice registers (the same pattern as `AgentPort`).
   - **`copilot.functions → components/nav-config`:** move the `NAV_GROUPS` data into a pure shared module. The UI and the copilot both import it.
   - **`schema.ts → offer-check`:** apply the same json-types fix as the other four S7 cases.
   - **`hiring-sla.server`:** place it in desk (L4). It reads desk and lifecycle.
   - **Placement of new files:**
     - pay-*, labour-policy and offer-check → offers, as a `policy/` subfolder. No new package.
     - workflows, agent-intelligence, governance, reports and modality → agents.
     - copilot server → desk.
     - iso, appearance and report-window → shared utils.
     - call-reviews → voice.
     - hiring-oversight, demand-outlook and pool-coverage → analytics/desk, confirmed against their imports.
   - **The 23 new tables:** the executor proposes owners in `table-owners.mjs`, and the reviewer approves them before Phase 1's gate.
2. **One PR:** done (#80). `SOURCE_SHA` is set correctly.
3. **Prettier:** do one deliberate whole-repo format commit, as its own PR, before Phase 1 starts. Never mix it into move commits. Format churn inside a file move ruins `git log --follow` and review diffs. After it lands, consider making CI check formatting.
