# `services/_template` — the shared Python service scaffold

Phase 9 of the refactor ([plan §9](../../docs/refactor/02-implementation-plan.md)) adds Python
services **next to** the TypeScript app, not instead of it. TS keeps auth, tenancy
(`requireOrg`), the database, the lifecycle cores, agent governance and the AI gateway; Python
takes compute-, ML- and media-heavy work. This directory is the starting point for every
service (`parser`, `matching-ml`, `analytics-ml`, `voice`) — copy it, rename, and delete what
you do not need. The template itself is never deployed.

## Stack

Python 3.12, FastAPI + Uvicorn, Pydantic v2, `uv` (lockfile committed), `pytest`, `ruff`,
`mypy --strict`. Each service ships its own Dockerfile and runs as its own Cloud Run service
on internal ingress (never reachable by browsers).

## Commands

```sh
uv lock && uv sync          # deps (lockfile is committed and CI-checked)
uv run pytest -q            # tests
uv run ruff check app tests
uv run mypy app             # strict
bun tools/contracts/generate.mjs --check   # from the repo root (needs bun)
```

CI (`.github/workflows/ci.yml`, job `python-services`) runs all of the above.

## Layout

```
pyproject.toml       project + ruff/mypy(strict)/pytest config; uv.lock is committed
app/main.py          FastAPI app: /healthz (open) + demo route (token-gated)
app/auth.py          service-token dependency (SERVICE_TOKENS, constant-time compare)
app/ai_client.py     typed client for the TS internal AI callback endpoint
app/contracts_gen/   GENERATED Pydantic models — do not edit
contracts/*.ts       the zod source of every contract (plan Phase 9 rule 5)
tests/               pytest; golden contract fixtures shared with the TS side
Dockerfile           uv base, non-root user, EXPOSE 8080, /healthz healthcheck
```

## The non-negotiable rules (plan §9 — review and CI enforce them)

1. **No database access.** TS sends the data; the service stores nothing.
2. **Called only from TS server code**, through `safeFetch`, with a per-service token.
3. **Every request carries `orgId` (in the contract) and `requestId` (the `x-request-id`
   header)**; both are logged per request.
4. **No AI provider keys in Python.** LLM calls go back through the TS internal endpoint
   (`POST /api/internal/ai`) via `app/ai_client.py` — the gateway ledger, spend caps, consent,
   training capture and vendor stripping all still apply on the TS side.
5. **Contracts come from zod.** Author the schema in `contracts/*.ts`, add it to
   `tools/contracts/manifest.json`, run `bun tools/contracts/generate.mjs`, and commit the
   generated models plus a golden fixture under `tests/golden/`. CI fails on drift.
6. **Agents never call Python directly** — agent tools call TS cores, which may call services.
7. **Erasure:** hold no candidate data at rest; delete temp files per request.

## Service tokens

`app/auth.py` checks `Authorization: Bearer <token>` against the **`SERVICE_TOKENS`** env var
(comma-separated list) with a constant-time compare and a generic 401. The env list is the
per-service _bootstrap_; the durable store is the TS `encryptSecret` credential store, tokens
are **rotated per service** there (through `writeAudit`), and the new list is pushed to the
service at deploy. An empty `SERVICE_TOKENS` fails closed. The TS side uses the same env name
(`apps/web/src/routes/api/internal/ai.ts`), so one token works in both directions of a pair.

## The AI callback

`app/ai_client.py` posts `{feature, input: {system, prompt, orgId}}` to the TS app's
`/api/internal/ai` and validates the reply against the generated `AiCallbackOk` contract
(optional `data` validation via `response_model=`). Non-200 replies raise `AiCallbackError`
with the status. The route is rate-limited on the TS side (`/api/internal` prefix, kept
stable — the limiter keys on it) and never returns vendor or model names.

## Turborepo: deliberately not wired in (decision, 9a)

Plan §9 mentions Turorepo running Python tasks through `package.json` shims. That would put a
`package.json` under `services/*`, which bun workspaces would then try to install with bun.
For now Python quality is owned entirely by the dedicated `python-services` CI job; revisit
only if a service genuinely needs to join a turbo pipeline.

## Copying the template

```sh
cp -R services/_template services/<name>
# rename in pyproject.toml, set SERVICE_NAME, prune the demo route, keep the rules
```
