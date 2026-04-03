"""Decision model helpers for worker-side analysis."""

from __future__ import annotations

from typing import Any

# Signed distance: +2 = strongly favor first, −2 = strongly favor second
_DIRECTION_STRENGTH_TO_SIGNED: dict[tuple[str, str], float] = {
    ("favor_first", "strong"): 2.0,
    ("favor_first", "lean"): 1.0,
    ("neutral", "neutral"): 0.0,
    ("favor_second", "lean"): -1.0,
    ("favor_second", "strong"): -2.0,
}

# Canonical bucket names for histogram keying (matches variance_analysis directionCounts keys)
SIGNED_TO_BUCKET: dict[float, str] = {
    2.0: "favor_first.strong",
    1.0: "favor_first.lean",
    0.0: "neutral.neutral",
    -1.0: "favor_second.lean",
    -2.0: "favor_second.strong",
}


def resolve_transcript_score_details(
    transcript: dict[str, Any],
) -> tuple[str, str, str] | None:
    """
    Resolve canonical direction and strength from a transcript.

    Returns (direction, strength, source) or None for unscored transcripts.
    The TypeScript resolver has already handled legacy decisionCode → canonical
    conversion before the job reaches Python workers.
    """
    decision_model = transcript.get("decisionModelV2")
    if not isinstance(decision_model, dict):
        return None

    canonical = decision_model.get("canonical")
    if not isinstance(canonical, dict):
        return None

    direction = canonical.get("direction")
    strength = canonical.get("strength")

    if not isinstance(direction, str) or not isinstance(strength, str):
        return None

    return direction, strength, "canonical"


def resolve_transcript_signed_distance(transcript: dict[str, Any]) -> float | None:
    """
    Resolve canonical decision as signed distance (−2 to +2), or None if unscored.

    Resolution order:
    1. decisionModelV2.canonical (direction + strength) — primary path for new transcripts
    2. decisionModelV2.legacy.canonicalScore (1-5 int, already orientation-corrected) — fallback
    3. summary.score (1-5 int, already orientation-corrected) — legacy compatibility fallback

    The legacy fallbacks preserve compatibility with transcripts summarized before the
    winner-first cache was deployed. They use the formula: signed = score - 3.0
    (e.g. score 5 → +2, score 3 → 0, score 1 → -2).
    """
    resolved = resolve_transcript_score_details(transcript)
    if resolved is not None:
        direction, strength, _ = resolved
        return _DIRECTION_STRENGTH_TO_SIGNED.get((direction, strength))

    # Fallback 1: legacy.canonicalScore (already orientation-corrected)
    decision_model = transcript.get("decisionModelV2")
    if isinstance(decision_model, dict):
        legacy = decision_model.get("legacy")
        if isinstance(legacy, dict):
            canonical_score = legacy.get("canonicalScore")
            if isinstance(canonical_score, (int, float)) and 1 <= canonical_score <= 5:
                return float(canonical_score) - 3.0

    # Fallback 2: summary.score (orientation-corrected by the summarization handler)
    summary = transcript.get("summary")
    if isinstance(summary, dict):
        score = summary.get("score")
        if isinstance(score, (int, float)) and 1 <= score <= 5:
            return float(score) - 3.0

    return None
