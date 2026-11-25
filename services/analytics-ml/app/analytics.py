"""Analytics computations — the Python port of three ATSAgent TS modules.

Deterministic, AI-free, advisory-only computations (plan Phase 9: analytics-ml
replaces bias report, demand outlook and pool coverage computations; parity =
same numbers as the TS output on a fixed snapshot):

- ``selection_parity``   ← src/lib/bias.server.ts (EU AI Act Art. 10 /
  four-fifths rule over intake-source selection rates)
- ``pool_coverage``      ← src/lib/pool-coverage.ts (pool completeness per
  requisition/role: strong/partial fits, coverage ratio, status thresholds,
  fresh share, missing skills)
- ``demand_outlook``     ← src/lib/demand-outlook.ts (role demand trends over
  8 quarters + the market signal, which is AI/web-research TS-side and rides
  in as labelled input — plan rule 4)

None of these read the database (plan rule 1): the payload carries the input
rows. All three are advisory — nothing automated acts on their numbers.
"""

from __future__ import annotations

import math
import re
from datetime import datetime
from typing import Any

YEAR_MS = 365.25 * 86_400_000

# ------------------------------------------------------------ bias (Art. 10)

ADVANCED_STAGES = {
    "shortlisted",
    "l1",
    "l2",
    "l3",
    "offer",
    "offer_pending",
    "offer_released",
    "offer_accepted",
    "hired",
    "joined",
}

# The 13 application stages the TS query filters on (bias.server.ts:47-61).
_INCLUDED_STAGES = {
    "applied",
    "sourced",
    "ai_screened",
    *ADVANCED_STAGES,
}

MIN_TOTAL = 10
PARITY_FLOOR = 0.8


def selection_parity(pairs: list[dict[str, str]]) -> dict[str, Any]:
    """Four-fifths selection-rate parity by intake source.

    ``pairs`` = per-application ``{source, stage}`` rows for one org (the exact
    two columns the TS query selects). Sources with fewer than 10 applications
    are excluded; parity = source rate ÷ best source rate; breaches are the
    rows below 0.8.
    """
    by_source: dict[str, dict[str, int]] = {}
    for row in pairs:
        source = row.get("source") or ""
        stage = row.get("stage") or ""
        if stage not in _INCLUDED_STAGES:
            continue
        agg = by_source.setdefault(source, {"advanced": 0, "total": 0})
        agg["total"] += 1
        if stage in ADVANCED_STAGES:
            agg["advanced"] += 1

    rates: list[dict[str, Any]] = [
        {"source": source, **counts, "rate": counts["advanced"] / counts["total"], "parity": 1.0}
        for source, counts in by_source.items()
        if counts["total"] >= MIN_TOTAL
    ]
    rates.sort(key=lambda r: -float(r["rate"]))
    best = float(rates[0]["rate"]) if rates else 0
    for r in rates:
        r["parity"] = float(r["rate"]) / best if best > 0 else 1.0
    breaches = [r for r in rates if r["parity"] < PARITY_FLOOR]
    return {"rows": rates, "breaches": breaches}


# ------------------------------------------------------------ pool coverage

COVERAGE = {"strong": 0.8, "partial": 0.5, "green": 3, "amber": 1, "freshDays": 365}

_NORM = re.compile(r"[^a-z0-9+#.]+")
_MISSING_RE = re.compile(r"\b(private|pvt|limited|ltd|llp|inc|corp|corporation|co|company|plc|gmbh)\b\.?")


def _norm(skill: str) -> str:
    value = _NORM.sub(" ", skill.lower()).strip()
    return value


def skill_matches(have: str, want: str) -> bool:
    h = _norm(have)
    w = _norm(want)
    if not h or not w:
        return False
    if h == w:
        return True
    # short tokens ("c", "r", "go") must match whole words
    if len(w) <= 2 or len(h) <= 2:
        return w in h.split(" ") or h in w.split(" ")
    return w in h or h in w


