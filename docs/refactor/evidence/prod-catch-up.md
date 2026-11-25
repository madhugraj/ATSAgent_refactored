# Production catch-up release plan (PLAN ONLY — not executed)

**Status:** plan. The product owner approves the release and its timing; nothing here has been run.
**Written:** 2026-11-24, Dev 3. Revised same day after the product owner's read-only production check
(CloudNativePG database, real migration state, backupless instance). Sources: the source repo
(`/Users/yavar/Documents/CoE/ATSAgent` @ origin/main `3d55eb1`), `scripts/deploy.sh`, `DEPLOYMENT-GCP.md`,
`DEPLOY-QUICK.md`, `infra/`, `gh pr list` against `madhugraj/ATSAgent`, and the live check. Items still
marked **[VERIFY LIVE]** need cluster access on the day.

---

## 1. What production runs

|                            |                                                                                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project / cluster / region | `yavar-studio` / `yavar-studio-cluster` / `asia-south1`                                                                                                                                                                     |
| Namespace                  | `atsiq` (live site: `z-atsiq.yavar.ai`, external GCLB ingress + managed cert)                                                                                                                                               |
| Web                        | `deployment/atsiq` — image `asia-south1-docker.pkg.dev/yavar-studio/yavar-platform/atsiq:17f59fa`, port 3000, ~2 replicas [VERIFY LIVE]                                                                                     |
| Voice                      | `deployment/atsiq-voice-worker` — same image, `node /app/.output/voice-worker/index.mjs`, 1 replica, Recreate, 1900s grace [VERIFY LIVE]                                                                                    |
| Parser                     | documented (`node .output/parser-worker/index.mjs`, deny-all egress, `PARSER_TOKEN`) — manifest not in repo [VERIFY LIVE]                                                                                                   |
| **Database**               | **CloudNativePG in-cluster** (confirmed live): namespace `atsiq`, instance `atsiq-db`, **PostgreSQL 16.4**, single instance, 10Gi `standard-rwo` PVC (`pvc-ccf4fc30-…`), ~191 MB. **No backup settings, no backups exist.** |
| In-cluster CronJobs        | `atsiq-board-sync`, `atsiq-sync-hrms` (15 min) [VERIFY LIVE]                                                                                                                                                                |
| Secrets                    | `atsiq-env` (DATABASE_URL, SESSION_SECRET, SECRET_ENCRYPTION_KEY, PUBLIC_SITE_URL, CRON_SECRET, TRUSTED_PROXY_COUNT=1, RATE_LIMIT_STORE=postgres, …), `atsiq-voice` (SIP_*), `atsiq-parser` (PARSER_TOKEN)                  |
| Cloud Scheduler            | Bearer `CRON_SECRET` → `/api/public/…` (process-email-outbox */5, inbox-sync, sync-hrms */15, board-sync */15, sync-candidates hourly) [VERIFY LIVE: `gcloud scheduler jobs list --location asia-south1`]                   |
| Monitoring                 | `/metrics` behind `METRICS_TOKEN`; `scheduler-stalled` alert policy fires if the agent tick stops                                                                                                                           |

**Provenance warning:** commit `17f59fa` does **not exist** in the repo — `git cat-file` fails locally and
GitHub returns "No commit found for SHA". It was likely built from an unpushed working tree on ~2026-10-27.
Treat the production **code** baseline as "main as of ≈ 2026-10-27". The **database** is older still: its
last migration was applied **2026-10-07**, and its migration history has **diverged from the repo's** (§3).
The registry holds every old image tag, so the image rollback target survives regardless.

## 2. Everything that has merged since then

Origin/main moved **417 commits** between 2026-10-26 and 2026-11-24 (HEAD `3d55eb1`, PR #89). 46 PRs:

- **2026-10-27 (8)** — #28 zod4+DOMPurify audit unblock, #26 voice screening M0, #27 voice screening stage 1
  (100+ files), #30 org agreements, #31 app observability (metrics/SLO/alerts), #25 Capture hand posting,
  #24 candidate requests, #32 org context agent O0.
- **2026-10-29 (1)** — #33 org context agent O1+O2 (50 files).
- **2026-11-01 (9)** — #38/#39/#40 guardrails P0–P2 (128 files total: injection guardrails, hidden text,
  spend caps, two-person rule, parser sandbox, rate limits, step-up, supply chain), #37 silent panel agents
  L1–L3 (68 files), #36 agent register index, #35 negotiator voice N0–N4 (48 files), #34 parallel desk +
  org context 1.1.0 + role expert (50 files), #29 stale-agent-task fix, #52 dependabot group.
