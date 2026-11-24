"""The template's health endpoint: 200, no auth, correct shape."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz_is_open_and_ok() -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["service"] == "_template"


def test_healthz_refuses_nothing_on_other_methods() -> None:
    """POST to a GET-only route is method-not-allowed, not an auth failure."""
    response = client.post("/healthz")
    assert response.status_code in {405, 400}
