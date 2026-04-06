#!/usr/bin/env python3
import hashlib
from pathlib import Path


def repo_relative_path(path: Path, repo_root: Path) -> str:
    resolved = path.resolve()
    try:
        return str(resolved.relative_to(repo_root.resolve()))
    except ValueError:
        return str(resolved)


def resolve_stored_path(raw: str, repo_root: Path, stored_repo_root: str = "") -> Path:
    candidate = Path(raw)
    if not candidate.is_absolute():
        return (repo_root / candidate).resolve()

    if candidate.exists():
        return candidate.resolve()

    if stored_repo_root:
        try:
            return (repo_root / candidate.relative_to(Path(stored_repo_root))).resolve()
        except ValueError:
            pass

    repo_name = repo_root.name
    if repo_name in candidate.parts:
        idx = candidate.parts.index(repo_name)
        suffix = candidate.parts[idx + 1 :]
        if suffix:
            return (repo_root / Path(*suffix)).resolve()

    return candidate


def normalized_artifact_text(stage: str, path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if stage != "plan" or "## Review Reconciliation" not in text:
        return text
    before, remainder = text.split("## Review Reconciliation", 1)
    trailing = remainder.split("\n## ", 1)
    if len(trailing) == 2:
        return before.rstrip() + "\n\n## " + trailing[1].lstrip()
    return before.rstrip() + "\n"


def normalized_artifact_hash(stage: str, path: Path) -> str:
    return hashlib.sha256(normalized_artifact_text(stage, path).encode("utf-8")).hexdigest()