- **2026-11-02 (3)** — #53 dependabot (180 dep updates), #55 tanstack import protection, #54 agent-handoff tests.
- **2026-11-21 (7)** — #56 panel directory, #61 panel view (interviewer role), #62 scorecard rubric,
  #70 panel brief, #66 voice-first scheduling, #71 panel changes, #72 pre-commit lint.
- **2026-11-23 (16)** — #76 offer stage events, #75 email branding (33 files), #67 UI dedup, #77 rubric docs,
  #65 agent review loop fix, #64 cost/tokens per candidate, #73 nav hubs, #74 alert digest, #68 appearance,
  #69 workflow chat (100+ files), #78 agent intelligence + workflows (100+ files), #80 p0 fixes, #81
  whole-repo prettier format, #83 panel-book race fix, #82 stage guard fix, #85/#86 harness window fixes.
- **2026-11-24 (1)** — #89 voice worker boots from the image without node_modules (newest main; the fix the
  prod worker needs if it is rolled).

**Plus 19 commits pushed straight to main with no PR** (2026-11-02 → 2026-11-05) — easy to miss in a
PR-only changelog, and they include the **2026-11 audit hardening** `69339ff8` (auth limiter, CSRF guard,
SSRF pin, input bounds), voice fixes (playout buffer, server-side VAD, cue timing, prompted answers), audit
N-3 transcription routing, capture distribution token (N-15), and the matching hard-gates/evals batch
(`632a81d9`, `3e7c89ee`, `0d631704`, `3e80417d`, `15c27a6b`, `4708c7c2`, `9510168f`, `f96da86f`).

## 3. Migration state: the histories have diverged

The runner (`scripts/migrate-pg.mjs`) tracks applied files **by exact filename** in `pg_migrations`, applies
in lexicographic order, stops hard on the first failure, and is **not transactional per file** (a
half-applied file leaves partial DDL with no ledger row; re-runs depend on the file being idempotent — most
are, see flags below).

**Confirmed live:** production's last migration ran **2026-10-07**, and production applied **7 migrations
that do not exist in the repo** — the histories forked. The last common point is **0022**:

- Production-only (keep / map / drop — see §4): `0014_candidate_gender`, `0023_observability`,
  `0024_trace_steps`, `0025_platform_settings`, `0026_email_reply_routing`, `0027_inbox_star_read`,
  `0028_inbox_owner_scope`.
- Pending (everything in the repo after the fork): **75 files, `0023`–`0093`**. The authoritative list is
  still read from the DB on the day:
  ```bash
  comm -23 <(ls drizzle/pg-migrations/*.sql | xargs -n1 basename | sort) \
           <(psql "$DATABASE_URL" -Atc "select name from pg_migrations" | sort)
  ```

**Flags in the pending set (the runner stops at the first failure):**

1. `0058_active_run_unique` **fails if dirty data exists** — partial unique index on active live runs. Prod
   ran the racy pre-fix code for ~7 weeks, so pre-check and cancel duplicates first:
   `select org_id, agent_type, subject_id, count(*) from agent_runs where subject_type='requisition' and status in ('queued','running','awaiting_human') and mode='live' group by 1,2,3 having count(*)>1;`
2. `0070_panel_directory` is a **real data migration** (inserts panelists from org members, rewrites
   role_panels/round_substitutes ids) — the §6 rehearsal covers exactly this.
3. `0073_pay_terms` + `0075_offer_pay_terms`: add-not-null-default + backfill UPDATE + constraint swaps —
   brief ACCESS EXCLUSIVE locks on requisitions/offers while the app is live. Acceptable, but schedule the
   migrate for a quiet minute.
4. `0069_slot_offer_call_first`: bounded backfill UPDATE + partial index — fine.
5. No pending migration drops data; the only DROPs are `drop constraint if exists` swaps.

## 4. Reconciliation (before any migrate)

Production-only objects must be reconciled against the repo's schema before 75 pending migrations run over
them — a repo migration may `create table if not exists` an object production already has under a different
shape, or alter a column production never got.

