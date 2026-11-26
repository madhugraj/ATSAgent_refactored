"""Parser token authentication — mirrors the TS parser worker exactly.

The TS worker (src/server/parser/worker.ts) authenticates ``POST /parse``
with the ``x-parser-token`` header compared against ``PARSER_TOKEN``
(length-equal then ``timingSafeEqual``). Shadow mode calls this service with
the very same header and credential the real worker gets, so the two calls
are indistinguishable at the auth layer.

Deviation from the worker, on purpose and stricter: the worker skips auth
when PARSER_TOKEN is unset and it is not deployed (local dev convenience);
this service fails closed on an unset token always — a shadow service must
never accept unauthenticated traffic.
"""

from __future__ import annotations

import hmac
import os

from fastapi import HTTPException, Request

_UNAUTHORIZED = HTTPException(status_code=401, detail="Unauthorized")


def parser_token() -> str | None:
    """The configured token; None means fail closed."""
    return os.environ.get("PARSER_TOKEN", "").strip() or None


async def require_parser_token(request: Request) -> None:
    """FastAPI dependency: reject anything without the exact configured token.

    Comparison is constant-time (``hmac.compare_digest``) after a length gate.
    The failure response is generic — it must not distinguish a missing token
    from a wrong one.
    """
    expected = parser_token()
    if expected is None:
        raise _UNAUTHORIZED
    given = request.headers.get("x-parser-token", "")
    if not given or len(given) != len(expected):
        raise _UNAUTHORIZED
    if not hmac.compare_digest(given.encode("utf-8"), expected.encode("utf-8")):
        raise _UNAUTHORIZED
