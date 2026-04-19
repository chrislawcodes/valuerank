#!/usr/bin/env python3
"""Path helpers, atomic I/O primitives, state constants, and workflow state
management for the feature factory.

No subprocess calls.  All I/O is file-based JSON read/write.
Every public symbol is safe to import in tests without side effects.
"""
import json
from contextlib import contextmanager
import fcntl
import errno
import os
import tempfile
import time
from pathlib import Path


# ---------------------------------------------------------------------------
# Repository root + canonical subdirectory roots
# ---------------------------------------------------------------------------

REPO_ROOT: Path = Path(__file__).resolve().parents[6]
FACTORY_RUNS_ROOT: Path = REPO_ROOT / "docs" / "workflow" / "feature-runs"

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
PARALLEL_ANALYSIS_KEY = "parallel_analysis"
INIT_HEAD_SHA_KEY = "init_head_sha"

# ---------------------------------------------------------------------------
# Atomic JSON I/O
# ---------------------------------------------------------------------------


def atomic_json_write(path: Path, data: dict) -> None:
    """Write *data* to *path* as JSON atomically via a temp file + os.replace()."""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, indent=2)
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


def default_parallel_analysis_state() -> dict:
    return {
        "reviewed": False,
        "found": False,
        "note": "",
        "updated_at": 0,
    }


def _default_workflow_state() -> dict:
    """Return the baseline workflow state for a new or migrated run."""
    return {
        "review_policy": {
            "sensitive": False,
            "large_structural": False,
            "performance_sensitive": False,
            "extra_gemini_lenses": [],
        },
        BLOCKED_KEY: {
            "active": False,
            "reason": "",
            "updated_at": 0,
        },
        DISCOVERY_KEY: default_discovery_state(),
        DELIVERY_KEY: {},
        DIRTY_OVERRIDE_KEY: {},
        CHECKPOINT_FALLBACK_KEY: {},
        PARALLEL_ANALYSIS_KEY: default_parallel_analysis_state(),
        INIT_HEAD_SHA_KEY: "",
        "token_usage": [],
        "stages": {},
        "schema_version": 1,
    }


def _default_stage_state(state: dict | None = None, stage: str | None = None) -> dict:
    """Return the canonical nested state blob for a single workflow stage."""
    stage_state = {
        "adversarial_rounds": 0,
        "judge_rounds": 0,
        "judge_verdicts": [],
        "annotations": [],
        "unresolved_concerns": [],
        "adversarial_sha_history": [],
        "initial_sha": "",
    }
    if state is None or stage is None:
        return stage_state
    for key in ("adversarial_rounds", "judge_rounds"):
        legacy_key = f"{stage}_{key}"
        if legacy_key in state:
            stage_state[key] = state[legacy_key]
    return stage_state


