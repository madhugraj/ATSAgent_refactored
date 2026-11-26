"""Service-token authentication (refactor plan Phase 9 rule 2).

Per-service credential: this service validates MATCHING_ML_TOKEN — its own
entry in the TS service_tokens store, rotated there and pushed to this
deployment. Never a shared bootstrap list.

Every service is called only from TS server code, over the private network,
with a per-service bearer token. Tokens travel in the ``SERVICE_TOKENS`` env
var as a comma-separated list — the per-service bootstrap list. The durable
store is the TS ``encryptSecret`` credential store; rotation happens there per
service (through ``writeAudit``) and the new list is pushed to the service.
"""

from __future__ import annotations

import hmac
import os

from fastapi import HTTPException, Request

_UNAUTHORIZED = HTTPException(status_code=401, detail="Unauthorized")


def service_tokens() -> list[str]:
    """The bootstrap token list. Empty means fail closed: nothing is accepted."""
    raw = os.environ.get("SERVICE_TOKENS", "")
    return [token.strip() for token in raw.split(",") if token.strip()]


def bearer_token(request: Request) -> str | None:
    """The bearer token of the request, or None when the header is absent/malformed."""
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    given = header[len("bearer ") :].strip()
    return given or None


async def require_service_token(request: Request) -> None:
    """FastAPI dependency: reject anything without a valid service token.

    Comparison is constant-time (``hmac.compare_digest``) per configured token.
    The failure response is generic — it must not distinguish a missing token
    from a wrong one.
    """
    given = bearer_token(request)
    if given is None:
        raise _UNAUTHORIZED
    given_bytes = given.encode("utf-8")
    for expected in service_tokens():
        if hmac.compare_digest(given_bytes, expected.encode("utf-8")):
            return
    raise _UNAUTHORIZED
