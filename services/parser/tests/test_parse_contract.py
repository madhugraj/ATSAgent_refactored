"""Wire-contract parity: the 5 parser-sandbox cases (Phase 9 gate, rule for
9b: the pytest suite replays scripts/parser-sandbox.test.ts case for case).

The bun originals spawn the real worker on a port; here the FastAPI app is
exercised through httpx's ASGI transport — same routes, same auth, same
status codes.
"""

from __future__ import annotations

import os

import pytest
from starlette.testclient import TestClient

from app.main import app

TOKEN = "tok-parity-0123456789abcdef"


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("PARSER_TOKEN", TOKEN)
    return TestClient(app)


def test_healthz(client: TestClient) -> None:
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_parse_plain_text_round_trip(client: TestClient) -> None:
    res = client.post(
        "/parse",
        content=b"plain CV text",
        headers={"x-file-name": "cv.txt", "x-parser-token": TOKEN,
                 "content-type": "application/octet-stream"},
    )
    assert res.status_code == 200
    assert res.json() == {"text": "plain CV text"}


def test_wrong_token_is_401_and_fail_closed(client: TestClient) -> None:
    res = client.post(
        "/parse",
        content=b"plain CV text",
        headers={"x-file-name": "cv.txt", "x-parser-token": "wrong",
                 "content-type": "application/octet-stream"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Unauthorized"


def test_missing_token_is_401(client: TestClient) -> None:
    res = client.post(
        "/parse",
        content=b"plain CV text",
        headers={"x-file-name": "cv.txt", "content-type": "application/octet-stream"},
    )
    assert res.status_code == 401


def test_fail_closed_when_no_token_configured(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Stricter than the worker's dev-skip: unset PARSER_TOKEN refuses everything."""
    monkeypatch.delenv("PARSER_TOKEN", raising=False)
    res = client.post(
        "/parse",
        content=b"plain CV text",
        headers={"x-file-name": "cv.txt", "x-parser-token": TOKEN,
                 "content-type": "application/octet-stream"},
    )
    assert res.status_code == 401


def test_oversize_body_is_413(client: TestClient) -> None:
    res = client.post(
        "/parse",
        content=b"\0" * 15_000_001,
        headers={"x-file-name": "big.txt", "x-parser-token": TOKEN,
                 "content-type": "application/octet-stream"},
    )
    assert res.status_code == 413
    assert res.json() == {"error": "too large"}


def test_content_length_declared_oversize_is_413_early(client: TestClient) -> None:
    res = client.post(
        "/parse",
        content=b"small",
        headers={"x-file-name": "big.txt", "x-parser-token": TOKEN,
                 "content-type": "application/octet-stream",
                 "content-length": "15000001"},
    )
    assert res.status_code == 413


def test_garbage_pdf_is_422_not_a_leak(client: TestClient) -> None:
    res = client.post(
        "/parse",
        content=b"%PDF-1.4 garbage not a real pdf \xff\xfe",
        headers={"x-file-name": "broken.pdf", "x-parser-token": TOKEN,
                 "content-type": "application/octet-stream"},
    )
    assert res.status_code == 422
    assert res.json() == {"error": "could not parse"}


def test_unknown_route_is_404(client: TestClient) -> None:
    res = client.request("POST", "/nope", content=b"", headers={"x-parser-token": TOKEN})
    assert res.status_code == 404


def test_env_token_absent_in_module_namespace(client: TestClient) -> None:
    """The service holds no other secret: PARSER_TOKEN is read per request."""
    assert not hasattr(app, "token")
    assert os.environ.get("PARSER_TOKEN", TOKEN)