@contextmanager
def with_locked_state(slug: str):
    """Lock state.json, yield the loaded state, and persist mutations on exit."""
    path = factory_state_path(slug)
    if not path.exists():
        atomic_json_write(path, _default_workflow_state())

    last_error: Exception | None = None
    backoff_seconds = 0.1
    for attempt in range(11):
        with path.open("r+", encoding="utf-8") as lock_fh:
            try:
                fcntl.flock(lock_fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except Exception as exc:
                busy_errno = getattr(exc, "errno", None)
                if not isinstance(exc, BlockingIOError) and busy_errno not in {errno.EACCES, errno.EAGAIN}:
                    raise
                last_error = exc
                if attempt == 10:
                    break
                time.sleep(backoff_seconds)
                backoff_seconds *= 2
                continue

            try:
                state = load_workflow_state(slug)
                yield state
                atomic_json_write(path, state)
            finally:
                fcntl.flock(lock_fh.fileno(), fcntl.LOCK_UN)
            return

    raise TimeoutError(f"Timed out acquiring exclusive lock for {path} after 10 retries") from last_error


def migrate_discovery_state(d: dict) -> dict:
    """Upgrade a V1 discovery blob to V2. Returns a new dict (does not mutate input.

    Idempotent on V2+ blobs. Safe for malformed inputs.
    """
    try:
        version = d.get("version", 1)
        if not isinstance(version, (int, float)) or version >= 2:
            return d
    except Exception:
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
    # Sanitize unresolved: keep only valid dicts with a hashable "item" key
    existing_unresolved = d.get("unresolved", [])
    if not isinstance(existing_unresolved, list):
        existing_unresolved = []
    valid_unresolved = []
    for item in existing_unresolved:
        if not isinstance(item, dict) or "item" not in item:
            continue
        try:
            hash(item["item"])
        except TypeError:
            continue
        valid_unresolved.append(item)
    d["unresolved"] = valid_unresolved
    # Populate unresolved from V1 questions when discovery is required and incomplete
    if d.get("required") and not bool(d.get("complete")):
        questions = d.get("questions", [])
        if not isinstance(questions, list):
            questions = []
        existing_items = {u["item"] for u in d["unresolved"]}
        for q in questions:
            if not isinstance(q, dict):
                continue
            raw = q.get("question")
            if not isinstance(raw, str):
                continue
            text = raw.strip()
            if text and text not in existing_items:
                d["unresolved"].append({"item": text, "deferred": False})
                existing_items.add(text)
    return d


def blocking_unresolved_items(discovery: dict) -> list[dict]:
    """Return unresolved discovery entries that still block spec progress."""
    unresolved = discovery.get("unresolved", [])
    if not isinstance(unresolved, list):
        return [{"item": "<malformed discovery state>", "deferred": False, "malformed": True}]
    blocking: list[dict] = []
    for item in unresolved:
        if not isinstance(item, dict):
            blocking.append({"item": "<malformed unresolved item>", "deferred": False, "malformed": True})
            continue
        value = item.get("item")
        if not isinstance(value, str) or not value.strip():
            blocking.append({"item": "<malformed unresolved item>", "deferred": False, "malformed": True})
            continue
        if item.get("deferred") is True:
            continue
        blocking.append(item)
    return blocking


def discovery_blockers_are_malformed(discovery: dict) -> bool:
    """Return True when blocking discovery items include malformed state."""
    unresolved = discovery.get("unresolved", [])
    if not isinstance(unresolved, list):
        return True
    return any(isinstance(item, dict) and item.get("malformed") is True for item in blocking_unresolved_items(discovery))


# ---------------------------------------------------------------------------
# Workflow state I/O — load / save / update patterns
# ---------------------------------------------------------------------------


def parse_review_frontmatter(path: Path) -> tuple[dict[str, str], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"{path} is missing frontmatter")
    _, rest = text.split("---\n", 1)
    fm_text, body = rest.split("\n---\n", 1)
    data: dict[str, str] = {}
    for line in fm_text.splitlines():
        if not line.strip():
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip().strip('"')
    return data, body


def load_scope_manifest(slug: str) -> dict:
    path = scope_manifest_path(slug)
    if not path.exists():
        return {"paths": [], "allowed_dirty_paths": []}
    return json.loads(path.read_text(encoding="utf-8"))


def save_scope_manifest(slug: str, paths: list[str]) -> Path:
    safe_slug = validated_slug(slug)
    normalized_paths = {normalized_repo_path(path, "scope path").rstrip("/") for path in paths if path.strip()}
    manifest = {
        "paths": sorted(normalized_paths),
        "allowed_dirty_paths": sorted(
            {
                *normalized_paths,
                f"docs/workflow/feature-runs/{safe_slug}",
            }
        ),
    }
    path = scope_manifest_path(slug)
    atomic_json_write(path, manifest)
    return path


def load_workflow_state(slug: str) -> dict:
    """Load workflow state and add missing schema defaults without writing."""
    path = factory_state_path(slug)
    if not path.exists():
        return _default_workflow_state()
    state = json.loads(path.read_text(encoding="utf-8"))
    defaults = _default_workflow_state()
    state.setdefault("review_policy", defaults["review_policy"])
    state.setdefault(BLOCKED_KEY, defaults[BLOCKED_KEY])
    state.setdefault(DISCOVERY_KEY, default_discovery_state())
    state.setdefault(DELIVERY_KEY, {})
    state.setdefault(DIRTY_OVERRIDE_KEY, {})
    state.setdefault(CHECKPOINT_FALLBACK_KEY, {})
    state.setdefault(PARALLEL_ANALYSIS_KEY, default_parallel_analysis_state())
    state.setdefault(INIT_HEAD_SHA_KEY, "")
    state.setdefault("token_usage", [])
    state.setdefault("stages", {})
    state.setdefault("schema_version", 1)
    return state


def save_workflow_state(slug: str, state: dict) -> Path:
    path = factory_state_path(slug)
    atomic_json_write(path, state)
    return path


def update_workflow_state(slug: str, mutate) -> dict:
    """Mutate workflow state under the exclusive file lock."""
    with with_locked_state(slug) as state:
        mutate(state)
    return state


def update_stage_state(slug: str, stage: str, updates: dict) -> dict:
    """Update nested stage state and mirror legacy top-level counters."""
    with with_locked_state(slug) as state:
        stages = state.get("stages")
        if not isinstance(stages, dict):
            stages = {}
            state["stages"] = stages
        stage_state = stages.get(stage)
        if not isinstance(stage_state, dict):
            stage_state = {}
        defaults = _default_stage_state(state, stage)
        for key, value in defaults.items():
            stage_state.setdefault(key, value)
        for key, value in updates.items():
            stage_state[key] = value
            if key in {"adversarial_rounds", "judge_rounds"}:
                state[f"{stage}_{key}"] = value
        stages[stage] = stage_state
        try:
            schema_version = int(state.get("schema_version", 1))
        except (TypeError, ValueError):
            schema_version = 1
        if schema_version < 2:
            state["schema_version"] = 2
    return state


def discovery_state(slug: str) -> dict:
    state = load_workflow_state(slug).get(DISCOVERY_KEY, {})
    merged = default_discovery_state()
    merged.update(state if isinstance(state, dict) else {})
    def _safe_list(val) -> list:
        return list(val) if isinstance(val, list) else []
    merged["questions"] = _safe_list(merged.get("questions"))
    merged["assumptions"] = _safe_list(merged.get("assumptions"))
    merged["unresolved"] = _safe_list(merged.get("unresolved"))
    merged["non_goals"] = _safe_list(merged.get("non_goals"))
    merged["acceptance_criteria"] = _safe_list(merged.get("acceptance_criteria"))
    merged = migrate_discovery_state(merged)
    return merged


def update_discovery_state(slug: str, mutate) -> dict:
    def _migrated_mutate(state: dict):
        discovery = state.setdefault(DISCOVERY_KEY, default_discovery_state())
        migrated = migrate_discovery_state(discovery)
        state[DISCOVERY_KEY] = migrated
        return mutate(migrated)
    return update_workflow_state(slug, _migrated_mutate)


def load_checkpoint_manifest(slug: str, stage: str) -> dict | None:
    path = checkpoint_manifest_path(slug, stage)
    manifest, _ = read_json_file(path)
    return manifest
