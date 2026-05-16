#!/usr/bin/env python3
"""Project-specific configuration loader for the Feature Factory runner.

Reads `feature-factory.config.json` from the repo root (or the path set in
FF_CONFIG_PATH).  Falls back to safe defaults when the file is absent so the
runner works out-of-the-box in repos that haven't added a config file yet.

Schema
------
{
  "repo": "OWNER/REPO",
  "protected_files": ["AGENTS.md", "MEMORY.md", ...],
  "do_not_modify_prompt_files": ["AGENTS.md", "MEMORY.md", ...],
  "sync_script": null | "relative/path/to/script.py"
}

Environment overrides
---------------------
FF_CONFIG_PATH   Absolute path to the config file (overrides the default
                 <REPO_ROOT>/feature-factory.config.json location).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

# Import REPO_ROOT lazily to avoid circular imports when factory_state is first
# loading — factory_config must be importable before factory_state finishes.
def _get_repo_root() -> Path:
    from factory_state import REPO_ROOT  # noqa: PLC0415
    return REPO_ROOT


def _derive_repo_from_git() -> str | None:
    """Try to derive OWNER/REPO from the git remote URL."""
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )
        url = result.stdout.strip()
        # Handle both https://github.com/OWNER/REPO.git and git@github.com:OWNER/REPO.git
        for prefix in ("https://github.com/", "git@github.com:"):
            if url.startswith(prefix):
                slug = url[len(prefix):]
                if slug.endswith(".git"):
                    slug = slug[:-4]
                return slug
        return None
    except Exception:
        return None


_DEFAULT_PROTECTED_FILES: list[str] = [
    "CLAUDE.md",
    "AGENTS.md",
    "MEMORY.md",
    "GEMINI.md",
    ".gitignore",
    "cloud/CLAUDE.md",
    "cloud/GEMINI.md",
    "cloud/agents.md",
]

_DEFAULT_DO_NOT_MODIFY: list[str] = [
    "CLAUDE.md",
    "AGENTS.md",
    "MEMORY.md",
]


def _load_raw() -> dict[str, Any]:
    """Return the parsed config dict, or {} if the file is absent or invalid."""
    override = os.environ.get("FF_CONFIG_PATH")
    if override:
        config_path = Path(override).expanduser().resolve()
    else:
        try:
            config_path = _get_repo_root() / "feature-factory.config.json"
        except Exception:
            return {}

    if not config_path.exists():
        return {}
    try:
        return json.loads(config_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _cfg() -> dict[str, Any]:
    """Cached config (loaded once per process)."""
    if not hasattr(_cfg, "_cache"):
        _cfg._cache = _load_raw()  # type: ignore[attr-defined]
    return _cfg._cache  # type: ignore[attr-defined]


def get_repo() -> str | None:
    """Return the OWNER/REPO string, or derive it from the git remote."""
    raw = _cfg().get("repo")
    if isinstance(raw, str) and raw and raw != "OWNER/REPO":
        return raw
    return _derive_repo_from_git()


def get_protected_files() -> list[str]:
    """Return the list of files that should never be left modified by agents."""
    raw = _cfg().get("protected_files")
    if isinstance(raw, list):
        return [str(x) for x in raw]
    return list(_DEFAULT_PROTECTED_FILES)


def get_do_not_modify_prompt_files() -> list[str]:
    """Return the list of files to put in the Codex 'DO NOT MODIFY' prompt line."""
    raw = _cfg().get("do_not_modify_prompt_files")
    if isinstance(raw, list):
        return [str(x) for x in raw]
    return list(_DEFAULT_DO_NOT_MODIFY)


def get_sync_script() -> Path | None:
    """Return the absolute path to the sync script, or None if not configured."""
    raw = _cfg().get("sync_script")
    if not raw:
        return None
    try:
        repo_root = _get_repo_root()
        p = (repo_root / str(raw)).resolve()
        return p if p.exists() else None
    except Exception:
        return None
