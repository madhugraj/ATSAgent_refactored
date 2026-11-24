"""Service-token auth: protected routes reject missing, malformed and wrong tokens."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

TOKEN = "test-service-token-0123456789abcdef"
client = TestClient(app)

BODY = {
    "orgId": str(uuid.uuid4()),
    "applicationId": str(uuid.uuid4()),
    "window": {"from": "2026-01-01", "to": "2026-06-30"},
}


@pytest.fixture(autouse=True)
def _tokens(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SERVICE_TOKENS", f"other-token,{TOKEN}")


def authed() -> dict[str, str]:
    return {"authorization": f"Bearer {TOKEN}"}


def test_missing_token_is_401() -> None:
    response = client.post("/v1/bias-report", json=BODY)
    assert response.status_code == 401
    assert response.json()["detail"] == "Unauthorized"


def test_wrong_token_is_401() -> None:
    response = client.post(
        "/v1/bias-report", headers={"authorization": "Bearer nope"}, json=BODY
    )
    assert response.status_code == 401


def test_garbage_header_is_401() -> None:
    for header in ("", "Basic xyz", "Bearer", "Bearer   "):
        response = client.post(
            "/v1/bias-report", headers={"authorization": header} if header else {}, json=BODY
        )
        assert response.status_code == 401, header


def test_empty_token_list_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SERVICE_TOKENS", "")
    response = client.post("/v1/bias-report", headers=authed(), json=BODY)
    assert response.status_code == 401


def test_valid_token_and_valid_contract_pass() -> None:
    response = client.post("/v1/bias-report", headers=authed(), json=BODY)
    assert response.status_code == 200
    assert response.json()["received"] is True
    assert response.json()["window"] == {"from": "2026-01-01", "to": "2026-06-30"}


def test_valid_token_but_invalid_contract_is_422() -> None:
    bad = {**BODY, "orgId": "not-a-uuid"}
    response = client.post("/v1/bias-report", headers=authed(), json=bad)
    assert response.status_code == 422
