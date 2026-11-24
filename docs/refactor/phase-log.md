# Refactor phase log

Baseline (`SOURCE_SHA`): `dcb6a4b` — after the pre-Phase-1 source PRs (#81 whole-repo prettier format,
#83 second interview-panel race, #82 review R1 stage-guard fix), 2026-11-23, CI green.

**Pre-Phase-0 merge (2026-11-23):** `main` is at `39ce992` (CI green). Merged: #76 offer stage events, #77 scorecard
docs, #67 UI dedup, #65 agent review loop, #64 cost tokens, #73 nav hubs, #74 alert digest (includes #75 email
branding, stacked on it), #68 appearance, #69 workflow chat (stacked on `feat/agent-intelligence`, landed via #78).
**Not merged:** Dependabot #63 and #59 (CI failing). Phase 0 starts from `39ce992`. Re-run `scripts/refactor/graph.mjs`
there, because the map was built at `7990feb` and #69 alone added about 54k lines (workflows, pay terms, labour policy, Voice Guard,
org ontology, ~20 migrations).

Phase 0 notes found during the merge:

- `scripts/agent-interview-slots.test.ts` is **flaky** (an email-outbox race: "sent" vs "suppressed", missing mail row).
  It fails intermittently on `main` too. Fix the race in Phase 0 (add it to 0.4).
- The pre-commit formatter rewrites generated docs. `docs/voice-agents-charter.md` is now in `.prettierignore`. Check
  `docs/er-diagram.md` and `docs/voice-scheduling-call-plan.md` too.
- Migration numbers repeat (0046, 0058, 0069, 0070 each have two files). This works, because `migrate-pg.mjs` tracks file names, but the
  ordering on a fresh DB differs from production. Keep both, and document it.
- A hydration warning appears on every page in dev (probably the theme/text-size setting read on the client). Not investigated.

