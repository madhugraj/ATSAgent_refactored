# Phase 3 review: L1 platform (madhugraj/ATSAgent_refactored#15)

- **Reviewed:** `refactor/p3-l1-platform` @ `b2cdf5b`, `SOURCE_SHA` `3d55eb1` (sync to `bca8574` staged separately on `sync/bca8574`)
- **Reviewer:** Claude, fresh checkout with its own `bun install` (real `node_modules`, not a symlink) and its own test DB
- **Date:** 2026-11-25
- **Verdict:** **APPROVE**, with one condition before merge: lower `WARN_MAX` to 114 (C1).

## Gate 3, re-run independently

| Check                                                                  | Result                                                                                                                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| install, `turbo typecheck --force`                                     | ✅                                                                                                                                                               |
| lint                                                                   | ✅ 0 errors, 271 warnings                                                                                                                                        |
| prettier                                                               | ✅                                                                                                                                                               |
| table owners                                                           | ✅                                                                                                                                                               |
| depcruise                                                              | ✅ **114** warnings (ratchet max 171), down 57                                                                                                                   |
| migrations (fresh DB)                                                  | ✅ 97                                                                                                                                                            |
| package tests (turbo)                                                  | ✅                                                                                                                                                               |
| Full suite: every `scripts/*.test.ts` + package test, one process each | ✅ **106 files, 1,468 pass, 0 fail**                                                                                                                             |
| `agents:lock`                                                          | ✅ no diff                                                                                                                                                       |
| `turbo build --force`                                                  | ✅                                                                                                                                                               |
| `worker-boot-smoke.sh`                                                 | ✅ voice, parser **and web server** boot without `node_modules`; the SLO alert mailer and the kernel/ai/observability load-once guards are present in the bundle |

## Invariants checked

- **The `requireOrg` / `requireRole` / `requireOrgOwner` / `requirePlatformAdmin` surface is unchanged.**
  - `auth.middleware.ts` now re-exports `assertRole`, `activeOrgOf`, `isPanelOnly`, `assertNotPanelOnly` and the types from `@ats/auth`. The names are the same.
  - The TanStack wrapper stays in the app.
- **Kernel cycle fix: behaviour is the same.**
  - Old: `emitAgentEvent` inserts the row, then `await import(orchestrator)`, then `kickAgents()` (not awaited), all inside a try/catch that logs.
  - New: it inserts the row, then calls the registered handlers in order (`boot.ts` registers `kickAgents`), inside the same try/catch.
  - The kick is still fire-and-forget, and errors are still logged.
  - `AGENT_INLINE_KICK=0` in the voice worker is kept, because the guard lives inside `kickAgents`.
  - Kernel has no orchestrator imports.
  - `boot.ts` is in `sideEffects`, and the smoke test checks the build so tree-shaking can't silently drop it.
- **Shared entries are browser-safe.** `ai`, `config`, `db` and `storage` mention "server-only" or `node:` only in comments. No `/shared` entry imports `server-only` or a Node built-in. (This covers Developer 2's ruling-6 concern.)
- **ALS / load-once guards:** they're armed in the kernel, ai and observability server entries. The `als-single-instance` test proves a real second import throws, and the built bundle contains the guards.
- **AI gateway:**
  - The whole gateway moved to `@ats/ai`.
  - The call-path audit test enforces three things: providers are called only from the gateway, features use `AI_FEATURES` slugs, and no `model`/`engine` reaches a server-function response outside a documented baseline.
  - The 17 gateway mocks and the ledger mock were re-pointed, and their usage assertions pass.
- **platform-http parity:** 12 prefixes and 4 CSRF origins match `bca8574` (the parity script is mutation-tested). The burst tests cover every limiter branch, including `/api/agents/*`, `/api/mcp`, `/api/workflows/*` and the tighter budget for `confirm`.
- **SLO notify injection:** observability has no comms or mail imports. `boot.ts` registers the same recipients and idempotency keys as before.

## Conditions

**C1 (before merge). Lower `WARN_MAX` from 171 to 114.** The ratchet only goes down, and this PR earns the drop. Without it, the next 57 new violations would pass CI silently.

## Rulings on the executor's questions

1. **The 12 new sync edges (`sync/bca8574`, #87/#90):** **approved as temporary**, recorded in map §10 as "freeze-exception edges, resolved in Phase 7". They are all in voice, orchestrator and interviews, which are L4/L3 work Phase 7 untangles. The sync PR may set `WARN_MAX` to **114 + 12 = 126 at most**, with the edges listed in the PR. That's a one-off exception: the number may not go above what the sync adds.
2. **Vendor-leak findings** (corrected 2026-11-25 after Developer 2 checked them):
   - **`salary-benchmark`, `onboarding`, `verification`, `assessment`: verified false positives.** Every
     `model:` hit is a **DB write** (`.values` / `.set`), and the wire returns exclude the field: `toWire(row)`
     leaves it out, `{status, note}`, `{ok}`, and `{model: _model, ...wire}`. No invariant breach, so **no source
     change** (moving the writes now would be refactor churn during the freeze).
   - **Developer 1:** annotate those baseline entries as "verified false positive: persisted column, not returned",
     or tighten the audit to skip `.set({…})` / `.values({…})` blocks, as a small follow-up after #15.
   - The core extractions stay with the Phase 6 change PRs (offers, onboarding, interviews).
   - **`ontology.functions` `stats.model: engine`:** check it. If it carries a vendor or model name, strip it from the
     wire. If it's a neutral label, rename the field.
   - **`platform-ai-usage` (the platform admin page shows model names):** **product decision.** Strip them, or amend
     the AGENTS.md invariant to allow the internal platform-admin console.
3. **platform-http shape** (`server.ts` about 30 lines, `pipeline.ts` composable): **matches the Option-B intent.** Approved.

## Deviations

1. Interim tsconfig paths: approved.
2. Gateway split deferred: approved; a later change PR.
3. Auth core without `createServerOnlyFn`: approved (the server entry keeps the marker).
4. Merging `main` in instead of rebasing: approved. Resolving the #13 `withToday` port into `@ats/ai` is correct.

**After merge:** rebase `sync/bca8574` and open it as its own PR for review. Phase 4 can start: Developer 1 `desk-core`/`org`, Developer 2 `legal` → `comms` → `integrations`.
