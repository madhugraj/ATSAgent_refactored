# Reviews 2026-11-25: Phase 4 (Dev 1 half), the #20 sync ratchet, Phase 9a sign-off, the release plan, Phase 8 prep

Reviewer: Claude, fresh checkouts with their own `bun install` and their own test DBs.

## Phase 4, Dev 1 half: `@ats/desk-core` + `@ats/org` (#23, `refactor/p4-deskcore-org`): **APPROVE**

| Check                                                                                        | Result                                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| typecheck (turbo --force), lint (0 errors), prettier, owners, migrations, agents:lock, build | ✅                                                                             |
| depcruise                                                                                    | ✅ **89** warnings (max 114)                                                   |
| worker boot smoke (web, voice, parser without `node_modules`)                                | ✅                                                                             |
| Full suite, one process per file                                                             | ✅ 109 of 110 files, 1,469 pass. The one failing file is pre-existing; see A1. |
| `packages/org` imports nothing from agents                                                   | ✅ (grep is empty; `AgentPort` is the seam)                                    |
| No package uses the app-only `@db/` or `@/` aliases                                          | ✅                                                                             |

- **C1 (in this PR):** set `WARN_MAX` to **89**.
- **Deviations:** the effects-injection seam and the org/agents test split are approved as described in the handoff.
- **A1 (pre-existing from Phase 3; a follow-up PR):** `packages/ai/test/redteam-check.test.ts` fails 6 of 6 when run on its own ("No AI model key saved"), on `main` too. It only passes when turbo runs it in one process with the other ai tests, so it depends on another file's mock. Phase 0's rule is one process per file. Make it set up its own mock or key, and make the package test script run each file in its own process (as the root suite does).

## #20 sync (`sync/bca8574`, #87/#90): ratchet ruling

- **Rebase onto the post-#23 `main`.** Then set `WARN_MAX` to the **measured** count, at most **89 + the sync's own new edges** (the handoff says +7, which would be 96). The 114 + 7 = 121 in the PR description is based on an old count, so recompute it.
- The edges are approved as temporary freeze-exception edges (map §10), resolved in Phase 7.
- **CI failure on the current head:** it's prettier on `docs/refactor/phase-log.md` only. Run prettier on that file.

## Phase 9a (#7, merged): **SIGNED OFF**

- B1 and B2 are fixed. A1 is done, with deny-by-default (an empty allow-list denies everything) and `SERVICE_TOKEN_FEATURES` scoping the bootstrap token.
- **The service name in the ledger:** confirmed as deferred, but **not** to "the Phase 3 gateway move", which has now merged. Its new home is a small **Dev 1 change PR after the #20 sync**: an `ai_usage_events.metadata jsonb` column (migration 0095), with the internal route passing `{service}` through the gateway. It must land before 9b's first service goes live in shadow mode.

## Production catch-up plan (#8): **APPROVE (as a plan)**

- It now matches production: CloudNativePG `atsiq-db`, no previous backups, histories forked at 0022 (7 production-only migrations, 75 pending).
- **The backup has actually been done:**
  - `gs://atsiq/backups/atsiq-20261124.dump` (13.9 MB)
  - VolumeSnapshot `atsiq-db-pre-migrate-20261124`, using a region-pinned snapshot class (a good catch)
  - the restore was proven: 62 of 62 tables, 61 exact; `app_logs` is live and production-only
- Steps §4 reconciliation → §6 rehearsal → §7 `migrate` then `deploy` are in the right order, and the rollback is sound. `INTEGRATION_ALLOWED_HOSTS` is check 1 in §9.
- **Still needed before any execution:** the product owner approves the release and its timing; the §4 keep/map/drop decisions are recorded; §6 rehearsal is green. Nothing runs until then.
- **Bucket settings:** the reviewer couldn't check them (the gcloud login had expired). The product owner should confirm public access prevention, uniform access, versioning and a retention policy on `gs://atsiq`. The dump contains candidate personal data.

## Phase 8 prep: one `.output` layout (#16): **APPROVE the layout**

- The workers now build into `apps/web/.output/{voice,parser}-worker` beside the Nitro server. The Dockerfile copies `apps/web/.output`, so the image finally contains the web server. The GKE commands (`node .output/...`) are unchanged.
- The bare-directory boots of all three are accepted as proof for now.
- **Condition:** the first real image build (the `deploy.sh` builder pod, or staging) must prove all three boot **from the image** before that image goes to production. That step goes in #8 §7 as step 0b.
