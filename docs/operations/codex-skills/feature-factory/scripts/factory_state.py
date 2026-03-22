#!/usr/bin/env python3
"""Pure path helpers, atomic I/O primitives, and state constants for the feature workflow.

Nothing in this module calls external processes or performs I/O beyond reading
Path metadata.  Every public symbol is safe to import in tests without side
effects.
"""
import json
import os
import tempfile
from pathlib import Path


# ---------------------------------------------------------------------------
# Repository root + canonical subdirectory roots
# ---------------------------------------------------------------------------

REPO_ROOT: Path = Path(__file__).resolve().parents[5]
FACTORY_RUNS_ROOT: Path = REPO_ROOT / "docs" / "feature-runs"

# ---------------------------------------------------------------------------
# String constants used as workflow-state dictionary keys
# ---------------------------------------------------------------------------

FACTORY_STATE = "state.json"

BLOCKED_KEY = "blocked"
DISCOVERY_KEY = "discovery"
DELIVERY_KEY = "delivery"
DIRTY_OVERRIDE_KEY = "dirty_overrides"
CHECKPOINT_FALLBACK_KEY = "checkpoint_fallback"
CHECKPOINT_PROGRESS_KEY = "checkpoint_progress"

# ---------------------------------------------------------------------------
# Atomic JSON I/O
# ---------------------------------------------------------------------------


def atomic_json_write(path: Path, data: dict) -> None:
    """Write *data* to *path* as JSON atomically via a temp file + os.replace()."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = data
    # Keep legacy state.json writers compatible with the current runner by
    # down-revving discovery.version on disk only.
    if path.name == FACTORY_STATE and isinstance(data, dict):
        discovery = data.get(DISCOVERY_KEY)
        if isinstance(discovery, dict) and discovery.get("version", 1) >= 2:
            payload = dict(data)
            legacy_discovery = dict(discovery)
            legacy_discovery["version"] = 1
            payload[DISCOVERY_KEY] = legacy_discovery
    text = json.dumps(payload, indent=2)
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=".tmp.", suffix=".json")
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        tmp_path.replace(path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def read_json_file(path: Path) -> tuple[dict | None, str]:
    """Return (parsed_dict, "") on success, or (None, error_string) on failure."""
    if not path.exists():
        return None, ""
    try:
        return json.loads(path.read_text(encoding="utf-8")), ""
    except Exception as exc:
        return None, str(exc)


# ---------------------------------------------------------------------------
# Pure path helpers
# ---------------------------------------------------------------------------


def validated_slug(slug: str) -> str:
    """Return a validated single-component workflow slug, or raise SystemExit."""
    candidate = Path(slug)
    if not slug or candidate.is_absolute() or len(candidate.parts) != 1:
        raise SystemExit(f"Invalid workflow slug: {slug!r}")
    part = candidate.parts[0]
    if part in {".", ".."}:
        raise SystemExit(f"Invalid workflow slug: {slug!r}")
    resolved = (FACTORY_RUNS_ROOT / part).resolve()
    try:
        resolved.relative_to(FACTORY_RUNS_ROOT.resolve())
    except ValueError as exc:
        raise SystemExit(f"Invalid workflow slug: {slug!r}") from exc
    return part


def normalized_repo_path(raw: str, field_name: str) -> str:
    """Resolve *raw* to a repo-relative path string, or raise SystemExit."""
    stripped = raw.strip()
    if not stripped or stripped.strip("/") == "":
        raise SystemExit(f"Invalid {field_name}: {raw!r}")
    candidate = Path(stripped)
    resolved = (
        candidate.resolve()
        if candidate.is_absolute()
        else (REPO_ROOT / candidate).resolve()
    )
    try:
        relative = resolved.relative_to(REPO_ROOT.resolve())
    except ValueError as exc:
        raise SystemExit(f"Invalid {field_name}: {raw!r}") from exc
    return str(relative)


def workflow_dir(slug: str) -> Path:
    return FACTORY_RUNS_ROOT / validated_slug(slug)


def reviews_dir(slug: str) -> Path:
    return workflow_dir(slug) / "reviews"


def scope_manifest_path(slug: str) -> Path:
    return workflow_dir(slug) / "scope.json"


def factory_state_path(slug: str) -> Path:
    return workflow_dir(slug) / FACTORY_STATE


def checkpoint_manifest_path(slug: str, stage: str) -> Path:
    return reviews_dir(slug) / f"{stage}.checkpoint.json"


def default_artifact_path(slug: str, stage: str) -> Path:
    if stage == "diff":
        return reviews_dir(slug) / "implementation.diff.patch"
    return workflow_dir(slug) / f"{stage}.md"


# ---------------------------------------------------------------------------
# Default state shapes
# ---------------------------------------------------------------------------


def default_discovery_state() -> dict:
    return {
        "version": 2,
        "required": False,
        "complete": True,
        "question_count": 0,
        "asked_count": 0,
        "questions": [],
        "assumptions": [],
        "summary": "",
        "updated_at": 0,
        "answers": {},
        "non_goals": [],
        "acceptance_criteria": [],
        "unresolved": [],
    }


def migrate_discovery_state(d: dict) -> dict:
    """Upgrade a V1 discovery blob to V2. Returns a new dict (does not mutate input.

    Idempotent on V2+ blobs. Safe for malformed inputs.
    """
    if d.get("version", 1) >= 2:
        return d
    d = dict(d)  # shallow copy — do not mutate caller's dict
    d["version"] = 2
    # Add missing V2 fields
    if "answers" not in d:
        d["answers"] = {}
    if "non_goals" not in d:
        d["non_goals"] = []
    if "acceptance_criteria" not in d:
        d["acceptance_criteria"] = []
    # Sanitize unresolved: keep only valid dicts with an "item" key
    existing_unresolved = d.get("unresolved", [])
    if not isinstance(existing_unresolved, list):
        existing_unresolved = []
    d["unresolved"] = [
        item for item in existing_unresolved
        if isinstance(item, dict) and "item" in item
    ]
    # Populate unresolved from V1 questions when discovery is required and incomplete
    if d.get("required") and not bool(d.get("complete")):
        questions = d.get("questions", [])
        if not isinstance(questions, list):
            questions = []
        existing_items = {u["item"] for u in d["unresolved"]}
        for q in questions:
            if not isinstance(q, dict):
                continue
            text = (q.get("question") or "").strip()
            if text and text not in existing_items:
                d["unresolved"].append({"item": text, "deferred": False})
                existing_items.add(text)
    return d
