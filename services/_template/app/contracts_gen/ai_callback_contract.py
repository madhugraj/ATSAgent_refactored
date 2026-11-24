"""GENERATED — do not edit; run bun tools/contracts/generate.mjs.

Source: apps/web/src/lib/ai-callback.contract.ts
Schemas: AiCallbackRequest, AiCallbackOk
"""

from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field


class AiCallbackRequest(BaseModel):
    system: str = Field(min_length=1, max_length=20000)
    prompt: str = Field(min_length=1, max_length=120000)
    orgId: uuid.UUID


class AiCallbackOkUsage(BaseModel):
    promptTokens: int
    completionTokens: int
    totalTokens: int


class AiCallbackOk(BaseModel):
    ok: Literal[True]
    data: Any
    usage: AiCallbackOkUsage | None
