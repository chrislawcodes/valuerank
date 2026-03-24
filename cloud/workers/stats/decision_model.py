"""Decision model compatibility helpers for worker-side analysis."""

from __future__ import annotations

import math
from typing import Any


def _parse_compat_score(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        numeric = float(value)
    elif isinstance(value, str) and value.strip() != "":
        try:
            numeric = float(value)
        except ValueError:
            return None
    else:
        return None

    if not math.isfinite(numeric):
        return None
    if numeric < 1.0 or numeric > 5.0 or not numeric.is_integer():
        return None
    return numeric


def _score_from_canonical_decision(decision: Any) -> float | None:
    if not isinstance(decision, dict):
        return None

    direction = decision.get("direction")
    strength = decision.get("strength")

    if direction == "favor_first" and strength == "strong":
        return 5.0
    if direction == "favor_first" and strength == "lean":
        return 4.0
    if direction == "neutral" and strength == "neutral":
        return 3.0
    if direction == "favor_second" and strength == "lean":
        return 2.0
    if direction == "favor_second" and strength == "strong":
        return 1.0
    return None


def normalize_resolved_score(score: float, already_normalized: bool, orientation_flipped: bool) -> float:
    """Return the analysis-facing scalar score for a resolved transcript."""
    if already_normalized or not orientation_flipped:
        return float(score)
    return float(6 - score)


def resolve_transcript_score_details(transcript: dict[str, Any]) -> tuple[float, bool] | None:
    """
    Resolve a transcript score and whether it is already canonicalized.

    Preference order:
    1. `decisionModelV2.legacy.canonicalScore`
    2. `decisionModelV2.legacy.rawScore`
    3. `decisionModelV2.canonical.direction` + `strength`
    4. legacy `summary.score` when it is already on the canonical 1-5 scale

    The fallback preserves legacy 1-5 compatibility while letting the V2
    envelope take precedence when available.
    """
    decision_model = transcript.get("decisionModelV2")
    if isinstance(decision_model, dict):
        legacy = decision_model.get("legacy")
        if isinstance(legacy, dict):
            canonical_score = _parse_compat_score(legacy.get("canonicalScore"))
            if canonical_score is not None:
                return canonical_score, True

            raw_score = _parse_compat_score(legacy.get("rawScore"))
            if raw_score is not None:
                return raw_score, False

        canonical = decision_model.get("canonical")
        canonical_score = _score_from_canonical_decision(canonical)
        if canonical_score is not None:
            return canonical_score, True

    summary = transcript.get("summary", {})
    if isinstance(summary, dict):
        score = _parse_compat_score(summary.get("score"))
        if score is not None:
            return score, False
    return None


def resolve_transcript_score(transcript: dict[str, Any]) -> float | None:
    resolved = resolve_transcript_score_details(transcript)
    if resolved is None:
        return None
    score, _ = resolved
    return score


def resolve_transcript_normalized_score(transcript: dict[str, Any]) -> float | None:
    resolved = resolve_transcript_score_details(transcript)
    if resolved is None:
        return None
    score, already_normalized = resolved
    return normalize_resolved_score(score, already_normalized, bool(transcript.get("orientationFlipped", False)))
