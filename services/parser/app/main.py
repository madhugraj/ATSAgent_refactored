"""ATSAgent parser service — Phase 9b shadow of the TS parser worker.

Wire parity with src/server/parser/worker.ts (the service this shadows):

- ``GET /healthz`` → ``{ ok: true }``, no auth.
- ``POST /parse`` — body is the raw document bytes
  (``application/octet-stream``), file name in ``x-file-name``
  (URL-encoded, truncated to 300 chars by the client), auth in
  ``x-parser-token``. Responses: 200 ``{ text }``; 401 generic; 413
  ``{ error: "too large" }`` over 15,000,000 bytes; 504
  ``{ error: "parse timed out" }`` past ``PARSE_LIMIT_MS``; 422
  ``{ error: "could not parse" }`` for anything else.

Stateless by construction (plan rule 7): document bytes live only inside the
request handler — no temp files, no database, no outbound calls.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from urllib.parse import unquote

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from app.auth import require_parser_token
from app.extraction import extract_text

SERVICE_NAME = os.environ.get("SERVICE_NAME", "parser")
PARSE_LIMIT_MS = int(os.environ.get("PARSE_LIMIT_MS", "30000"))
MAX_BYTES = 15_000_000

logger = logging.getLogger(f"ats.service.{SERVICE_NAME}")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="atsiq-parser-service", docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.post("/parse", dependencies=[Depends(require_parser_token)])
async def parse(request: Request) -> JSONResponse:
    declared = request.headers.get("content-length")
    if declared and int(declared) > MAX_BYTES:
        return JSONResponse({"error": "too large"}, status_code=413)
    filename = unquote(request.headers.get("x-file-name", "document")[:300] or "document")
    content = await request.body()
    if len(content) > MAX_BYTES:
        return JSONResponse({"error": "too large"}, status_code=413)
    started = time.perf_counter()
    try:
        text = await asyncio.wait_for(
            asyncio.to_thread(extract_text, filename, content), timeout=PARSE_LIMIT_MS / 1000
        )
    except TimeoutError:
        logger.warning("parser.shadow_parse_timeout", extra={"filename_len": len(filename)})
        return JSONResponse({"error": "parse timed out"}, status_code=504)
    except Exception:  # noqa: BLE001 — generic 422, the error message never leaves
        logger.warning("parser.shadow_parse_failed", extra={"filename_len": len(filename)})
        return JSONResponse({"error": "could not parse"}, status_code=422)
    logger.info(
        "parser.shadow_parsed",
        extra={"ms": round((time.perf_counter() - started) * 1000), "chars": len(text)},
    )
    return JSONResponse({"text": text})
