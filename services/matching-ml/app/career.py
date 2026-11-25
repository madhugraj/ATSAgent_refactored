"""Career metrics + career score — the Python port of ATSAgent src/lib/career.ts.

Deterministic career-history analytics: employer tenures (consecutive roles at
the same company with a gap under 3 months merge into one tenure), title levels
(0-6 via the same regex table), promotion counting, gap accounting, and the
explicit penalty schedule of ``careerScore``. Byte-level parity with the TS
engine is the Phase 9 parity gate for this service.

``now`` is always passed in by the caller (the TS shadow hook sends the request
time) so both engines measure identical durations — never read the clock here.
"""

from __future__ import annotations

import math
import re
from datetime import UTC, datetime
from typing import Any

YEAR_MS = 365.25 * 86_400_000
MONTH = YEAR_MS / 12

LEVELS: list[tuple[re.Pattern[str], int]] = [
    (re.compile(r"\b(intern|trainee|graduate)\b", re.IGNORECASE), 0),
    (re.compile(r"\b(junior|associate|jr\.?)\b", re.IGNORECASE), 1),
    (re.compile(r"\b(engineer|developer|analyst|designer|consultant|specialist|executive)\b", re.IGNORECASE), 2),
    (re.compile(r"\b(senior|sr\.?|sde ?(?:ii|iii|3|2))\b", re.IGNORECASE), 3),
    (re.compile(r"\b(lead|principal|staff|architect|manager|supervisor)\b", re.IGNORECASE), 4),
    (re.compile(r"\b(head|director|senior manager|group manager)\b", re.IGNORECASE), 5),
    (re.compile(r"\b(vp|vice president|cto|ceo|cxo|chief|founder|partner)\b", re.IGNORECASE), 6),
]

