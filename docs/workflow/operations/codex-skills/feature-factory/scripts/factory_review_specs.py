#!/usr/bin/env python3
"""Review spec definitions, actionable-finding detection, and lens selection.

Pure helpers with no filesystem or workflow-state side effects. Extracted from
factory_review.py to keep each module under the 400-line source limit.
"""
import re
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_GEMINI_MODEL = "gemini-2.5-pro"
DEFAULT_CODEX_MODEL = "gpt-5.4-mini"

SMALL_TASK_SET_THRESHOLD = 15
_AUTO_ACCEPT_NOTE = "No actionable findings detected — auto-accepted"

_ACTIONABLE_FINDING_RE = re.compile(
    r"(?:"
    r"^\s*-\s+(?:\[[^\]]+\]\s+)?(high|medium):"  # bullet-list: "- high:" or "- [tag] high:"
    r"|"
    r"^\|\s*\*\*(critical|high|medium)\*\*"  # table row: "| **HIGH** |" or "| **CRITICAL** |"
    r")",
    re.MULTILINE,
)


# ---------------------------------------------------------------------------
# Review helpers
# ---------------------------------------------------------------------------


def detect_actionable_findings(review_path: Path) -> bool:
    """Return True if the review contains any HIGH or MEDIUM severity findings.

    Lowercases the full text once so mixed-case headings (High, HIGH, high) all match.
    Returns False if the file cannot be read, treating unreadable files as non-blocking.
    """
    try:
        text = review_path.read_text(encoding="utf-8").lower()
    except OSError:
        return False
    return bool(_ACTIONABLE_FINDING_RE.search(text))


def trim_detail(text: str, limit: int = 240) -> str:
    stripped = " ".join(text.split())
    if len(stripped) <= limit:
        return stripped
    return stripped[: limit - 3] + "..."


def pick_secondary_lens(primary: str, default: str, candidates: list[str]) -> str:
    ordered = [*candidates, default]
    seen: set[str] = set()
    for lens in ordered:
        if not lens or lens in seen:
            continue
        seen.add(lens)
        if lens != primary:
            return lens
    return default if default != primary else f"{primary}-secondary"


def required_reviews(
    stage: str,
    sensitive: bool,
    large_structural: bool,
    performance_sensitive: bool,
    extra_gemini: list[str],
    fast: bool = False,
    small_task_set: bool = False,
) -> list[dict[str, str]]:
    if fast:
        return [
            {"reviewer": "gemini", "lens": "regression-adversarial", "model": DEFAULT_GEMINI_MODEL},
            {"reviewer": "codex", "lens": "correctness-adversarial", "model": DEFAULT_CODEX_MODEL},
        ]

    primary_gemini = ""
    secondary_default = ""
    codex_lens = ""
    extra_candidates = list(extra_gemini)

    if stage == "spec":
        primary_gemini = "requirements-adversarial"
        secondary_default = "edge-cases-adversarial"
        codex_lens = "feasibility-adversarial"
        if sensitive:
            extra_candidates.insert(0, "risk-adversarial")
    elif stage == "plan":
        primary_gemini = "architecture-adversarial"
        secondary_default = "testability-adversarial"
        codex_lens = "implementation-adversarial"
        if sensitive:
            extra_candidates.insert(0, "risk-adversarial")
    elif stage == "tasks":
        primary_gemini = "dependency-order-adversarial"
        secondary_default = "coverage-adversarial"
        codex_lens = "execution-adversarial"
        if sensitive:
            extra_candidates.insert(0, "risk-adversarial")
    elif stage == "diff":
        primary_gemini = "regression-adversarial"
        secondary_default = "quality-adversarial"
        codex_lens = "correctness-adversarial"
        if sensitive:
            extra_candidates.insert(0, "security-adversarial")
        if performance_sensitive:
            extra_candidates.insert(0, "performance-adversarial")
        if large_structural:
            extra_candidates.append("quality-adversarial")
    elif stage == "closeout":
        primary_gemini = "completeness-adversarial"
        secondary_default = "residual-risk-adversarial"
        codex_lens = "fidelity-adversarial"
        if sensitive:
            extra_candidates.insert(0, "rollout-risk-adversarial")
    else:
        raise ValueError(f"Unsupported stage: {stage}")

    secondary_gemini = pick_secondary_lens(primary_gemini, secondary_default, extra_candidates)

    if small_task_set and stage in ("tasks", "closeout"):
        return [
            {
                "reviewer": "codex",
                "lens": codex_lens,
                "model": DEFAULT_CODEX_MODEL,
            },
        ]

    return [
        {
            "reviewer": "gemini",
            "lens": primary_gemini,
            "model": DEFAULT_GEMINI_MODEL,
        },
        {
            "reviewer": "gemini",
            "lens": secondary_gemini,
            "model": DEFAULT_GEMINI_MODEL,
        },
        {
            "reviewer": "codex",
            "lens": codex_lens,
            "model": DEFAULT_CODEX_MODEL,
        },
    ]
