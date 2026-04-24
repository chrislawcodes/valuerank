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

# Every pattern below is matched against text that has already been lowercased
# by detect_actionable_findings(). All patterns anchor to start-of-line (after
# optional whitespace) to avoid matching prose mentions of severity words inside
# sentences. ACTIONABLE_FINDING_SHAPES documents the supported forms; when a
# reviewer starts using a new shape, update this regex and add a test.
#
# Supported shapes (each example drawn from a real review):
#   1. "- high: ..."                           bullet + severity + colon
#   2. "- [tag] high: ..."                     bullet + bracket tag + severity
#   3. "- HIGH [CODE-CONFIRMED]: ..."          bullet + bare severity + bracket tag
#   4. "- **HIGH**: ..."                       bullet + bold severity + colon
#   5. "| **HIGH** | ..."                      table cell with bold severity
#   6. "1. **HIGH**: ..."                      numbered list + bold severity
#   7. "### HIGH: ..."                         heading with severity word
#   8. "### 1. Finding title"                  heading with rank prefix (matched via next line)
#   9. "**HIGH**: ..."                         bold-prefix at paragraph start
#  10. "**HIGH [CODE-CONFIRMED]**: ..."        bold-prefix with tag
#  11. "**Severity**: HIGH"                    inline-field form (Gemini style)
#  12. "Severity: HIGH"                        inline-field without bold
ACTIONABLE_FINDING_SHAPES = (
    "bullet-colon",
    "bullet-bracket-tag-colon",
    "bullet-bare-plus-bracket-tag",
    "bullet-bold-severity",
    "table-bold-severity",
    "numbered-bold-severity",
    "heading-severity",
    "paragraph-bold-prefix",
    "paragraph-bold-prefix-bracket",
    "inline-severity-field-bold",
    "inline-severity-field-plain",
)

_SEV = r"(?:critical|high|medium)"

_ACTIONABLE_FINDING_RE = re.compile(
    r"(?:"
    # 1-2. Bullet + severity + colon: "- high:" or "- [tag] high:"
    r"^\s*-\s+(?:\[[^\]]+\]\s+)?" + _SEV + r":"
    r"|"
    # 3. Bullet + bare severity + bracket tag: "- high [code-confirmed]:"
    r"^\s*-\s+" + _SEV + r"\s+\[[^\]]+\]\s*:"
    r"|"
    # 4. Bullet + bold severity (with optional inner bracket tag):
    # "- **high**:" or "- **high [code-confirmed]**:" or
    # "- **HIGH [CODE-CONFIRMED]** rest-of-line" (no colon, as some lenses emit)
    r"^\s*-\s+\*\*" + _SEV + r"(?:\s*\[[^\]]+\])?\*\*(?:\s*:|\s+)"
    r"|"
    # 5. Table cell with bold severity: "| **high** |"
    r"^\|\s*\*\*" + _SEV + r"\*\*"
    r"|"
    # 6a. Numbered list + bold severity: "1. **high**:"
    r"^\s*\d+\.\s+\*\*" + _SEV + r"\*\*\s*:"
    r"|"
    # 6b. Numbered list + plain severity + colon (no bold): "1. high:" or "1. HIGH [tag]:"
    r"^\s*\d+\.\s+" + _SEV + r"(?:\s+\[[^\]]+\])?\s*:"
    r"|"
    # 7. Heading with severity word followed by colon or end-of-line.
    # Must be `### HIGH:` or `### HIGH` on its own line — NOT `### HIGH availability
    # target` (false-positive from section titles). Colon is the only delimiter
    # allowed since `-` or `--` can appear in compound words like `MEDIUM-term`.
    r"^#+\s+(?:\d+\.\s+)?" + _SEV + r"\s*(?::|$)"
    r"|"
    # 9-10. Paragraph start with bold prefix: "**high**:" or "**high [code-confirmed]**:"
    r"^\s*\*\*" + _SEV + r"(?:\s*\[[^\]]+\])?\*\*\s*:"
    r"|"
    # 11. Inline Severity field bold: "**severity**: high" or "**severity:** high"
    r"^\s*\*\*severity(?:\*\*)?:\*?\*?\s*" + _SEV + r"\b"
    r"|"
    # 12. Inline Severity field plain: "severity: high"
    r"^\s*severity:\s*" + _SEV + r"\b"
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
