#!/usr/bin/env python3
"""Text helpers for the summarize worker."""

import re
from typing import Any


FILLER_WORDS_PATTERN = re.compile(r"\b(?:their|the|a|an)\b", re.IGNORECASE)


def normalize_for_match(text: str) -> str:
    sanitized = text.replace("**", " ").replace("__", " ").replace("`", " ")
    sanitized = re.sub(r"[^a-z0-9]+", " ", sanitized.lower())
    return re.sub(r"\s+", " ", sanitized).strip()


def normalize_for_relaxed_match(text: str) -> str:
    base = normalize_for_match(text)
    relaxed = FILLER_WORDS_PATTERN.sub(" ", base)
    return re.sub(r"\s+", " ", relaxed).strip()


def build_response_text(transcript_content: dict[str, Any]) -> str:
    turns = transcript_content.get("turns", [])
    responses: list[str] = []
    for turn in turns:
        response = turn.get("targetResponse", "")
        if isinstance(response, str) and response:
            responses.append(response)
    return "\n".join(responses).strip()


def response_excerpt(text: str, limit: int = 280) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    return compact[:limit]


def response_segments(text: str) -> list[str]:
    segments: list[str] = []
    for block in re.split(r"[\n\r]+", text):
        stripped = block.strip()
        if not stripped:
            continue
        segments.extend(
            sentence.strip()
            for sentence in re.split(r"(?<=[.!?])\s+", stripped)
            if sentence.strip()
        )
    return segments


LEADING_DECISION_PREFIX_PATTERN = re.compile(
    r"^\s*(?:"
    r"(?:my\s+)?(?:final\s+|overall\s+)?(?:judg(?:e)?ment|answer|response|decision|choice|rating|score)"
    r"(?:\s+on\s+the\s+scale)?\s*(?:(?:is)\s*[:=]?|[:=])?\s*"
    r"|level\s+of\s+support\s*[:=]?\s*"
    r"|in\s+short\s*[:,-]?\s*"
    r"|overall\s*[:,-]?\s*"
    r")",
    re.IGNORECASE,
)


def strip_leading_decision_prefix(text: str) -> str:
    if not text:
        return ""

    stripped = text.replace("**", "").replace("__", "").replace("`", "").strip()
    previous = None
    while stripped and stripped != previous:
        previous = stripped
        stripped = LEADING_DECISION_PREFIX_PATTERN.sub("", stripped, count=1).strip()
    return stripped


def leading_response_candidates(text: str) -> list[tuple[str, bool]]:
    if not text:
        return []

    candidates: list[tuple[str, bool]] = []
    lines = [line.strip() for line in re.split(r"[\n\r]+", text) if line.strip()]
    segments = response_segments(text)

    for candidate in [
        lines[0] if lines else "",
        segments[0] if segments else "",
    ]:
        if not candidate:
            continue
        stripped = strip_leading_decision_prefix(candidate)
        for value, used_prefix_stripping in [
            (candidate, False),
            (stripped, stripped != candidate),
        ]:
            if value and not any(existing == value for existing, _ in candidates):
                candidates.append((value, used_prefix_stripping))

    return candidates
