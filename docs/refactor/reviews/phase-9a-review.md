# Phase 9a review: Python services scaffold + internal AI route (madhugraj/ATSAgent_refactored#7)

- **Reviewed:** `services/9a-template` @ `85e0914` (6 commits on `main`)
- **Reviewer:** Claude, fresh checkout
- **Date:** 2026-11-24
- **Verdict:** **CHANGES REQUESTED.** There are two blockers. The scaffold, contracts and tests are good.

## Re-run

| Check                                                                                            | Result                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| CI `python-services`                                                                             | ✅ (uv sync, ruff, mypy strict, pytest, contract `--check`)                                                                            |
| CI `verify`                                                                                      | ❌ fails at "every table owned": `service_tokens` has no owner (B2). Because of that, CI never ran the TS tests, so I ran them myself. |
| `turbo typecheck`                                                                                | ✅                                                                                                                                     |
| `internal-ai-route.test.ts` / `internal-ai-rate-limit.test.ts` / `rate-limit.test.ts` (fresh DB) | ✅ 21 / 1 / 10 pass                                                                                                                    |
| `services/_template` pytest                                                                      | ✅ 18 pass                                                                                                                             |

## Spec check (`/api/internal/ai`)

| Requirement                                                         | Status                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Service token stored via `encryptSecret`, compared in constant time | ✅ `timingSafeEqual`, a generic 401                                                        |
| Rotation goes through `writeAudit`                                  | ✅ `internal.service_token.rotated`                                                        |
| Rate-limited                                                        | ✅ `isInternalApiPath` in the general limiter branch                                       |
| CSRF-exempt only because of the token                               | ✅ `csrfGuard` covers only `/api/auth` and `/_serverFn`; the route requires a bearer token |
| `feature` ∈ `AI_FEATURES`, 400 otherwise                            | ✅                                                                                         |
| Org exists and has AI consent, generic 403                          | ✅ consent = has a BYO provider credential (see A2)                                        |
| `untrusted(...)` + `INJECTION_RULES`                                | ✅                                                                                         |
| No vendor or model names in replies or errors                       | ✅ deep strip; gateway errors are made generic                                             |
| Tests for 401 / 400 / 429                                           | ✅                                                                                         |
| Internal ingress only in production                                 | ❌ **B1**                                                                                  |

## Blockers

**B1. In production, the IP gate refuses the legitimate in-cluster caller.**

- What happens:
  - `internalIngressAllowed()` needs `clientIp()` to be a private address.
  - `clientIp()` reads the right-most `X-Forwarded-For` entry, and returns `"unknown"` when there is no `X-Forwarded-For`.
  - A Python pod calling `scouts-app.scouts.svc.cluster.local` goes through no proxy, so it sends no `X-Forwarded-For`.
  - The result is a 404 for every real service call in production. The PR's own test asserts this (`internal-ai-route.test.ts:203`, where `req("")` → refused).
- The gate is also weak in the other direction: it depends on the proxy topology and `TRUSTED_PROXY_COUNT`, not on how the request actually arrived.
- **Fix:**
  - Remove the IP heuristic.
  - Enforce "internal only" where the network can guarantee it:
    1. The public ingress must not route `/api/internal/*`. Add a Cloud Armor or BackendConfig deny rule on the public load balancer, plus a test or manifest check for it.
    2. The route refuses any request that carries `X-Forwarded-For`. Only the public load balancer adds that header, so a request that has it came from outside.
  - Keep the token check as the real authentication.
  - Add a production-mode test: no `X-Forwarded-For` → allowed with a valid token; any `X-Forwarded-For` → 404.

**B2. `service_tokens` has no owner.**

- Add it to `OWNERS` in `scripts/refactor/table-owners.mjs`. It's a platform table, owned by `platform` or `auth`; `platform` is the better fit.
- Also renumber the migration from `0092_service_tokens.sql` to **`0094_…`**. The source repo now has `0092_voice_confirmation_calls.sql` and `0093_panelist_mobile_ask.sql`, which arrive at Developer 1's next sync. The runner tracks file names, so the clash would technically work, but the order would be confusing.

## Advisory

- **A1. Limit features per service.** Today any service token may use any `AI_FEATURES` slug, including agent features, so ledger attribution can be wrong. Add `allowedFeatures` per service token (a column, or a map in config) and return 403 for anything else. Put the service name in the ledger event metadata, so you can tell which service spent the money.
- **A2. Define "AI consent".** "Has its own provider credential" is a reasonable meaning for this route. Note in the handoff that it is **not** the training-capture consent (`captureFeedback`), which stays separate.
- **A3. `SERVICE_TOKENS` env bootstrap.** The bootstrap token sits in env in plaintext. That's acceptable from Secret Manager, but document that it is removed after the first rotation, and log a warning at boot while it's set.
- **A4.** `serviceTokenAuthorized` decrypts every row on every request. That's fine at today's scale (one row per service). Revisit it if the number of tokens grows.

**To approve:** fix B1 and B2 with a production-mode test, CI `verify` green, and A1 done or explicitly deferred.
