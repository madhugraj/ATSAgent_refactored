"""The AI callback client, against a stubbed httpx transport (no real server)."""

from __future__ import annotations

import json
import uuid

import httpx
import pytest
from pydantic import BaseModel, ValidationError

from app.ai_client import AiCallbackClient, AiCallbackError

TOKEN = "callback-token-0123456789abcdef"
OK_BODY = {
    "ok": True,
    "data": {"score": 0.5},
    "usage": {"promptTokens": 10, "completionTokens": 5, "totalTokens": 15},
}


class Score(BaseModel):
    score: float


def make_client(handler: httpx.MockTransport) -> AiCallbackClient:
    return AiCallbackClient(
        base_url="https://app.internal", token=TOKEN, transport=handler
    )


async def test_posts_the_contract_shape_and_validates_the_envelope() -> None:
    seen: dict[str, httpx.Request] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["request"] = request
        return httpx.Response(200, json=OK_BODY)

    client = make_client(httpx.MockTransport(handler))
    data, usage = await client.call(
        "candidate_score",
        system="Judge the application.",
        prompt="application text",
        org_id=str(uuid.uuid4()),
        response_model=Score,
    )
    assert isinstance(data, Score) and data.score == 0.5
    assert usage is not None and usage.totalTokens == 15
    request = seen["request"]
    assert request.url == "https://app.internal/api/internal/ai"
    assert request.headers["authorization"] == f"Bearer {TOKEN}"
    assert request.headers["x-request-id"]
    body = json.loads(request.content)
    assert body["feature"] == "candidate_score"
    assert set(body["input"]) == {"system", "prompt", "orgId"}


async def test_non_200_raises_a_clear_error() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(502, json={"ok": False, "message": "upstream unavailable"})

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(AiCallbackError) as excinfo:
        await client.call(
            "candidate_score",
            system="s",
            prompt="p",
            org_id=str(uuid.uuid4()),
        )
    assert excinfo.value.status == 502
    assert "502" in str(excinfo.value) and "upstream unavailable" in str(excinfo.value)


async def test_2xx_body_that_breaks_the_contract_raises() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        # ok:false on a 200, or missing usage — both violate the generated contract.
        return httpx.Response(200, json={"ok": False, "message": "x"})

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(AiCallbackError) as excinfo:
        await client.call("candidate_score", system="s", prompt="p", org_id=str(uuid.uuid4()))
    assert "contract" in str(excinfo.value)


async def test_data_that_breaks_the_response_model_raises() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={**OK_BODY, "data": {"score": "high"}})

    client = make_client(httpx.MockTransport(handler))
    with pytest.raises(ValidationError):
        await client.call(
            "candidate_score",
            system="s",
            prompt="p",
            org_id=str(uuid.uuid4()),
            response_model=Score,
        )


async def test_missing_env_raises_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AI_CALLBACK_URL", raising=False)
    monkeypatch.delenv("AI_CALLBACK_TOKEN", raising=False)
    with pytest.raises(AiCallbackError, match="AI_CALLBACK_URL"):
        AiCallbackClient()