_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
_ONGOING = re.compile(r"present|current|till date|to date|now", re.IGNORECASE)
_YEAR = re.compile(r"(19|20)\d{2}")
_MONTH_NAME = re.compile(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b", re.IGNORECASE)
_ISO = re.compile(r"(?:19|20)\d{2}[-/.](\d{1,2})\b")
_US = re.compile(r"\b(\d{1,2})[-/.](?:19|20)\d{2}")
_COMPANY_SUFFIX = re.compile(r"\b(private|pvt|limited|ltd|llp|inc|corp|corporation|co|company|plc|gmbh)\b\.?", re.IGNORECASE)

Present = object()


def title_level(title: str) -> int:
    level = -1
    for pattern, value in LEVELS:
        if pattern.search(title):
            level = max(level, value)
    return level


def company_key(company: str | None) -> str:
    value = (company or "").lower()
    value = _COMPANY_SUFFIX.sub("", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return value.strip()


def _to_date(value: str | None, now: datetime) -> datetime | None:
    """Parse "Mar 2025", "March 2025", "2025-03", "03/2025", "2025" to the
    first of that month; None when unreadable; None for ongoing markers."""
    if not value or _ONGOING.search(value):
        return None
    v = value.lower()
    year_m = _YEAR.search(v)
    if not year_m:
        return None
    year = int(year_m.group(0))
    if year < 1950 or year > now.year + 1:
        return None
    month = 0
    name = _MONTH_NAME.search(v)
    iso = _ISO.search(v)
    us = _US.search(v)
    if name:
        month = _MONTHS.index(name.group(1)[:3])
    elif iso and 1 <= int(iso.group(1)) <= 12:
        month = int(iso.group(1)) - 1
    elif us and 1 <= int(us.group(1)) <= 12:
        month = int(us.group(1)) - 1
    return datetime(year, month + 1, 1, tzinfo=UTC)


def _round1(n: float) -> float:
    # JS Math.round: half away from zero for positives — floor(n*10 + 0.5)/10.
    return math.floor(n * 10 + 0.5) / 10


def js_round(n: float) -> int:
    """JS Math.round semantics (Python round() is banker's rounding)."""
    return math.floor(n + 0.5)


def clamp(n: float) -> int:
    """matching.server.ts clamp: non-finite -> 0, then round and cap 0..100."""
    if not math.isfinite(n):
        return 0
    return max(0, min(100, js_round(n)))


def compute_career_metrics(
    history: list[dict[str, Any]],
    skill_recency_years: float | None,
    now: datetime,
) -> dict[str, Any]:
    """The measured career metrics — port of computeCareerMetrics."""
    rows = [r for r in (history or []) if r and (r.get("company") or r.get("title"))]
    roles: list[dict[str, Any]] = []
    for r in rows:
        start = _to_date(r.get("start"), now)
        end_raw = r.get("end")
        ongoing = not end_raw or bool(_ONGOING.search(end_raw))
        end = now if ongoing else _to_date(end_raw, now)
        if not start or not end or end < start:
            continue
        roles.append(
            {
                "start": start,
                "end": end,
                "ongoing": ongoing,
                "title": r.get("title") or "",
                "company": company_key(r.get("company")),
            }
        )
    roles.sort(key=lambda s: s["start"])

    tenures: list[dict[str, Any]] = []
    for r in roles:
        last = tenures[-1] if tenures else None
        if (
            last
            and r["company"]
            and last["company"] == r["company"]
            and (r["start"] - last["end"]).total_seconds() * 1000 < 3 * MONTH
        ):
            if r["end"] > last["end"]:
                last["end"] = r["end"]
            last["ongoing"] = last["ongoing"] or r["ongoing"]
        else:
            tenures.append(dict(r))

    def years(t: dict[str, Any]) -> float:
        delta: float = (t["end"] - t["start"]).total_seconds() * 1000 / YEAR_MS
        return delta

    lengths = [years(t) for t in tenures]
    total_years = sum(lengths)
    finished = [years(t) for t in tenures if not t["ongoing"]]

    longest_gap = 0.0
    total_gap = 0.0
    for i in range(1, len(tenures)):
        gap_months = (tenures[i]["start"] - tenures[i - 1]["end"]).total_seconds() * 1000 / MONTH
        if gap_months > 1:
            total_gap += gap_months
            longest_gap = max(longest_gap, gap_months)

    five_years_ago = now.timestamp() * 1000 - 5 * YEAR_MS
    recent = [t for t in tenures if t["end"].timestamp() * 1000 >= five_years_ago]
    jobs_last_5y = len({(t["company"] or f"#{i}") for i, t in enumerate(recent)})

    levels = [title_level(s["title"]) for s in roles]
    levels = [lv for lv in levels if lv >= 0]
    promotions = sum(1 for i in range(1, len(levels)) if levels[i] > levels[i - 1])
    progression = "unclear" if len(levels) < 2 else ("upward" if promotions > 0 else "lateral")

    current = next((t for t in tenures if t["ongoing"]), None)
    distinct_employers = len({(company_key(r.get("company")) or f"#{i}") for i, r in enumerate(rows)})

    recency = None if skill_recency_years is None else _round1(skill_recency_years)
    return {
        "employers": distinct_employers,
        "dated_employers": len(tenures),
        "total_years": _round1(total_years),
        "avg_tenure_years": _round1(total_years / len(tenures)) if tenures else 0,
        "shortest_stint_years": _round1(min(finished)) if finished else None,
        "current_tenure_years": _round1(years(current)) if current else None,
        "jobs_last_5y": jobs_last_5y,
        "longest_gap_months": js_round(longest_gap),
        "total_gap_months": js_round(total_gap),
        "promotions": promotions,
        "progression": progression,
        "skill_recency_years": recency,
    }


def career_score(metrics: dict[str, Any]) -> dict[str, Any]:
    """The explicit penalty schedule — port of careerScore. Returns
    {score, flags, notes}; flags/notes match the TS strings for parity."""
    flags: list[str] = []
    notes: list[str] = []

    if metrics["dated_employers"] == 0:
        return {
            "score": 60,
            "flags": ["Employment dates not readable from the CV — career quality could not be measured"],
            "notes": ["Scored neutrally (60) because no dated roles were found."],
        }

    score = 100.0

    def cut(points: int, why: str, flag: str | None = None) -> None:
        nonlocal score
        score -= points
        notes.append(f"-{points} · {why}")
        if flag:
            flags.append(flag)

    avg = metrics["avg_tenure_years"]
    employers = metrics["dated_employers"]
    if avg < 1.5:
        cut(25, f"average tenure {avg} yrs", f"Short average tenure ({avg} yrs across {employers} employers)")
    elif avg < 2.5:
        cut(10, f"average tenure {avg} yrs")
    else:
        notes.append(f"Stable: {avg} yrs average tenure.")

    shortest = metrics["shortest_stint_years"]
    if shortest is not None and shortest < 0.75:
        cut(8, f"shortest stint {shortest} yrs", f"A role shorter than 9 months ({shortest} yrs)")

    jobs5 = metrics["jobs_last_5y"]
    if jobs5 > 3:
        cut(12, f"{jobs5} employers in the last 5 years", f"{jobs5} employers in the last 5 years")

    longest_gap = metrics["longest_gap_months"]
    if longest_gap > 12:
        cut(14, f"{longest_gap}-month break between roles", f"Unexplained break of {longest_gap} months — ask, do not assume")
    elif longest_gap > 6:
        cut(8, f"{longest_gap}-month break between roles", f"Break of {longest_gap} months between roles")

    progression = metrics["progression"]
    if progression == "upward":
        promotions = metrics["promotions"]
        score += 8
        notes.append(f"+8 · {promotions} step-up{'s' if promotions != 1 else ''} in title level")
    elif progression == "lateral" and metrics["total_years"] >= 6:
        cut(12, "no title progression across 6+ years", "No visible title progression despite 6+ years of experience")

    recency = metrics["skill_recency_years"]
    if recency is not None and recency > 3:
        cut(10, f"core requisition skills last used ~{recency} yrs ago", f"Core skills last used about {recency} years ago")

    return {"score": max(0, min(100, js_round(score))), "flags": flags, "notes": notes}
