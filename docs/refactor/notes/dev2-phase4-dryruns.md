# Phase 4 dry runs: legal / comms / integrations (Dev 2, 2026-11-24)

Full move rehearsals against Dev 1's Phase 3 branch (`a4008c4`, real `@ats/auth` + `@ats/kernel`),
one scratch worktree per package, nothing pushed. Every gate green in all three: repo typecheck
14/14, lint 0 errors, moved suites pass, depcruise holds the 171 ratchet, `agents:lock` no diff.
This note is the punch list for the real PRs.

## Cross-cutting (for Dev 1)

1. **Placeholder `server-only` in shared entries**: `packages/*/src/shared/index.ts` shipped by
   Phase 3 carries `import "@tanstack/react-start/server-only"`. Legal's dry run had to remove it —
   shared is client-imported (rule 5). **Check every L1/L2 package's shared entry for the same bug**
   before Phase 4 PRs land.
2. **`bun.lock`** changes in all three real PRs (legal: workspace deps @ats/audit+@ats/db +
   drizzle-orm + zod; comms: react 19, @react-email/components|render, nodemailer, workspace deps;
   integrations: workspace deps). Routed through you per phase4-split.
3. **inventory.csv**: `email-templates/*` rows say `comms,shared` — wrong, React templates are
   `comms,server` (map rule 4). Also `tools/refactor/inventory.mjs` doesn't exist in this repo (the
   Phase 1 tooling never landed beyond contracts/depcruise/tsconfig) — Phase 4/5 can't regenerate it.
4. Interim `tsconfig` path aliases (`@/*`, `@db/*` → `../../apps/web/…`) are needed in legal, comms
   and integrations (same block security/ai/kernel already carry) because package typechecks reach
   app code through tests and cross-package dynamic imports. Phase 8 removals.

## legal (rehearsal complete — first real PR is ready to write)

- Moves: `lib/legal/*` → `legal/shared`; `server/org-agreements.server.ts` → `legal/server`;
  `LegalSection` type → `legal/shared/legal-section.ts` (LegalPage imports + re-exports — the one
  allowed component edit). `org-agreements.functions.ts` contains only `createServerFn` exports —
  **nothing to split**, it stays whole in apps/web.
- 7 shims at old paths; app importers untouched (work through shims). Note: shims at the exact old
  path break git rename detection — the real PR description must list old→new paths explicitly.
- Package needs `@ats/audit`, `@ats/db`, `drizzle-orm`, `zod` in package.json.
- **Real PR owes a UI boot check** (PORT=9101 recipe): LegalPage becomes the first client import of
  an `@ats/*` package.
- Moved test needed 3 type-only edits (package `test/` is tsc-checked; `scripts/` never was) —
  expect the same on every test move.

## comms (rehearsal complete — move plan corrected)

- **`local-inbox.server.ts` cannot move whole**: it imports intake.server + onboarding.server (L3,
  incl. dynamic imports), job-channels, cv-text. A whole-file move inverts comms→L3 and cannot
  typecheck. The **transport extraction is a PREREQUISITE** for the email-outbox move, not a
  follow-up: `email-outbox` calls `local-inbox.inboxAddress` via `careersReplyAddress`.
- **`ics.ts` lands in comms/`shared`**, not server: client routes (`interviews.index/mine`) import
  `buildIcs`/`downloadIcs` directly; it's pure (DOM Blob/URL, no node). Map doesn't specify the
  entry — recorded here as the decision.
- **`email-settings.functions.ts`, `email-brand.functions.ts`, `local-inbox.functions.ts` stay in
  apps/web** (createServerFn + middleware, map §2). Only `email-settings.shared.ts` moves.
- **Map gap needing approval**: `send-email` imports `@/server/email-brand.server` (org brand +
  storage logo, cached) — not on the map's comms list. Dry run moved it into comms/server (its
  imports are layer-legal: db/storage/observability). Reviewer sign-off needed as a deviation.
- SLO notify wiring already exists in `apps/web/src/boot.ts` (`setAgentAlertMailer` +
  `setSloNotifier`) — boot imports rewritten to `@ats/comms/server`, no rewiring needed.
- The ~60 email-outbox call sites are dynamic `await import(...)` in voice/agents-tools/desk/panel
  files — mechanical sed, but **agent-prompt-adjacent files: no formatters** (rule 9).
- Package deps: react 19, @react-email/components+render, nodemailer (+types), drizzle-orm,
  workspace @ats/{db,observability,storage}.
- Env gotcha: `@ats/comms`'s own `bun test` pulls config env validation — export DATABASE_URL +
  SESSION_SECRET even for package-level runs (bun loads .env.local by cwd, not repo root).

## integrations (rehearsal complete)

- Moves: `meetings.server`, `meetings-oauth.server`, `meeting-transcripts.server`,
  `meetings.functions` (core part), `linkedin.server`, `calendar-availability.server` →
  `integrations/server`. `linkedin.functions.ts` needed **no split** (only a file-internal type) —
  whole wrapper stays.
- **Credential-store boundary**: integrations needs exactly `readSecrets(integrationId)`,
  `writeSecrets(integrationId, patch)`, `clearSecrets` (+ integration row lookups) from
  `apps/web/src/lib/integrations.server.ts` until Dev 1 moves the store to `@ats/org`.
- **Hidden cycle at the split boundary**: web's `integrations.server.ts` dynamically imports
  `testMeetingProvider` from `@ats/integrations/server`, while the package imports `readSecrets`
  back from web. Runtime-safe only because of dynamic-import laziness — flag for the reviewer; the
  clean fix lands when the credential store moves to `@ats/org`.
- **`exchangeCode` export collision**: `linkedin.server` and `meetings-oauth.server` both export it;
  two `export *` in the index would silently drop the name and break the LinkedIn callback route.
  Index pins `export { exchangeCode } from "./linkedin-oauth.server"`.
- **Recorded deviation needing sign-off**: the extracted `createMeetingLinkCore` drops its
  `createServerOnlyFn` wrapper (precedent: Phase 3 auth core note).
- `meeting-transcripts.server.ts` keeps interim upward deps on app's `meeting-ref` + `vtt` —
  resolves in Phase 6 (`@ats/interviews/shared`).
- Package deps: workspace @ats/{auth,config,db,security}, drizzle-orm, zod.
- Agents' dynamic imports (panel-gate, tools-phase3) rewritten to `@ats/integrations/server` —
  `agents:lock` byte-identical.
