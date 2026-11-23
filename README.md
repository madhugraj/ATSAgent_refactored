# ATSAgent_refactored

ATSAgent restructured as a monorepo: one TanStack Start web app, two worker apps, and layered domain packages.

Read in this order:

1. `docs/refactor/00-TEAM-BRIEF.md`: **start here**. The team prompt, rules, phase-by-phase steps, templates
2. `docs/refactor/01-module-boundary-map.md`: current-state facts, the architecture decision, packages and layers, rules, events, security owners, table owners
3. `docs/refactor/02-implementation-plan.md`: phases 0–10, gates, sync and review protocol
4. `docs/refactor/phase-log.md`: progress, handoff notes, sign-offs
5. `docs/refactor/evidence/`: the module reviews and import matrix behind the map
6. `scripts/refactor/`: import-graph tools (`graph.mjs <repo>` then `analyze.mjs`). `domains-draft-v1.mjs` is the draft mapping to correct in Phase 1.

Reviews run in a separate folder: `../ATSAgent_refactored-review` (a git worktree, created at the first review).
