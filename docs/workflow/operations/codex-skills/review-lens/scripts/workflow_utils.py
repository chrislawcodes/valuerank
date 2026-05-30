#!/usr/bin/env python3
import hashlib
import os
import re
import subprocess
from pathlib import Path


def _toolchain_repo_root() -> Path:
    """Return the repo root derived from this file's install location.

    This is the factory's *own* checkout — used only as a last-resort fallback
    when no target repo can be determined from the environment, recorded data,
    or the current git worktree. workflow_utils.py lives six directories below
    the repo root (docs/workflow/operations/codex-skills/review-lens/scripts/).
    """
    return Path(__file__).resolve().parents[6]


def resolve_repo_root(stored_repo_root: str = "") -> Path:
    """Resolve the TARGET repository root the factory is operating on.

    This is the single source of truth for "which repo are we acting on" shared
    by the feature-factory engine and the review-lens scripts. The factory's own
    scripts may live in a different repo than the one under work (cross-repo
    use), so tool location and target repo must be resolved separately — tool
    paths stay engine-relative, while every artifact / review / feature-run path
    resolves against the root this function returns.

    Resolution order, highest priority first:
      1. ``$FF_REPO_ROOT`` — explicit operator override.
      2. ``stored_repo_root`` — an absolute repo root recorded in checkpoint or
         review data. Skipped when blank, relative (e.g. the historical ``"."``),
         or not an existing directory.
      3. The current git worktree (``git rev-parse --show-toplevel`` from cwd).
      4. The factory's own install location (in-repo fallback for installs/tests).
    """
    override = os.environ.get("FF_REPO_ROOT")
    if override:
        return Path(override).expanduser().resolve()

    if stored_repo_root:
        candidate = Path(stored_repo_root).expanduser()
        if candidate.is_absolute() and candidate.is_dir():
            return candidate.resolve()

    git_result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        cwd=Path.cwd(),
        text=True,
        capture_output=True,
        check=False,
    )
    if git_result.returncode == 0:
        git_root = git_result.stdout.strip()
        if git_root:
            return Path(git_root).expanduser().resolve()

    return _toolchain_repo_root()


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


def _strip_plan_reconciliation_section(text: str) -> str:
    lines = text.splitlines(keepends=True)
    in_fence = False
    starts: list[int] = []
    heading_re = re.compile(r"^##\s+Review Reconciliation\s*$")
    for idx, line in enumerate(lines):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence and heading_re.match(line.rstrip()):
            starts.append(idx)
    if len(starts) != 1:
        return text
    start = starts[0]
    end = len(lines)
    for idx in range(start + 1, len(lines)):
        if re.match(r"^##\s+\S", lines[idx]):
            end = idx
            break
    return "".join(lines[:start]).rstrip() + "\n\n" + "".join(lines[end:]).lstrip()


def normalized_artifact_text(stage: str, path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    if stage == "plan":
        return _strip_plan_reconciliation_section(text).rstrip() + "\n"
    return text


def normalized_artifact_hash(stage: str, path: Path) -> str:
    return hashlib.sha256(normalized_artifact_text(stage, path).encode("utf-8")).hexdigest()


def full_artifact_hash(path: Path) -> str:
    return hashlib.sha256(path.read_text(encoding="utf-8").encode("utf-8")).hexdigest()


def artifact_hash_matches(stage: str, path: Path, data: dict) -> bool:
    current = normalized_artifact_hash(stage, path)
    if data.get("artifact_sha256") == current:
        return True
    if stage == "plan" and not data.get("narrowed_artifact_sha256"):
        return data.get("artifact_sha256") == full_artifact_hash(path)
    return False
