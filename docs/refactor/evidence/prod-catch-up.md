# Production catch-up release plan (PLAN ONLY — not executed)

**Status:** plan. The product owner approves the release and its timing; nothing here has been run.
**Written:** 2026-11-24, Dev 3. Evidence gathered from the source repo (`/Users/yavar/Documents/CoE/ATSAgent`
@ origin/main `3d55eb1`), `scripts/deploy.sh`, `DEPLOYMENT-GCP.md`, `DEPLOY-QUICK.md`, `infra/`, and
`gh pr list` against `madhugraj/ATSAgent`. Every item marked **[VERIFY LIVE]** needs cluster/Cloud SQL access
(gcloud account `madhu.r@yavar.ai`) and must be confirmed on the day.

---

## 1. What production runs

|                            |                                                                                                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project / cluster / region | `yavar-studio` / `yavar-studio-cluster` / `asia-south1`                                                                                                                                                    |
| Namespace                  | `atsiq` (live site: `z-atsiq.yavar.ai`, external GCLB ingress + managed cert)                                                                                                                              |
| Web                        | `deployment/atsiq` — image `asia-south1-docker.pkg.dev/yavar-studio/yavar-platform/atsiq:17f59fa`, port 3000, ~2 replicas [VERIFY LIVE]                                                                    |
| Voice                      | `deployment/atsiq-voice-worker` — same image, `node /app/.output/voice-worker/index.mjs`, 1 replica, Recreate, 1900s grace [VERIFY LIVE]                                                                   |
| Parser                     | documented (`node .output/parser-worker/index.mjs`, deny-all egress, `PARSER_TOKEN`) — manifest not in repo [VERIFY LIVE]                                                                                  |
| In-cluster CronJobs        | `atsiq-board-sync`, `atsiq-sync-hrms` (15 min) [VERIFY LIVE]                                                                                                                                               |
| Secrets                    | `atsiq-env` (DATABASE_URL, SESSION_SECRET, SECRET_ENCRYPTION_KEY, PUBLIC_SITE_URL, CRON_SECRET, TRUSTED_PROXY_COUNT=1, RATE_LIMIT_STORE=postgres, …), `atsiq-voice` (SIP_*), `atsiq-parser` (PARSER_TOKEN) |
| Cloud Scheduler            | Bearer `CRON_SECRET` → `/api/public/…` (process-email-outbox */5, inbox-sync, sync-hrms */15, board-sync */15, sync-candidates hourly) [VERIFY LIVE: `gcloud scheduler jobs list --location asia-south1`]  |
| Monitoring                 | `/metrics` behind `METRICS_TOKEN`; `scheduler-stalled` alert policy fires if the agent tick stops                                                                                                          |

**Provenance warning:** commit `17f59fa` does **not exist** in the repo — `git cat-file` fails locally and
GitHub returns "No commit found for SHA". It was likely built from an unpushed working tree on ~2026-10-27
(eight PRs merged that same day). Treat the production code baseline as **"main as of ≈ 2026-10-27"**, not as
a known commit. Recovery options: `kubectl -n atsiq get deploy atsiq -o jsonpath='{…image}'` to confirm the
tag; `gcloud artifacts docker tags list` for the image's created timestamp; worst case diff the running
bundle. The registry still holds every old image (tags are immutable short SHAs), so the rollback target
survives regardless.

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
- **2026-11-24 (1)** — #89 voice worker boots from the image without node_modules (directly relevant: this
  is the newest main, and the fix the prod image needs if the worker is rolled).

**Plus 19 commits pushed straight to main with no PR** (2026-11-02 → 2026-11-05) — these are easy to miss in
a PR-only changelog and include the **2026-11 audit hardening** `69339ff8` (auth limiter, CSRF guard, SSRF
pin, input bounds), voice fixes (playout buffer, server-side VAD, cue timing, prompted answers), audit N-3
transcription routing, capture distribution token (N-15), and the matching hard-gates/evals batch
(`632a81d9`, `3e7c89ee`, `0d631704`, `3e80417d`, `15c27a6b`, `4708c7c2`, `9510168f`, `f96da86f`).
Full list in the research appendix of this file's source notes (phase-log); verify with
`git log --since=2026-10-26 --first-parent --no-merges origin/main`.

## 3. Pending migrations

