# ats-parser-service (Phase 9b shadow)

Python shadow of the TS parser worker (`apps/web/src/server/parser/worker.ts`
in the monorepo = `src/server/parser/worker.ts` in the source repo). Same
wire (`POST /parse`, octet-stream + `x-file-name` + `x-parser-token`,
`{ text }` responses, 401/413/504/422), same extraction semantics
(hidden-text removal with the `[Hidden text removed from this document: N
characters]` marker, 15 MB cap, 30-page cap, DOCX XML cap, entity decode).

Shadow mode (refactor plan Phase 9): the TS parse stays the served result;
`apps/web/src/server/parser/shadow.ts` fires the same payload here
(`PARSER_SHADOW_URL`, off by default) and logs a hash-level diff. This
service holds no candidate data at rest — document bytes exist only inside
one request handler.

Engine: pdfminer.six with an interpreter/aggregator subclass restoring
render mode (`Tr`) and painted-background/image flags for the hidden-text
classification (see `app/extraction.py` header for the two known parity
gaps vs pdf.js). DOCX/text paths are direct ports.

Gates: `uv run ruff check app tests` · `uv run mypy app` · `uv run pytest`.
Contract: `apps/web/src/lib/parser-shadow.contract.ts` → generated Pydantic
twin in `app/contracts_gen` (drift-checked in CI).

Known deviations (for the reviewer):

- Auth fails closed even with no token configured (the worker allows
  unauthenticated local dev when `PARSER_TOKEN` is unset and undeployed).
- PDF `painted_background` is a per-page aggregate (pdf.js evaluates it per
  show-text op in stream order).
