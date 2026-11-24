# Phase 2 review: L0 foundation (madhugraj/ATSAgent_refactored#4)

- **Reviewed:** `refactor/p2-l0-foundation` @ `4e80cc9` (9 commits on `main`), `SOURCE_SHA` `25d6e6f`
- **Reviewer:** Claude, fresh checkout at `../ATSAgent_refactored-review`
- **Date:** 2026-11-24
- **Verdict:** **CHANGES REQUESTED.** There is one blocker (B1): the voice worker no longer starts in a production-shaped image. Everything else passes.

## Gate 2, re-run independently

| Check                                                                       | Result                                                                                                                                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| install, `turbo typecheck --force`                                          | ✅                                                                                                                                                                        |
| lint                                                                        | ✅ 0 errors, 271 warnings                                                                                                                                                 |
| prettier `--check`                                                          | ✅                                                                                                                                                                        |
| table owners                                                                | ✅                                                                                                                                                                        |
| depcruise ratchet                                                           | ✅ **171** warnings (max 173). Lower `WARN_MAX` to 171.                                                                                                                   |
| migrations ×2 (fresh `*_test` DB)                                           | ✅ 96 applied, then "up to date"                                                                                                                                          |
| `turbo run test` (packages)                                                 | ✅                                                                                                                                                                        |
| Full suite: 86 `scripts/` files + 7 package files, one process each         | ✅ **93 files, 1,386 pass, 0 fail**                                                                                                                                       |
| agents:lock                                                                 | ✅ no diff                                                                                                                                                                |
| `turbo run build --force`                                                   | ✅                                                                                                                                                                        |
| Client bundle grep (`SECRET_ENCRYPTION_KEY`, `DATABASE_URL`, `node:crypto`) | ✅ 0 hits                                                                                                                                                                 |
| AsyncLocalStorage                                                           | ✅ the request context lives only in `@ats/observability` (single instance)                                                                                               |
| Test parity vs source `25d6e6f`                                             | ✅ 90 source files: 4 moved into packages, 86 stay. 3 new package suites. Nothing dropped. (The handoff's "85 files / 1,337" undercounts; there are 86 `scripts/` files.) |
| S7                                                                          | ✅ 5 shapes in `packages/db/src/server/json-types/`. 2 app-relative `$type` refs remain (deviation 3).                                                                    |

## Blocker

### B1. The voice worker crashes at startup in production

The fix in `7fe8a76` makes all of `@tanstack/*` external in `scripts/build-voice-worker.mjs`.

The bundle (`.output/voice-worker/index.mjs`) now has **top-level static imports** of `@tanstack/react-start`, `@tanstack/react-start/server` and `@tanstack/react-start/server-only`. For example:

- lines 216481–216482: `createMiddleware`, `createServerOnlyFn`, `getRequest`
- five `createServerFn` imports

The runtime image copies **only `.output`**, with no `node_modules` (`apps/web/Dockerfile` final stage). GKE runs `node .output/voice-worker/index.mjs`.

**Reproduced:** I copied `.output/voice-worker` into an empty directory and ran it with `node`:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@tanstack/react-start' imported from …/voice-worker/index.mjs
```

The parser worker, run the same way, starts fine ("parser worker listening").

So the handoff's claim that the voice worker "carries zero Start-server code" is wrong. The Start code is still referenced; it's just no longer bundled. CI is green only because CI runs inside the repo, where `node_modules` resolves the package.

**Fix (pick one):**

- Go back to the previous externals for the voice worker (`#tanstack-*`, `tanstack-start-*`, playwright, chromium-bidi), so `@tanstack/react-start` is bundled again as it was on `main`. Then in the worker build only, alias `@tanstack/react-start/server-only` to an empty module (an esbuild/bun plugin `onResolve`). That handles the new marker imports.
- Or keep the scope external, and also ship a pruned `node_modules` for the workers in the image. That's more moving parts; I don't recommend it.

**Required with the fix: a CI smoke step.**

1. After `turbo run build`, copy `.output/voice-worker` and `.output/parser-worker` into a temp dir that has no `node_modules`.
2. Start each with `node` and dummy env.
3. Assert it reaches its "listening" or health line within 10 s.

This class of bug is invisible to every check we have today.

## Advisory

- **A1. Image layout, for Phase 8.**
  - The workers build to the repo root `.output/`, but the web Nitro build now lands in `apps/web/.output/`.
  - The Dockerfile copies `/app/.output`, which as checked out has only the workers.
  - It depends on the build context, but an image built today would likely lack `.output/server`.
  - Deploy is deferred to Phase 8 (deviation 7). Add "one `.output` layout; image boots web + both workers" to the Phase 8 checklist so it isn't missed.
- **A2. Ratchet.** depcruise is at 171. Lower `WARN_MAX` to 171 in this PR, so the gain is locked in.
- **A3. Deviation 7: declare the undeclared runtime deps now** (`undici` in security, `zod` in config). It's two lines, and the hoisted linker hides the mistake until someone changes it. Required by the end of Phase 3.

## Answers to the executor's questions

- **Deviations 1–8:** approved, with the A3 condition on deviation 7. Deviation 5's grep exception is OK. Record it in the brief as "UI regex literal in the org-ontology skill tags; not a credential".
- **Hybrid shims for the four lib files:** approved until their L3 packages land (interviews in Phase 5, offers in Phase 6). Every shim must keep its `// SHIM: remove in Phase 8` marker. There are 23 today.
- **SLO notify-injection PR (map §4):** still owed. Do it in Phase 3, before the parser-worker de-scoping relies on it.

## To approve

1. B1 is fixed.
2. The worker smoke step is in CI and green.
3. `WARN_MAX` is set to 171.

Then I'll approve #4, and Phase 3 can start.
