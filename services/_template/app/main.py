"""Shared FastAPI service template (refactor plan Phase 9a).

Copy ``services/_template`` per service (``services/<name>``). The template is
never deployed — it exists so every service starts with the same health check,
service-token auth, contract models and AI callback client.

Rules this scaffold enforces (refactor plan Phase 9, non-negotiable):

1. No database access — TS sends the data; the service stores nothing.
2. Everything except ``/healthz`` requires a service token (``app.auth``).
3. Every request carries ``orgId`` (in the payload contract) and ``requestId``
   (in the ``x-request-id`` header); both are logged.
4. No AI provider keys here — LLM calls go back through the TS internal
   endpoint via ``app.ai_client``.
"""

from __future__ import annotations

import logging
import os
import time

from fastapi import Depends, FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.auth import require_service_token
from app.contracts_gen.demo import BiasReportRequest

SERVICE_NAME = os.environ.get("SERVICE_NAME", "_template")

logger = logging.getLogger(f"ats.service.{SERVICE_NAME}")
logging.basicConfig(level=logging.INFO)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log one line per request with method, path, status and requestId."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "http.request %s %s -> %s in %.1fms request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            request.headers.get("x-request-id", "-"),
        )
        return response


app = FastAPI(title="ATSAgent service template", version="0.1.0")
app.add_middleware(RequestLoggingMiddleware)


@app.get("/healthz")
async def healthz() -> dict[str, object]:
    """Liveness probe. No auth: the platform health check carries no token."""
    return {"ok": True, "service": SERVICE_NAME}


@app.post("/v1/bias-report", dependencies=[Depends(require_service_token)])
async def bias_report(request: BiasReportRequest) -> dict[str, object]:
    """Demo protected route, shaped by the generated contract.

    The real selection-parity computation lands with the analytics-ml service
    (9b). The template only echoes the contract back so auth and contract
    plumbing are exercised end to end.
    """
    return {
        "received": True,
        "orgId": request.orgId,
        "applicationId": request.applicationId,
        "window": request.window.model_dump(mode="json"),
    }
