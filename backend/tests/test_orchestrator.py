"""Tests for orchestrator helpers: _normalize_decision, _parse_llm_response."""

import pytest

from app.schemas.orchestrator import Decision
from app.services.orchestrator import _normalize_decision, _parse_llm_response


@pytest.mark.parametrize("raw,expected", [
    ("go", Decision.GO),
    ("Go", Decision.GO),
    ("GO", Decision.GO),
    ("modify", Decision.MODIFY),
    ("Modify", Decision.MODIFY),
    ("skip", Decision.SKIP),
    ("Skip", Decision.SKIP),
    ("", Decision.GO),
    (None, Decision.GO),
    ("unknown", Decision.GO),
])
def test_normalize_decision(raw, expected):
    """Decision string is normalized to enum; unknown defaults to Go."""
    assert _normalize_decision(raw) == expected


def test_parse_llm_response_go():
    """Valid JSON with decision Go is parsed."""
    text = '{"decision": "Go", "reason": "All good.", "modified_plan": null, "suggestions_next_days": null}'
    r = _parse_llm_response(text)
    assert r.decision == Decision.GO
    assert r.reason == "All good."
    assert r.modified_plan is None
    assert r.suggestions_next_days is None


def test_parse_llm_response_skip():
    """Valid JSON with decision Skip is parsed."""
    text = '{"decision": "Skip", "reason": "Poor sleep.", "modified_plan": null, "suggestions_next_days": "Rest."}'
    r = _parse_llm_response(text)
    assert r.decision == Decision.SKIP
    assert r.reason == "Poor sleep."
    assert r.suggestions_next_days == "Rest."


def test_parse_llm_response_strips_code_fence():
    """Response wrapped in ```json ... ``` is unwrapped."""
    text = '```json\n{"decision": "Modify", "reason": "Reduce load.", "modified_plan": null, "suggestions_next_days": null}\n```'
    r = _parse_llm_response(text)
    assert r.decision == Decision.MODIFY
    assert r.reason == "Reduce load."


def test_parse_llm_response_truncates_long_reason():
    """Reason longer than 1000 chars is truncated."""
    long_reason = "x" * 1500
    text = f'{{"decision": "Go", "reason": "{long_reason}", "modified_plan": null, "suggestions_next_days": null}}'
    r = _parse_llm_response(text)
    assert len(r.reason) == 1000
    assert r.reason == "x" * 1000


def test_parse_llm_response_modified_plan_valid():
    """Valid modified_plan object is parsed."""
    text = '{"decision": "Modify", "reason": "OK", "modified_plan": {"title": "Easy run", "start_date": "2026-02-25T08:00:00", "end_date": null, "description": "30 min"}, "suggestions_next_days": null}'
    r = _parse_llm_response(text)
    assert r.modified_plan is not None
    assert r.modified_plan.title == "Easy run"
    assert r.modified_plan.start_date == "2026-02-25T08:00:00"