97 migration files exist; the runner (`scripts/migrate-pg.mjs`) tracks applied files **by exact filename**
in the `pg_migrations` table (name, applied_at), applies in lexicographic order, stops hard on the first
failure, and is **not transactional per file** (half-applied file = partial DDL with no ledger row; re-run
depends on the file being idempotent — most are, see flags below).

**The authoritative pending list must come from the database** [VERIFY LIVE]:

```bash
DBURL=$(kubectl -n atsiq get secret atsiq-env -o jsonpath='{.data.DATABASE_URL}' | base64 -d)
# then, from any pod with the repo (deploy.sh's builder pod, or a one-off migrate-image pod):
select name, applied_at from pg_migrations order by applied_at, name;
# pending = repo files minus that list:
comm -23 <(ls drizzle/pg-migrations/*.sql | xargs -n1 basename | sort) <(psql "$DBURL" -Atc "select name from pg_migrations" | sort)
```

**Inferred pending (40 files, 0055–0091), from commit dates — confirm before running:**
`0055` org context · `0056` split groups · `0057` expert brief · `0058` active-run unique (+ `0058_negotiation_call`)
· `0059` meeting ref · `0060` panel transcripts · `0061` panel assessments · `0062` panel review ·
`0063` transcript wait · `0064` AI spend caps · `0065` AI redteam checks · `0066` rate limits + step-up ·
`0067` distribution token · `0068` custom scoring dimensions · `0069` agent event lineage (+ `0069_slot_offer_call_first`)
· `0070` copilot intelligence (+ `0070_panel_directory`) · `0071` voice guard · `0072` short screening call ·
`0073`–`0079` pay terms / pay conventions / offer pay terms / labour policy / offer policy check / policy
documents / policy briefings · `0080` agent blueprints · `0081` interviewer role · `0082` studio agents ·
`0083` agent workflows · `0084` workflow waits · `0085`/`0086` interview confirmations + times ·
`0087` workflow API keys · `0088` hiring SLA · `0089` scorecard chases · `0090` panel changes ·
`0091` org email brand.

**Boundary cases:** `0052_org_agreements`, `0053_service_slo`, `0054_org_profile` were all authored
2026-10-27 — pending or not depends on the time of the last prod deploy that day; the `applied_at`
column resolves it instantly. Also expect ledger noise: `0046_org_agreements`/`0046_service_slo` were
renamed to `0052_`/`0053_` — if prod applied the old names, the runner re-attempts under the new names
(safe: both bodies are fully idempotent, it just records extra rows).

**Flags before running (the runner stops at the first failure):**

1. `0058_active_run_unique` **fails if dirty data exists** — partial unique index on active live runs. Prod
   ran the racy pre-fix code for ~4 weeks, so pre-check and cancel duplicates first:
   `select org_id, agent_type, subject_id, count(*) from agent_runs where subject_type='requisition' and status in ('queued','running','awaiting_human') and mode='live' group by 1,2,3 having count(*)>1;`
2. `0070_panel_directory` is a **real data migration** (inserts panelists from org members, rewrites
   role_panels/round_substitutes ids) — rehearse against a restored dump, not an empty DB.
3. `0073_pay_terms` + `0075_offer_pay_terms`: add-not-null-default + backfill UPDATE + constraint swaps —
   brief ACCESS EXCLUSIVE locks on requisitions/offers while the app is live. Acceptable window, but schedule
   the migrate for a quiet minute.
4. `0069_slot_offer_call_first`: bounded backfill UPDATE + partial index — fine.
5. No pending migration drops data; the only DROPs are `drop constraint if exists` swaps.

## 4. Backup steps for atsiq-db (write nothing back — read-only plan)

**There is no documented backup procedure for the live instance** — the backup documentation in the repo
(`--backup-start-time 20:30`, PITR, quarterly restore test) belongs to the not-yet-deployed `scouts-pg`
instance. First time, then every release:

1. Confirm the instance and its state [VERIFY LIVE — docs name it `atsiq`; the brief says `atsiq-db`; neither
   is authoritative, check]:
   `gcloud sql instances list` then
   `gcloud sql instances describe <instance> --format='value(settings.backupConfiguration)'` — if automated
   backups/PITR are **off**, enable them before anything else:
   `gcloud sql instances patch <instance> --backup-start-time=20:30 --enable-point-in-time-recovery`
2. Immediately before the migrate, take an on-demand backup and verify it exists:
   ```bash
   gcloud sql backups create -i <instance> --description="pre-catch-up 2026-11-XX"
   gcloud sql backups list -i <instance> --limit 3
   ```
