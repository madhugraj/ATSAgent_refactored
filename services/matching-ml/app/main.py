"""ATSAgent matching-ml service — Phase 9b shadow of the TS matching scorer.

Scores only. The request is the derived features dict (the AI extraction
already done TS-side through aiJson feature ``candidate_score`` — no AI keys
here, plan rule 4) plus the weights, custom dimensions, blended social score,
experience band and the request timestamp. The response is the deterministic
arithmetic: per-feature scores, career metrics/flags, contributions and the
clamped overall. The recommendation gates never exist here — they stay in TS
(gatedRecommendation), so this service cannot select, reject or hold anyone.

Stateless (plan rule 7): nothing at rest, no files, no outbound calls.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from app.auth import require_service_token
from app.scoring import score

SERVICE_NAME = os.environ.get("SERVICE_NAME", "matching-ml")

logger = logging.getLogger(f"ats.service.{SERVICE_NAME}")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="atsiq-matching-ml-service", docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.post("/score", dependencies=[Depends(require_service_token)])
async def score_endpoint(request: Request) -> JSONResponse:
    started = time.perf_counter()
    payload = await request.json()
    now_raw = payload.get("now")
    try:
        now = (
            datetime.fromisoformat(str(now_raw).replace("Z", "+00:00"))
            if now_raw
            else datetime.now(UTC)
        )
    except ValueError:
        now = datetime.now(UTC)
    try:
        result = score(payload, now)
    except Exception:  # noqa: BLE001 — generic 422; the error detail never leaves
        logger.warning("matching.shadow_score_failed", extra={"org_id": payload.get("orgId")})
        return JSONResponse({"error": "could not score"}, status_code=422)
    logger.info(
        "matching.shadow_scored",
        extra={
            "ms": round((time.perf_counter() - started) * 1000),
            "overall": result.get("overall"),
        },
    )
    return JSONResponse(result)
