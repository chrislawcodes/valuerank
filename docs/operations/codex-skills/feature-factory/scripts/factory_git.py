#!/usr/bin/env python3
"""Git and subprocess utilities for the feature factory runner.

Pure wrappers around git, shell commands, and filesystem scaffolding.
No domain knowledge — just tool invocation.
"""
import shutil
import subprocess
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from factory_state import REPO_ROOT  # noqa: E402

SYNC_SCRIPT = REPO_ROOT / "scripts" / "sync-codex-skills.py"


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, text=True)


def git_output(*args: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(REPO_ROOT), *args],
            check=True,
            capture_output=True,
            text=True,
            timeout=20,
        )
        return result.stdout.strip()
    except Exception:
        return None


def _sha_is_valid_ancestor(sha: str) -> bool:
    """Return True iff sha exists in the repo AND is an ancestor of HEAD."""
    if not sha:
        return False
    # Check existence first.
    try:
        subprocess.run(
            ["git", "-C", str(REPO_ROOT), "cat-file", "-t", sha],
            check=True, capture_output=True, timeout=10,
        )
    except Exception:
        return False
    # Check ancestry.
    try:
        result = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "merge-base", "--is-ancestor", sha, "HEAD"],
            capture_output=True, timeout=10,
        )
        return result.returncode == 0
    except Exception:
        return False


def _git_head_sha(repo: Path) -> str | None:
    """Return the current HEAD SHA for repo, or None if unavailable."""
    try:
        result = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.stdout.strip()
    except Exception:
        return None


def current_branch_name() -> str | None:
    branch = git_output("rev-parse", "--abbrev-ref", "HEAD")
    if not branch or branch == "HEAD":
        return None
    return branch


def upstream_branch_name() -> str | None:
    return git_output("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}")


def commits_behind_upstream() -> int | None:
    """Return how many commits HEAD is behind its upstream, or None if unknown."""
    result = git_output("rev-list", "--count", "HEAD..@{upstream}")
    if result is None:
        return None
    try:
        return int(result)
    except ValueError:
        return None


def repo_remote_url(remote_name: str) -> str | None:
    return git_output("remote", "get-url", remote_name)


def command_path(name: str) -> str | None:
    return shutil.which(name)


def ensure_sync() -> None:
    run([sys.executable, str(SYNC_SCRIPT), "--sync-if-needed"])


def ensure_file(path: Path, heading: str) -> None:
    if not path.exists():
        path.write_text(f"# {heading}\n", encoding="utf-8")
