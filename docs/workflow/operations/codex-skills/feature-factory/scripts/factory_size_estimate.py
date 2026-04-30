#!/usr/bin/env python3
"""Size auto-classification for Feature Factory workflow slugs.

Exports:
    estimate_size(slug: str) -> dict

The returned dict has the shape:
    {
        "size": "small" | "medium" | "large",
        "recommended_path": "quick" | "full",
        "signals": {
            "scope_path_count": int,
            "summary_chars": int,
            "diff_lines": int | None,
            "changed_files": int | None,
        },
        "reasoning": "<one-line human explanation>",
    }
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import factory_state


def _read_scope_path_count(slug: str) -> int:
    """Return the number of paths in scope.json, or 0 if missing/malformed."""
    scope_path = factory_state.workflow_dir(slug) / "scope.json"
    if not scope_path.exists():
        return 0
    try:
        raw = json.loads(scope_path.read_text(encoding="utf-8"))
    except Exception:
        return 0
    if isinstance(raw, list):
        return len(raw)
    if isinstance(raw, dict):
        paths = raw.get("paths", raw.get("scope_paths", []))
        if isinstance(paths, list):
            return len(paths)
    return 0


def _read_summary_chars(slug: str) -> int:
    """Return the character length of discovery.summary in state.json, or 0."""
    state_path = factory_state.factory_state_path(slug)
    if not state_path.exists():
        return 0
    try:
        raw = json.loads(state_path.read_text(encoding="utf-8"))
    except Exception:
        return 0
    discovery = raw.get("discovery", {})
    if not isinstance(discovery, dict):
        return 0
    summary = discovery.get("summary", "")
    if not isinstance(summary, str):
        return 0
    return len(summary)


def _git_diff_stats() -> tuple[int | None, int | None]:
    """Return (diff_lines, changed_files) against origin/main, or (None, None).

    Parses the last line of `git diff origin/main --stat`, which looks like:
        3 files changed, 120 insertions(+), 45 deletions(-)

    Returns None for both values if origin/main does not exist, the repo is not
    a git repo, or the stat line cannot be parsed.
    """
    try:
        result = subprocess.run(
            ["git", "diff", "origin/main", "--stat"],
            cwd=factory_state.REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None, None
    if result.returncode != 0:
        return None, None

    output = result.stdout.strip()
    if not output:
        return 0, 0

    # The summary line is the last line when there are changes, e.g.:
    # " 3 files changed, 120 insertions(+), 45 deletions(-)"
    lines = output.splitlines()
    summary_line = lines[-1].strip()

    diff_lines: int | None = None
    changed_files: int | None = None

    import re

    m_files = re.search(r"(\d+)\s+files? changed", summary_line)
    if m_files:
        changed_files = int(m_files.group(1))

    m_insert = re.search(r"(\d+)\s+insertion", summary_line)
    m_delete = re.search(r"(\d+)\s+deletion", summary_line)
    insertions = int(m_insert.group(1)) if m_insert else 0
    deletions = int(m_delete.group(1)) if m_delete else 0
    if m_files:
        diff_lines = insertions + deletions

    return diff_lines, changed_files


def _classify(
    scope_path_count: int,
    summary_chars: int,
    diff_lines: int | None,
    changed_files: int | None,
) -> str:
    """Return 'small', 'medium', or 'large' based on heuristics."""
    # Large: any single signal exceeds the large threshold.
    if scope_path_count >= 10:
        return "large"
    if summary_chars > 1500:
        return "large"
    if diff_lines is not None and diff_lines > 800:
        return "large"
    if changed_files is not None and changed_files >= 15:
        return "large"

    # Small: all signals within small bounds.
    diff_ok = diff_lines is None or diff_lines < 200
    files_ok = changed_files is None or changed_files <= 5
    if scope_path_count <= 3 and summary_chars < 500 and diff_ok and files_ok:
        return "small"

    return "medium"


def _build_reasoning(
    size: str,
    scope_path_count: int,
    summary_chars: int,
    diff_lines: int | None,
    changed_files: int | None,
    scope_missing: bool,
) -> str:
    if scope_missing:
        return "scope.json missing — classified as medium with no scope-path signal"

    parts: list[str] = []
    if size == "large":
        if scope_path_count >= 10:
            parts.append(f"{scope_path_count} scope paths (>= 10)")
        if summary_chars > 1500:
            parts.append(f"{summary_chars}-char summary (> 1500)")
        if diff_lines is not None and diff_lines > 800:
            parts.append(f"{diff_lines} diff lines (> 800)")
        if changed_files is not None and changed_files >= 15:
            parts.append(f"{changed_files} changed files (>= 15)")
        return "large signals: " + ", ".join(parts)
    elif size == "small":
        diff_note = "no diff yet" if diff_lines is None else f"{diff_lines} diff lines"
        return (
            f"{scope_path_count} scope path{'s' if scope_path_count != 1 else ''}, "
            f"{summary_chars}-char summary, {diff_note}"
        )
    else:
        # medium — explain what kept it out of small
        reasons: list[str] = []
        if scope_path_count > 3:
            reasons.append(f"{scope_path_count} scope paths (> 3)")
        if summary_chars >= 500:
            reasons.append(f"{summary_chars}-char summary (>= 500)")
        if diff_lines is not None and diff_lines >= 200:
            reasons.append(f"{diff_lines} diff lines (>= 200)")
        if changed_files is not None and changed_files > 5:
            reasons.append(f"{changed_files} changed files (> 5)")
        if reasons:
            return "medium: " + ", ".join(reasons)
        return "medium by default"


def estimate_size(slug: str) -> dict:
    """Return a size-estimate dict for the given workflow slug.

    The dict shape is:
        {
            "size": "small" | "medium" | "large",
            "recommended_path": "quick" | "full",
            "signals": {
                "scope_path_count": int,
                "summary_chars": int,
                "diff_lines": int | None,
                "changed_files": int | None,
            },
            "reasoning": "<one-line human explanation>",
        }
    """
    # Check if scope.json exists for the reasoning message.
    scope_path = factory_state.workflow_dir(slug) / "scope.json"
    scope_missing = not scope_path.exists()

    scope_path_count = _read_scope_path_count(slug)
    summary_chars = _read_summary_chars(slug)
    diff_lines, changed_files = _git_diff_stats()

    # If scope.json is missing, default to medium regardless of other signals.
    if scope_missing:
        size = "medium"
    else:
        size = _classify(scope_path_count, summary_chars, diff_lines, changed_files)

    recommended_path = "quick" if size == "small" else "full"
    reasoning = _build_reasoning(
        size, scope_path_count, summary_chars, diff_lines, changed_files, scope_missing
    )

    return {
        "size": size,
        "recommended_path": recommended_path,
        "signals": {
            "scope_path_count": scope_path_count,
            "summary_chars": summary_chars,
            "diff_lines": diff_lines,
            "changed_files": changed_files,
        },
        "reasoning": reasoning,
    }
