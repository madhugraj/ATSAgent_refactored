"""GENERATED — do not edit; run bun tools/contracts/generate.mjs.

Source: services/_template/contracts/demo.ts
Schemas: BiasReportRequest
"""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class BiasReportRequestWindow(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    from_: date = Field(alias="from")
    to: date


class BiasReportRequest(BaseModel):
    orgId: uuid.UUID
    applicationId: uuid.UUID
    window: BiasReportRequestWindow
