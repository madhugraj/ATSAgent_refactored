"""Typed client for the TS internal AI callback endpoint (refactor plan Phase 9 rule 4).

Python services hold no AI provider keys. Every LLM call is POSTed to the TS
app's ``/api/internal/ai`` route (``apps/web/src/routes/api/internal/ai.ts``)
with a service token; the TS side calls the AI gateway, so the ledger
(``ai_usage_events``), spend caps, consent, training capture and vendor
stripping all still apply.

Env (per service, set at deploy time):

- ``AI_CALLBACK_URL`` — the TS app origin (e.g. ``https://atsiq.internal``).
- ``AI_CALLBACK_TOKEN`` — this service's token; must be in the app's
  ``SERVICE_TOKENS`` list.

The response envelope is validated against the generated contract
(``app/contracts_gen``); ``data`` is optionally validated against a per-feature
model the caller passes in.
"""

from __future__ import annotations

import os
import uuid
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.contracts_gen.ai_callback_contract import AiCallbackOk

ModelT = TypeVar("ModelT", bound=BaseModel)


class AiCallbackError(RuntimeError):
    """A non-200 (or contract-violating) reply from the TS AI callback endpoint."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


class AiCallbackClient:
    """Posts one AI request per call; stateless beyond the base URL and token."""

    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
        *,
        timeout: float = 120.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = (base_url or os.environ.get("AI_CALLBACK_URL", "")).rstrip("/")
        if not self._base_url:
            raise AiCallbackError(0, "AI_CALLBACK_URL is not set")
        self._token = token or os.environ.get("AI_CALLBACK_TOKEN", "")
        if not self._token:
            raise AiCallbackError(0, "AI_CALLBACK_TOKEN is not set")
        self._timeout = timeout
        self._transport = transport

    async def call(
        self,
        feature: str,
        *,
        system: str,
        prompt: str,
        org_id: str,
        response_model: type[ModelT] | None = None,
    ) -> tuple[Any, Any]:
        """Run one AI request. Returns (data, usage) on success.

        Raises :class:`AiCallbackError` on a non-200 reply or when the reply
        violates the generated ``AiCallbackOk`` contract (or ``response_model``,
        when given). ``feature`` must be a slug from AI_FEATURES on the TS side.
        """
        async with httpx.AsyncClient(
            base_url=self._base_url,
            timeout=self._timeout,
            transport=self._transport,
        ) as client:
            response = await client.post(
                "/api/internal/ai",
                headers={
                    "authorization": f"Bearer {self._token}",
                    "x-request-id": str(uuid.uuid4()),
                },
                json={
                    "feature": feature,
                    "input": {"system": system, "prompt": prompt, "orgId": org_id},
                },
            )
        if response.status_code != 200:
            detail: Any
            try:
                detail = response.json().get("message")
            except ValueError:
                detail = None
            message = (
                f"AI callback failed with HTTP {response.status_code}"
                + (f": {detail}" if isinstance(detail, str) and detail else "")
            )
            raise AiCallbackError(response.status_code, message)
        try:
            envelope = AiCallbackOk.model_validate(response.json())
        except ValidationError as e:
            raise AiCallbackError(
                response.status_code, f"AI callback reply failed contract: {e}"
            ) from e
        data: Any = envelope.data
        if response_model is not None:
            data = response_model.model_validate(data)
        return data, envelope.usage
