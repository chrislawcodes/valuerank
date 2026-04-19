#!/usr/bin/env python3
"""Prompt loading and template substitution helpers for judge prompts."""
from collections import ChainMap
from pathlib import Path
import re
import string


JUDGE_PROMPTS_DIR = Path(__file__).parent.parent / "judge-prompts"
VALID_LENSES = frozenset({"completeness", "restatement", "implementation-risk"})
REQUIRED_TEMPLATE_VARIABLES = {
    "completeness": {"high_findings_with_ids", "spec", "plan", "tasks"},
    "restatement": {"prior_findings_and_fixes", "latest_findings"},
    "implementation-risk": {"spec", "plan", "tasks", "diff_since_last_round"},
}

_SECTION_HEADINGS = {
    "system": "# System Prompt",
    "user": "# User Prompt Template",
}
_FIELD_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class DefaultFormatDict(dict):
    """Mapping used to raise a clear KeyError for missing format variables."""

    def __missing__(self, key: str) -> str:
        raise KeyError(f"Missing template variable: {key}")


def _extract_section(text: str, heading: str) -> str:
    lines = text.splitlines()
    start_index: int | None = None
    for idx, line in enumerate(lines):
        if line.strip() == heading:
            start_index = idx + 1
            break
    if start_index is None:
        raise ValueError(f"Missing {heading} section")

    end_index = len(lines)
    for idx in range(start_index, len(lines)):
        line = lines[idx].strip()
        if line.startswith("# ") and line != heading:
            end_index = idx
            break
    return "\n".join(lines[start_index:end_index]).strip()


def load_prompt(lens: str) -> tuple[str, str]:
    """Load a prompt file and return its system prompt and user template."""
    if lens not in VALID_LENSES:
        raise ValueError(f"Unknown judge lens: {lens}")
    path = JUDGE_PROMPTS_DIR / f"{lens}.md"
    text = path.read_text(encoding="utf-8")
    system_prompt = _extract_section(text, _SECTION_HEADINGS["system"])
    user_prompt = _extract_section(text, _SECTION_HEADINGS["user"])
    return system_prompt, user_prompt


def substitute(template: str, variables: dict[str, str]) -> str:
    """Substitute {name} placeholders using format_map-compatible semantics."""
    mapping = ChainMap(dict(variables), DefaultFormatDict())
    return template.format_map(mapping)


def _template_variables(template: str) -> set[str]:
    formatter = string.Formatter()
    variables: set[str] = set()
    for _, field_name, _, _ in formatter.parse(template):
        if field_name is None:
            continue
        if not _FIELD_NAME_RE.fullmatch(field_name):
            raise AssertionError(f"Unsupported template placeholder: {field_name!r}")
        variables.add(field_name)
    return variables


def validate_template_variables(lens: str, template: str) -> None:
    """Assert that template placeholders exactly match the required variables."""
    if lens not in VALID_LENSES:
        raise ValueError(f"Unknown judge lens: {lens}")
    expected = REQUIRED_TEMPLATE_VARIABLES[lens]
    try:
        actual = _template_variables(template)
    except ValueError as exc:
        raise AssertionError(f"Invalid template syntax for {lens}: {exc}") from exc
    if actual != expected:
        raise AssertionError(
            f"Template variables for {lens} must exactly match {sorted(expected)}; "
            f"found {sorted(actual)}"
        )
