#!/usr/bin/env python3
"""Telemetry helpers for AI subprocess calls."""
from __future__ import annotations

import builtins
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Callable, Optional

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from factory_state import load_workflow_state, with_locked_state  # noqa: E402


VALID_ACTIVITY_TYPES = frozenset(
    {
        "authoring",
        "reconciliation",
        "adversarial_review",
        "judge_panel",
        "implementation",
        "implementation_review",
        "orchestration",
    }
)

_PRICING_PATH = Path(__file__).resolve().parents[1] / "pricing.json"
_PRICING_CACHE: dict[str, object] | None = None
_CODEX_TOKEN_RE = re.compile(
    r'"totalTokens":\s*\{.*?"prompt":\s*(\d+).*?"candidates":\s*(\d+)',
    re.DOTALL,
)
_CLAUDE_INPUT_RE = re.compile(r'"input_tokens":\s*(\d+)')
_CLAUDE_OUTPUT_RE = re.compile(r'"output_tokens":\s*(\d+)')


def _now_iso8601_utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def _stage_state_for_slug(slug: str, stage: str) -> dict[str, object]:
    state = load_workflow_state(slug)
    stages = state.get("stages", {})
    if not isinstance(stages, dict):
        return {}
    stage_state = stages.get(stage, {})
    return stage_state if isinstance(stage_state, dict) else {}


def _artifact_sha_at_time(slug: str, stage: str) -> str | None:
    stage_state = _stage_state_for_slug(slug, stage)
    history = stage_state.get("adversarial_sha_history", [])
    if isinstance(history, list):
        for item in reversed(history):
            if isinstance(item, str) and item.strip():
                return item
    initial_sha = stage_state.get("initial_sha", "")
    if isinstance(initial_sha, str) and initial_sha.strip():
        return initial_sha
    return None


def _resolve_agent_id() -> str | None:
    for env_name in ("AGENT_ID", "CODEx_AGENT_ID", "CLAUDE_AGENT_ID", "GEMINI_AGENT_ID"):
        value = os.environ.get(env_name)
        if value:
            return value
    return None


def _load_pricing() -> dict[str, object]:
    global _PRICING_CACHE
    if _PRICING_CACHE is None:
        _PRICING_CACHE = json.loads(_PRICING_PATH.read_text(encoding="utf-8"))
    return _PRICING_CACHE


def lookup_pricing(model: str) -> dict[str, object] | None:
    pricing = _load_pricing()
    entry = pricing.get(model)
    if not isinstance(entry, dict):
        return None
    return dict(entry)


def _estimate_cost_usd(input_tokens: int, output_tokens: int, pricing: dict[str, object]) -> float | None:
    try:
        input_price = Decimal(str(pricing["input_usd_per_1k_tokens"]))
        output_price = Decimal(str(pricing["output_usd_per_1k_tokens"]))
    except Exception:
        return None
    total = (
        (Decimal(input_tokens) / Decimal(1000)) * input_price
        + (Decimal(output_tokens) / Decimal(1000)) * output_price
    )
    return float(total)


def parse_tokens_codex(result: subprocess.CompletedProcess) -> Optional[dict]:
    stderr = _text(getattr(result, "stderr", ""))
    matches = list(_CODEX_TOKEN_RE.finditer(stderr))
    if not matches:
        return None
    prompt, candidates = matches[-1].groups()
    return {"input_tokens": int(prompt), "output_tokens": int(candidates)}


def _find_gemini_token_payload(value: object) -> dict[str, object] | None:
    if isinstance(value, dict):
        for key in ("tokenStats", "totalTokens"):
            candidate = value.get(key)
            if isinstance(candidate, dict):
                return candidate
        for nested in value.values():
            found = _find_gemini_token_payload(nested)
            if found is not None:
                return found
    elif isinstance(value, list):
        for item in value:
            found = _find_gemini_token_payload(item)
            if found is not None:
                return found
    return None


