"""Contract round-trip for the parser shadow response (Phase 9 rule 5).

The golden fixture must be accepted by the generated Pydantic model AND
re-serialize to the exact same JSON. The zod side of the same fixture is
asserted by ``tools/contracts/validate-fixture.mjs``.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest

from app.contracts_gen.parser_shadow_contract import ParserShadowResponse

REPO_ROOT = Path(__file__).resolve().parents[3]
GOLDEN = Path(__file__).resolve().parent / "golden"


def test_golden_round_trips_through_generated_model() -> None:
    golden: dict[str, Any] = json.loads((GOLDEN / "parser-shadow-response.json").read_text())
    parsed = ParserShadowResponse.model_validate(golden)
    assert parsed.model_dump(mode="json") == golden


def test_rejections_match_the_schema_not_just_the_shape() -> None:
    with pytest.raises(ValueError):
        ParserShadowResponse.model_validate({"ok": True})
    with pytest.raises(ValueError):
        ParserShadowResponse.model_validate({"text": None})


@pytest.mark.skipif(shutil.which("bun") is None, reason="bun not installed")
def test_zod_side_accepts_the_same_fixtures() -> None:
    result = subprocess.run(
        ["bun", "tools/contracts/validate-fixture.mjs"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "accepted by their zod schemas" in result.stdout
