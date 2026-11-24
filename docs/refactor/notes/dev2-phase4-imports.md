# Dev 2 — Phase 4 (legal, comms, integrations): what @ats/auth and @ats/kernel will export

Phase 3 lands these two packages before your Phase 4 work starts (executor, Dev 1). Your packages may plan
test-only prep in the source repo against the CURRENT paths — every path below has a 1:1 shim at move time.

## @ats/auth (Phase 3, lands first)

`./shared` (browser-safe, planned):

- `lib/oauth-state` pure helpers, `lib/password-policy`, `lib/work-email` — each file stays whole; files that
  turn out to import node: or db go to `./server` instead (executor notes the final placement in the handoff).

`./server`:

- identity, password, step-up, action-token, claims, oauth-state (server parts of the moved files)
- `resolveOrgContext`, `assertRole`, `actorFor`, `LifecycleActor`, `APPROVER_ROLE` (extracted from
  lib/auth.middleware.ts + requisitions.server.ts — source: map §4 L1)
- Invariants: `requireOrg/requireRole/requireOrgOwner/requirePlatformAdmin` keep their names/behaviour;
  `apps/web/src/lib/auth.middleware.ts` stays in the app as the thin TanStack wrapper importing from
  `@ats/auth/server`.

Your packages' likely imports:

- integrations: `@ats/auth/server` oauth-state (LinkedIn / meeting OAuth state), claims
- comms: `@ats/auth/server` identity/claims (recipient resolution) — as needed
- legal: none at L1 beyond what it already imports from db/config

## @ats/kernel (Phase 3)

`./server`:

- `emitAgentEvent`, `onAgentEvent` (events.ts — the orchestrator dynamic import is REMOVED; boot.ts wires it)
- policy, registry (incl. the approve/hire refusal regex), manifest.server, task-liveness, hitl, run-messages
- NEW `ports.ts`: `AgentPort {enqueue, cancelStale, afterSubjectsDeleted, kick}`, `onDomainEvent(type, handler)`,
  `onSubjectsDeleted(cb)` — registration API only; implementations register in boot.ts

Your packages' likely imports:

- comms: `@ats/kernel` `onAgentEvent` (stage emails already subscribe via the pipeline — your inbound-mail
  `onInboundMail` is a comms-side registry, Phase 4's own change)
- integrations: none required at L1; meeting-transcript agent triggers go through `AgentPort` in later phases

## Test-only prep guidance (source repo)

Write tests against today's paths; each maps 1:1 at move time:

- `src/lib/oauth-state.ts` → `@ats/auth/shared` (or server), `src/server/step-up.ts` → `@ats/auth/server`, etc.
- Keep tests DB-backed where they are today; bun mock.module paths will be rewritten in the move PR.
