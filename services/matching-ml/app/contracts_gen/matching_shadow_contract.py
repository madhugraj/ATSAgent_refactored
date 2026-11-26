"""GENERATED — do not edit; run bun tools/contracts/generate.mjs.

Source: apps/web/src/lib/matching-shadow.contract.ts
Schemas: MatchingShadowRequest, MatchingShadowResponse
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class MatchingShadowRequestJd(BaseModel):
    experienceMin: float
    experienceMax: float


class MatchingShadowRequestCandidate(BaseModel):
    experienceYears: float


class MatchingShadowRequestWeights(BaseModel):
    skills: float
    experience: float
    career: float
    impact: float
    education: float
    social: float


class MatchingShadowRequestCustomDimensionsItem(BaseModel):
    key: str
    label: str
    hint: str
    weight: float


class MatchingShadowRequestAiEmploymentHistoryItem(BaseModel):
    company: str
    title: str
    start: str
    end: str


class MatchingShadowRequestAiAdditionalScoresItem(BaseModel):
    key: str
    score: float
    evidence: str


class MatchingShadowRequestAi(BaseModel):
    skillsScore: float
    educationScore: float
    employmentHistory: list[MatchingShadowRequestAiEmploymentHistoryItem]
    skillRecencyYears: float | None = None
    impactScore: float
    innovationScore: float
    additionalScores: list[MatchingShadowRequestAiAdditionalScoresItem]


class MatchingShadowRequest(BaseModel):
    orgId: uuid.UUID
    now: str = Field(min_length=10)
    jd: MatchingShadowRequestJd
    candidate: MatchingShadowRequestCandidate
    weights: MatchingShadowRequestWeights
    customDimensions: list[MatchingShadowRequestCustomDimensionsItem]
    socialScore: float
    ai: MatchingShadowRequestAi


class MatchingShadowResponseScores(BaseModel):
    skills: float
    experience: float
    career: float
    impact_innovation: float
    education: float
    social: float


class MatchingShadowResponseCustom_scoresItem(BaseModel):
    key: str
    score: float


class MatchingShadowResponseContributionsItem(BaseModel):
    label: str
    raw: float
    weight: float
    weighted: float


class MatchingShadowResponse(BaseModel):
    overall: float
    scores: MatchingShadowResponseScores
    career_flags: list[str]
    custom_scores: list[MatchingShadowResponseCustom_scoresItem]
    contributions: list[MatchingShadowResponseContributionsItem]