3. Export a portable copy too (restorable anywhere, unlike the instance-linked backup):
   `gcloud sql export sql <instance> gs://<bucket>/atsiq-pre-migrate-$(date +%Y%m%d-%H%M).sql --database=atsiq`
   (needs a GCS bucket in `asia-south1`; `gsutil ls` to pick one.)
4. Do not skip: confirm `SECRET_ENCRYPTION_KEY` is safely backed up (losing it makes every stored
   credential — OAuth tokens, AI keys — unreadable; DEPLOYMENT-HANDOFF warns rotation requires re-encrypting
   everything).

## 5. Deploy order: `deploy.sh migrate` **then** `deploy.sh`

The two modes are mutually exclusive invocations of `scripts/deploy.sh` — deploy never migrates, migrate
never rolls out, and nothing in the script enforces the order. The documented requirement
(DEPLOYMENT-GCP.md: "One DB migration Job per release **must complete before rolling the Deployment**") is
the right order here, because four weeks of new code will be rolled and migrations are backward-compatible
(old code runs on the new schema; the reverse is not guaranteed):

```bash
# 0. product owner approval recorded; backups from §4 taken and listed
# 1. migrations (runs the TARGET SHA's tree, reads DATABASE_URL from secret atsiq-env)
scripts/deploy.sh migrate <target-sha>
# 2. rollout (web; voice worker rolled with the same image, waits out in-progress calls ≤ 2400s)
scripts/deploy.sh <target-sha>
# 3. smoke (the script does this): GET / must be 200 + board-webhook guard probe
# 4. verify the in-cluster CronJobs completed post-deploy (DEPLOY-QUICK checklist)
```

Notes: `deploy.sh migrate` runs from the target commit's tree (it `git archive`s the SHA), so the pending
list in §3 must be computed at that SHA, not at main. **Docs contradiction to resolve later:** DEPLOY-QUICK.md
says to migrate _after_ deploying; that works only because migrations are additive, and it is the wrong
default for a four-week catch-up — this plan follows DEPLOYMENT-GCP.md. Also note the header comment in
deploy.sh says "kaniko" but the push actually uses `scripts/crane-stage.sh` (stale comment, harmless).

## 6. Rollback plan

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
  stops before the next file; fix forward (most files are `create … if not exists` / guarded constraints);
  restore from §4's export only as the last resort, with the product owner's explicit call (it loses the
  interim write window).
- **Voice worker:** Recreate + 1900s grace — an in-progress call finishes (≤ 30 min) before the pod swaps;
  don't force-delete pods mid-call.
- **Cron/secret rotation:** if `CRON_SECRET` rotates in the same window, use the documented
  `CRON_SECRET_PREVIOUS` pattern (set old value, deploy, update Scheduler jobs, remove) — never a hard
  cutover, or the agent tick stops and the `scheduler-stalled` alert fires.
- **Post-rollback checks:** smoke GET `/` = 200, agent tick advancing (agent_events), outbox draining,
  voice heartbeat, `/metrics` scrape green.

## 7. Approval and timing

- The product owner approves the release and its timing (team brief). The z-atsiq path has no technical
  approval gate (the scouts pipeline's GitHub `production` Environment reviewers don't exist here) — the
  approval is the human running deploy.sh under `madhu.r@yavar.ai`; record it in this file before running.
- Suggested window: a quiet weekday slot for §5 step 1 (migration locks in flags 3), never a Friday evening;
  voice-worker roll waits out live calls, so prefer a low-call period.
- This plan is deliberately deploy-free. Cut-over itself is Phase 10 and separately approved.

## 8. Open items needing live access (nothing here blocks planning)

1. Confirm image/deployments/secrets/CronJobs in namespace `atsiq` (`kubectl get deploy,svc,ingress,cronjob,secret -n atsiq -o wide`).
2. Authoritative pending-migration list from `pg_migrations` (§3 command).
3. Cloud SQL instance name + backup config (§4 step 1) — including whether "atsiq-db" vs "atsiq" is the real name.
4. Cloud Scheduler jobs actually registered for z-atsiq (`gcloud scheduler jobs list --location asia-south1`).
5. Whether a Cloud Run-era `atsiq` service or parser still exists alongside the GKE deployment (the repo
   documents three generations; only the GKE one matches the brief).
6. Recover `17f59fa` provenance from the registry image manifest (best-effort; the release proceeds on the
   date-bounded baseline either way).
