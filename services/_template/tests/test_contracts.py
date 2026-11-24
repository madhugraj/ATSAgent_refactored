"""Contract round-trip (refactor plan Phase 9 rule 5).

Every golden fixture in ``tests/golden`` must be accepted by the generated
Pydantic model AND re-serialize to the exact same JSON. The zod side of the
same fixtures is asserted by ``tools/contracts/validate-fixture.mjs``, which
the last test here invokes — both sides agree on the same bytes.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Any

import pytest

from app.contracts_gen.ai_callback_contract import AiCallbackOk, AiCallbackRequest
from app.contracts_gen.demo import BiasReportRequest

REPO_ROOT = Path(__file__).resolve().parents[3]
GOLDEN = Path(__file__).resolve().parent / "golden"

MODELS = {
    "bias-report-request.json": BiasReportRequest,
    "ai-callback-request.json": AiCallbackRequest,
    "ai-callback-ok.json": AiCallbackOk,
}


@pytest.mark.parametrize("fixture_name", sorted(MODELS))
def test_golden_round_trips_through_generated_model(fixture_name: str) -> None:
    golden: dict[str, Any] = json.loads((GOLDEN / fixture_name).read_text())
    model = MODELS[fixture_name]
    parsed = model.model_validate(golden)
    assert parsed.model_dump(mode="json") == golden


def test_rejections_match_the_schema_not_just_the_shape() -> None:
    """The generated models actually validate, they don't just accept anything."""
    with pytest.raises(ValueError):
        BiasReportRequest.model_validate(
            {
                "orgId": "not-a-uuid",
                "applicationId": str(uuid.uuid4()),
                "window": {"from": "2026-01-01", "to": "2026-06-30"},
            }
        )
    with pytest.raises(ValueError):
        AiCallbackOk.model_validate({"ok": False, "data": {}, "usage": None})
    with pytest.raises(ValueError):
        AiCallbackRequest.model_validate(
            {"system": "", "prompt": "x", "orgId": str(uuid.uuid4())}
        )


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
