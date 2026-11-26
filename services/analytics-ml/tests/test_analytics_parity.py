"""Parity tests: the TS analytics modules' behaviour replayed case for case
(Phase 9 gate — same numbers as the TS output on a fixed snapshot).

Formulas are quoted from src/lib/bias.server.ts, src/lib/pool-coverage.ts and
src/lib/demand-outlook.ts.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.analytics import (
    compute_coverage,
    history_quarters,
    quarters_ago,
    rank_outlook,
    role_key,
    selection_parity,
    skill_matches,
    status_of,
    summarise_coverage,
)

NOW = datetime(2026, 11, 25, 12, 0, tzinfo=UTC)


# ------------------------------------------------------------ bias (Art. 10)


def test_selection_parity_rates_and_four_fifths() -> None:
    pairs = (
        [{"source": "referral", "stage": "hired"} for _ in range(10)]
        + [{"source": "referral", "stage": "applied"} for _ in range(10)]
        + [{"source": "board", "stage": "hired"} for _ in range(6)]
        + [{"source": "board", "stage": "applied"} for _ in range(14)]
        + [{"source": "tiny", "stage": "applied"} for _ in range(5)]  # below the >=10 cutoff
    )
    out = selection_parity(pairs)
    by_source = {r["source"]: r for r in out["rows"]}
    assert "tiny" not in by_source  # 5 < 10: excluded
    assert by_source["referral"]["rate"] == 0.5
    assert by_source["board"]["rate"] == 0.3
    assert by_source["board"]["parity"] == 0.6  # 0.3 / 0.5 — below 0.8
    assert by_source["referral"]["parity"] == 1.0
    assert out["breaches"] == [by_source["board"]]


def test_selection_parity_no_data_is_no_breach() -> None:
    assert selection_parity([]) == {"rows": [], "breaches": []}


def test_selection_parity_ignores_stages_outside_the_window() -> None:
    # "rejected" is a real stage but not among the 13 the TS query selects.
    pairs = [{"source": "s", "stage": "rejected"} for _ in range(20)]
    assert selection_parity(pairs)["rows"] == []


# ------------------------------------------------------------ pool coverage


def test_skill_matches_short_tokens_whole_words() -> None:
    assert skill_matches("go developer", "go")  # whole word
    assert not skill_matches("golang", "go")  # "go" must not match inside "golang"
    assert skill_matches("full stack react", "react")
    assert skill_matches("reactjs developer", "react")  # containment
    assert not skill_matches("", "go")
    assert skill_matches("Node.JS", "node.js")  # punctuation normalised


def test_coverage_strong_partial_and_status_thresholds() -> None:
    demands = [
        {"key": "r1", "kind": "requisition", "label": "R1 Backend", "skills": ["go", "postgres", "redis", "kafka"], "demand": 2}
    ]
    strong = {"id": "s", "skills": ["go", "postgres", "redis", "kafka"], "isInternal": False, "seenAt": NOW}
    partial = {"id": "p", "skills": ["go"], "isInternal": False, "seenAt": NOW}
    rows = compute_coverage(demands, [strong, partial], NOW)
    row = rows[0]
    # the partial person covers 1/4 = 25% < 50% — not a fit at all
    assert row["strong"] == 1 and row["partial"] == 0
    assert row["ratio"] == 0.5  # 1 strong / 2 demand
    assert row["status"] == "red"  # < 1
    assert row["missingSkills"] == ["postgres", "redis", "kafka"]  # held by nobody
    assert row["freshShare"] == 1.0


def test_coverage_status_boundaries() -> None:
    assert status_of(3.0) == "green"
    assert status_of(2.9) == "amber"
    assert status_of(1.0) == "amber"
    assert status_of(0.9) == "red"


def test_coverage_skills_capped_at_15() -> None:
    demands = [{"key": "r", "kind": "role", "label": "R", "skills": [f"skill{i}" for i in range(25)], "demand": 1}]
    pool = [{"id": "p", "skills": [f"skill{i}" for i in range(25)], "isInternal": False, "seenAt": NOW}]
    row = compute_coverage(demands, pool, NOW)[0]
    # only the first 15 are considered, and each is held by exactly 1 person
    # — the TS rule counts held-by-<=1 as missing
    assert len(row["missingSkills"]) == 15


def test_coverage_summary_counts_and_top_gaps() -> None:
    demands = [
        {"key": "r1", "kind": "role", "label": "A", "skills": ["rare1", "go"], "demand": 1},
        {"key": "r2", "kind": "role", "label": "B", "skills": ["rare1", "python"], "demand": 1},
    ]
    pool = [{"id": "p", "skills": ["go", "python"], "isInternal": True, "seenAt": NOW}]
    rows = compute_coverage(demands, pool, NOW)
    summary = summarise_coverage(rows)
    assert summary["red"] == 2 and summary["amber"] == 0 and summary["green"] == 0
    assert summary["topSkillGaps"][0]["skill"] == "rare1"
    assert summary["topSkillGaps"][0]["roles"] == 2


def test_coverage_sort_ascending_ratio_then_descending_demand() -> None:
    demands = [
        {"key": "hi", "kind": "role", "label": "Hi", "skills": ["go"], "demand": 3},
        {"key": "lo", "kind": "role", "label": "Lo", "skills": ["go"], "demand": 1},
    ]
    pool = [{"id": "p", "skills": ["go"], "isInternal": False, "seenAt": NOW}]
    rows = compute_coverage(demands, pool, NOW)
    assert [r["key"] for r in rows] == ["hi", "lo"]  # ratio 0.3 both → demand desc


# ----------------------------------------------------------- demand outlook


def test_quarters_ago_floor_semantics() -> None:
    assert quarters_ago(datetime(2026, 9, 1, tzinfo=UTC), NOW) == 0  # 2 months → floor(2/3) = 0
    assert quarters_ago(datetime(2026, 11, 1, tzinfo=UTC), NOW) == 0
    assert quarters_ago(datetime(2024, 1, 1, tzinfo=UTC), NOW) == 11  # 34 months → floor(34/3)


def test_role_key_normalisation() -> None:
    assert role_key("Backend-Engineer (Go)") == "backend engineer go"
    assert role_key("  BACKEND  ") == "backend"


def test_rank_outlook_scoring_confidence_and_filter() -> None:
    trends = [
        {"role": "Backend", "quarters": [0] * 6 + [2, 4], "recent": 6, "prior": 2, "growth": 2.0},
        {"role": "Sinking", "quarters": [0] * 6 + [0, 1], "recent": 1, "prior": 3, "growth": -0.67},
    ]
    market = [{"role": "Backend", "outlook": "rising", "reason": "demand up"}]
    emerging = [{"name": "AI Engineer", "status": "emerging"}]
    rows = rank_outlook(trends, market, emerging, [], 8, True)
    # Backend: internal (cap 2 * 1 + 0.25) + market rising (1, grounded) = 3.25
    # AI Engineer: emerging 0.5
    # Sinking: internal −1 + 0.25 = −0.75 → filtered (score > 0 only)
    by_role = {r["role"]: r for r in rows}
    assert "Sinking" not in by_role
    assert by_role["Backend"]["score"] == 3.25
    assert by_role["Backend"]["confidence"] == "high"  # internal + market agree (rising)
    assert by_role["AI Engineer"]["confidence"] == "low"
    assert rows[0]["role"] == "Backend"  # sorted by score desc


def test_rank_outlook_thin_history_halves_internal() -> None:
    trends = [{"role": "Backend", "quarters": [0] * 6 + [2, 4], "recent": 6, "prior": 2, "growth": 2.0}]
    rows = rank_outlook(trends, [], [], [], 3, False)  # 3 quarters = thin
    assert rows[0]["score"] == 1.25  # (2 * 0.5) + 0.25, no market


def test_rank_outlook_ungrounded_market_discount() -> None:
    trends: list = []
    market = [{"role": "Backend", "outlook": "rising", "reason": "guess"}]
    grounded = rank_outlook(trends, market, [], [], 0, True)
    ungrounded = rank_outlook(trends, market, [], [], 0, False)
    assert grounded[0]["score"] == 1.0
    assert ungrounded[0]["score"] == 0.5
    assert "estimate without live sources" in ungrounded[0]["evidence"][0]


def test_history_quarters_cap() -> None:
    assert history_quarters([], NOW) == 0
    assert history_quarters([{"createdAt": datetime(2024, 6, 1, tzinfo=UTC)}], NOW) == 8  # capped
    assert history_quarters([{"createdAt": datetime(2026, 10, 1, tzinfo=UTC)}], NOW) == 1
