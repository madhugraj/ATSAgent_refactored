"""ATSAgent analytics-ml service — Phase 9b shadow of three TS analytics
computations (bias report, demand outlook, pool coverage).

Advisory-only by design: nothing automated acts on these numbers (the bias
watch appends to the audit trail; the copilot explains them). The payloads
carry the input rows — the service never touches Postgres (plan rule 1),
holds nothing at rest (rule 7) and uses no AI keys (rule 4): the demand
outlook's market signal is AI/web-research TS-side and rides in as labelled
input.
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime
from typing import Any

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from app.analytics import (
    compute_coverage,
    history_quarters,
    rank_outlook,
    role_trends,
    selection_parity,
    summarise_coverage,
)
from app.auth import require_service_token

SERVICE_NAME = os.environ.get("SERVICE_NAME", "analytics-ml")

logger = logging.getLogger(f"ats.service.{SERVICE_NAME}")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="atsiq-analytics-ml-service", docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}


def _now(payload: dict[str, Any]) -> datetime:
    raw = payload.get("now")
    try:
        return (
            datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            if raw
            else datetime.now(UTC)
        )
    except ValueError:
        return datetime.now(UTC)


@app.post("/selection-parity", dependencies=[Depends(require_service_token)])
async def selection_parity_endpoint(request: Request) -> JSONResponse:
    payload = await request.json()
    return JSONResponse(selection_parity(payload.get("pairs", [])))


@app.post("/pool-coverage", dependencies=[Depends(require_service_token)])
async def pool_coverage_endpoint(request: Request) -> JSONResponse:
    payload = await request.json()
    rows = compute_coverage(payload.get("demands", []), payload.get("pool", []), _now(payload))
    return JSONResponse({"rows": rows, "summary": summarise_coverage(rows)})


@app.post("/demand-outlook", dependencies=[Depends(require_service_token)])
async def demand_outlook_endpoint(request: Request) -> JSONResponse:
    payload = await request.json()
    now = _now(payload)
    reqs = payload.get("requisitions", [])
    trends = role_trends(reqs, now)
    horizon = history_quarters(reqs, now)
    rows = rank_outlook(
        trends,
        payload.get("market", []),
        payload.get("emerging", []),
        payload.get("coverage", []),
        horizon,
        bool(payload.get("marketGrounded")),
        int(payload.get("limit", 10)),
    )
    return JSONResponse(
        {
            "generatedAt": now.isoformat(),
            "historyQuarters": horizon,
            "thinHistory": horizon < 4,
            "marketGrounded": bool(payload.get("marketGrounded")),
            "marketAvailable": bool(payload.get("market")),
            "rows": rows,
            "trends": trends,
        }
    )