1. Dump production's schema only:
   `kubectl -n atsiq exec <atsiq-db-pod> -- pg_dump -U postgres --schema-only atsiq > prod-schema.sql`
   (writes to the operator's machine, not the cluster).
2. Create a scratch DB (locally or a second CNPG instance in-cluster), run `scripts/migrate-pg.mjs` against
   a checkout at the **last common point (0022)** — i.e. the repo tree as of 2026-10-07.
3. Diff: `pg_dump --schema-only` of the scratch DB vs `prod-schema.sql` (`diff` or `migra`-style tooling).
4. For **each production-only object** (tables/columns/indexes/constraints from the 7 forked migrations,
   plus anything else the diff shows): decide and record one of
   - **keep** — production data depends on it; a later repo migration must adopt/extend it (or it lives
     outside the repo's model deliberately, e.g. `0023_observability`'s tables vs the repo's
     `0053_service_slo`/`rate_limit_hits`);
   - **map** — it is the same object under another name/history (e.g. `0025_platform_settings` vs the
     platform tables the repo created in its own 0023–0053 window); align the repo migration or write a
     small reconciliation migration;
   - **drop** — dead (created then abandoned); do it via an explicit, reviewed `reconcile-*.sql`, not
     silently.
5. Record the decision table in this file (or a `reconcile-decisions.md` beside it) **before** §7 runs.
   Expected effort is small: the 191 MB DB has a handful of drifted objects.
6. **First concrete finding (2026-11-24, from the restore proof):** production has an `app_logs` table
   (~425k rows, still being written by the running image) that exists **nowhere in the repo** — likely the
   old pre-fork observability path (`0023_observability`), superseded by the repo's metrics/SLI approach
   (PR #31). Candidate decision: keep it (historical logs) and let the repo's migrations ignore it, or
   export-then-drop via a reviewed `reconcile-*.sql`. Decide in step 4 above with the rest.

## 5. Backup steps for atsiq-db

There is **no backup settings and no backups today** (confirmed live). Nothing in §7 runs until steps A and
B have succeeded once and a restore has been tested.

**Status 2026-11-24: A, B and the restore proof are done and verified** (the exact commands below were
executed today, read-only against production). The bucket is **`gs://atsiq`** (project `atsiq-508808`,
provided by the product owner — the operator account cannot create or list buckets); the verified dump is
at `gs://atsiq/backups/atsiq-20261124.dump`. Per-release backups repeat A (dump + copy) and B (snapshot).

**A. pg_dump, stored off-cluster (the primary, portable backup) — exact commands, executed 2026-11-24:**

```bash
# 1. dump (read-only): streams pg_dump -Fc from the CNPG postgres container
D=/tmp/atsiq-backup-20261124 && mkdir -p $D
kubectl -n atsiq exec atsiq-db-1 -c postgres -- \
  pg_dump -U postgres -Fc --no-owner --no-privileges atsiq \
  > $D/atsiq-20261124.dump          # 13 MB compressed (DB 191 MB), exit 0

# 2. upload off-cluster — bucket gs://atsiq (project atsiq-508808, product-owner-provided;
#    the operator account has object-level access only, no buckets.create/list)
gcloud storage cp $D/atsiq-20261124.dump gs://atsiq/backups/atsiq-20261124.dump
gcloud storage ls -l gs://atsiq/backups/   # verify: 1 object, 13899783 bytes
```

**B. Disk snapshot of the data PVC — done 2026-11-24 (`readyToUse=true`, restoreSize 10Gi):**

The stock `pd-snapshot-class` **fails** in this project: the PD CSI driver defaults to the multi-region
`ASIA` location, which the org policy `constraints/gcp.resourceLocations` rejects (412). A region-pinned
class is required — created once, cluster-scoped, then snapshots from it:

```bash
# 1. one-time: a snapshot class pinned to the allowed location
kubectl apply -f - <<'EOF'
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshotClass
metadata: { name: pd-snapshot-class-asia-south1 }
driver: pd.csi.storage.gke.io
deletionPolicy: Retain
parameters: { storage-locations: asia-south1 }
EOF

# 2. per backup: snapshot the PVC (read-only w.r.t. the database; the PVC name
#    is the volume behind pod atsiq-db-1: pvc-ccf4fc30-2aea-4f89-8cdb-529e6049ea70)
kubectl -n atsiq apply -f - <<'EOF'
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata: { name: atsiq-db-pre-migrate-20261124, namespace: atsiq, labels: { purpose: pre-migrate-backup } }
spec:
  volumeSnapshotClassName: pd-snapshot-class-asia-south1
  source: { persistentVolumeClaimName: atsiq-db-1 }
EOF
kubectl -n atsiq wait --for=jsonpath='{.status.readyToUse}'=true \
  volumesnapshot/atsiq-db-pre-migrate-20261124 --timeout=300s
```

Keep the snapshot until the catch-up release has been stable for a week. A snapshot alone is not the backup
of record — it is tied to the cluster and zone; the off-cluster dump in A is what survives the cluster.

**Restore proof (executed 2026-11-24, passed):** the dump restores cleanly and matches production. The
local pg_restore is PostgreSQL 14, which cannot read PG16's format-1.15 archives — install
`postgresql@16` (Homebrew) and use its client against a scratch PG16 cluster (same major as production):

```bash
P16=/opt/homebrew/opt/postgresql@16/bin
$P16/initdb -D /tmp/atsiq-backup-20261124/scratch-pg16 --auth=trust -U postgres
$P16/pg_ctl -D /tmp/atsiq-backup-20261124/scratch-pg16 -o "-p 54398 -c listen_addresses=127.0.0.1" start
$P16/createdb -h 127.0.0.1 -p 54398 -U postgres atsiq_restore_check
$P16/pg_restore -h 127.0.0.1 -p 54398 -U postgres -d atsiq_restore_check \
  --no-owner --no-privileges -j 4 /tmp/atsiq-backup-20261124/atsiq-20261124.dump   # exit 0, no errors

# compare: table count + rows per table, production vs restore
Q="select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c \
  from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int as rows \
  from information_schema.tables where table_schema='public' and table_type='BASE TABLE' \
  order by table_name"
kubectl -n atsiq exec atsiq-db-1 -c postgres -- psql -U postgres -d atsiq -Atc "$Q" > counts-prod.txt
$P16/psql -h 127.0.0.1 -p 54398 -U postgres -d atsiq_restore_check -Atc "$Q" > counts-restored.txt
diff counts-prod.txt counts-restored.txt
```

**Result:** 62 tables on both sides; **61 of 62 row-for-row identical** (427k rows total). The one
exception is `app_logs` — restored 425,896 rows vs live 425,780 at compare time, i.e. the restore is
_ahead_ of live production: `app_logs` is a live, production-only table (see §4) whose rows changed
between the 12:03 dump and the compare, not a restore defect. Everything else matched exactly.

**C. Later (post-release, real backup posture):** move CNPG to proper backups —
`barmanObjectStore` targeting a GCS bucket (full + WAL archiving), a `ScheduledBackup` (daily base backup),
and a second instance (replica) so recovery is not host-bound. This is a CNPG `Cluster` spec change
(`backup:` section + `instances: 2`), applied as a normal CNPG rolling update. Until C lands, A + B are the
posture, run by hand per release.

Also, unchanged from before: `SECRET_ENCRYPTION_KEY` must stay safely backed up — losing it makes every stored credential (OAuth tokens, AI keys) unreadable.

**Erasure-vs-retention note (2026-11-25, product owner approved):** `gs://atsiq` now has
`versioning_enabled: true` and a 30-day **unlocked** retention policy (applied 2026-11-25; private
access unchanged — `public_access_prevention: enforced`). Unlocked is deliberate: candidate erasure
requests (the AGENTS.md erasure cascade) must be able to delete objects inside the retention window,
so the policy stays removable per request; do not `--lock` it without a product decision. Versioned
delete leaves noncurrent versions — a periodic cleanup of noncurrent copies is part of Dev 3's §5C
backup-posture work, with erasure requests sweeping noncurrent versions of the erased objects too. — losing it makes every
stored credential (OAuth tokens, AI keys) unreadable.

## 6. Rehearsal (required before §7)

The database is 191 MB, so a **full dump-and-restore rehearsal is quick** — and it is mandatory, because
the pending set contains a real data migration (`0070_panel_directory`) and the histories forked (§4):

1. Restore the §5A dump into a scratch database (local or a second in-cluster CNPG instance):
   `pg_restore -d <scratch-url> --no-owner atsiq-pre-migrate-*.dump`
2. Reconcile per §4 decisions (the restore contains the production-only objects).
3. Run `scripts/migrate-pg.mjs` against the scratch DB **at the target SHA's tree** — the exact command §7
   will run, over the exact data §7 will run it against.
4. Fix whatever fails (cancel duplicate active runs for `0058`, adjust reconciliations), then re-run until
   it applies clean. Record the result in this file.
5. Boot the target image against the rehearsed DB once (dev-only) and smoke: `/` renders, agent tick
   advances, outbox drains.

## 7. Deploy order: `deploy.sh migrate` **then** `deploy.sh`

The two modes are mutually exclusive invocations of `scripts/deploy.sh` — deploy never migrates, migrate
never rolls out, and nothing in the script enforces the order. Migrations are backward-compatible by policy
(old code runs on the new schema; the reverse is not guaranteed), and four weeks of new code will be rolled,
so the documented order (DEPLOYMENT-GCP.md: "One DB migration Job per release **must complete before rolling
the Deployment**") is the right one:

```bash
# 0. product owner approval recorded; §4 reconciliation decisions recorded; §5 backups taken and verified; §6 rehearsal green
# 0b. IMAGE BOOT PROOF (review, layout-approved PR #16): before the image may
#     reach production, prove from the image itself that all three entries
#     boot — not just that the bundles boot. Pull the just-pushed image and:
#       docker run --rm "$IMAGE" node .output/server/index.mjs &     # → GET / 200
#       docker run --rm --entrypoint node "$IMAGE" \
#         .output/voice-worker/index.mjs                             # → voice_worker.started
#       docker run --rm --entrypoint node "$IMAGE" \
#         .output/parser-worker/index.mjs                            # → parser worker listening
#     (dummy env per §6-style throwaway values; run on any machine with
#     Docker, e.g. the deploy operator's — not necessarily this laptop).
#     No 200/started/listen line from any entry → stop, do not roll out.
# 1. migrations (runs the TARGET SHA's tree, reads DATABASE_URL from secret atsiq-env)
scripts/deploy.sh migrate <target-sha>
# 2. rollout (web; voice worker rolled with the same image, waits out in-progress calls ≤ 2400s)
scripts/deploy.sh <target-sha>
# 3. smoke (the script does this): GET / must be 200 + board-webhook guard probe
# 4. verify the in-cluster CronJobs completed post-deploy (DEPLOY-QUICK checklist)
```

Notes: `deploy.sh migrate` runs from the target commit's tree (it `git archive`s the SHA), so the pending
list must be computed at that SHA. **Docs contradiction to resolve later:** DEPLOY-QUICK.md says to migrate
_after_ deploying; that works only because migrations are additive, and it is the wrong default for a
seven-week catch-up — this plan follows DEPLOYMENT-GCP.md. deploy.sh's header says "kaniko" but the push
actually uses `scripts/crane-stage.sh` (stale comment, harmless). The DATABASE_URL the app uses points at
the in-cluster CNPG instance, so the migrate runs inside the cluster (that is what the builder pod does).

## 8. Rollback plan

- **Automatic:** deploy.sh records `PREV` (the running image) before every rollout; on `rollout status`
  failure it re-sets `atsiq=$PREV`, waits, and exits non-zero. Watch for its `previous image (rollback if
needed)` line.
- **Manual, app only** (first tool after a bad release):
  `kubectl -n atsiq set image deploy/atsiq atsiq=asia-south1-docker.pkg.dev/yavar-studio/yavar-platform/atsiq:<prev-sha>`
  then `kubectl -n atsiq rollout status deploy/atsiq`; same for `deploy/atsiq-voice-worker` (or
  `kubectl -n atsiq rollout undo deploy/atsiq`). k8s keeps revision history; Artifact Registry keeps every
  image tag. [VERIFY LIVE: confirm revision history exists on the day.]
- **Database: never rolled back.** Migrations are forward-only and written backward-compatible (repo
  doctrine) — an image rollback runs fine on the migrated schema. If a migration _fails mid-run_: the runner
  stops before the next file; fix forward (most files are `create … if not exists` / guarded constraints).
  Restoring the database itself is the last resort, with the product owner's explicit call, and comes from
  §5: `pg_restore` the off-cluster dump into a new PVC/instance (or roll the PVC back to the §5B snapshot
  and re-attach), then point the app's DATABASE_URL at it. It loses the interim write window — say so
  before doing it.
- **Voice worker:** Recreate + 1900s grace — an in-progress call finishes (≤ 30 min) before the pod swaps;
  don't force-delete pods mid-call.
- **Cron/secret rotation:** if `CRON_SECRET` rotates in the same window, use the documented
  `CRON_SECRET_PREVIOUS` pattern (set old value, deploy, update Scheduler jobs, remove) — never a hard
  cutover, or the agent tick stops and the `scheduler-stalled` alert fires.
- **Post-rollback checks:** smoke GET `/` = 200, agent tick advancing (agent_events), outbox draining,
  voice heartbeat, `/metrics` scrape green.

## 9. Approval, timing and pre-cut-over checks

**Check 1 — custom import hosts and the uuid-chain duplicate window (from ATSAgent#93/#94).**
The external-id fallback fix (#94, merged) changes what `importFromProvider` stores: records that previously
got a **random** external id (the old chain ignored a bare provider `uuid` field) will get the **provider's
uuid** on the first import after the fix — so cross-import dedupe will miss and create **one duplicate
candidate per uuid-only record**. This applies **only to custom import hosts**; built-in providers
(naukri/indeed) carry `id` and are unaffected.

```bash
# read-only: does production import from any custom host?
kubectl -n atsiq get secret atsiq-env -o jsonpath='{.data.INTEGRATION_ALLOWED_HOSTS}' | base64 -d
```

If it is unset or empty: no exposure, note it here and move on. If it lists hosts: before the first
re-import of any of them in production, (a) count the exposed integrations on the prod DB (read-only), and
(b) schedule a dedupe pass over the candidates created by that first re-import — the repo's candidates
`dedupe` core is the tool; run it right after the import rather than letting duplicates accumulate. Record
the outcome in this file.

**Approval and timing**

- The product owner approves the release and its timing (team brief). The z-atsiq path has no technical
  approval gate (the scouts pipeline's GitHub `production` Environment reviewers don't exist here) — the
  approval is the human running deploy.sh under `madhu.r@yavar.ai`; record it in this file before running.
- Suggested sequence, all plan-only until approved: §5 backups + restore test → §4 reconciliation →
  §6 rehearsal → §7 migrate+rollout, in a quiet weekday slot for the migration locks (flags 3 in §3), never
  a Friday evening; the voice-worker roll waits out live calls, so prefer a low-call period.
- This plan is deliberately deploy-free. Cut-over itself is Phase 10 and separately approved.

## 10. Open items needing live access

1. Confirm deployments/secrets/CronJobs in namespace `atsiq` and the image tag
   (`kubectl -n atsiq get deploy,svc,ingress,cronjob,secret -o wide`).
2. The authoritative pending list from `pg_migrations` on the day (§3 command).
3. VolumeSnapshotClass name for `standard-rwo` in this cluster (§5B), and whether snapshots are permitted
   by the cluster's backup policy.
4. A GCS bucket for off-cluster dumps (and later, for §5C's barman/WAL archive).
5. Cloud Scheduler jobs actually registered for z-atsiq (`gcloud scheduler jobs list --location asia-south1`).
6. Whether a Cloud Run-era `atsiq` service or parser still exists alongside the GKE deployment (the repo
   documents three generations; only the GKE one matches the brief).
7. Recover `17f59fa` provenance from the registry image manifest (best-effort; the release proceeds on the
   date-bounded baseline either way).

## Release-gate results (2026-11-25, day before the window)

All four §7 preconditions are green. Nothing was written to production
beyond read-only dumps/counts; the gate image was pushed under a
`release-gate-*` tag and the proof pods were deleted afterwards.

1. **§4 decisions recorded** — `reconcile-decisions.md` (this directory):
   7 keep / 6 drop / 0 unresolved across the 7 production-only migrations;
   adversarially verified 19/19 against the repo; merged to main.
2. **§6 rehearsal green** — 2026-11-24-verified dump re-restored from a
   fresh 2026-11-25 dump into a scratch PG16 cluster: all 73 pending
   migrations applied with zero failures, split around the 0058
   duplicate-run pre-check, which found **zero duplicate active live runs**
   (zero active runs at all — nothing to cancel). 0070's data migration
   built 4 panelists from restored rows; the production-only objects
   survived untouched.
3. **§7 0b image boot proof green** — the real image was built in the
   builder pod from source `origin/main` @ `930eb6bf` and pushed as
   `asia-south1-docker.pkg.dev/yavar-studio/yavar-platform/atsiq:release-gate-930eb6bf`
   (no rollout), then proven to boot all three FROM the image:
   `GET / → 200`, `voice_worker.started`, `parser worker listening on 8080`.
   Note for the runbook: the image has no working directory baked in —
   always use the absolute `/app/.output/...` entrypoints (as crane-stage
   and the Deployments do).
4. **§9 check 1 green** — `INTEGRATION_ALLOWED_HOSTS` is not set in
   `atsiq-env`: no custom import hosts, no exposure to the #94 uuid-chain
   duplicate window.

Release target: source `origin/main` HEAD on the morning of 2026-11-26;
fresh backups (dump → gs://atsiq + PVC snapshot) are the first act of the
window, then `deploy.sh migrate <sha>` → `deploy.sh <sha>` → smoke, under
the operator account, with the §7 0b proof repeated for the release SHA.
