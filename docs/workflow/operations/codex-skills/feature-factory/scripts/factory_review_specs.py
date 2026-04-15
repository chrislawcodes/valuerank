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
            {"reviewer": "codex", "lens": "correctness-adversarial", "model": DEFAULT_CODEX_MODEL},
            {"reviewer": "gemini", "lens": "regression-adversarial", "model": DEFAULT_GEMINI_MODEL},
        ]

    # Codex runs two reviews (primary + secondary) — it has codebase context and finds hard issues.
    # Gemini runs one review using the broadest-perspective lens for the stage.
    gemini_lens = ""
    codex_primary = ""
    codex_secondary = ""

    if stage == "spec":
        gemini_lens = "requirements-adversarial"
        codex_primary = "feasibility-adversarial"
        codex_secondary = "risk-adversarial" if sensitive else "edge-cases-adversarial"
    elif stage == "plan":
        gemini_lens = "testability-adversarial"
        codex_primary = "implementation-adversarial"
        codex_secondary = "risk-adversarial" if sensitive else "architecture-adversarial"
    elif stage == "tasks":
        gemini_lens = "coverage-adversarial"
        codex_primary = "execution-adversarial"
        codex_secondary = "risk-adversarial" if sensitive else "dependency-order-adversarial"
    elif stage == "diff":
        gemini_lens = "quality-adversarial"
        codex_primary = "correctness-adversarial"
        if sensitive:
            codex_secondary = "security-adversarial"
        elif performance_sensitive:
            codex_secondary = "performance-adversarial"
        else:
            codex_secondary = "regression-adversarial"
    elif stage == "closeout":
        gemini_lens = "residual-risk-adversarial"
        codex_primary = "fidelity-adversarial"
        codex_secondary = "rollout-risk-adversarial" if sensitive else "completeness-adversarial"
    else:
        raise ValueError(f"Unsupported stage: {stage}")

    if small_task_set and stage in ("tasks", "closeout"):
        return [
            {
                "reviewer": "codex",
                "lens": codex_primary,
                "model": DEFAULT_CODEX_MODEL,
            },
        ]

    return [
        {
            "reviewer": "codex",
            "lens": codex_primary,
            "model": DEFAULT_CODEX_MODEL,
        },
        {
            "reviewer": "codex",
            "lens": codex_secondary,
            "model": DEFAULT_CODEX_MODEL,
        },
        {
            "reviewer": "gemini",
            "lens": gemini_lens,
            "model": DEFAULT_GEMINI_MODEL,
        },
    ]
