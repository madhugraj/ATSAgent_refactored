"""Deterministic scoring — the Python port of the TS scorer's arithmetic half
(ATSAgent src/lib/matching.server.ts scoreCandidate).

The AI-extracted semantic scores (skills/education/impact/innovation,
employment history, experience/direction fit) arrive in the request payload —
they were produced TS-side through aiJson feature ``candidate_score`` (plan
rule 4: no AI keys here). This module computes everything after that point:
the experience band (costs both ways, 22 pts/year), the career score
(app.career), the impact/innovation blend, the custom org dimensions, and the
weighted roll-up with its totalWeight fallback.

Scores only — the recommendation gates (gatedRecommendation, logistics
blockers, injection holds) stay in TS, exactly as the refactor plan requires.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from app.career import career_score, clamp, compute_career_metrics, js_round

DEFAULT_WEIGHTS = {
    "skills": 40,
    "experience": 15,
    "career": 10,
    "impact": 10,
    "education": 10,
    "social": 15,
}

EXPERIENCE_BAND_STEP = 22


def experience_score(years: float, min_years: float, max_years: float) -> int:
    """The band costs both ways: 22 points per year outside, either side."""
    if min_years <= years <= max_years:
        return 100
    if years < min_years:
        return clamp(100 - (min_years - years) * EXPERIENCE_BAND_STEP)
    return clamp(100 - (years - max_years) * EXPERIENCE_BAND_STEP)


def score(request: dict[str, Any], now: datetime) -> dict[str, Any]:
    weights = {**DEFAULT_WEIGHTS, **(request.get("weights") or {})}
    jd = request.get("jd") or {}
    candidate = request.get("candidate") or {}
    ai = request.get("ai") or {}

    # Experience band
    experience_years = float(candidate.get("experienceYears") or 0)
    experience = experience_score(
        experience_years, float(jd.get("experienceMin") or 0), float(jd.get("experienceMax") or 0)
    )

    # Career history: metrics from the AI-extracted employment rows, then the
    # penalty schedule. `now` comes from the caller so both engines measure
    # identical durations.
    metrics = compute_career_metrics(
        ai.get("employmentHistory") or [], ai.get("skillRecencyYears"), now
    )
    career = career_score(metrics)

    # Impact & innovation blend
    impact = float(ai.get("impactScore") or 0)
    innovation = float(ai.get("innovationScore") or 0)
    impact_innovation = clamp(impact * 0.6 + innovation * 0.4)

    skills = float(ai.get("skillsScore") or 0)
    education = float(ai.get("educationScore") or 0)
    social = float(request.get("socialScore") or 0)

    # Custom org dimensions: the AI additional_scores join the saved weights;
    # a missing entry scores 0; a non-finite weight contributes 0.
    custom_out: list[dict[str, Any]] = []
    custom_parts: list[dict[str, Any]] = []
    for dim in request.get("customDimensions") or []:
        key = dim.get("key") or ""
        weight = dim.get("weight")
        if not isinstance(weight, (int, float)) or not math.isfinite(weight):
            continue
        score_value = 0
        for extra in ai.get("additionalScores") or []:
            if extra.get("key") == key:
                raw = extra.get("score")
                score_value = int(raw) if isinstance(raw, (int, float)) else 0
                break
        custom_out.append({"key": key, "score": score_value})
        custom_parts.append({"label": key, "raw": score_value, "weight": weight})

    parts = [
        {"label": "Skills", "raw": skills, "weight": weights["skills"]},
        {"label": "Experience", "raw": experience, "weight": weights["experience"]},
        {"label": "Career history", "raw": career["score"], "weight": weights["career"]},
        {"label": "Impact & innovation", "raw": impact_innovation, "weight": weights["impact"]},
        {"label": "Education", "raw": education, "weight": weights["education"]},
        {"label": "Social profile", "raw": social, "weight": weights["social"]},
        *custom_parts,
    ]
    total_weight = sum(p["weight"] for p in parts) or 100
    contributions = [
        {**p, "weighted": js_round(p["raw"] * p["weight"] / total_weight)} for p in parts
    ]
    overall = clamp(sum(p["weighted"] for p in contributions))

    return {
        "overall": overall,
        "scores": {
            "skills": clamp(skills),
            "experience": experience,
            "career": career["score"],
            "impact_innovation": impact_innovation,
            "education": clamp(education),
            "social": clamp(social),
        },
        "career_flags": career["flags"],
        "career_metrics": metrics,
        "custom_scores": custom_out,
        "contributions": [
            {"label": c["label"], "raw": c["raw"], "weight": c["weight"], "weighted": c["weighted"]}
            for c in contributions
        ],
    }