| Phase        | Branch / PRs                                                                                                                                                                                                                                                                                                                                                           | Packages touched                                                 | Gate                                                                                                                                                                                                                                                                               | Reviewer sign-off                                                                                                                                            | Date       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 0            | `fix/offer-stage-events` (madhugraj/ATSAgent#76) + `chore/p0-fixes` (**#80**, merged `ca7599c`)                                                                                                                                                                                                                                                                        | source repo                                                      | Gate 0: pass 2026-11-23 (typecheck ✓, lint 0 errors ✓, 89 files / 1367 tests / 0 fail ✓, agents:lock no diff ✓)                                                                                                                                                                    | **Signed off 2026-11-23** (Claude; independent re-run at `ca7599c`: 89 files / 1,367 pass / 0 fail). See `reviews/phase-0-review.md`; R1 due before Phase 2  | 2026-11-23 |
| 1            | ATSAgent_refactored @ `main` (remote madhugraj/ATSAgent_refactored, private). **History rewritten 2026-11-23** to purge the accidentally-committed `.turbo` cache (F3): old→new SHAs — `c6aa095`→`653ef1f` (bootstrap), `61df2e8`→`d2e0061` (docs), `9298d75`→`c3eea66` (conditions C1–C4/A1), `f57916c`→`0265855` (docs row), `a7b4551`→`b450d70` (dependabot paths). | monorepo shell; tools/                                           | Gate 1: pass 2026-11-23 (turbo typecheck+build ✓; lint, per-file tests and migrations run through root scripts ✓; app boots + login ✓, inventory 0 unmapped ✓, no forbidden files ✓, 89 files / 1367 tests = source parity ✓, agents:lock no diff ✓, depcruise 0 errors at warn ✓) | **PASS with conditions C1–C4** (Claude, 2026-11-23; independent re-run: 89 files / 1,367 pass / 0 fail, src byte-identical). See `reviews/phase-1-review.md` | 2026-11-23 |
| 2            |                                                                                                                                                                                                                                                                                                                                                                        |                                                                  |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |
| 3            | `refactor/p3-l1-platform` (12+ commits: sync, 5 package moves, kernel cycle fix, SLO notify, ALS guards, gate additions, hardening suite, merge with main post-9a/tzfix)                                                                                                                                                                                               | @ats/audit, @ats/auth, @ats/ai, @ats/kernel, @ats/platform-http  | Gate 3: pass 2026-11-24 (typecheck 14/14 ✓, lint 0 errors ✓, package suites ✓, scripts suite 0 fail ✓, agents:lock no diff ✓, worker boot smoke ✓, depcruise 171 ✓, parity 12 prefixes/4 origins ✓, attribution ✓, limiter bursts ✓, CSRF ✓, ALS guards proven ✓)                  | _awaiting review_                                                                                                                                            | 2026-11-24 |
| 4            |                                                                                                                                                                                                                                                                                                                                                                        |                                                                  |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |
| 5            |                                                                                                                                                                                                                                                                                                                                                                        |                                                                  |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |
| 6            |                                                                                                                                                                                                                                                                                                                                                                        |                                                                  |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |
| 7            |                                                                                                                                                                                                                                                                                                                                                                        |                                                                  |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |
| 8            |                                                                                                                                                                                                                                                                                                                                                                        |                                                                  |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |
| 9 (parallel) | `services/9a-template` (4 commits, pushed; cut from `2b60c87` — rebase onto `main` before continuing)                                                                                                                                                                                                                                                                  | services/_template, tools/contracts, apps/web internal route, CI | 9a slice: all local gates green (pytest 18, ruff, mypy strict, contracts --check, typecheck 6/6, lint, depcruise 171, gitleaks clean)                                                                                                                                              | _handoff to Developer 3 below_                                                                                                                               | 2026-11-24 |
| 10           |                                                                                                                                                                                                                                                                                                                                                                        |                                                                  |                                                                                                                                                                                                                                                                                    |                                                                                                                                                              |            |

<!-- Append one handoff note per phase below, using template E2 in 00-TEAM-BRIEF.md. -->

### Phase 4 handoff (Dev 1 half): 2026-11-24

- **Branch / PRs:** `refactor/p4-deskcore-org` → PR (Dev 1's half). Dev 2's legal landed (#21); comms and
  integrations follow their sequence (integrations gated on @ats/org landing, which this PR provides).
- **Packages created:** @ats/desk-core (store/threads/text/effects; notifyRequisitionThread added) and
  @ats/org (org-profile*/org-context*/master*/templates*, org-setup, integration-seeds, the generic
  credential store). Both follow the Phase 2/3 recipe with declared workspace deps ("workspace:*" — Dev 2's
  style, agreed as the going-forward practice).
- **Change PRs (logic):** (1) deleteThread/restoreThread runtime cancellation is INJECTED via
  registerDeskThreadEffects (L2→L4 seam; the kernel AgentPort stays at its map-listed four methods) —
  registered in boot.ts for production and at desk.server load for tests/direct importers; (2) org-profile/
  org-context start runs through the kernel AgentPort via apps/web/src/agent-port.server.ts — packages/org
  has zero agents/runtime or orchestrator imports.
- **Gate 4 (Dev 1 half): 10/10.** Suite 83 files / 1,336 pass / 0 fail on this branch pre-merge;
  post-merge re-run pending PR CI. Depcruise: desk-core 0 violations; app ratchet count fell 114 → 98
  (repoints removed edges) — WARN_MAX left for the phase-4 review to lower (~98). AI call-path audit green.
- **Deviations needing reviewer awareness:** (a) the effects-injection seam (kernel AgentPort deliberately
  not extended; observability mailer precedent); (b) the test split at the org/agents seam (agent-card +
  agent-runs tests new; some desk-side assertions moved); (c) verbatim-extraction proven for 16 moved
  bodies, with the two seams the only behavioural-neutrality deltas.
- **Followups:** adopt notifyRequisitionThread at the conversationForRequisition+postMessage pairs over
  time (mechanical); repoint remaining desk.server importers (orchestrator, tools, hiring-desk, org-desk)
  as their packages land; Phase 8 removes the 9 shims.

### Phase 3 handoff: 2026-11-24 (Dev 1)

- **Branch / PRs:** `refactor/p3-l1-platform`, 16 commits: `a2d2d24` sync 3d55eb1 · `fee9bed` @ats/audit ·
  `8e406dc` @ats/auth · `7d8e7d2` @ats/ai · `8391fff` @ats/kernel + cycle fix · `700620a` @ats/platform-http ·
  `e8e06be` SLO notify + ALS guards · `78de958` gate additions · `55462ad`…`3041f63` hardening suite ·
  merge with `origin/main` (post-9a #7, tzfix #13) resolving the gateway/server.ts/lock conflicts.
- **Source sync:** `SOURCE_SHA` 3d55eb1 → **bca8574 staged on branch `sync/bca8574`** (4 commits, freeze
  exception for #87 + #90, product owner approved). It rebases onto the Phase 3 merge after this PR lands
  (the only real conflict: orchestrator sweeps importing `@ats/kernel/server` — mechanical). Dev 2's #91 and
  the 9a migration `0094_service_tokens` do not clash with 0092/0093.
- **Packages created:** @ats/audit (writeAudit) · @ats/auth (identity/password/step-up/action-token/claims/
  oauth-state + the framework-neutral core extracted from auth.middleware/requisitions.server; the TanStack
  wrapper stays in the app with the unchanged requireOrg/requireRole/requireOrgOwner/requirePlatformAdmin
  surface) · @ats/ai (gateway whole-move — the transport/providers/ledger split stays a later change PR —
  ledger, pricing, spend cap, prompt-echo, training, redteam, context, injection) · @ats/kernel (events,
  policy, registry, manifest.server, task-liveness, hitl, run-messages, ports) · @ats/platform-http
  (rate-limit, cron-auth, the extracted server.ts pipeline).
- **Change PRs (logic):**
  1. **The §5 cycle fix:** kernel events.ts no longer dynamically imports the orchestrator — emitAgentEvent
     inserts + calls `onAgentEvent` handlers; `apps/web/src/boot.ts` (new composition root) registers the
     orchestrator kick, preserving AGENT_INLINE_KICK=0 semantics. Kernel has zero orchestrator imports.
     The boot-wiring test fails if boot.ts stops registering it.
  2. **SLO notify injection** (owed from Phase 2): observability takes an injected notifier; boot registers
     the app's email path. observability has zero comms/mail imports — the parser worker can now drop them.
  3. **ALS load-once guards:** each of kernel/ai/observability arms a globalThis symbol in its /server
     entry; a duplicated copy throws the named loud error at import. Proven by test.
  4. **boot wiring in the build:** apps/web package.json marks `./src/boot.ts` in `sideEffects` so
     tree-shaking cannot silently drop the registrations — `worker-boot-smoke.sh` asserts the guards and
     the alert mailer are present in the built bundle.
- **Gate 3 (workflow gate agent + coordinator re-run):** typecheck 11→14/14 · lint 0 errors / 271 warnings ·
  package suites 67 tests · scripts suite 82→86 files, 0 fail · `agents:lock` no diff ·
  attribution verified field-level (`ai_usage_events.agentRunId` set in-run, null out-of-run;
  `training_inferences.candidateId` resolved) · limiter bursts on every branch (`/_serverFn`,
  `/api/public/*`, `/api/auth/login`, `/api/auth/confirm` tighter-contrast, `/api/auth/session`, `/me`,
  `/api/agents/*`, `/api/mcp`, `/api/workflows/*`) · `/metrics` 404/401 · cross-site CSRF 403 ·
  worker boot smoke ✓ · depcruise ratchet 171 ✓ · parity 12 prefixes / 4 origins vs bca8574 ✓.
- **Hardening suite (product owner's criteria):** scripts/check-platform-parity.mjs + bca8574 snapshot
  (mutation-tested) · scripts/rate-limit.test.ts 22 tests · scripts/als-single-instance.test.ts (proves the
  landed guards fire on a genuine cache-busted second import — probe verified bun creates one) ·
  scripts/boot-wiring.test.ts · scripts/ai-call-path-audit.test.ts (providers only in the gateway;
  AI_FEATURES slugs, no bare literals; server-fn responses free of model/engine outside a documented
  baseline). The 17 ai-gateway mocks + the ledger mock re-pointed to `@ats/ai/server` per Dev 2's
  mock-paths.md; usage assertions prove interception at the new specifier (all 17 files green).
- **Freeze exception (recorded):** #87 + #90 synced via `sync/bca8574`; brings migrations 0092/0093 (columns
  on panelists [interviews] and screening_calls [voice] — no new tables, owners already correct), the two
  new agents (25 agents, lock regenerated deliberately on that branch), email kinds/templates, three
  orchestrator sweeps, voice/short-call.server.ts.
- **Depcruise watch (product owner):** the sync raises warnings 171 → 183 (+12 no-cycles edges). WARN_MAX
  deliberately NOT raised. New edges for map §10 review: orchestrator → voice/confirm-calls.server,
  → lib/panelist-mobile.server, → lib/interview-reminders.server, → voice/scheduling-request.server;
  voice/confirm-calls.server → desk.server + agents/{context,policy}; voice/call-session → voice/
  confirm-calls; voice/scheduling-request → voice/confirm-calls; voice/scheduling-session → voice/short-call;
  interviewer-brief.server → panelist-mobile.server; panelists.server → voice/phone; tools-phase2 →
  tools-confirm-calls; definitions → voice/confirm-call-prompts.
- **Deviations:** (1) interim tsconfig paths remain in observability/security (shrink as L2 lands);
  (2) the gateway is not yet split into transport/providers/ledger/json (later change PR); (3) the auth
  core extraction drops `createServerOnlyFn` wrapping on the extracted fns (identity functions at runtime;
  the /server entry keeps the server-only marker); (4) merged `origin/main` into the branch rather than
  rebasing — the tzfix (#13) had edited the gateway file that the ai move relocates, and the resolution
  ports #13's deterministic withToday into `@ats/ai/server` (verified byte-identical output).
- **Findings for the reviewer (AI call-path audit baseline):** pre-existing vendor-leak candidates —
  salary-benchmark.functions returns `result.model`; onboarding.functions returns `read.model`;
  verification/assessment.functions return `result.model`; platform-ai-usage.functions renders usage rows'
  models on the admin page (carve-out covers only the BYO page); ontology.functions `stats.model: engine`
  (may be a non-vendor label). Bug fixes allowed under the freeze — needs a product ruling.
- **Findings recorded elsewhere:** worker-bundle bun-ICU incident (#11/#12/#13 on main, fixed and
  documented); 9a handoff on `services/9a-template` (Dev 3).
- **Questions for reviewer:** (1) approve the 12 new sync edges for map §10 (list above); (2) rule on the
  vendor-leak findings (fix now as freeze-exception bug fixes, or amend the invariant's carve-out for the
  platform-admin page); (3) confirm the platform-http extraction shape (server.ts ~30 lines, pipeline.ts
  composable) matches the Option-B intent.

### Phase 9a handoff → Developer 3 (2026-11-24)

**Branch:** `services/9a-template` (pushed; 4 commits: contracts generator, services scaffold, web route, CI job).
Rebase onto `main` (`157b617`) before continuing — the branch predates the three-dev plan merge.
Worktree discipline: work in `../ATSAgent_refactored-p9` or your own clone; never the main checkout
(Dev 1's Phase 3 agents run there). Ask Dev 1 for shared-file changes (ci.yml, turbo.json, root
package.json, depcruise config, bun.lock).

**Landed (all gates green):**

- `services/_template/`: FastAPI + Pydantic v2 + uv (lockfile committed), app/ with `/healthz`,
  service-token auth (constant-time, fails closed on empty list), typed ai_client, contracts_gen/,
  pytest/ruff/mypy-strict/Dockerfile/README. 18 pytest green; live uvicorn boot smoke done.
- `tools/contracts/generate.mjs` (+ manifest): zod → JSON Schema → Pydantic emitter, deterministic,
  `--check` drift mode. Golden JSON fixtures shared TS↔Python.
- `apps/web/src/routes/api/internal/ai.ts`: POST, service-token auth, 60/min per-caller-per-path limiter
  (new `isInternalApiPath`, prefix `/api/internal` documented as stable), zod-validated body
  (feature ∈ AI_FEATURES), generic failure messages (provider errors quote model ids — replaced),
  success replies deep-stripped of model/provider/engine keys, tests assert no vendor tokens on the wire.
- CI: `python-services` job (uv sync --locked, ruff, mypy strict, pytest, contracts `--check`).

**Your task list — harden the route to the product owner's spec (not yet done):**

1. Move the service token from the env bootstrap to durable storage: stored via `encryptSecret`
   (packages/security), read via decryptSecret at request time; constant-time compare stays.
2. **Rotation through `writeAudit`** (packages/audit): a rotation path (TS-side admin fn or script) that
   writes the new token and appends to audit_log.
3. Rate limiting ✓ done; **CSRF exemption** is correct-by-construction (token-authenticated, no cookies —
   the csrfGuard scopes `/api/auth` + `/_serverFn` only). Document that in the route's comment.
4. **Internal ingress only**: production gets no external route to `/api/internal` — add the note to
   `apps/web/infra/gke/10-app.yaml` (or the ingress doc) so Phase 8 enforces it.
5. Body checks: `orgId` + `feature` — **verify the org exists and has AI consent** (training_settings /
   consent path) before calling the gateway; unknown feature → 400 (already done); consent missing → 403.
6. Wrap forwarded text in `untrusted(...)` (from `@ats/ai/server` — injection rules).
7. Vendor stripping ✓ done (deep-strip + wire-text test).
8. Tests: 401 missing/wrong token ✓, 400 unknown feature ✓, **429 burst** — add it; add consent-403 and
   org-not-found tests.
9. First CI run: confirm the python job finds Python 3.12 on ubuntu-latest; pin (`uv python install 3.12`)
   if not. The job runs on every PR (classic protection can't path-scope) — approved deviation; keep it fast.
10. Record this handoff's completion in the phase-log Phase 9 row and open the 9a PR when the hardening
    is done — it merges independently of Phase 3.

Open questions → ask Dev 1 (shared files) or the product owner via the phase-log.

### Phase 9a hardening handoff (Dev 3 → reviewer, 2026-11-24)

Task list above is **done** on `services/9a-template`, in the `../ATSAgent_refactored-p9` worktree. Commit + PR
opened as `refactor/p9a-internal-ai`. Gate: ruff / mypy strict / pytest (18) green; contract `--check` green;
turbo typecheck green; root eslint 0 errors; agents:lock no diff; migration 0092 applied twice (idempotent);
web build green; client bundle grep clean; new tests 22 pass.

1. **Durable token storage:** new `service_tokens` table (schema + `packages/db/drizzle/pg-migrations/0092_service_tokens.sql`,
   platform-scoped by design — a service token authenticates a service, never a tenant). Stored via
   `encryptSecret` ("enc:v1.…" asserted in tests), read via `decryptSecret` per request, constant-time compare
   over env bootstrap list + all stored tokens. `SERVICE_TOKENS` env stays as the pre-rotation bootstrap.
2. **Rotation through writeAudit:** `rotateServiceToken` in `apps/web/src/server/internal-ai.server.ts`
   (generate → encrypt → upsert → `internal.service_token.rotated` audit row). Platform-admin gated server
   functions in the new `apps/web/src/lib/platform-service-tokens.functions.ts` (`rotateServiceTokenFn` —
   returns the plaintext once; `listServiceTokens` — metadata only). New file on purpose: not a shared-file change.
3. **CSRF exemption:** documented in the route comment; the guard scopes `/api/auth` + `/_serverFn` only, and
   the endpoint is token-authenticated with no cookies.
4. **Internal ingress:** two layers — production runtime check (`internalIngressAllowed`: private-range client
   IP via `clientIp()`, fail-closed on "unknown"/public, 404) + comment note in `apps/web/infra/gke/20-ingress.yaml`
   (services must call the cluster-internal service, never the public host).
5. **Tenancy check:** `orgHasAiConsent(orgId)` = org row exists AND the org has a saved AI provider credential.
   **Deviation from the handoff's suggestion** (training_settings): training consent gates _capture_, not AI
   use; the only "this org opted into AI" signal in the app today is its own BYO-key credential, and the
   gateway refuses without one anyway. Unknown org and consent-missing return the same generic 403, so the
   endpoint cannot probe org existence. Reviewer: confirm this reading.
6. **untrusted(...)** wrapping: prompt arrives as `<untrusted_data label="service_input">…</untrusted_data>`
   and the system prompt is prefixed with `INJECTION_RULES` (fence look-alikes in the payload are sanitised —
   tested). Note: taken from `@/lib/ai-gateway.server` — the `@ats/ai` package lands in Phase 3; the import
   moves then. Contract `prompt` max lowered to 60_000 to match `untrusted()`'s truncation bound, so oversize
   payloads are a 400 rather than a silently truncated prompt (contracts regenerated, `--check` green).
7. **Tests:** `scripts/internal-ai-route.test.ts` (21: 401 ×3 incl. empty-list fail-closed and an
   encryptSecret round-trip with a look-alike reject; ingress unit cases; 400 ×6; 403 ×3 incl. orgId-scoped
   credential check; injection-hygiene ×2; vendor stripping ×3) and `scripts/internal-ai-rate-limit.test.ts`
   (429 burst through the real `server.ts` dispatch with the SSR entry stubbed — kept in its own file so the
   server-entry mock doesn't leak into other suites).

**Worktree pitfall found and fixed (affects every Phase 9 worktree):** `ATSAgent_refactored-p9/node_modules`
was a symlink to the main checkout's `node_modules`, so every `@ats/*` import resolved to the **main
checkout's** package sources — a schema change made in a worktree silently didn't exist at runtime, and any
other session's relink mutated this worktree's dependency graph mid-run. Fixed by giving the worktree its own
`bun install` (real `node_modules`). If a worktree sees "stale package" behaviour, check
`readlink -f node_modules/@ats/db` first.

**Known gaps / follow-ups:** the ER diagram generator does not exist in the monorepo yet — table 0092 needs to
be added when `gen-er-diagram` lands (source-repo rule). `SERVICE_TOKENS` and `NODE_ENV` reads stay in
`internal-ai.server.ts` (not `@ats/config`'s env schema) to keep the changeset off Dev 1's shared files —
fold into the config package when convenient. Rotation UI on the platform console is not built (server
functions only) — fine for 9a, needed before 9b's first real service.

**Question for reviewer:** approve the two documented deviations (consent = BYO-key credential;
token table platform-scoped with env bootstrap) in the 9a review.
### Freeze-exception sync (staged, pending the Phase 3 merge): 2026-11-24

- **Branch:** `sync/bca8574` (ATSAgent_refactored-sync worktree). Source `3d55eb1` → `bca8574`
  (#87 interview reminders, #90 voice confirmation and panel time-check calls) is applied here in
  full: migrations 0092 + 0093, the schema columns and email kinds, the two new agents
  (Confirmation call and Panel time-check, v0.1.0) with `agents.lock.json` regenerated
  (**deliberate diff** — 2 new agents), the orchestrator sweeps, `short-call.server.ts`,
  `confirm-calls.server.ts`, the panelist-mobile link, and the PRs' tests.
- **This branch is pre-Phase-3** (`src/server.ts` monolith, app in `apps/web`): the sync is staged
  here and rebases onto the Phase 3 merge (the pre-built `a2d2d24` sync of `3d55eb1` turns the
  rebase into a formality; `worker-boot-smoke.sh` is pre-ported byte-identical from `a2d2d24` so
  the smoke gate runs before that merge).
- **Wrong-way watch (map §10 for reviewer review):** depcruise went 171 → **183** warnings
  (ratchet deliberately NOT raised). The new module edges the sync adds —
  `agents/orchestrator.server.ts` → `voice/confirm-calls.server.ts` (dynamic),
  `agents/orchestrator.server.ts` → `lib/panelist-mobile.server.ts` (dynamic) and
  `agents/orchestrator.server.ts` → `lib/interview-reminders.server.ts` (dynamic; the three
  product-owner-flagged sweep edges), `agents/orchestrator.server.ts` →
  `voice/scheduling-request.server.ts` (`remindUnansweredOffers`), `voice/confirm-calls.server.ts`
  (new) → `desk/desk.server.ts` and → `agents/{context,policy}`, `voice/call-session.server.ts` →
  `voice/confirm-calls.server.ts`, `voice/scheduling-request.server.ts` →
  `voice/confirm-calls.server.ts`, `voice/scheduling-session.server.ts` →
  `voice/short-call.server.ts`, `lib/interviewer-brief.server.ts` →
  `lib/panelist-mobile.server.ts`, `lib/panelists.server.ts` → `server/voice/phone`,
  `agents/tools-phase2.ts` → `agents/tools-confirm-calls.ts`, and `agents/definitions.ts` →
  `voice/confirm-call-prompts.ts` — spawn 12 net-new no-cycles warnings. No WARN_MAX change.
- Table owners: no new tables (0092/0093 add columns to `panelists` [interviews] and
  `screening_calls` [voice]); `table-owners.mjs` passes unchanged, owners already match the steer.
>>>>>>> 43be4fa (sync(bca8574) 4/4: SOURCE_SHA -> bca8574, phase-log freeze exception)

### Phase 2 handoff: 2026-11-23

- **Branch / PRs:** `refactor/p2-l0-foundation` on madhugraj/ATSAgent_refactored, 7 commits:
  `7ed63f5` sync (source `25d6e6f`, #86 harness cushion) · `685038c` @ats/config · `ba0efd7` @ats/observability ·
  `ef106f8` @ats/security · `524d20e` @ats/storage · `3803645` @ats/db + json-types · `41c2ab4` chore
  (vite protection, CI package tests, lint scope).
- **Source sync:** `SOURCE_SHA` `dcb6a4b` → `25d6e6f` (#86 only: computeHarness 1s default-window cushion),
  applied at `apps/web/src/server/agents/governance.server.ts`.
- **Packages created:** @ats/config, @ats/observability, @ats/security, @ats/storage, @ats/db — each with
  `./shared` + `./server` exports, server entries opening with `@tanstack/react-start/server-only`, own
  tsconfig extending `tools/tsconfig.base.json`, own test suite. Shims marked `// SHIM: remove in Phase 8`.
- **Change PRs (logic):**
  - config (first slice): per-app zod schemas `webEnv`/`voiceEnv`/`parserEnv` alongside the unchanged
    combined parse — pure addition, behaviour identical.
  - db: S7 json-types — the zod shapes the schema `$type`s against moved to `packages/db/src/server/json-types/`
    (interview-plan, expert-brief, vtt, panel-assessment, offer-check per §10). Schema byte-differs only in
    those import paths.
- **Gate output:** `bunx turbo run typecheck` 6/6 ✓ · `bun run lint` 0 errors (271 pre-existing warnings) ·
  `node packages/db/scripts/migrate-pg.mjs` ×2 → no-op ✓ · ER-diagram regen byte-identical ✓ ·
  `bun run agents:lock` 23 agents, no diff ✓ · `depcruise-check` ok (ratchet 173) ✓ · `build:web` ✓ ·
  client-bundle grep: 0 files hit node:crypto / SECRET_ENCRYPTION_KEY / DATABASE_URL ✓ ·
  scripts suite **85 files / 1,337 tests / 0 fail** (89 − 4 = the four test files that moved into packages) ·
  5 package suites green via `bunx turbo run test`.
- **Deviations (reviewer awareness):**
  1. `tools/tsconfig.base.json` sets `types: ["vite/client", "bun", "node"]` and packages declare
     `@types/bun` — isolated packages must declare their globals explicitly (tsc probe proved it).
  2. Interim `paths` in packages/{observability,security}/tsconfig.json point at `../../apps/web/src/*`:
     moved files still import not-yet-moved app modules (e.g. alerts → email-outbox). These shrink to zero
     as L2/L3 packages land; removed by Phase 8.
  3. json-types covers **7** lib modules, not the map's 5: `demand-outlook` (plain types, desk/analytics)
     and `pay-settings` (offers) were added by merges after the map's SHA. Their two `$type` refs keep
     app-relative imports with comments until phases 5–6.
  4. The four lib shims are hybrid: types re-export from `@ats/db/server`; runtime helpers
     (CompetencyRating, parseVtt, panel-assessment builders, overallVerdict) stay because client components
     import them — they move with the L3 packages (interviews, offers).
  5. Gate-2 grep as written ("must be empty") has one known exception: the org-ontology UI skill-tag regex
     contains the word "postgres" in one client asset — pre-existing since the Phase 1 bootstrap, UI data
     only. Recommend the brief documents this exception rather than changing the UI now.
  6. Root lint widened to `apps packages scripts`; CI gained a turbo package-tests step — both were gaps
     (package tests were never run in CI).
  7. Runtime deps not declared per package (undici in security, zod in config) — hoisted resolution covers
     them; declare at the dependency-hygiene pass or when the linker changes.
  8. `parserEnv` picks nothing today (PARSER_* are not in the combined schema) — a later config slice gives
     it its own fields rather than inventing definitions here.
- **Phase 2 review conditions (2026-11-24):**
  - **B1 (blocker) — and an important discovery:** the worker-boot crash is real but **not a Phase 2
    regression**: `main`'s freshly-built voice bundle fails identically from a node_modules-less directory
    (same `#tanstack-start-server-fn-resolver` static import — verified by building and booting the source
    at `25d6e6f`). Prod runs `node .output/voice-worker/index.mjs` from an image with only `.output`, so
    this is a latent prod bug on main (or prod runs a stale image). Fixed properly regardless:
    `build-voice-worker.mjs` keeps the Phase-1 externals (Start is bundled, as on main) and now **aliases
    `@tanstack/react-start/server-only` to an empty module** (build plugin) and **emits a
    `tanstack-hash-stubs.mjs` + `package.json` "imports" map** next to the bundle resolving the dead-code
    hash specifier. `build-parser-worker.mjs` gets the same alias (its externals stay). Verified by
    booting both bundles from bare directories: voice reaches `voice_worker.started`, parser prints
    `parser worker listening`, zero module-resolution errors.
  - **CI worker boot smoke** added after the build step: copies both bundles into node_modules-less dirs,
    boots with dummy env, requires the health lines and no resolution errors.
  - **A2:** depcruise ratchet lowered to `WARN_MAX = 171` (verified count at HEAD).
  - **A3 (done early):** `undici ^8.12.3` declared in @ats/security, `zod ^4.6.7` in @ats/config.
  - **A1:** Phase 8 checklist in the plan now demands one `.output` layout and an image-boot proof for
    web + both workers.
  - Deviation 5's grep exception recorded in the team brief's checklist.
  - Handoff test counts corrected: the authoritative full-suite figure is **93 files / 1,386 tests**
    (86 scripts files + 7 package files), per the review's re-run; my earlier "85 / 1,337" counted only
    the scripts loop and missed one file in the awk tally.
- **Correction during PR CI (2026-11-23):** the first Gate 2 run verified `build:web` only; the PR's CI
  turbo build failed on the worker bundles — the new package server entries (the server-only marker; the
  observability chain reaching error-capture) pull @tanstack/start-server-core internals and playwright
  subpaths into the graph, past the old exact-string externals. Fix: both worker build scripts now keep the
  whole @tanstack and playwright scopes external, subpaths included (the deliberate voice de-scoping is
  Phase 7's, map §4). Verified: full `bun run build` green locally and in CI; the voice worker bundle
  contains no Start-server code. Gate 2 counts as green **including worker bundles**.
- **Known gaps / follow-ups:** SLO notify-injection change PR (map §4, observability) still owed — it is
  what lets parser-worker drop playwright/@tanstack from its bundle; config adoption of raw process.env
  reads one area at a time; Phase 8 deletes all shims (`grep -rn SHIM` must be empty).
- **Questions for reviewer:** approve deviations 1–8; confirm the hybrid-shim pattern for the four lib
  files is acceptable until L3; confirm the grep exception wording.

### Phase 1 handoff: 2026-11-23

- **Branch / PRs:** single commit `phase-1-bootstrap` in `ATSAgent_refactored` (git-inited this phase; no
  remote yet — review checks out this repo directly). Source side before bootstrap: #81 (whole-repo prettier
  format + prompt-file formatter protection + CI format check), #82 (R1: stage-writer guard scans src/apps/
  packages with a ≥300-file floor and basename writer matching), #83 (second interview-panel race: `book()`
  now scores the exact row `scheduleInterviewCore` returns; root cause probed — UUID ids make id-ordering
  random, and inline agent kicks insert placeholder rounds). `SOURCE_SHA` moved `ca7599c` → `dcb6a4b`.
- **Source sync:** bootstrap copied the tree at `dcb6a4b` (`rsync` into `apps/web/`, exclusions per rule 5 +
  `.git`/`node_modules`/`.output`/`.github`/`scripts`; scripts/ moved to the repo root).
- **Packages created/changed:** none yet (Phase 2 starts `packages/*`). Created: root `package.json`
  (workspaces `apps/* packages/* tools/*`, turbo, dependency-cruiser), `turbo.json`, root
  `.github/workflows/ci.yml`, `tools/depcruise.cjs`, `tools/refactor/{domains,inventory,matrix,table-owners}.mjs`.
- **Change PRs (logic):** #81/#82/#83 on the source repo (above). In the new repo, no logic changed — the
  diff vs the source is layout + import paths + the tooling above. `apps/web/src` is byte-identical to the
  source `src/` at `dcb6a4b` (verified with `diff -r`).
- **Deviations from map/plan (need reviewer approval):**
  1. `std` package chosen over utils-in-`config` (map §4 left it open). Recorded in the map §4 with reason.
  2. `docs/`, `infra/`, `extension/` sit inside `apps/web/` for now (the plan's rsync target); they move to
     their final homes in Phase 8.
  3. Matrix baseline re-cut: the old `evidence/baseline-matrix.txt` was computed with the _draft_ domain
     names at `7990feb`, so it was incomparable to the final mapping. It is kept as
     `baseline-matrix-draft-7990feb.txt`; the new baseline is the source at `dcb6a4b` under the final
     `domains.mjs`. Future phases diff against that.
  4. CI runs `table-owners.mjs` but not inventory/graph (they map source paths that don't exist in this
     repo; they run locally against the source checkout at `SOURCE_SHA`).
  5. `postgres` declared as a root dependency (migrate-pg runs from the root; moves to `packages/db` in
     Phase 2).
  6. `bunfig.toml` at the root sets `linker = "hoisted"` (bun otherwise isolates workspace deps and root
     scripts can't resolve app packages).
  7. Source deploy workflows (`deploy.yml`, `deploy-gke.yml`) are excluded until Phase 8 rebuilds them
     per-app (phase-1 review C2; approved with deviation 2). The tracked source `.env` (public Supabase
     values for the Lovable build) is excluded too: Lovable decoupling completed 2026-10-05 (roadmap.md),
     nothing builds through it. Sync parity is enforced by `scripts/refactor/parity.mjs` against
     `docs/refactor/sync-exclusions.txt` (C2).
- **Gate output:** `bunx turbo run typecheck lint` → clean, 0 lint errors (271 pre-existing warnings, same
  as source). `node scripts/migrate-pg.mjs` ×2 → second run no-op. Full suite: **89 files / 1,367 tests /
  0 fail** — equals the source repo's counts. `bun run agents:lock` → 23 agents, no diff. `depcruise` →
  0 errors, 173 warn (the §1.2 cycles, armed at warn per plan). `bunx turbo run build` → vite + voice
  worker + parser worker bundles green. Boot check: dev server on :9101, `POST /api/auth/login` 200 with a
  local admin, `/api/auth/me` 200 with the session cookie. `inventory.mjs`: 607 mapped, 0 unmapped.
  Forbidden-file grep over `git ls-files`: 0 hits.
- **Test count before → after:** identical (89 / 1,367) — layout moved, nothing added or dropped.
  Third interview-suite flake found and fixed in the new repo's scripts (`agent-event-lineage`:
  `INSERT..RETURNING` resolves before the implicit commit is visible on another pooled connection; the two
  governance-chains tests now poll for visibility). `governance.server.ts` itself untouched (verified
  pristine vs `dcb6a4b`).
- **Phase 2 review conditions (2026-11-24):**
  - **B1 (blocker) — and an important discovery:** the worker-boot crash is real but **not a Phase 2
    regression**: `main`'s freshly-built voice bundle fails identically from a node_modules-less directory
    (same `#tanstack-start-server-fn-resolver` static import — verified by building and booting the source
    at `25d6e6f`). Prod runs `node .output/voice-worker/index.mjs` from an image with only `.output`, so
    this is a latent prod bug on main (or prod runs a stale image). Fixed properly regardless:
    `build-voice-worker.mjs` keeps the Phase-1 externals (Start is bundled, as on main) and now **aliases
    `@tanstack/react-start/server-only` to an empty module** (build plugin) and **emits a
    `tanstack-hash-stubs.mjs` + `package.json` "imports" map** next to the bundle resolving the dead-code
    hash specifier. `build-parser-worker.mjs` gets the same alias (its externals stay). Verified by
    booting both bundles from bare directories: voice reaches `voice_worker.started`, parser prints
    `parser worker listening`, zero module-resolution errors.
  - **CI worker boot smoke** added after the build step: copies both bundles into node_modules-less dirs,
    boots with dummy env, requires the health lines and no resolution errors.
  - **A2:** depcruise ratchet lowered to `WARN_MAX = 171` (verified count at HEAD).
  - **A3 (done early):** `undici ^8.12.3` declared in @ats/security, `zod ^4.6.7` in @ats/config.
  - **A1:** Phase 8 checklist in the plan now demands one `.output` layout and an image-boot proof for
    web + both workers.
  - Deviation 5's grep exception recorded in the team brief's checklist.
  - Handoff test counts corrected: the authoritative full-suite figure is **93 files / 1,386 tests**
    (86 scripts files + 7 package files), per the review's re-run; my earlier "85 / 1,337" counted only
    the scripts loop and missed one file in the awk tally.
- **Correction during PR CI (2026-11-23):** the first Gate 2 run verified `build:web` only; the PR's CI
  turbo build failed on the worker bundles — the new package server entries (the server-only marker; the
  observability chain reaching error-capture) pull @tanstack/start-server-core internals and playwright
  subpaths into the graph, past the old exact-string externals. Fix: both worker build scripts now keep the
  whole @tanstack and playwright scopes external, subpaths included (the deliberate voice de-scoping is
  Phase 7's, map §4). Verified: full `bun run build` green locally and in CI; the voice worker bundle
  contains no Start-server code. Gate 2 counts as green **including worker bundles**.
- **Known gaps / follow-ups:**
  - The 22 PROPOSED table owners (9 agents, 3 interviews, 9 offers, 1 voice) in `table-owners.mjs` await
    Gate 1 approval (§10).
  - `scripts/evals/*.ts` and `scripts/local-e2e/*` paths were rewritten like the rest of scripts/; the evals
    that need real AI keys still skip cleanly when env is absent.
  - dev server env: root `.env.local` is written by `scripts/local-db.sh` but Vite loads env from
    `apps/web/`; boot checks should pass `DATABASE_URL`/`SESSION_SECRET` in the shell until Phase 2's
    `config` package settles env loading.
  - `apps/web/bun.lock` removed; the root `bun.lock` is authoritative (CI installs `--frozen-lockfile`).
  - **A1 root cause (found, phase-1 conditions):** the lineage flake is a **clock-boundary race**, not an
    insert-visibility race. `computeHarness`'s default window is `to: new Date()` (JS clock) while the
    just-written rows carry `createdAt` from the Postgres clock; same-millisecond writes land after `to`
    and the read drops them. Proven with paired timestamps at failure; visibility ruled out first (75/75
    immediate reads). The governance-chains tests now read with an explicit window past their writes; the
    polling workaround was removed. Same fix landed in the source repo (branch `fix/lineage-clock-window`).
- **Questions for reviewer:**
  1. Approve the 22 proposed table owners (`scripts/refactor/table-owners.mjs`, §10 rule: writer owns).
  2. Approve the `std` package decision (map §4, dated note) and the six deviations above.
  3. Confirm the phase-flow preference for Phase 2: per-package PR sets in this same local repo (no remote
     yet), or set up a remote first?

### Phase 0 handoff: 2026-11-23

- **Branch / PRs:** `chore/p0-fixes` (based on `main` `39ce992`), merged as **PR #80** → `main` `ca7599c`
  (CI green, 3m40s). 4 commits:
  `ab71e15` test(pipeline): stage-pipeline coverage + CI/test glob (0.2, 0.3) ·
  `746bb09` test: mock-usage assertions + two test-race fixes (0.4) ·
  `a1c73a8` fix(security): rate-limit `/api/auth/confirm`, `/me`, `/session` (0.5) ·
  `fdce7e1` docs: cron table, env example, generated-docs protection (0.6).
- **Source sync:** n/a (this phase edits the source repo itself).
- **Change PRs (logic):**
  - `src/server.ts`: new `isAuthReadPath`; confirm limited on every method (tighter auth budget, shared
    bucket with POST), `session`/`me` limited per caller-per-path on the normal budget (map §6 gap closed).
  - `scripts/agent-interview-slots.test.ts`: `markUnsent()` replaces the outbox row with a fresh
    not-yet-due copy — the old re-queue raced the fire-and-forget outbox drain (root cause of the flake).
  - `scripts/agent-interview-panel.test.ts` (second, pre-existing flake found by the full-suite run):
    `book()` now selects the newest interview row for (application, level); the unordered select raced
    re-bookings of the same level.
  - 14 test files: every `mock.module` now asserts it was applied (counter/marker after the code ran);
    8 more files already asserted and were only verified.
  - CI (`.github/workflows/ci.yml`) and `package.json` "test": every `scripts/*.test.ts` runs, **one bun
    process per file** — see deviation below.
- **Deviations from the brief:**
  - 0.3 is a per-file loop (`for f in scripts/*.test.ts; do bun test "$f"; done`), not the bare
    `bun test scripts/` glob: bun's `mock.module` is process-global, so a single-process run leaks mocks
    across files (`agent-gateway`'s `{ db: {} }` mock breaks every DB-backed file after it). Verified:
    the bare glob fails, the per-file loop passes 89/89.
  - `docs/voice-scheduling-call-plan.md` was **not** added to `.prettierignore`: it is hand-written (only
    referenced by `scripts/scheduling-call.test.ts`), not generated. Generated docs protected: the charter
    (already) and `docs/er-diagram.md` (now), which was also regenerated after the hook had mangled it.
  - Coverage numbers differ from the brief's estimate: 89 test files at `39ce992`; the old CI list covered
    57, `package.json` 36, union 82 — **31 files newly covered, 7 of which ran in neither place before**
    (agent-review-loop, hiring-sla, interview-confirmations, interviewer-brief, panel-changes, panel-directory,
    scorecard-chase…). No test needed an AI-key skip guard (grep found none).
- **Gate output:**
  - `bun run typecheck` → clean. `bun run lint` → 0 errors, 271 pre-existing warnings (none in changed files).
  - Full suite (per-file loop, fresh-migrated `atsagent_test`): **89 files, 1,367 tests, 0 fail**, exit 0.
  - `scripts/pipeline.test.ts`: 26 pass / 256 expects on a from-zero database (verified twice, self-cleaning).
  - `bun run agents:lock` → 23 agents, **no diff**. `rate-limit.test.ts`: 10 pass (6 new dispatch tests
    burst `session`/`me` → 429 on the normal budget, `confirm` GET on the tighter budget).
- **Test count before → after:** `bun run test` ran 36 hand-listed files → runs all 89; 1,367 tests pass
  (26 of them new pipeline coverage; ~30 new mock-liveness/rate-limit assertions).
- **Phase 2 review conditions (2026-11-24):**
  - **B1 (blocker) — and an important discovery:** the worker-boot crash is real but **not a Phase 2
    regression**: `main`'s freshly-built voice bundle fails identically from a node_modules-less directory
    (same `#tanstack-start-server-fn-resolver` static import — verified by building and booting the source
    at `25d6e6f`). Prod runs `node .output/voice-worker/index.mjs` from an image with only `.output`, so
    this is a latent prod bug on main (or prod runs a stale image). Fixed properly regardless:
    `build-voice-worker.mjs` keeps the Phase-1 externals (Start is bundled, as on main) and now **aliases
    `@tanstack/react-start/server-only` to an empty module** (build plugin) and **emits a
    `tanstack-hash-stubs.mjs` + `package.json` "imports" map** next to the bundle resolving the dead-code
    hash specifier. `build-parser-worker.mjs` gets the same alias (its externals stay). Verified by
    booting both bundles from bare directories: voice reaches `voice_worker.started`, parser prints
    `parser worker listening`, zero module-resolution errors.
  - **CI worker boot smoke** added after the build step: copies both bundles into node_modules-less dirs,
    boots with dummy env, requires the health lines and no resolution errors.
  - **A2:** depcruise ratchet lowered to `WARN_MAX = 171` (verified count at HEAD).
  - **A3 (done early):** `undici ^8.12.3` declared in @ats/security, `zod ^4.6.7` in @ats/config.
  - **A1:** Phase 8 checklist in the plan now demands one `.output` layout and an image-boot proof for
    web + both workers.
  - Deviation 5's grep exception recorded in the team brief's checklist.
  - Handoff test counts corrected: the authoritative full-suite figure is **93 files / 1,386 tests**
    (86 scripts files + 7 package files), per the review's re-run; my earlier "85 / 1,337" counted only
    the scripts loop and missed one file in the awk tally.
- **Correction during PR CI (2026-11-23):** the first Gate 2 run verified `build:web` only; the PR's CI
  turbo build failed on the worker bundles — the new package server entries (the server-only marker; the
  observability chain reaching error-capture) pull @tanstack/start-server-core internals and playwright
  subpaths into the graph, past the old exact-string externals. Fix: both worker build scripts now keep the
  whole @tanstack and playwright scopes external, subpaths included (the deliberate voice de-scoping is
  Phase 7's, map §4). Verified: full `bun run build` green locally and in CI; the voice worker bundle
  contains no Start-server code. Gate 2 counts as green **including worker bundles**.
- **Known gaps / follow-ups:**
  - **Known-writers list grew beyond the brief's list** (encoded in `pipeline.test.ts` as
    `KNOWN_STAGE_WRITERS`): also `src/lib/lifecycle.functions.ts` (bulk stage move bypassing `moveStageCore`),
    `src/lib/matching.functions.ts`, `src/lib/interviews.functions.ts` (two writers), and a second INSERT —
    `src/lib/candidates.functions.ts` create-candidate (`stage: "sourced"`), beside collaboration. Phase 5
    funnels all of these through pipeline cores; target is an empty list.
  - Pre-existing prod observation, no behaviour change made: `processEmailOutbox` writes status by bare
    `where id`, so a concurrent supersede/withdraw can be overwritten (lost update). Recorded, out of scope.
  - Pre-existing cross-file mock leakage is now _documented_ in CI (per-file loop) — if bun ever scopes
    `mock.module` per file, the loop can collapse back to the glob.
  - 20 files fail `prettier --check` for reasons that predate this branch (docs, design html, ci.yml
    comment); CI does not gate formatting. `DEPLOYMENT-GCP.md` was prettier-formatted whole-file in
    `fdce7e1` (it now passes).
  - Hydration warning on every page in dev (merge-session note): still not investigated.
- **Graph re-run at `39ce992` (map-update input; tools live in `ATSAgent_refactored/scripts/refactor/`,
  baseline copies `graph-7990feb.json` / `edges-7990feb.json`, new output `analyze-39ce992.txt`):**
  - 607 src files (+98 / −1, net +32.9k lines). **Schema is now 125 tables / 299 FKs** (map §7 lists 102) —
    23 new tables need owners in Phase 1's `table-owners.mjs`.
  - **New wrong-way imports** (map §1.2 additions):
    - **S7 new instance:** `drizzle/schema.ts:1292` → `$type<import("../src/lib/offer-check").OfferCheck>`
      (`offer-check.ts` is pure zod — same json-types treatment as the other four).
    - `server/hiring-sla.server.ts` (new, draft-domain "core") → `desk.server.ts` + `lib/lifecycle.ts`.
    - `desk.server.ts` → voice internals, 5 dynamic imports (`request.server` OPEN_CALL ×2 + requestScreeningCall,
      `settings.server`, `schedule`, `call-brief.server`) — a within-L4 edge the map does not list.
    - `lib/slot-offers.server.ts` (interviews) → `voice/scheduling-request.server.ts` — completes an
      `interviews ↔ voice` cycle pair (voice→interviews already had 10 edges).
    - `lib/copilot.functions.ts` → runtime import of `NAV_GROUPS` from `components/nav-config` (server-fn → UI).
  - **24 new files (~8.9k lines) are unmapped by `domains-draft-v1.mjs`** — Phase 1's final `domains.mjs`
    must place them: pay-* (6), labour-policy, workflow-templates, agent-intelligence/governance/reports/
    modality, call-reviews, hiring-oversight, iso, appearance, demand-outlook, pool-coverage, report-window,
    weight-advice, copilot server (2), src/server.ts.
  - Candidates for the map: pay-*/labour-policy/offer-check → offers or a new "policy" area (decision needed);
    workflows/agent-intelligence/governance → agents; copilot server → desk; iso/appearance/report-window →
    shared utils; `hiring-sla.server` → org or L4.
- **Questions for reviewer:**
  1. Map updates for the new wrong-way imports above (esp. `desk → voice`: list the edge in §4 L4, or
     require the voice public API?), and the 23 new tables' owners — approve before Phase 1 freezes `domains.mjs`.
  2. ~~Confirm `chore/p0-fixes` merges to `main` as one PR (4 commits)~~ — done: PR #80 merged as one PR;
     `SOURCE_SHA` = `ca7599c`.
  3. The pre-commit hook will keep reformatting hand-written docs that fail `prettier --check` on touch;
     leave as-is (CI doesn't gate it) or a deliberate whole-repo format commit?

### Phase 9a review fixes (Dev 3, 2026-11-24 — review 9a, changes requested)

All blockers and notes from `reviews/phase-9a-review.md` are addressed on `services/9a-template`:

- **B1 ingress:** IP heuristic removed. Production now 404s any request that **carries X-Forwarded-For**
  (in-cluster callers connect directly and carry none); no-XFF + valid token → allowed. Both production-mode
  tests added. Infra note in `20-ingress.yaml` now instructs a Cloud Armor policy / BackendConfig denying
  `/api/internal/*` at the public LB. (The reviewer's point was correct and the old test proved it: the
  real in-cluster caller has no XFF, `clientIp()` returns "unknown", the heuristic 404'd it.)
- **B2:** migration renamed `0092_service_tokens.sql` → `0094_service_tokens.sql` (source repo's 0092/0093
  land at Dev 1's next sync); `service_tokens` added to `scripts/refactor/table-owners.mjs` → **platform**
  and recorded in map §7 with date/reason. Applied twice locally against `atsagent_test` (old 0092 artifacts
  dropped first).
- **A1 (done now):** `service_tokens.allowed_features` jsonb column; `rotateServiceToken` and the platform
  rotation server fn take an allow-list; the route 403s a non-listed feature ("empty list = every feature",
  documented). **Deferred explicitly:** the service name in the ledger — `ai_usage_events` has no metadata
  column, and adding one plus a `recordAiUsage` signature change touches the shared ledger + gateway that
  Dev 1 is moving in Phase 3. Propose folding it there; flag if it should happen sooner.
- **Notes:** route comment now spells out that "AI consent" = the org's own saved provider key (AI-use
  consent), separate from training-capture consent (`training_settings`); the SERVICE_TOKENS env bootstrap
  lifecycle (delete the var after the first rotation) is documented in `internal-ai.server.ts` and the route.

Gate re-run: 25 tests green (route 24 + 429 dispatch), ruff/mypy/pytest green, contracts `--check` green,
turbo typecheck green, eslint 0 errors, `agents:lock` no diff, table-owners check "every table owned".

### Phase 9a follow-up (pre-9b, 2026-11-24): allow-lists are explicit

Per the reviewer's approval condition: an **empty allowedFeatures now denies every feature** (previously
empty = unrestricted). The route 403s any feature not in the token's list, and the env bootstrap list is
scoped by a new `SERVICE_TOKEN_FEATURES` var (empty/missing = authorises nothing) — so nothing can call the
callback without an explicit list. 26 tests green (new: empty list denies; bootstrap without features
denies). Operators rotate tokens with explicit lists; `SERVICE_TOKENS`/`SERVICE_TOKEN_FEATURES` are deleted
together after the first rotation.
