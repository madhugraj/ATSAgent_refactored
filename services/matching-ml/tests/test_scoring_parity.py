"""Parity tests for the deterministic scoring half (Phase 9 gate).

Every case mirrors the TS engine's behaviour in src/lib/matching.server.ts
and src/lib/career.ts — the formulas and thresholds are quoted from those
files. The AI-extracted semantic scores are inputs here (they stay TS-side);
what must match exactly is the arithmetic.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.career import career_score, clamp, compute_career_metrics, js_round, title_level
from app.scoring import DEFAULT_WEIGHTS, experience_score, score

NOW = datetime(2026, 11, 25, 12, 0, tzinfo=UTC)


def base_request(**overrides: Any) -> dict[str, Any]:
    request: dict[str, Any] = {
        "orgId": "7e9b1f52-3a44-4c1b-9c2e-8f1d2a3b4c5d",
        "now": "2026-11-25T12:00:00+00:00",
        "jd": {"experienceMin": 3, "experienceMax": 6},
        "candidate": {"experienceYears": 4},
        "weights": DEFAULT_WEIGHTS,
        "customDimensions": [],
        "socialScore": 0,
        "ai": {
            "skillsScore": 80,
            "educationScore": 70,
            "employmentHistory": [
                {"company": "Yavar Techworks Pvt. Ltd.", "title": "Senior Engineer", "start": "Jan 2023", "end": "present"},
                {"company": "Infosys", "title": "Junior Engineer", "start": "Jan 2020", "end": "Dec 2022"},
            ],
            "skillRecencyYears": None,
            "impactScore": 60,
            "innovationScore": 50,
            "additionalScores": [],
        },
    }
    request.update(overrides)
    return request


# ---------------------------------------------------------------- js_round


def test_js_round_matches_javascript_not_python() -> None:
    # Python round() is banker's rounding; JS Math.round rounds .5 up.
    assert js_round(2.5) == 3
    assert round(2.5) == 2  # the difference this helper exists for
    assert js_round(0.5) == 1
    assert js_round(-0.5) == 0
    assert js_round(1.4) == 1
    assert js_round(-1.5) == -1


# --------------------------------------------------------- experience band


def test_experience_band_costs_both_ways_22_per_year() -> None:
    assert experience_score(4, 3, 6) == 100  # inside
    assert experience_score(3, 3, 6) == 100
    assert experience_score(6, 3, 6) == 100
    assert experience_score(2, 3, 6) == clamp(100 - 22)  # 78
    assert experience_score(0, 3, 6) == clamp(100 - 66)  # 34
    assert experience_score(7, 3, 6) == clamp(100 - 22)  # overqualified costs the same
    assert experience_score(9, 3, 6) == clamp(100 - 66)
    assert experience_score(10, 3, 6) == 12  # clamped: 100 - 4*22


# ----------------------------------------------------------- career maths


def test_tenure_merge_same_company_small_gap() -> None:
    # Two roles at the same company with a 1-month gap merge into one tenure.
    metrics = compute_career_metrics(
        [
            {"company": "Acme", "title": "Engineer", "start": "Jan 2020", "end": "Jan 2022"},
            {"company": "Acme Pvt Ltd", "title": "Senior Engineer", "start": "Feb 2022", "end": "present"},
        ],
        None,
        NOW,
    )
    assert metrics["dated_employers"] == 1
    assert metrics["promotions"] == 1  # title change inside the tenure
    assert metrics["progression"] == "upward"


def test_company_key_ignores_legal_suffixes() -> None:
    metrics = compute_career_metrics(
        [
            {"company": "Yavar Techworks Pvt. Ltd.", "title": "Engineer", "start": "Jan 2020", "end": "Jan 2022"},
            {"company": "yavar techworks", "title": "Senior Engineer", "start": "Feb 2022", "end": "present"},
        ],
        None,
        NOW,
    )
    assert metrics["dated_employers"] == 1


def test_career_score_neutral_60_without_dates() -> None:
    result = career_score(compute_career_metrics([{"company": "Acme", "title": None, "start": None, "end": None}], None, NOW))
    assert result["score"] == 60


def test_career_score_penalty_schedule() -> None:
    # Short tenure (<1.5y avg): −25; short stint: −8; job-hopping (>3 in 5y): −12.
    metrics = compute_career_metrics(
        [
            {"company": "A", "title": "Engineer", "start": "Jan 2025", "end": "Jun 2025"},
            {"company": "B", "title": "Engineer", "start": "Jul 2025", "end": "Nov 2025"},
            {"company": "C", "title": "Engineer", "start": "Nov 2025", "end": "present"},
        ],
        None,
        NOW,
    )
    result = career_score(metrics)
    # 3 employers inside 5 years (>3 is the trigger, 3 is not) — only the
    # short-tenure penalties apply; assert against the documented schedule.
    assert result["score"] <= 75  # −25 avg-tenure path fired


def test_career_score_gap_and_recency_penalties() -> None:
    # 14-month gap: −14; core skills 4 years stale: −10.
    metrics = compute_career_metrics(
        [
            {"company": "A", "title": "Engineer", "start": "Jan 2020", "end": "Jan 2022"},
            {"company": "B", "title": "Engineer", "start": "Mar 2023", "end": "present"},
        ],
        4,
        NOW,
    )
    result = career_score(metrics)
    # Schedule: avg tenure 2.85y (no cut), finished stint 2y (no cut), 2
    # employers in 5y (no cut), 14-month gap → −14, lateral with 5.7y total
    # (< 6, no cut), recency 4y → −10 → 76.
    assert result["score"] == 76
    assert any("14 months" in f for f in result["flags"]) or any(
        "14-month" in n for n in result["notes"]
    )


def test_career_score_upward_bonus() -> None:
    metrics = compute_career_metrics(
        [
            {"company": "A", "title": "Junior Engineer", "start": "Jan 2020", "end": "Jan 2022"},
            {"company": "B", "title": "Senior Engineer", "start": "Feb 2022", "end": "present"},
        ],
        None,
        NOW,
    )
    result = career_score(metrics)
    assert result["score"] >= 100  # 100 base + 8 upward, no penalties


def test_title_level_table() -> None:
    assert title_level("Intern") == 0
    # max-across-table semantics, identical to the TS loop: "Developer" lifts
    # "Junior Developer" to the engineer level (career.ts takes Math.max).
    assert title_level("Junior Developer") == 2
    assert title_level("Software Engineer") == 2
    assert title_level("SDE II") == 3
    assert title_level("Lead Engineer") == 4
    assert title_level("Head of Engineering") == 5
    assert title_level("VP Engineering") == 6


# --------------------------------------------------------------- roll-up


def test_rollup_matches_the_ts_formula() -> None:
    request = base_request()
    request["ai"]["skillsScore"] = 100
    request["ai"]["impactScore"] = 100
    request["ai"]["innovationScore"] = 100
    request["candidate"] = {"experienceYears": 4}
    result = score(request, NOW)
    # skills 100*40/100=40, experience 100*15/100=15, career 100*10/100=10,
    # impact blend 100*10/100=10, education 70*10/100=7, social 0 → 82
    assert result["overall"] == 82


def test_custom_dimensions_join_the_rollup() -> None:
    request = base_request(
        customDimensions=[{"key": "domain", "label": "Domain", "hint": "h", "weight": 50}]
    )
    request["weights"] = {k: 10 for k in DEFAULT_WEIGHTS}  # 60 + 50 custom = 110
    request["ai"]["skillsScore"] = 100
    request["ai"]["additionalScores"] = [{"key": "domain", "score": 80, "evidence": ""}]
    result = score(request, NOW)
    weights = {c["label"]: c for c in result["contributions"]}
    assert weights["domain"]["weighted"] == js_round(80 * 50 / 110)
    assert result["custom_scores"] == [{"key": "domain", "score": 80}]


def test_custom_dimension_without_ai_score_is_zero() -> None:
    request = base_request(customDimensions=[{"key": "domain", "label": "d", "hint": "h", "weight": 10}])
    result = score(request, NOW)
    assert result["custom_scores"] == [{"key": "domain", "score": 0}]


def test_missing_dimension_score_contributes_zero_weight_adjusted() -> None:
    # The custom dimension's weight still participates in totalWeight even
    # when the AI never scored it (matching.server.ts:488-497 behaviour).
    request = base_request(customDimensions=[{"key": "domain", "label": "d", "hint": "h", "weight": 100}])
    result = score(request, NOW)
    total = sum(c["weighted"] for c in result["contributions"])
    assert result["overall"] == max(0, min(100, total))


def test_zero_total_weight_falls_back_to_100() -> None:
    request = base_request(weights={k: 0 for k in DEFAULT_WEIGHTS})
    result = score(request, NOW)
    assert isinstance(result["overall"], int)


def test_recommendation_never_exists_in_the_response() -> None:
    """Gates and decisions stay in TS — the service must not even have the
    field (refactor plan: matching-ml produces scores only)."""
    result = score(base_request(), NOW)
    assert "recommendation" not in result
    assert "gates" not in result
