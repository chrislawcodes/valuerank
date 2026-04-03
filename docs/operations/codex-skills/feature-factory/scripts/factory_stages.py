#!/usr/bin/env python3
"""Stage health analysis, checkpoint marker parsing, and prerequisite checks.

Reads state and classifies stage health. No review execution — just analysis.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from factory_state import (  # noqa: E402
    REPO_ROOT,
    CHECKPOINT_PROGRESS_KEY,
    read_json_file,
    workflow_dir,
    reviews_dir,
    checkpoint_manifest_path,
    default_artifact_path,
    load_workflow_state,
    load_checkpoint_manifest,
    parse_review_frontmatter,
)

REVIEW_SCRIPTS = REPO_ROOT / "docs" / "operations" / "codex-skills" / "review-lens" / "scripts"
if str(REVIEW_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(REVIEW_SCRIPTS))

from workflow_utils import normalized_artifact_hash, resolve_stored_path  # noqa: E402
from factory_git import _git_head_sha  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VERIFY_CHECKPOINT = REVIEW_SCRIPTS / "verify_review_checkpoint.py"
VERIFY_RECONCILIATION = REVIEW_SCRIPTS / "verify_reconciliation.py"

HARD_DIFF_ARTIFACT_MAX_CHARS = 150000
LARGE_DIFF_RERUN_WARN_CHARS = 80000

CHECKPOINT_STAGES = ["spec", "plan", "tasks", "diff", "closeout"]
VERIFY_ON_CLOSEOUT_STAGES = ["spec", "plan", "tasks", "diff"]
REQUIRED_PREDELIVERY_STAGES = ["spec", "plan", "tasks", "diff"]
STAGE_PREREQUISITES = {
    "plan": ["spec"],
    "tasks": ["plan"],
    "diff": ["tasks"],
}
STAGE_ARTIFACT_HEADINGS = {
    "spec": "# Spec",
    "plan": "# Plan",
    "tasks": "# Tasks",
}

# Matches [CHECKPOINT] as a marker on any list-item line (unordered, ordered, checkbox).
# Anchored to end-of-line to avoid matching [CHECKPOINT] mid-sentence.
_CHECKPOINT_MARKER_RE = re.compile(
    r"^\s*(?:[-*]|\d+\.|-\s+\[[ xX]\])\s+.*\[CHECKPOINT\]\s*$",
    re.MULTILINE,
)


# ---------------------------------------------------------------------------
# Checkpoint marker parsing
# ---------------------------------------------------------------------------


def parse_checkpoint_markers(slug: str) -> tuple[int, str]:
    """Return (count, markers_sha) for [CHECKPOINT] markers in tasks.md.

    markers_sha is sha256 of only the matched marker lines (normalised to LF,
    stripped of leading/trailing whitespace) — routine edits to non-marker
    lines do not change the hash.  Returns (0, '') if tasks.md is missing or
    has no markers.
    """
    tasks_path = workflow_dir(slug) / "tasks.md"
    if not tasks_path.exists():
        return 0, ""
    text = tasks_path.read_text(encoding="utf-8")
    matches = _CHECKPOINT_MARKER_RE.findall(text)
    if not matches:
        return 0, ""
    # Normalise: strip individual lines and join with LF to avoid CRLF drift.
    normalised = "\n".join(line.strip() for line in matches)
    sha = hashlib.sha256(normalised.encode("utf-8")).hexdigest()
    return len(matches), sha


def checkpoint_progress_state(slug: str) -> dict:
    """Return checkpoint_progress from workflow state, filling missing keys with defaults."""
    state = load_workflow_state(slug)
    raw = state.get(CHECKPOINT_PROGRESS_KEY, {})
    return {
        "index": int(raw.get("index", 0)),
        "markers_sha": str(raw.get("markers_sha", "")),
        "last_diff_head_sha": str(raw.get("last_diff_head_sha", "")),
    }


def _default_checkpoint_progress() -> dict:
    return {"index": 0, "markers_sha": "", "last_diff_head_sha": ""}


# ---------------------------------------------------------------------------
# Artifact & manifest health
# ---------------------------------------------------------------------------


def artifact_has_meaningful_content(stage: str, path: Path) -> bool:
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8").strip()
    heading = STAGE_ARTIFACT_HEADINGS.get(stage)
    if not text:
        return False
    if heading and text == heading:
        return False
    return True


def verify_checkpoint_manifest(manifest_path: Path) -> tuple[bool, str]:
    result = subprocess.run(
        [sys.executable, str(VERIFY_CHECKPOINT), "--checkpoint-manifest", str(manifest_path)],
        text=True,
        capture_output=True,
    )
    detail = (result.stdout or result.stderr or "").strip()
    return result.returncode == 0, detail


# ---------------------------------------------------------------------------
# Diff review budget
# ---------------------------------------------------------------------------


def diff_review_budget_state(slug: str) -> dict[str, object]:
    artifact_path = default_artifact_path(slug, "diff")
    state: dict[str, object] = {
        "artifact_path": artifact_path,
        "artifact_exists": artifact_path.exists(),
        "artifact_bytes": artifact_path.stat().st_size if artifact_path.exists() else 0,
        "large_artifact": artifact_path.exists() and artifact_path.stat().st_size >= LARGE_DIFF_RERUN_WARN_CHARS,
        "recorded_base_ref": "",
        "recorded_base_sha": "",
        "recorded_head_sha": "",
        "current_head_sha": _git_head_sha(REPO_ROOT) or "",
        "head_mismatch": False,
        "scope_basis": "branch-merge-base",
        "suggested_base_ref": "",
        "codex_review_path": None,
        "codex_review_present": False,
        "artifact_changed_since_codex": False,
    }
    meta_path = artifact_path.with_suffix(artifact_path.suffix + ".json")
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            state["recorded_base_ref"] = meta.get("git_base_ref", "")
            state["recorded_base_sha"] = meta.get("git_base_sha", "")
            state["recorded_head_sha"] = meta.get("git_head_sha", "")
        except Exception:
            state["recorded_base_ref"] = ""
            state["recorded_base_sha"] = ""
            state["recorded_head_sha"] = ""
    recorded_head = str(state["recorded_head_sha"])
    current_head = str(state["current_head_sha"])
    state["head_mismatch"] = bool(recorded_head and current_head and recorded_head != current_head)
    if state["head_mismatch"] and recorded_head:
        state["scope_basis"] = "last-reviewed-head"
        state["suggested_base_ref"] = recorded_head
    elif state["recorded_base_ref"]:
        state["scope_basis"] = "recorded-base"
        state["suggested_base_ref"] = str(state["recorded_base_ref"])

    manifest = load_checkpoint_manifest(slug, "diff")
    if not manifest:
        return state
    for review in manifest.get("required_reviews", []):
        if review.get("reviewer") != "codex":
            continue
        review_path = resolve_stored_path(review["path"], REPO_ROOT)
        state["codex_review_path"] = review_path
        state["codex_review_present"] = review_path.exists()
        if not review_path.exists() or not artifact_path.exists():
            return state
        try:
            data, _ = parse_review_frontmatter(review_path)
        except Exception:
            return state
        state["artifact_changed_since_codex"] = (
            data.get("artifact_sha256", "") != normalized_artifact_hash("diff", artifact_path)
        )
        return state
    return state


def preferred_diff_base_ref(slug: str, requested: str | None = None) -> str | None:
    if requested:
        return requested
    diff_budget = diff_review_budget_state(slug)
    suggested = str(diff_budget.get("suggested_base_ref", ""))
    return suggested or None


# ---------------------------------------------------------------------------
# Stage manifest state & health classification
# ---------------------------------------------------------------------------


def stage_manifest_state(slug: str, stage: str) -> dict[str, object]:
    artifact_path = default_artifact_path(slug, stage)
    manifest_path = checkpoint_manifest_path(slug, stage)
    artifact_exists = artifact_path.exists()
    meaningful = artifact_has_meaningful_content(stage, artifact_path) if stage in STAGE_ARTIFACT_HEADINGS else artifact_exists
    state: dict[str, object] = {
        "artifact_path": artifact_path,
        "artifact_exists": artifact_exists,
        "artifact_meaningful": meaningful,
        "manifest_path": manifest_path,
        "manifest_exists": manifest_path.exists(),
        "healthy": False,
        "detail": "",
    }
    if manifest_path.exists():
        healthy, detail = verify_checkpoint_manifest(manifest_path)
        state["healthy"] = healthy
        state["detail"] = detail
    return state


def stage_review_inventory(slug: str, stage: str) -> tuple[list[Path], list[Path]]:
    manifest = load_checkpoint_manifest(slug, stage) or {}
    active_reviews: set[Path] = set()
    for review in manifest.get("required_reviews", []):
        active_reviews.add(resolve_stored_path(review["path"], REPO_ROOT).resolve())
    review_files = sorted(reviews_dir(slug).glob(f"{stage}.*.review.md"))
    orphaned = [path for path in review_files if path.resolve() not in active_reviews]
    return review_files, orphaned


def stage_drift_class(stage: str, state: dict[str, object]) -> str:
    if stage in STAGE_ARTIFACT_HEADINGS:
        if not state["artifact_exists"]:
            return "missing-artifact"
        if not state["artifact_meaningful"]:
            return "stub-artifact"
    if not state["manifest_exists"]:
        if stage == "diff" and not state["artifact_exists"]:
            return "not-started"
        if stage == "diff" and state["artifact_exists"]:
            return "missing-manifest"
        if stage in STAGE_ARTIFACT_HEADINGS and state["artifact_meaningful"]:
            return "missing-manifest"
        return "not-started"
    if state["healthy"]:
        return "healthy"
    if stage == "diff" and not state["artifact_exists"]:
        return "missing-artifact"
    return "unhealthy-manifest"


def stage_repairable(slug: str, stage: str, state: dict[str, object]) -> bool:
    if stage in STAGE_ARTIFACT_HEADINGS:
        return bool(state["artifact_meaningful"]) and (not state["manifest_exists"] or not state["healthy"])
    if stage == "diff":
        return bool(state["artifact_exists"]) and (
            not state["manifest_exists"]
            or not state["healthy"]
            or bool(diff_review_budget_state(slug).get("head_mismatch"))
        )
    return False


def stage_status_label(slug: str, stage: str, state: dict[str, object]) -> str:
    drift = stage_drift_class(stage, state)
    if stage == "diff" and stage_repairable(slug, stage, state):
        return "repairable"
    if drift == "healthy":
        return "healthy"
    if stage_repairable(slug, stage, state):
        return "repairable"
    if drift == "not-started":
        return "not-checkpointed"
    return drift


def later_progress_exists(stages: dict[str, dict[str, object]], current_stage: str) -> tuple[bool, str]:
    index = CHECKPOINT_STAGES.index(current_stage)
    for later_stage in CHECKPOINT_STAGES[index + 1 : CHECKPOINT_STAGES.index("diff") + 1]:
        later_state = stages[later_stage]
        # Fresh runs create heading-only spec/plan/tasks files up front. Those stubs should
        # not count as real later-stage progress when deciding the next action.
        if later_stage in STAGE_ARTIFACT_HEADINGS:
            if later_state["artifact_meaningful"] or later_state["manifest_exists"]:
                return True, later_stage
            continue
        if later_state["artifact_exists"] or later_state["manifest_exists"]:
            return True, later_stage
    return False, ""


# ---------------------------------------------------------------------------
# Reconciliation & prerequisites
# ---------------------------------------------------------------------------


def reconciliation_state(slug: str) -> tuple[bool, str]:
    reviews: list[Path] = []
    for manifest in sorted(reviews_dir(slug).glob("*.checkpoint.json")):
        payload, error = read_json_file(manifest)
        if error:
            return False, f"{manifest} is invalid: {error}"
        if not payload:
            continue
        if payload.get("stage") == "closeout":
            continue
        healthy, _ = verify_checkpoint_manifest(manifest)
        if not healthy:
            continue
        for review in payload.get("required_reviews", []):
            reviews.append(resolve_stored_path(review["path"], REPO_ROOT))
    if not reviews:
        return True, ""
    plan_path = workflow_dir(slug) / "plan.md"
    cmd = [sys.executable, str(VERIFY_RECONCILIATION), "--plan", str(plan_path), "--require-terminal"]
    for review in reviews:
        cmd.extend(["--review", str(review)])
    result = subprocess.run(cmd, text=True, capture_output=True)
    detail = (result.stdout or result.stderr or "").strip()
    return result.returncode == 0, detail


def prerequisite_failure(slug: str, stage: str) -> str | None:
    for prereq in STAGE_PREREQUISITES.get(stage, []):
        prereq_state = stage_manifest_state(slug, prereq)
        if not prereq_state["manifest_exists"]:
            return f"{stage} checkpoint requires completed {prereq} checkpoint first"
        if not prereq_state["healthy"]:
            return f"{stage} checkpoint requires a healthy {prereq} checkpoint first"
    return None


def parse_p_annotation(line: str) -> list[str]:
    match = re.search(r"\[P:\s*([^\]]*)\]", line)
    if not match:
        return []

    raw_paths = [part.strip() for part in match.group(1).split(",")]
    if not any(raw_paths):
        return []

    repo_root = REPO_ROOT.resolve()
    parsed_paths: list[str] = []
    seen: set[str] = set()

    for raw_path in raw_paths:
        if not raw_path:
            continue

        cleaned = raw_path
        while cleaned.startswith("./"):
            cleaned = cleaned[2:]
        while "//" in cleaned:
            cleaned = cleaned.replace("//", "/")

        if not cleaned:
            continue

        if cleaned.startswith("/"):
            print(f"warning: rejecting absolute path in [P:] annotation: {raw_path}", file=sys.stderr)
            continue

        try:
            resolved = (REPO_ROOT / cleaned).resolve()
            resolved.relative_to(repo_root)
        except Exception:
            print(f"warning: rejecting path outside repository in [P:] annotation: {raw_path}", file=sys.stderr)
            continue

        normalized = resolved.relative_to(repo_root).as_posix()
        if normalized in seen:
            continue
        seen.add(normalized)
        parsed_paths.append(normalized)

    return parsed_paths


def parse_parallel_task_groups(slug: str) -> list[dict]:
    tasks_path = workflow_dir(slug) / "tasks.md"
    if not tasks_path.exists():
        return []

    unchecked_tasks: list[dict[str, object]] = []
    for line in tasks_path.read_text(encoding="utf-8").splitlines():
        if _CHECKPOINT_MARKER_RE.match(line):
            break
        if not re.match(r"^\s*-\s+\[\s\]\s+", line):
            continue

        unchecked_tasks.append(
            {
                "task": re.sub(r"\s*\[P(?::[^\]]*)?]", "", line).rstrip(),
                "files": parse_p_annotation(line),
            }
        )

    if not unchecked_tasks:
        return []

    annotated_indexes = [index for index, item in enumerate(unchecked_tasks) if item["files"]]
    task_texts = [str(item["task"]) for item in unchecked_tasks]

    def serial_group(overlap_warning: str | None = None) -> list[dict]:
        return [
            {
                "tasks": task_texts,
                "parallel": False,
                "files": [],
                "overlap_warning": overlap_warning,
            }
        ]

    if len(annotated_indexes) < 2:
        return serial_group()

    file_to_indexes: dict[str, list[int]] = {}
    for index, item in enumerate(unchecked_tasks):
        for file_path in item["files"]:
            file_to_indexes.setdefault(str(file_path), []).append(index)

    overlap_warning = None
    for file_path, indexes in file_to_indexes.items():
        if len(indexes) > 1:
            first, second = indexes[0] + 1, indexes[1] + 1
            overlap_warning = f"tasks {first},{second} share file {file_path}"
            break

    if overlap_warning:
        return serial_group(overlap_warning=overlap_warning)

    annotated_tasks = [unchecked_tasks[index] for index in annotated_indexes]
    unannotated_tasks = [item for index, item in enumerate(unchecked_tasks) if index not in set(annotated_indexes)]

    parallel_files: list[str] = []
    seen_files: set[str] = set()
    for item in annotated_tasks:
        for file_path in item["files"]:
            file_name = str(file_path)
            if file_name in seen_files:
                continue
            seen_files.add(file_name)
            parallel_files.append(file_name)

    groups: list[dict] = [
        {
            "tasks": [str(item["task"]) for item in annotated_tasks],
            "parallel": True,
            "files": parallel_files,
            "overlap_warning": None,
        }
    ]

    if unannotated_tasks:
        groups.append(
            {
                "tasks": [str(item["task"]) for item in unannotated_tasks],
                "parallel": False,
                "files": [],
                "overlap_warning": None,
            }
        )

    return groups