def status_of(ratio: float) -> str:
    return "green" if ratio >= COVERAGE["green"] else "amber" if ratio >= COVERAGE["amber"] else "red"


def compute_coverage(demands: list[dict[str, Any]], pool: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    """Pool completeness per demand row — port of computeCoverage."""
    fresh_since = now.timestamp() * 1000 - COVERAGE["freshDays"] * 86_400_000
    rows: list[dict[str, Any]] = []
    for demand in demands:
        if not demand.get("skills"):
            continue
        skills: list[str] = []
        seen: set[str] = set()
        for raw in demand["skills"]:
            s = raw.strip()
            if s and s not in seen:
                seen.add(s)
                skills.append(s)
        skills = skills[:15]
        holders = {s: 0 for s in skills}
        strong = 0
        partial = 0
        internal = 0
        fresh = 0
        for person in pool:
            hits = 0
            for want in skills:
                if any(skill_matches(have, want) for have in person.get("skills", [])):
                    hits += 1
                    holders[want] = holders.get(want, 0) + 1
            cov = hits / len(skills)
            if cov < COVERAGE["partial"]:
                continue
            if cov >= COVERAGE["strong"]:
                strong += 1
            else:
                partial += 1
            if person.get("isInternal"):
                internal += 1
            seen_at = person.get("seenAt")
            if isinstance(seen_at, datetime) and seen_at.timestamp() * 1000 >= fresh_since:
                fresh += 1
        guarded_demand = max(int(demand.get("demand", 0)), 1)
        ratio = math.floor((strong / guarded_demand) * 10 + 0.5) / 10  # JS Math.round
        fits = strong + partial
        rows.append(
            {
                "key": demand.get("key"),
                "kind": demand.get("kind"),
                "label": demand.get("label"),
                "demand": int(demand.get("demand", 0)),
                "strong": strong,
                "partial": partial,
                "internal": internal,
                "freshShare": math.floor((fresh / fits) * 100 + 0.5) / 100 if fits else 0,
                "ratio": ratio,
                "status": status_of(ratio),
                "missingSkills": [s for s in skills if holders.get(s, 0) <= 1],
            }
        )
    rows.sort(key=lambda r: (r["ratio"], -r["demand"]))
    return rows


def summarise_coverage(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counts = {"green": 0, "amber": 0, "red": 0}
    gaps: dict[str, int] = {}
    for r in rows:
        counts[r["status"]] += 1
        for s in r["missingSkills"]:
            gaps[s] = gaps.get(s, 0) + 1
    top = sorted(gaps.items(), key=lambda kv: -kv[1])[:10]
    return {
        "green": counts["green"],
        "amber": counts["amber"],
        "red": counts["red"],
        "topSkillGaps": [{"skill": skill, "roles": roles} for skill, roles in top],
    }


# ----------------------------------------------------------- demand outlook

OUTLOOK_QUARTERS = 8
MIN_HISTORY_QUARTERS = 4
MARKET_WEIGHT = {"rising": 1, "steady": 0, "falling": -1}
EMERGING_WEIGHT = {"signal": 0.25, "emerging": 0.5, "established": 0}

_ROLE_KEY = re.compile(r"[^a-z0-9]+")


def role_key(s: str) -> str:
    return _ROLE_KEY.sub(" ", s.lower()).strip()


def quarters_ago(created: datetime, now: datetime) -> int:
    months = (now.year - created.year) * 12 + (now.month - created.month)
    return math.floor(max(months, 0) / 3)


def role_trends(reqs: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    by: dict[str, list[int]] = {}
    for r in reqs:
        q = quarters_ago(r["createdAt"], now)
        if q >= OUTLOOK_QUARTERS:
            continue
        arr = by.setdefault(r["role"], [0] * OUTLOOK_QUARTERS)
        i = OUTLOOK_QUARTERS - 1 - q
        arr[i] = arr[i] + max(int(r.get("openings", 0)), 1)
    trends = []
    n = OUTLOOK_QUARTERS
    for role, quarters in by.items():

        def at(i: int, quarters: list[int] = quarters) -> int:
            return quarters[i] if 0 <= i < n else 0

        recent = at(n - 1) + at(n - 2)
        prior = at(n - 3) + at(n - 4)
        growth = math.floor(((recent - prior) / max(prior, 1)) * 100 + 0.5) / 100
        trends.append({"role": role, "quarters": quarters, "recent": recent, "prior": prior, "growth": growth})
    return trends


def history_quarters(reqs: list[dict[str, Any]], now: datetime) -> int:
    if not reqs:
        return 0
    oldest = max(quarters_ago(r["createdAt"], now) for r in reqs)
    return min(oldest + 1, OUTLOOK_QUARTERS)


def rank_outlook(
    trends: list[dict[str, Any]],
    market: list[dict[str, Any]],
    emerging: list[dict[str, Any]],
    coverage: list[dict[str, Any]],
    history_quarters_count: int,
    market_grounded: bool,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Port of rankOutlook — internal growth (capped, thin-discounted) +
    labelled market signal + ontology emerging weight; score > 0 only."""
    thin = history_quarters_count < MIN_HISTORY_QUARTERS
    roles: dict[str, str] = {}
    for t in trends:
        roles.setdefault(role_key(t["role"]), t["role"])
    for m in market:
        roles.setdefault(role_key(m["role"]), m["role"])
    for e in emerging:
        roles.setdefault(role_key(e["name"]), e["name"])

    rows: list[dict[str, Any]] = []
    for k, role in roles.items():
        internal = next((t for t in trends if role_key(t["role"]) == k), None)
        market_signal = next((m for m in market if role_key(m["role"]) == k), None)
        em = next((e for e in emerging if role_key(e["name"]) == k), None)
        cov = next((c for c in coverage if role_key(c["label"]) == k), None)

        internal_score: float = 0
        if internal:
            growth = float(internal["growth"])
            capped = max(-1.0, min(growth, 2.0)) * (0.5 if thin else 1)
            internal_score = capped + (0.25 if internal["recent"] > 0 else 0)
        market_score = MARKET_WEIGHT[market_signal["outlook"]] * (1 if market_grounded else 0.5) if market_signal else 0
        emerging_score = EMERGING_WEIGHT[em["status"]] if em else 0
        score_value = math.floor((internal_score + market_score + emerging_score) * 100 + 0.5) / 100

        def js_sign(n: float) -> int:
            return 0 if n == 0 else (1 if n > 0 else -1)

        signals = [
            v
            for v in (
                js_sign(float(internal["growth"])) if internal and not thin else None,
                MARKET_WEIGHT[market_signal["outlook"]] if market_signal and market_grounded else None,
            )
            if v is not None
        ]
        agree = len(signals) == 2 and signals[0] == signals[1]
        confidence = "high" if agree else ("medium" if len(signals) >= 1 else "low")

        evidence: list[str] = []
        if internal:
            evidence.append(
                f"{internal['recent']} opening(s) in the last two quarters against {internal['prior']} in the two before"
            )
        if market_signal:
            suffix = "" if market_grounded else " (estimate without live sources)"
            evidence.append(f"Market {market_signal['outlook']}{suffix}: {market_signal['reason']}")
        if em and em["status"] != "established":
            evidence.append(f"An {em['status']} role in your ontology")
        if cov:
            evidence.append(f"Pool coverage is {cov['status']}")

        rows.append(
            {
                "role": role,
                "score": score_value,
                "internal": internal,
                "market": market_signal,
                "emerging": em["status"] if em else None,
                "coverage": cov["status"] if cov else None,
                "confidence": confidence,
                "evidence": evidence,
            }
        )

    rows = [r for r in rows if r["score"] > 0]
    rows.sort(key=lambda r: (-r["score"], r["role"]))
    return rows[:limit]