def parse_tokens_gemini(result: subprocess.CompletedProcess) -> Optional[dict]:
    stdout = _text(getattr(result, "stdout", ""))
    try:
        payload = json.loads(stdout)
    except Exception:
        return None
    token_payload = _find_gemini_token_payload(payload)
    if not isinstance(token_payload, dict):
        return None
    prompt = token_payload.get("prompt", token_payload.get("input"))
    candidates = token_payload.get("candidates", token_payload.get("output"))
    if not isinstance(prompt, int) or not isinstance(candidates, int):
        return None
    return {"input_tokens": prompt, "output_tokens": candidates}


def parse_tokens_claude(result: subprocess.CompletedProcess) -> Optional[dict]:
    combined = _text(getattr(result, "stderr", "")) + "\n" + _text(getattr(result, "stdout", ""))
    input_match = _CLAUDE_INPUT_RE.search(combined)
    output_match = _CLAUDE_OUTPUT_RE.search(combined)
    if not input_match or not output_match:
        return None
    return {
        "input_tokens": int(input_match.group(1)),
        "output_tokens": int(output_match.group(1)),
    }


def _parser_for_model(model: str):
    if model.startswith("gpt-"):
        return parse_tokens_codex
    if model.startswith("claude-"):
        return parse_tokens_claude
    if model.startswith("gemini-"):
        return parse_tokens_gemini
    return None


def _parse_error(model: str) -> str:
    if model.startswith("gpt-"):
        return "no Codex token block found in stderr"
    if model.startswith("claude-"):
        return "no Claude token counts found in stdout or stderr"
    if model.startswith("gemini-"):
        return "no Gemini token stats found in stdout"
    return f"unsupported model prefix: {model}"


def record_ai_call(
    slug: str,
    stage: str,
    round: int,
    activity_type: str,
    model: str,
    callable_fn: Callable[[], subprocess.CompletedProcess],
) -> subprocess.CompletedProcess:
    if activity_type not in VALID_ACTIVITY_TYPES:
        raise ValueError(f"Unknown activity type: {activity_type}")

    started_at = _now_iso8601_utc()
    start_monotonic = time.perf_counter()
    result = callable_fn()
    ended_at = _now_iso8601_utc()
    duration_seconds = builtins.round(time.perf_counter() - start_monotonic, 6)

    parser = _parser_for_model(model)
    parsed = parser(result) if parser is not None else None
    pricing = lookup_pricing(model)
    parse_error = None
    cost_usd_estimate = None
    if parsed is None:
        parse_error = _parse_error(model)
    else:
        cost_usd_estimate = _estimate_cost_usd(
            int(parsed["input_tokens"]),
            int(parsed["output_tokens"]),
            pricing if pricing is not None else {},
        ) if pricing is not None else None

    record: dict[str, object] = {
        "stage": stage,
        "round": int(round),
        "activity_type": activity_type,
        "model": model,
        "input_tokens": parsed["input_tokens"] if parsed else None,
        "output_tokens": parsed["output_tokens"] if parsed else None,
        "cost_usd_estimate": cost_usd_estimate,
        "timestamp": ended_at,
        "started_at": started_at,
        "ended_at": ended_at,
        "duration_seconds": duration_seconds,
        "agent_id": _resolve_agent_id(),
        "artifact_sha_at_time": _artifact_sha_at_time(slug, stage),
    }
    if parse_error is not None:
        record["parse_error"] = parse_error
    if parsed is not None:
        total_tokens = int(parsed["input_tokens"]) + int(parsed["output_tokens"])
        if total_tokens < 2000:
            record["activity_subtype"] = "micro"

    with with_locked_state(slug) as state:
        usage = state.get("token_usage", [])
        if not isinstance(usage, list):
            usage = []
        usage = list(usage)
        usage.append(record)
        state["token_usage"] = usage
    return result
