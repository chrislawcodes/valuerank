#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path


_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from factory_state import (  # noqa: E402
    REPO_ROOT,
    FACTORY_RUNS_ROOT,
    FACTORY_STATE,
    BLOCKED_KEY,
    DISCOVERY_KEY,
    DELIVERY_KEY,
    DIRTY_OVERRIDE_KEY,
    CHECKPOINT_FALLBACK_KEY,
    CHECKPOINT_PROGRESS_KEY,
    atomic_json_write,
    read_json_file,
    validated_slug,
    normalized_repo_path,
    workflow_dir,
    reviews_dir,
    scope_manifest_path,
    factory_state_path,
    checkpoint_manifest_path,
    default_artifact_path,
    default_discovery_state,
    migrate_discovery_state,
)

REVIEW_SCRIPTS = REPO_ROOT / "docs" / "operations" / "codex-skills" / "review-lens" / "scripts"
if str(REVIEW_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(REVIEW_SCRIPTS))

from workflow_utils import normalized_artifact_hash, repo_relative_path, resolve_stored_path  # noqa: E402

SYNC_SCRIPT = REPO_ROOT / "scripts" / "sync-codex-skills.py"
WRITE_DIFF = REVIEW_SCRIPTS / "write_canonical_diff.py"
REPAIR = REVIEW_SCRIPTS / "repair_review_checkpoint.py"
UPDATE_REVIEW = REVIEW_SCRIPTS / "update_review_resolution.py"
APPEND_RECONCILIATION = REVIEW_SCRIPTS / "append_reconciliation_entry.py"
VERIFY_RECONCILIATION = REVIEW_SCRIPTS / "verify_reconciliation.py"
VERIFY_CHECKPOINT = REVIEW_SCRIPTS / "verify_review_checkpoint.py"
RUN_GEMINI_REVIEW = REVIEW_SCRIPTS / "run_gemini_review.py"
RUN_CODEX_REVIEW = REVIEW_SCRIPTS / "run_codex_review.py"
HARD_DIFF_ARTIFACT_MAX_CHARS = 150000
LARGE_DIFF_RERUN_WARN_CHARS = 80000
DEFAULT_GEMINI_MODEL = "gemini-2.5-pro"
DEFAULT_CODEX_MODEL = "gpt-5.4-mini"
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


def ensure_sync() -> None:
    run([sys.executable, str(SYNC_SCRIPT), "--sync-if-needed"])


def ensure_file(path: Path, heading: str) -> None:
    if not path.exists():
        path.write_text(f"# {heading}\n", encoding="utf-8")


def load_scope_manifest(slug: str) -> dict:
    path = scope_manifest_path(slug)
    if not path.exists():
        return {"paths": [], "allowed_dirty_paths": []}
    return json.loads(path.read_text(encoding="utf-8"))


def load_workflow_state(slug: str) -> dict:
    path = factory_state_path(slug)
    if not path.exists():
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
        }
    state = json.loads(path.read_text(encoding="utf-8"))
    state.setdefault(
        "review_policy",
        {
            "sensitive": False,
            "large_structural": False,
            "performance_sensitive": False,
            "extra_gemini_lenses": [],
        },
    )
    state.setdefault(
        BLOCKED_KEY,
        {
            "active": False,
            "reason": "",
            "updated_at": 0,
        },
    )
    state.setdefault(DISCOVERY_KEY, default_discovery_state())
    state.setdefault(DELIVERY_KEY, {})
    state.setdefault(DIRTY_OVERRIDE_KEY, {})
    state.setdefault(CHECKPOINT_FALLBACK_KEY, {})
    return state


def save_workflow_state(slug: str, state: dict) -> Path:
    path = factory_state_path(slug)
    atomic_json_write(path, state)
    return path


def discovery_state(slug: str) -> dict:
    state = load_workflow_state(slug).get(DISCOVERY_KEY, {})
    merged = default_discovery_state()
    merged.update(state if isinstance(state, dict) else {})
    merged["questions"] = list(merged.get("questions", []))
    merged["assumptions"] = list(merged.get("assumptions", []))
    merged["unresolved"] = list(merged.get("unresolved", []))
    merged["non_goals"] = list(merged.get("non_goals", []))
    merged["acceptance_criteria"] = list(merged.get("acceptance_criteria", []))
    merged = migrate_discovery_state(merged)
    return merged


def update_discovery_state(slug: str, mutate) -> dict:
    def _migrated_mutate(state: dict):
        discovery = state.setdefault(DISCOVERY_KEY, default_discovery_state())
        migrated = migrate_discovery_state(discovery)
        state[DISCOVERY_KEY] = migrated
        return mutate(migrated)
    return update_workflow_state(slug, _migrated_mutate)


def save_scope_manifest(slug: str, paths: list[str]) -> Path:
    safe_slug = validated_slug(slug)
    normalized_paths = {normalized_repo_path(path, "scope path").rstrip("/") for path in paths if path.strip()}
    manifest = {
        "paths": sorted(normalized_paths),
        "allowed_dirty_paths": sorted(
            {
                *normalized_paths,
                f"docs/feature-runs/{safe_slug}",
            }
        ),
    }
    path = scope_manifest_path(slug)
    atomic_json_write(path, manifest)
    return path


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


def load_checkpoint_manifest(slug: str, stage: str) -> dict | None:
    path = checkpoint_manifest_path(slug, stage)
    manifest, _ = read_json_file(path)
    return manifest


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
        if later_state["artifact_exists"] or later_state["manifest_exists"]:
            return True, later_stage
    return False, ""


def repair_checkpoint_args(slug: str, stage: str, state: dict[str, object]) -> argparse.Namespace:
    manifest = load_checkpoint_manifest(slug, stage) or {}
    workflow_state = load_workflow_state(slug)
    context_paths: list[str] = []
    for review in manifest.get("required_reviews", []):
        for context_path in review.get("context_paths", []):
            if context_path not in context_paths:
                context_paths.append(context_path)
    allow_dirty_paths = list(dict.fromkeys(manifest.get("allowed_dirty_paths", [])))
    base_ref = manifest.get("git_base_ref") or ""
    use_existing_artifact = True
    diff_budget: dict[str, object] = {}
    if stage == "diff" and not base_ref:
        meta_path = Path(state["artifact_path"]).with_suffix(Path(state["artifact_path"]).suffix + ".json")
        meta_manifest, _ = read_json_file(meta_path)
        if meta_manifest:
            base_ref = meta_manifest.get("git_base_ref") or base_ref
            if not allow_dirty_paths:
                allow_dirty_paths = list(meta_manifest.get("allowed_dirty_paths", []))
    if stage == "diff":
        diff_budget = diff_review_budget_state(slug)
        if diff_budget.get("head_mismatch"):
            base_ref = str(diff_budget.get("suggested_base_ref", "")) or base_ref
            use_existing_artifact = False
    if stage == "diff" and not allow_dirty_paths:
        dirty_override = workflow_state.get(DIRTY_OVERRIDE_KEY, {})
        allow_dirty_paths = list(dict.fromkeys(dirty_override.get("allowed_dirty_paths", [])))
    return argparse.Namespace(
        slug=slug,
        stage=stage,
        artifact=str(state["artifact_path"]),
        base_ref=base_ref or None,
        context=context_paths,
        path=[],
        required_reviews=manifest.get("required_reviews"),
        extra_gemini_lens=[],
        sensitive=False,
        large_structural=False,
        performance_sensitive=False,
        use_existing_artifact=use_existing_artifact,
        allow_dirty_path=allow_dirty_paths,
        max_artifact_chars=manifest.get("max_artifact_chars"),
        max_context_chars=manifest.get("max_context_chars"),
        max_total_chars=manifest.get("max_total_chars"),
        gemini_timeout_seconds=120,
        gemini_retries=1,
        repair_timeout_seconds=300,
        allow_large_diff_rerun=bool(diff_budget.get("artifact_changed_since_codex")),
        fallback=False,
    )


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


def trim_detail(text: str, limit: int = 240) -> str:
    stripped = " ".join(text.split())
    if len(stripped) <= limit:
        return stripped
    return stripped[: limit - 3] + "..."


def update_workflow_state(slug: str, mutate) -> dict:
    state = load_workflow_state(slug)
    mutate(state)
    save_workflow_state(slug, state)
    return state


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
) -> list[dict[str, str]]:
    primary_gemini = ""
    secondary_default = ""
    codex_lens = ""
    extra_candidates = list(extra_gemini)

    if stage == "spec":
        primary_gemini = "requirements-adversarial"
        secondary_default = "edge-cases-adversarial"
        codex_lens = "feasibility-adversarial"
        if sensitive:
            extra_candidates.insert(0, "risk-adversarial")
    elif stage == "plan":
        primary_gemini = "architecture-adversarial"
        secondary_default = "testability-adversarial"
        codex_lens = "implementation-adversarial"
        if sensitive:
            extra_candidates.insert(0, "risk-adversarial")
    elif stage == "tasks":
        primary_gemini = "dependency-order-adversarial"
        secondary_default = "coverage-adversarial"
        codex_lens = "execution-adversarial"
        if sensitive:
            extra_candidates.insert(0, "risk-adversarial")
    elif stage == "diff":
        primary_gemini = "regression-adversarial"
        secondary_default = "quality-adversarial"
        codex_lens = "correctness-adversarial"
        if sensitive:
            extra_candidates.insert(0, "security-adversarial")
        if performance_sensitive:
            extra_candidates.insert(0, "performance-adversarial")
        if large_structural:
            extra_candidates.append("quality-adversarial")
    elif stage == "closeout":
        primary_gemini = "completeness-adversarial"
        secondary_default = "residual-risk-adversarial"
        codex_lens = "fidelity-adversarial"
        if sensitive:
            extra_candidates.insert(0, "rollout-risk-adversarial")
    else:
        raise ValueError(f"Unsupported stage: {stage}")

    secondary_gemini = pick_secondary_lens(primary_gemini, secondary_default, extra_candidates)
    return [
        {
            "reviewer": "gemini",
            "lens": primary_gemini,
            "model": DEFAULT_GEMINI_MODEL,
        },
        {
            "reviewer": "gemini",
            "lens": secondary_gemini,
            "model": DEFAULT_GEMINI_MODEL,
        },
        {
            "reviewer": "codex",
            "lens": codex_lens,
            "model": DEFAULT_CODEX_MODEL,
        },
    ]


def resolved_review_policy(slug: str, args: argparse.Namespace) -> dict:
    state = load_workflow_state(slug)
    policy = state.setdefault(
        "review_policy",
        {
            "sensitive": False,
            "large_structural": False,
            "performance_sensitive": False,
            "extra_gemini_lenses": [],
        },
    )
    if args.sensitive:
        policy["sensitive"] = True
    if args.large_structural:
        policy["large_structural"] = True
    if args.performance_sensitive:
        policy["performance_sensitive"] = True
    if args.extra_gemini_lens:
        policy["extra_gemini_lenses"] = list(args.extra_gemini_lens)
    save_workflow_state(slug, state)
    return policy


def checkpoint_manifest(
    slug: str,
    stage: str,
    artifact_path: Path,
    base_ref: str | None,
    extra_context: list[str],
    reviews: list[dict[str, str]],
    max_artifact_chars: int | None,
    max_context_chars: int | None,
    max_total_chars: int | None,
    allow_dirty_paths: list[str] | None = None,
) -> dict:
    manifest_reviews = []
    for spec in reviews:
        output = reviews_dir(slug) / f"{stage}.{spec['reviewer']}.{spec['lens']}.review.md"
        manifest_reviews.append(
            {
                "reviewer": spec["reviewer"],
                "lens": spec["lens"],
                "stage": stage,
                "path": repo_relative_path(output, REPO_ROOT),
                "context_paths": [repo_relative_path(resolve_stored_path(path, REPO_ROOT), REPO_ROOT) for path in extra_context],
                **({"model": spec["model"]} if spec.get("model") else {}),
            }
        )
    return {
        "feature_slug": slug,
        "stage": stage,
        "artifact_path": repo_relative_path(artifact_path, REPO_ROOT),
        "git_base_ref": base_ref or "",
        "allowed_dirty_paths": list(allow_dirty_paths or []),
        "required_reviews": manifest_reviews,
        "max_artifact_chars": max_artifact_chars,
        "max_context_chars": max_context_chars,
        "max_total_chars": max_total_chars,
    }


def fallback_review_command(spec: dict, artifact_path: Path, checkpoint: dict, workspace_dir: Path | None, timeout_seconds: int, retries: int) -> list[str]:
    cmd = [
        sys.executable,
        str(RUN_GEMINI_REVIEW if spec.get("reviewer") == "gemini" else RUN_CODEX_REVIEW),
        "--artifact",
        str(artifact_path),
        "--lens",
        spec["lens"],
        "--stage",
        checkpoint["stage"],
        "--output",
        spec["path"],
    ]
    for context_path in spec.get("context_paths", []):
        cmd.extend(["--context", context_path])
    if checkpoint.get("git_base_ref"):
        cmd.extend(["--git-base-ref", checkpoint["git_base_ref"]])
    if spec.get("model"):
        cmd.extend(["--model", spec["model"]])
    if checkpoint.get("max_artifact_chars"):
        cmd.extend(["--max-artifact-chars", str(checkpoint["max_artifact_chars"])])
    if checkpoint.get("max_context_chars"):
        cmd.extend(["--max-context-chars", str(checkpoint["max_context_chars"])])
    if checkpoint.get("max_total_chars"):
        cmd.extend(["--max-total-chars", str(checkpoint["max_total_chars"])])
    if workspace_dir:
        cmd.extend(["--workspace-dir", str(workspace_dir)])
    if spec.get("reviewer") == "gemini":
        cmd.extend(["--timeout-seconds", str(timeout_seconds), "--retries", str(retries)])
    return cmd


def run_checkpoint_fallback(manifest_path: Path, workspace_root: Path, gemini_timeout_seconds: int, gemini_retries: int) -> tuple[bool, str]:
    checkpoint = json.loads(manifest_path.read_text(encoding="utf-8"))
    artifact_path = resolve_stored_path(checkpoint["artifact_path"], REPO_ROOT)
    workspace_dir = workspace_root.resolve()
    failed: list[str] = []

    for spec in checkpoint.get("required_reviews", []):
        review_path = resolve_stored_path(spec["path"], REPO_ROOT)
        if review_path.exists():
            try:
                data, _ = parse_review_frontmatter(review_path)
            except Exception:
                data = {}
            if data.get("artifact_sha256") == normalized_artifact_hash(checkpoint.get("stage", ""), artifact_path):
                continue
        cmd = fallback_review_command(spec, artifact_path, checkpoint, workspace_dir, gemini_timeout_seconds, gemini_retries)
        timeout = gemini_timeout_seconds + 30 if spec.get("reviewer") == "gemini" else 210
        result = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout)
        if result.returncode != 0:
            failed.append(f"{spec['path']}: {trim_detail(result.stderr or result.stdout or 'review failed')}")

    verify = subprocess.run(
        [sys.executable, str(VERIFY_CHECKPOINT), "--checkpoint-manifest", str(manifest_path)],
        text=True,
        capture_output=True,
    )
    detail = (verify.stdout or verify.stderr or "").strip()
    if failed:
        detail = "; ".join([detail] + failed if detail else failed)
    return verify.returncode == 0 and not failed, detail


def closeout_inventory_text(
    slug: str,
    root: Path,
    plan_path: Path,
    reviews: list[Path],
    delivery: dict,
    dirty_override: dict,
    fallback: dict,
) -> str:
    lines = [
        f"# Closeout: {slug}",
        "",
        "## Outputs",
        f"- spec: `{root / 'spec.md'}`",
        f"- plan: `{plan_path}`",
        f"- tasks: `{root / 'tasks.md'}`",
        "",
        "## Reviews",
    ]
    for review in reviews:
        lines.append(f"- `{review}`")
    lines.extend(
        [
            "",
            "## Delivery",
            f"- branch: `{delivery.get('branch', current_branch_name() or '')}`",
            f"- pr: `{delivery.get('pr_url', '') or 'not-created'}`",
            f"- checks: `{delivery.get('checks_summary', 'unknown')}`",
            f"- merge-state: `{delivery.get('merge_state_status', '') or 'unknown'}`",
        ]
    )
    if dirty_override.get("used"):
        lines.append("- dirty-override: used")
        for path in dirty_override.get("allowed_dirty_paths", []):
            lines.append(f"- allow-dirty-path: `{path}`")
    if fallback.get("used"):
        lines.extend(
            [
                "",
                "## Fallback",
                f"- stage: `{fallback.get('stage', '')}`",
                f"- reason: `{fallback.get('reason', '')}`",
            ]
        )
    lines.extend(
        [
            "",
            "## Next Action",
            "- Share the closeout summary with the user and call out any deferred or open risks.",
        ]
    )
    return "\n".join(lines) + "\n"


def compose_closeout_text(existing_text: str, inventory_text: str) -> str:
    if not existing_text.strip():
        return inventory_text
    if "## Workflow Inventory" in existing_text:
        before, _ = existing_text.split("## Workflow Inventory", 1)
        return before.rstrip() + "\n\n" + inventory_text
    return existing_text.rstrip() + "\n\n" + inventory_text


def record_checkpoint_fallback(slug: str, stage: str, reason: str) -> dict:
    def mutate(state: dict) -> None:
        state[CHECKPOINT_FALLBACK_KEY] = {
            "used": True,
            "stage": stage,
            "reason": reason,
            "updated_at": int(time.time()),
        }

    return update_workflow_state(slug, mutate)


def gh_json(args: list[str]) -> dict | list:
    result = subprocess.run(["gh", *args], text=True, capture_output=True)
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "gh command failed").strip()
        raise SystemExit(message)
    output = result.stdout.strip() or "{}"
    return json.loads(output)


def current_pr_payload(pr_number: int | None = None) -> dict | None:
    cmd = [
        "gh",
        "pr",
        "view",
    ]
    if pr_number is not None:
        cmd.append(str(pr_number))
    cmd.extend(
        [
            "--json",
            "number,url,state,isDraft,headRefName,headRefOid,baseRefName,mergeable,mergeStateStatus,statusCheckRollup",
        ]
    )
    result = subprocess.run(
        cmd,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        return None
    return json.loads(result.stdout)


def required_check_summary(pr_number: int | None = None, watch: bool = False, interval: int = 10) -> tuple[str, list[dict], str]:
    cmd = ["gh", "pr", "checks"]
    if pr_number is not None:
        cmd.append(str(pr_number))
    cmd.extend(["--required", "--json", "name,state,bucket,link,workflow"])
    if watch:
        cmd.extend(["--watch", "--interval", str(interval)])
    result = subprocess.run(cmd, text=True, capture_output=True)
    if result.returncode not in {0, 8}:
        message = (result.stderr or result.stdout or "gh pr checks failed").strip()
        raise SystemExit(message)
    stdout = result.stdout.strip() or "[]"
    checks = json.loads(stdout)
    buckets = {item.get("bucket", "") for item in checks}
    if not checks:
        summary = "unknown"
    elif "fail" in buckets or "cancel" in buckets:
        summary = "fail"
    elif "pending" in buckets:
        summary = "pending"
    elif buckets <= {"pass", "skipping"}:
        summary = "pass"
    else:
        summary = "unknown"
    detail = (result.stderr or "").strip()
    return summary, checks, detail


def build_delivery_record(pr: dict | None, checks_summary: str, checks: list[dict], branch: str, head_sha: str) -> dict:
    return {
        "branch": branch,
        "head_sha": head_sha,
        "updated_at": int(time.time()),
        "pr_number": pr.get("number") if pr else None,
        "pr_url": pr.get("url") if pr else "",
        "pr_state": pr.get("state") if pr else "",
        "pr_is_draft": bool(pr.get("isDraft")) if pr else False,
        "pr_head_branch": pr.get("headRefName") if pr else "",
        "pr_head_sha": pr.get("headRefOid") if pr else "",
        "pr_base_branch": pr.get("baseRefName") if pr else "",
        "mergeable": pr.get("mergeable") if pr else "",
        "merge_state_status": pr.get("mergeStateStatus") if pr else "",
        "checks_summary": checks_summary,
        "required_checks": checks,
    }


def gather_all_review_paths(slug: str, include_closeout: bool = True) -> list[Path]:
    stages = list(VERIFY_ON_CLOSEOUT_STAGES)
    if include_closeout:
        stages.append("closeout")
    paths: list[Path] = []
    for stage in stages:
        manifest = load_checkpoint_manifest(slug, stage) or {}
        for review in manifest.get("required_reviews", []):
            paths.append(resolve_stored_path(review["path"], REPO_ROOT))
    return paths


def refresh_delivery_snapshot(delivery: dict) -> dict:
    pr_number = delivery.get("pr_number")
    if not pr_number or not command_path("gh"):
        return delivery
    try:
        pr = current_pr_payload(int(pr_number))
    except Exception:
        return delivery
    if not pr:
        return delivery

    branch = str(delivery.get("branch", "") or pr.get("headRefName", ""))
    head_sha = str(delivery.get("head_sha", "") or pr.get("headRefOid", "") or "")
    try:
        checks_summary, checks, checks_detail = required_check_summary(int(pr_number), watch=False)
    except SystemExit:
        return delivery

    refreshed = build_delivery_record(pr, checks_summary, checks, branch, head_sha)
    refreshed["upstream"] = delivery.get("upstream", "")
    refreshed["checks_detail"] = checks_detail
    refreshed["head_mismatch"] = bool(pr.get("headRefOid")) and bool(head_sha) and pr.get("headRefOid") != head_sha
    return refreshed


def command_init(args: argparse.Namespace) -> int:
    if not args.path:
        raise SystemExit(
            "init requires at least one --path argument to define the feature scope. "
            "Example: --path cloud/apps/web/src/components/my-feature"
        )
    ensure_sync()
    root = workflow_dir(args.slug)
    reviews = reviews_dir(args.slug)
    reviews.mkdir(parents=True, exist_ok=True)
    ensure_file(root / "spec.md", "Spec")
    ensure_file(root / "plan.md", "Plan")
    ensure_file(root / "tasks.md", "Tasks")
    save_scope_manifest(args.slug, args.path)
    existing_state = load_workflow_state(args.slug)
    existing_state.setdefault(
        "review_policy",
        {
            "sensitive": False,
            "large_structural": False,
            "performance_sensitive": False,
            "extra_gemini_lenses": [],
        },
    )
    existing_state.setdefault(DISCOVERY_KEY, default_discovery_state())
    # Always reset checkpoint_progress on init so stale slice state from a
    # previous run does not corrupt the new one.
    existing_state[CHECKPOINT_PROGRESS_KEY] = _default_checkpoint_progress()
    save_workflow_state(args.slug, existing_state)
    print(str(root))
    return 0


def command_checkpoint(args: argparse.Namespace) -> int:
    ensure_sync()
    root = workflow_dir(args.slug)
    reviews = reviews_dir(args.slug)
    root.mkdir(parents=True, exist_ok=True)
    reviews.mkdir(parents=True, exist_ok=True)
    prereq_error = prerequisite_failure(args.slug, args.stage)
    if prereq_error:
        raise SystemExit(prereq_error)
    if args.stage == "spec":
        discovery = discovery_state(args.slug)
        if discovery.get("required") and not discovery.get("complete"):
            raise SystemExit(
                "spec checkpoint requires discovery to be complete first; "
                "record the remaining questions and assumptions with the discover command"
            )
    policy = resolved_review_policy(args.slug, args)
    context_paths = [normalized_repo_path(path, "context path") for path in args.context]
    allow_dirty_paths = [normalized_repo_path(path, "allow-dirty path") for path in args.allow_dirty_path]
    prior_diff_budget = diff_review_budget_state(args.slug) if args.stage == "diff" else None

    # Capture HEAD SHA now — before any reviews launch — so it reflects the
    # state of the repo at diff generation time, not after verify completes.
    pending_head_sha: str = _git_head_sha(REPO_ROOT) or "" if args.stage == "diff" else ""

    if args.stage == "diff":
        # Determine whether a checkpoint-scoped base_ref should override the default.
        marker_count, current_markers_sha = parse_checkpoint_markers(args.slug)
        progress = checkpoint_progress_state(args.slug)
        use_checkpoint_base = False
        if marker_count > 0 and not args.base_ref:
            idx = progress["index"]
            stored_sha = progress["markers_sha"]
            last_head = progress["last_diff_head_sha"]
            if idx == 0:
                pass  # first slice — use branch base as normal
            elif idx >= marker_count:
                print(
                    f"warning: checkpoint_progress.index ({idx}) >= marker count ({marker_count}); "
                    "tasks.md may have had markers removed — resetting checkpoint progress and using branch base.",
                    file=sys.stderr,
                )
                update_workflow_state(
                    args.slug,
                    lambda s: s.__setitem__(CHECKPOINT_PROGRESS_KEY, _default_checkpoint_progress()),
                )
                args.base_ref = None
            elif stored_sha != current_markers_sha:
                print(
                    "warning: [CHECKPOINT] marker lines changed since last checkpoint — "
                    "resetting checkpoint progress and using branch base.",
                    file=sys.stderr,
                )
                update_workflow_state(
                    args.slug,
                    lambda s: s.__setitem__(CHECKPOINT_PROGRESS_KEY, _default_checkpoint_progress()),
                )
                args.base_ref = None
            elif _sha_is_valid_ancestor(last_head):
                use_checkpoint_base = True
                args.base_ref = last_head
            else:
                print(
                    f"warning: last_diff_head_sha {last_head[:12] if last_head else '(empty)'} is not a "
                    "valid ancestor of HEAD (possible rebase/amend) — "
                    "resetting checkpoint progress and using branch base.",
                    file=sys.stderr,
                )
                update_workflow_state(
                    args.slug,
                    lambda s: s.__setitem__(CHECKPOINT_PROGRESS_KEY, _default_checkpoint_progress()),
                )
                args.base_ref = None
        _ = use_checkpoint_base  # consumed above via args.base_ref
        args.base_ref = preferred_diff_base_ref(args.slug, args.base_ref)

    scope_manifest = scope_manifest_path(args.slug)
    if args.stage == "diff" and args.path:
        scope_manifest = save_scope_manifest(args.slug, args.path)

    artifact_path = Path(args.artifact).resolve() if args.artifact else default_artifact_path(args.slug, args.stage)
    if args.stage in STAGE_ARTIFACT_HEADINGS and not artifact_has_meaningful_content(args.stage, artifact_path):
        raise SystemExit(
            f"{args.stage} checkpoint requires a non-stub artifact first: {artifact_path}"
        )
    if args.stage == "diff":
        diff_budget = prior_diff_budget or diff_review_budget_state(args.slug)
        if (
            diff_budget
            and diff_budget.get("codex_review_present")
            and diff_budget.get("large_artifact")
            and diff_budget.get("artifact_exists")
            and diff_budget.get("artifact_changed_since_codex")
            and not args.allow_large_diff_rerun
        ):
            raise SystemExit(
                "Large diff rerun would regenerate the Codex review for a "
                f"{len(artifact_path.read_text(encoding='utf-8')) if artifact_path.exists() else 0}-character artifact. "
                "Batch more implementation fixes before rerunning the diff checkpoint, "
                "or pass --allow-large-diff-rerun if this spend is intentional."
            )
    if args.stage == "diff" and not args.use_existing_artifact:
        if not scope_manifest.exists():
            raise SystemExit("Diff checkpoint requires a saved scope manifest or explicit --path values")
        run(
            [
                sys.executable,
                str(WRITE_DIFF),
                "--repo",
                str(REPO_ROOT),
                "--output",
                str(artifact_path),
                "--path-manifest",
                str(scope_manifest),
                *sum((["--allow-dirty-path", path] for path in allow_dirty_paths), []),
                *([] if not args.base_ref else ["--base-ref", args.base_ref]),
            ]
        )
        diff_meta_path = artifact_path.with_suffix(artifact_path.suffix + ".json")
        if diff_meta_path.exists():
            diff_meta = json.loads(diff_meta_path.read_text(encoding="utf-8"))
            args.base_ref = diff_meta.get("git_base_ref") or args.base_ref
    elif not artifact_path.exists():
        raise SystemExit(f"Artifact does not exist: {artifact_path}")

    if args.stage == "diff":
        diff_meta_path = artifact_path.with_suffix(artifact_path.suffix + ".json")
        if diff_meta_path.exists():
            diff_meta = json.loads(diff_meta_path.read_text(encoding="utf-8"))
            args.base_ref = diff_meta.get("git_base_ref") or args.base_ref
            if args.use_existing_artifact:
                recorded_head = diff_meta.get("git_head_sha", "")
                if recorded_head:
                    current_head = _git_head_sha(REPO_ROOT)
                    if current_head and current_head != recorded_head:
                        raise SystemExit(
                            f"Existing diff artifact is stale: recorded HEAD {recorded_head[:12]} "
                            f"does not match current HEAD {current_head[:12]}. "
                            "Drop --use-existing-artifact to regenerate the diff, "
                            "or pass --base-ref if you intentionally want to review an older slice."
                        )

    if args.stage == "diff" and artifact_path.exists():
        diff_text = artifact_path.read_text(encoding="utf-8")
        if len(diff_text) > HARD_DIFF_ARTIFACT_MAX_CHARS:
            raise SystemExit(
                f"Diff artifact exceeds hard cap ({len(diff_text)} > {HARD_DIFF_ARTIFACT_MAX_CHARS}). "
                "Split the review scope into smaller workflow paths or use a smaller diff artifact."
            )
        if len(diff_text) >= LARGE_DIFF_RERUN_WARN_CHARS:
            print(
                "warning: large diff artifact detected; future diff reruns will regenerate "
                "the Codex review unless the artifact stays unchanged. Batch follow-up fixes when possible.",
                file=sys.stderr,
            )

    reviews = getattr(args, "required_reviews", None)
    if reviews is None:
        reviews = required_reviews(
            args.stage,
            policy["sensitive"],
            policy["large_structural"],
            policy["performance_sensitive"],
            policy["extra_gemini_lenses"],
        )

    manifest = checkpoint_manifest(
        args.slug,
        args.stage,
        artifact_path,
        args.base_ref,
        context_paths,
        reviews,
        args.max_artifact_chars,
        args.max_context_chars,
        args.max_total_chars,
        allow_dirty_paths,
    )
    manifest_path = checkpoint_manifest_path(args.slug, args.stage)
    atomic_json_write(manifest_path, manifest)
    if args.stage == "diff":
        update_workflow_state(
            args.slug,
            lambda state: state.__setitem__(
                DIRTY_OVERRIDE_KEY,
                {
                    "allowed_dirty_paths": allow_dirty_paths,
                    "used": bool(allow_dirty_paths),
                    "updated_at": int(time.time()),
                },
            ),
        )

    cmd = [
        sys.executable,
        str(REPAIR),
        "--checkpoint-manifest",
        str(manifest_path),
        "--workspace-dir",
        str(REPO_ROOT),
        "--gemini-timeout-seconds",
        str(args.gemini_timeout_seconds),
        "--gemini-retries",
        str(args.gemini_retries),
    ]
    try:
        result = subprocess.run(
            cmd,
            text=True,
            timeout=args.repair_timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        if not args.fallback:
            print(
                f"checkpoint blocked: repair exceeded {args.repair_timeout_seconds}s for "
                f"{args.stage} on {args.slug}",
                file=sys.stderr,
            )
            return 1
        fallback_reason = f"repair exceeded {args.repair_timeout_seconds}s"
    else:
        if result.returncode == 0:
            _advance_checkpoint_progress(args.slug, args.stage, pending_head_sha)
            return 0
        if not args.fallback:
            return result.returncode
        fallback_reason = f"repair exited {result.returncode}"

    fallback_ok, fallback_detail = run_checkpoint_fallback(
        manifest_path,
        REPO_ROOT,
        args.gemini_timeout_seconds,
        args.gemini_retries,
    )
    if not fallback_ok:
        print(f"checkpoint blocked: fallback review path failed for {args.stage} on {args.slug}: {trim_detail(fallback_detail)}", file=sys.stderr)
        return 1
    record_checkpoint_fallback(args.slug, args.stage, fallback_reason)
    _advance_checkpoint_progress(args.slug, args.stage, pending_head_sha)
    print(f"warning: fallback checkpoint path used for {args.stage} on {args.slug}: {fallback_reason}", file=sys.stderr)
    return 0


def _advance_checkpoint_progress(slug: str, stage: str, pending_head_sha: str) -> None:
    """After a successful diff checkpoint, advance index and record the HEAD SHA."""
    if stage != "diff":
        return
    marker_count, current_markers_sha = parse_checkpoint_markers(slug)
    if marker_count == 0:
        return  # no markers — nothing to track
    progress = checkpoint_progress_state(slug)
    new_progress = {
        "index": progress["index"] + 1,
        "markers_sha": current_markers_sha,
        "last_diff_head_sha": pending_head_sha,
    }
    update_workflow_state(
        slug,
        lambda s: s.__setitem__(CHECKPOINT_PROGRESS_KEY, new_progress),
    )


def command_reconcile(args: argparse.Namespace) -> int:
    ensure_sync()
    plan_path = workflow_dir(args.slug) / "plan.md"
    review_args = []
    for review in args.review:
        review_args.extend(["--review", str(Path(review).resolve())])

    run([sys.executable, str(UPDATE_REVIEW), *review_args, "--status", args.status, "--note", args.note])
    run([sys.executable, str(APPEND_RECONCILIATION), "--plan", str(plan_path), *review_args, "--status", args.status, "--note", args.note])
    run([sys.executable, str(VERIFY_RECONCILIATION), "--plan", str(plan_path), *review_args])
    return 0


def command_block(args: argparse.Namespace) -> int:
    ensure_sync()
    if not args.clear and not args.reason:
        raise SystemExit("block requires --reason unless --clear is used")

    def mutate(state: dict) -> None:
        if args.clear:
            state[BLOCKED_KEY] = {
                "active": False,
                "reason": "",
                "updated_at": int(time.time()),
            }
            return
        state[BLOCKED_KEY] = {
            "active": True,
            "reason": args.reason,
            "updated_at": int(time.time()),
        }

    state = update_workflow_state(args.slug, mutate)
    blocked = state.get(BLOCKED_KEY, {})
    if blocked.get("active"):
        print(f"blocked: {blocked.get('reason', '')}")
    else:
        print("unblocked")
    return 0


def command_discover(args: argparse.Namespace) -> int:
    ensure_sync()
    clear = getattr(args, "clear", False)
    force_complete = getattr(args, "force_complete", False)
    if clear and any(
        [
            args.required,
            args.count is not None,
            args.question,
            args.recommendation,
            args.rationale,
            args.assumption,
            args.summary is not None,
            args.complete,
            force_complete,
            getattr(args, "unresolved", None) is not None,
            getattr(args, "resolve", None) is not None,
            getattr(args, "defer", None) is not None,
            getattr(args, "non_goal", None) is not None,
            getattr(args, "acceptance_criteria", None) is not None,
            getattr(args, "answer", None) is not None,
        ]
    ):
        raise SystemExit("discover --clear cannot be combined with other discovery updates")
    if args.count is not None and args.count < 0:
        raise SystemExit("discover requires --count to be zero or greater")
    if any([args.question, args.recommendation, args.rationale]) and not all(
        [args.question, args.recommendation, args.rationale]
    ):
        raise SystemExit("discover requires --question, --recommendation, and --rationale together")
    if not clear and not any(
        [
            args.required,
            args.count is not None,
            args.question,
            args.assumption,
            args.summary is not None,
            args.complete,
            force_complete,
            getattr(args, "unresolved", None) is not None,
            getattr(args, "resolve", None) is not None,
            getattr(args, "defer", None) is not None,
            getattr(args, "non_goal", None) is not None,
            getattr(args, "acceptance_criteria", None) is not None,
            getattr(args, "answer", None) is not None,
        ]
    ):
        raise SystemExit("discover requires at least one update, or use --clear to reset discovery state")

    def mutate(discovery: dict) -> None:
        if clear:
            discovery.clear()
            discovery.update(default_discovery_state())
            return
        if args.required:
            discovery["required"] = True
        if args.count is not None:
            if discovery.get("asked_count", 0) > args.count:
                raise SystemExit(
                    "discover requires --count to stay at or above the number of already asked questions; "
                    "use --clear to restart discovery"
                )
            discovery["question_count"] = args.count
            discovery["required"] = discovery["required"] or args.count > 0
        if args.question:
            questions = list(discovery.get("questions", []))
            questions.append(
                {
                    "question": args.question,
                    "recommendation": args.recommendation,
                    "rationale": args.rationale,
                    "updated_at": int(time.time()),
                }
            )
            discovery["questions"] = questions
            discovery["asked_count"] = len(questions)
            discovery["required"] = True
            if discovery.get("question_count", 0) < len(questions):
                discovery["question_count"] = len(questions)
        if args.assumption:
            assumptions = list(discovery.get("assumptions", []))
            for assumption in args.assumption:
                if assumption not in assumptions:
                    assumptions.append(assumption)
            discovery["assumptions"] = assumptions
            discovery["required"] = discovery["required"] or bool(assumptions)
        if args.summary is not None:
            discovery["summary"] = args.summary
            discovery["required"] = discovery["required"] or bool(args.summary.strip())
        if getattr(args, "answer", None) is not None:
            question_text, answer_text = args.answer
            if not isinstance(discovery.get("answers"), dict):
                discovery["answers"] = {}
            discovery["answers"][question_text] = answer_text
        if getattr(args, "unresolved", None) is not None:
            item_text = args.unresolved
            unresolved = discovery.setdefault("unresolved", [])
            if not any(u["item"] == item_text for u in unresolved):
                unresolved.append({"item": item_text, "deferred": False})
        if getattr(args, "resolve", None) is not None:
            resolve_text = args.resolve
            discovery["unresolved"] = [
                u for u in discovery.get("unresolved", []) if u["item"] != resolve_text
            ]
        if getattr(args, "defer", None) is not None:
            defer_text = args.defer
            for u in discovery.get("unresolved", []):
                if u["item"] == defer_text:
                    u["deferred"] = True
                    break
        if getattr(args, "non_goal", None) is not None:
            ng = discovery.setdefault("non_goals", [])
            if args.non_goal not in ng:
                ng.append(args.non_goal)
        if getattr(args, "acceptance_criteria", None) is not None:
            ac = discovery.setdefault("acceptance_criteria", [])
            if args.acceptance_criteria not in ac:
                ac.append(args.acceptance_criteria)
        if args.complete:
            if not force_complete and int(discovery.get("asked_count", 0)) < int(discovery.get("question_count", 0)):
                raise SystemExit(
                    "discover cannot mark discovery complete before the planned questions are recorded; "
                    "use --force-complete if you intentionally want to override the count"
                )
            discovery["complete"] = True
        elif (
            args.required
            or args.count is not None
            or args.question
            or args.assumption
            or args.summary is not None
            or getattr(args, "answer", None) is not None
            or getattr(args, "unresolved", None) is not None
            or getattr(args, "resolve", None) is not None
            or getattr(args, "defer", None) is not None
            or getattr(args, "non_goal", None) is not None
            or getattr(args, "acceptance_criteria", None) is not None
        ):
            discovery["complete"] = False
        if force_complete:
            discovery["complete"] = True
        discovery["updated_at"] = int(time.time())

    state = update_discovery_state(args.slug, mutate)
    discovery = state.get(DISCOVERY_KEY, {})
    remaining = max(int(discovery.get("question_count", 0)) - int(discovery.get("asked_count", 0)), 0)
    print(f"workflow: {args.slug}")
    print("discovery:")
    print(f"- version: {discovery.get('version', 1)}")
    print(f"- required: {'yes' if discovery.get('required') else 'no'}")
    print(f"- complete: {'yes' if discovery.get('complete') else 'no'}")
    print(f"- question-count: {discovery.get('question_count', 0)}")
    print(f"- asked-count: {discovery.get('asked_count', 0)}")
    print(f"- remaining: {remaining}")
    if discovery.get("assumptions"):
        print(f"- assumptions: {len(discovery.get('assumptions', []))}")
        for assumption in discovery.get("assumptions", []):
            print(f"- assumption: {assumption}")
    if discovery.get("summary"):
        print(f"- summary: {trim_detail(str(discovery.get('summary', '')))}")
    if discovery.get("non_goals"):
        print(f"- non-goals: {len(discovery['non_goals'])}")
        for ng in discovery["non_goals"]:
            print(f"  - {ng}")
    if discovery.get("acceptance_criteria"):
        print(f"- acceptance-criteria: {len(discovery['acceptance_criteria'])}")
        for ac in discovery["acceptance_criteria"]:
            print(f"  - {ac}")
    if discovery.get("answers"):
        print(f"- answers: {len(discovery['answers'])}")
    if discovery.get("unresolved"):
        print(f"- unresolved: {len(discovery['unresolved'])}")
        for u in discovery["unresolved"]:
            status = " [deferred]" if u.get("deferred") else ""
            print(f"  - {u['item']}{status}")
    return 0


def recommended_next_action(
    slug: str,
    state: dict,
    stages: dict[str, dict[str, object]],
    reconciliation_ok: bool,
) -> str:
    blocked = state.get(BLOCKED_KEY, {})
    if blocked.get("active"):
        return "mark_blocked"
    discovery = state.get(DISCOVERY_KEY, {})
    if discovery.get("required") and not discovery.get("complete"):
        return "discover"
    if not stages["spec"]["artifact_exists"] or not stages["spec"]["artifact_meaningful"]:
        if later_progress_exists(stages, "spec")[0]:
            return "mark_blocked"
        return "author_spec"
    if not stages["spec"]["manifest_exists"] or not stages["spec"]["healthy"]:
        return "repair_spec_checkpoint"
    if not stages["plan"]["artifact_exists"] or not stages["plan"]["artifact_meaningful"]:
        if later_progress_exists(stages, "plan")[0]:
            return "mark_blocked"
        return "author_plan"
    if not stages["plan"]["manifest_exists"] or not stages["plan"]["healthy"]:
        return "repair_plan_checkpoint"
    if not stages["tasks"]["artifact_exists"] or not stages["tasks"]["artifact_meaningful"]:
        if later_progress_exists(stages, "tasks")[0]:
            return "mark_blocked"
        return "author_tasks"
    if not stages["tasks"]["manifest_exists"] or not stages["tasks"]["healthy"]:
        return "repair_tasks_checkpoint"
    if not stages["diff"]["artifact_exists"]:
        return "implement_next_slice"
    if not stages["diff"]["manifest_exists"] or not stages["diff"]["healthy"]:
        return "repair_diff_checkpoint"
    if diff_review_budget_state(slug).get("head_mismatch"):
        return "repair_diff_checkpoint"
    if not reconciliation_ok:
        return "reconcile_reviews"
    delivery = refresh_delivery_snapshot(state.get(DELIVERY_KEY, {}))
    if not delivery.get("pr_url"):
        return "deliver"
    if delivery.get("head_mismatch"):
        return "deliver"
    if delivery.get("checks_summary") in {"pending", "fail", "unknown"}:
        return "deliver"
    if not stages["closeout"]["manifest_exists"]:
        return "closeout"
    if not stages["closeout"]["healthy"]:
        return "repair_closeout_checkpoint"
    return "done"


def command_status(args: argparse.Namespace) -> int:
    ensure_sync()
    state = load_workflow_state(args.slug)
    stages = {stage: stage_manifest_state(args.slug, stage) for stage in CHECKPOINT_STAGES}
    recon_ok, recon_detail = reconciliation_state(args.slug)
    next_action = recommended_next_action(args.slug, state, stages, recon_ok)
    branch = current_branch_name() or "(detached HEAD)"
    upstream = upstream_branch_name() or "(none)"
    blocked = state.get(BLOCKED_KEY, {})
    delivery = refresh_delivery_snapshot(state.get(DELIVERY_KEY, {}))
    discovery = discovery_state(args.slug)
    dirty_override = state.get(DIRTY_OVERRIDE_KEY, {})
    checkpoint_fallback = state.get(CHECKPOINT_FALLBACK_KEY, {})
    diff_budget = diff_review_budget_state(args.slug)

    behind = commits_behind_upstream()

    print(f"workflow: {args.slug}")
    print(f"branch: {branch}")
    print(f"upstream: {upstream}")
    if behind is not None and behind > 0:
        print(f"warning: branch is {behind} commit{'s' if behind != 1 else ''} behind upstream — rebase before creating PR")
    print("")
    print("stages:")
    for stage in CHECKPOINT_STAGES:
        stage_state = stages[stage]
        status = stage_status_label(args.slug, stage, stage_state)
        detail = trim_detail(str(stage_state.get("detail", "")))
        _, orphaned = stage_review_inventory(args.slug, stage)
        if orphaned:
            orphaned_note = f"orphaned historical reviews: {len(orphaned)}"
            detail = f"{detail}; {orphaned_note}" if detail else orphaned_note
        print(f"- {stage}: {status}" + (f" ({detail})" if detail else ""))

    print("")
    print("reconciliation:")
    if recon_ok:
        print("- terminal")
    else:
        print(f"- blocked ({trim_detail(recon_detail)})")

    print("")
    print("blocked-state:")
    if blocked.get("active"):
        print(f"- active: {blocked.get('reason', '')}")
    else:
        print("- inactive")

    if discovery.get("required") or not discovery.get("complete") or discovery.get("asked_count") or discovery.get("assumptions") or discovery.get("summary"):
        print("")
        print("discovery:")
        print(f"- required: {'yes' if discovery.get('required') else 'no'}")
        print(f"- complete: {'yes' if discovery.get('complete') else 'no'}")
        print(f"- question-count: {discovery.get('question_count', 0)}")
        print(f"- asked-count: {discovery.get('asked_count', 0)}")
        remaining = max(int(discovery.get("question_count", 0)) - int(discovery.get("asked_count", 0)), 0)
        print(f"- remaining: {remaining}")
        if discovery.get("assumptions"):
            print(f"- assumptions: {len(discovery.get('assumptions', []))}")
        if discovery.get("summary"):
            print(f"- summary: {trim_detail(str(discovery.get('summary', '')))}")

    cp = checkpoint_progress_state(args.slug)
    if cp["index"] > 0:
        print("")
        print("checkpoint-progress:")
        print(f"- index: {cp['index']}")
        last = cp["last_diff_head_sha"]
        print(f"- last-diff-head: {last[:12] if last else '(none)'}")

    print("")
    print("delivery:")
    if delivery.get("pr_url"):
        line = f"- pr: {delivery.get('pr_url')} [{delivery.get('pr_state', '')}]"
        if delivery.get("pr_is_draft"):
            line += " draft"
        print(line)
        print(f"- checks: {delivery.get('checks_summary', 'unknown')}")
        if delivery.get("merge_state_status"):
            print(f"- merge-state: {delivery.get('merge_state_status')}")
        if delivery.get("head_mismatch"):
            print("- head-mismatch: local HEAD differs from PR head")
            print("- action: refresh the PR head before delivering")
    else:
        print("- not-started")

    if dirty_override.get("used"):
        print("")
        print("dirty-override:")
        print("- used: yes")
        for path in dirty_override.get("allowed_dirty_paths", []):
            print(f"- allow-dirty-path: {path}")

    if checkpoint_fallback.get("used"):
        print("")
        print("checkpoint-fallback:")
        print(f"- stage: {checkpoint_fallback.get('stage', '')}")
        print(f"- reason: {checkpoint_fallback.get('reason', '')}")

    if diff_budget.get("artifact_exists"):
        print("")
        print("diff-review-budget:")
        print(f"- artifact-bytes: {diff_budget.get('artifact_bytes', 0)}")
        if diff_budget.get("recorded_base_ref"):
            base_ref = str(diff_budget.get("recorded_base_ref", ""))
            base_sha = str(diff_budget.get("recorded_base_sha", ""))[:12]
            print(f"- recorded-base: {base_ref} [{base_sha}]")
        if diff_budget.get("large_artifact"):
            print(f"- large-artifact: yes (>= {LARGE_DIFF_RERUN_WARN_CHARS} bytes)")
        else:
            print("- large-artifact: no")
        if diff_budget.get("head_mismatch"):
            recorded_head = str(diff_budget.get("recorded_head_sha", ""))[:12]
            current_head = str(diff_budget.get("current_head_sha", ""))[:12]
            print(f"- rerun-likely: yes (diff artifact HEAD {recorded_head} != current HEAD {current_head})")
            print(
                f"- scope-basis: last-reviewed-head [{recorded_head}]"
            )
        elif diff_budget.get("artifact_changed_since_codex"):
            print("- rerun-likely: yes (artifact changed since the last Codex review)")
        elif diff_budget.get("suggested_base_ref"):
            suggested = str(diff_budget.get("suggested_base_ref", ""))[:12]
            print(f"- scope-basis: {diff_budget.get('scope_basis', 'branch-merge-base')} [{suggested}]")
        else:
            print("- rerun-likely: no")
        if diff_budget.get("large_artifact") and (
            diff_budget.get("head_mismatch") or diff_budget.get("artifact_changed_since_codex")
        ):
            print("- advice: batch more implementation fixes before rerunning the diff checkpoint")

    print("")
    print(f"next-action: {next_action}")
    return 0


def command_repair(args: argparse.Namespace) -> int:
    ensure_sync()
    state = load_workflow_state(args.slug)
    stages = {stage: stage_manifest_state(args.slug, stage) for stage in CHECKPOINT_STAGES}
    repaired: list[str] = []
    notes: list[str] = []
    blocked_reason = ""

    print(f"workflow: {args.slug}")
    print("repair:")

    for stage in ["spec", "plan", "tasks", "diff"]:
        stage_state = stages[stage]
        drift = stage_drift_class(stage, stage_state)
        _, orphaned = stage_review_inventory(args.slug, stage)
        if stage_repairable(args.slug, stage, stage_state):
            print(f"- {stage}: repairing {drift}")
            result = command_checkpoint(repair_checkpoint_args(args.slug, stage, stage_state))
            if result != 0:
                blocked_reason = f"{stage} repair failed"
                break
            refreshed = stage_manifest_state(args.slug, stage)
            stages[stage] = refreshed
            if not refreshed["healthy"]:
                blocked_reason = f"{stage} remains unhealthy: {trim_detail(str(refreshed.get('detail', '')))}"
                break
            repaired.append(stage)
            if orphaned:
                notes.append(f"{stage}: preserved {len(orphaned)} orphaned historical review file(s)")
            continue

        print(f"- {stage}: {stage_status_label(args.slug, stage, stage_state)}")

        if drift in {"missing-artifact", "stub-artifact"} and later_progress_exists(stages, stage)[0]:
            blocked_reason = f"{stage} has {drift.replace('-', ' ')} while later workflow material exists"
            break
        if drift == "unhealthy-manifest" and not stage_repairable(args.slug, stage, stage_state):
            blocked_reason = f"{stage} checkpoint is not safely repairable: {trim_detail(str(stage_state.get('detail', '')))}"
            break

    if not blocked_reason:
        # Repair closeout if manifest is stale (only when it exists and is unhealthy)
        closeout_state = stages["closeout"]
        closeout_drift = stage_drift_class("closeout", closeout_state)
        if closeout_drift == "unhealthy-manifest" and stage_repairable(args.slug, "closeout", closeout_state):
            print("- closeout: repairing unhealthy-manifest")
            result = command_checkpoint(repair_checkpoint_args(args.slug, "closeout", closeout_state))
            if result != 0:
                blocked_reason = "closeout repair failed"
            else:
                refreshed = stage_manifest_state(args.slug, "closeout")
                stages["closeout"] = refreshed
                if not refreshed["healthy"]:
                    blocked_reason = f"closeout remains unhealthy: {trim_detail(str(refreshed.get('detail', '')))}"
                else:
                    repaired.append("closeout")
        elif closeout_drift == "unhealthy-manifest":
            # unhealthy-manifest but not repairable — block so repair doesn't silently succeed
            blocked_reason = "closeout is unhealthy but not repairable"
        elif closeout_drift not in {"not-checkpointed", "missing-artifact", "stub-artifact"}:
            print(f"- closeout: {stage_status_label(args.slug, 'closeout', closeout_state)}")

    if blocked_reason:
        print(f"- blocked: {blocked_reason}")
        for note in notes:
            print(f"- note: {note}")
        return 1

    recon_ok, recon_detail = reconciliation_state(args.slug)
    next_action = recommended_next_action(args.slug, state, stages, recon_ok)
    print("")
    if repaired:
        print(f"- repaired: {', '.join(repaired)}")
    else:
        print("- repaired: none")
    if notes:
        for note in notes:
            print(f"- note: {note}")
    if not recon_ok:
        print(f"- follow-up: reconciliation still blocked ({trim_detail(recon_detail)})")
    print(f"next-action: {next_action}")
    return 0


def command_doctor(args: argparse.Namespace) -> int:
    checks: list[tuple[str, str, str]] = []

    def add(name: str, level: str, detail: str) -> None:
        checks.append((name, level, detail))

    repo_root = git_output("rev-parse", "--show-toplevel")
    add("repo-root", "ok" if repo_root == str(REPO_ROOT) else "fail", repo_root or "not inside a git repo")
    add(
        "python",
        "ok" if sys.version_info >= (3, 10) else "fail",
        f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
    )

    for label, path in {
        "sync-script": SYNC_SCRIPT,
        "feature-runner": Path(__file__).resolve(),
        "write-diff": WRITE_DIFF,
        "repair": REPAIR,
        "verify-checkpoint": VERIFY_CHECKPOINT,
        "verify-reconciliation": VERIFY_RECONCILIATION,
    }.items():
        add(label, "ok" if path.exists() else "fail", str(path))

    for tool_name in ["git", "codex", "gemini", "gh"]:
        found = command_path(tool_name)
        level = "ok" if found else ("warn" if tool_name == "gh" else "fail")
        add(f"tool:{tool_name}", level, found or "not installed")

    sync_check = subprocess.run([sys.executable, str(SYNC_SCRIPT), "--check"], text=True, capture_output=True)
    add("skill-sync", "ok" if sync_check.returncode == 0 else "warn", "in sync" if sync_check.returncode == 0 else "needs sync")

    branch = current_branch_name()
    add("git-branch", "ok" if branch else "warn", branch or "detached HEAD")
    upstream = upstream_branch_name()
    add("git-upstream", "ok" if upstream else "warn", upstream or "no upstream configured")

    if command_path("gh"):
        auth = subprocess.run(["gh", "auth", "status", "--active"], text=True, capture_output=True)
        auth_detail = (auth.stderr or auth.stdout or "").strip().splitlines()
        add("gh-auth", "ok" if auth.returncode == 0 else "warn", auth_detail[0] if auth_detail else "unknown")

    failed = False
    for name, level, detail in checks:
        print(f"[{level.upper()}] {name}: {detail}")
        if level == "fail":
            failed = True
    return 1 if failed else 0


def command_deliver(args: argparse.Namespace) -> int:
    ensure_sync()
    if not command_path("gh"):
        raise SystemExit("deliver requires the gh CLI to be installed")

    for stage in REQUIRED_PREDELIVERY_STAGES:
        manifest_path = checkpoint_manifest_path(args.slug, stage)
        if not manifest_path.exists():
            raise SystemExit(f"deliver requires completed {stage} checkpoint first")
        healthy, detail = verify_checkpoint_manifest(manifest_path)
        if not healthy:
            raise SystemExit(f"deliver requires a healthy {stage} checkpoint first: {trim_detail(detail)}")

    recon_ok, recon_detail = reconciliation_state(args.slug)
    if not recon_ok:
        raise SystemExit(f"deliver requires terminal reconciliation first: {trim_detail(recon_detail)}")

    auth = subprocess.run(["gh", "auth", "status", "--active"], text=True, capture_output=True)
    if auth.returncode != 0:
        raise SystemExit(trim_detail(auth.stderr or auth.stdout or "GitHub authentication is not ready"))

    branch = current_branch_name()
    if not branch:
        raise SystemExit("deliver requires a named branch; detached HEAD is not supported")
    upstream = upstream_branch_name()
    head_sha = git_output("rev-parse", "HEAD") or ""
    diff_budget = diff_review_budget_state(args.slug)
    if diff_budget.get("head_mismatch"):
        recorded_head = str(diff_budget.get("recorded_head_sha", ""))[:12]
        current_head = str(diff_budget.get("current_head_sha", ""))[:12]
        raise SystemExit(
            f"deliver requires the current branch to match the reviewed diff HEAD; "
            f"diff artifact HEAD {recorded_head} does not match current HEAD {current_head}. "
            "Rerun the diff checkpoint before delivering."
        )

    pr = current_pr_payload()
    if pr and pr.get("state") != "OPEN":
        pr = None

    if args.create_pr and not pr:
        if not upstream:
            raise SystemExit("deliver requires a published branch with an upstream before creating a PR")
        behind = commits_behind_upstream()
        if behind is not None and behind > 0:
            print(f"warning: branch is {behind} commit{'s' if behind != 1 else ''} behind upstream — consider rebasing before creating PR")
        title = args.title or f"Workflow: {args.slug}"
        body = "\n".join(
            [
                f"## Workflow",
                f"- slug: `{args.slug}`",
                f"- spec: `docs/feature-runs/{args.slug}/spec.md`",
                f"- plan: `docs/feature-runs/{args.slug}/plan.md`",
                f"- tasks: `docs/feature-runs/{args.slug}/tasks.md`",
                "",
                "## Verification",
                "- Local workflow checkpoints completed through diff review.",
            ]
        )
        cmd = [
            "gh",
            "pr",
            "create",
            "--head",
            branch,
            "--title",
            title,
            "--body",
            body,
        ]
        if args.base:
            cmd.extend(["--base", args.base])
        if args.draft:
            cmd.append("--draft")
        if args.dry_run:
            cmd.append("--dry-run")
        result = subprocess.run(cmd, text=True, capture_output=True)
        if result.returncode != 0:
            raise SystemExit(trim_detail(result.stderr or result.stdout or "PR creation failed"))
        if args.dry_run:
            print((result.stdout or "").strip())
        else:
            pr = current_pr_payload()

    if (args.watch_ci or args.merge_when_green or args.auto_merge) and not pr:
        raise SystemExit("deliver requires an open PR before watching checks or merging")

    checks_summary = "unknown"
    checks: list[dict] = []
    checks_detail = ""
    if pr:
        head_mismatch = bool(pr.get("headRefOid")) and bool(head_sha) and pr.get("headRefOid") != head_sha
        if head_mismatch and (args.merge_when_green or args.auto_merge):
            raise SystemExit(
                f"local HEAD {head_sha[:12]} does not match PR head {str(pr.get('headRefOid'))[:12]}; "
                "push the branch or refresh the PR before merging"
            )
        checks_summary, checks, checks_detail = required_check_summary(
            pr.get("number"),
            watch=args.watch_ci and not args.dry_run,
            interval=args.interval,
        )
        delivery_record = build_delivery_record(pr, checks_summary, checks, branch, head_sha)
        delivery_record["upstream"] = upstream or ""
        delivery_record["checks_detail"] = checks_detail
        delivery_record["head_mismatch"] = head_mismatch

        if args.dry_run:
            print(f"branch: {branch}")
            print(f"head: {head_sha}")
            print(f"pr: {delivery_record.get('pr_url', '') or 'not created'}")
            print(f"checks: {checks_summary}")
            if delivery_record.get("merge_state_status"):
                print(f"merge-state: {delivery_record.get('merge_state_status')}")
            if head_mismatch:
                print("head-mismatch: yes")
            return 0

        if args.auto_merge and not args.dry_run:
            merge_cmd = [
                "gh",
                "pr",
                "merge",
                str(pr["number"]),
                "--auto",
                "--squash",
                "--match-head-commit",
                head_sha,
            ]
            result = subprocess.run(merge_cmd, text=True, capture_output=True)
            if result.returncode != 0:
                raise SystemExit(trim_detail(result.stderr or result.stdout or "Auto-merge enable failed"))
            refreshed_delivery = refresh_delivery_snapshot(delivery_record)
            update_workflow_state(
                args.slug,
                lambda state: state.__setitem__(DELIVERY_KEY, refreshed_delivery),
            )
        elif args.merge_when_green and not args.dry_run:
            if checks_summary != "pass":
                raise SystemExit(f"cannot merge while required checks are {checks_summary}")
            merged_pr_number = pr["number"]
            merge_cmd = [
                "gh",
                "pr",
                "merge",
                str(merged_pr_number),
                "--squash",
                "--match-head-commit",
                head_sha,
            ]
            result = subprocess.run(merge_cmd, text=True, capture_output=True)
            if result.returncode != 0:
                raise SystemExit(trim_detail(result.stderr or result.stdout or "Merge failed"))
            pr = current_pr_payload()
            checks_summary, checks, checks_detail = required_check_summary(merged_pr_number, watch=False)
            update_workflow_state(
                args.slug,
                lambda state: state.__setitem__(
                    DELIVERY_KEY,
                    {
                        **build_delivery_record(pr, checks_summary, checks, branch, head_sha),
                        "upstream": upstream or "",
                        "checks_detail": checks_detail,
                        "head_mismatch": False,
                    },
                ),
            )
        else:
            update_workflow_state(
                args.slug,
                lambda state: state.__setitem__(DELIVERY_KEY, delivery_record),
            )

    else:
        if args.dry_run:
            print(f"branch: {branch}")
            print(f"head: {head_sha}")
            print("pr: not created (dry-run)")
            return 0
        update_workflow_state(
            args.slug,
            lambda state: state.__setitem__(
                DELIVERY_KEY,
                {
                    "branch": branch,
                    "head_sha": head_sha,
                    "updated_at": int(time.time()),
                    "upstream": upstream or "",
                    "pr_url": "",
                    "checks_summary": "not-started",
                },
            ),
        )

    delivery = load_workflow_state(args.slug).get(DELIVERY_KEY, {})
    print(f"branch: {branch}")
    print(f"head: {head_sha}")
    if delivery.get("pr_url"):
        print(f"pr: {delivery.get('pr_url')}")
        print(f"checks: {delivery.get('checks_summary', 'unknown')}")
        if delivery.get("merge_state_status"):
            print(f"merge-state: {delivery.get('merge_state_status')}")
        if delivery.get("head_mismatch"):
            print("head-mismatch: yes")
    else:
        print("pr: not created")
    return 0


def command_closeout(args: argparse.Namespace) -> int:
    ensure_sync()
    root = workflow_dir(args.slug)
    reviews = gather_all_review_paths(args.slug, include_closeout=False)
    plan_path = root / "plan.md"
    state = load_workflow_state(args.slug)
    delivery = refresh_delivery_snapshot(state.get(DELIVERY_KEY, {}))
    if not delivery.get("pr_url"):
        raise SystemExit("closeout requires a delivered PR first")
    if delivery.get("checks_summary") != "pass":
        raise SystemExit(
            f"closeout requires passing checks first; "
            f"current checks are {delivery.get('checks_summary', 'unknown')}"
        )

    missing_stages = []
    for stage in VERIFY_ON_CLOSEOUT_STAGES:
        manifest_path = checkpoint_manifest_path(args.slug, stage)
        if not manifest_path.exists():
            missing_stages.append(stage)
    if missing_stages:
        raise SystemExit(
            "Closeout requires completed checkpoint manifests for: "
            + ", ".join(missing_stages)
        )

    for stage in VERIFY_ON_CLOSEOUT_STAGES:
        manifest_path = checkpoint_manifest_path(args.slug, stage)
        run([sys.executable, str(VERIFY_CHECKPOINT), "--checkpoint-manifest", str(manifest_path)])

    if reviews:
        cmd = [
            sys.executable,
            str(VERIFY_RECONCILIATION),
            "--plan",
            str(plan_path),
            "--require-terminal",
        ]
        for review in reviews:
            cmd.extend(["--review", str(review)])
        run(cmd)

    summary_path = root / "closeout.md"
    closeout_manifest_path = checkpoint_manifest_path(args.slug, "closeout")
    dirty_override = state.get(DIRTY_OVERRIDE_KEY, {})
    checkpoint_fallback = state.get(CHECKPOINT_FALLBACK_KEY, {})
    backup_text = summary_path.read_text(encoding="utf-8") if summary_path.exists() else None
    backup_manifest = closeout_manifest_path.read_text(encoding="utf-8") if closeout_manifest_path.exists() else None
    inventory_text = closeout_inventory_text(args.slug, root, plan_path, reviews, delivery, dirty_override, checkpoint_fallback)
    summary_text = compose_closeout_text(backup_text or "", inventory_text)
    summary_path.write_text(summary_text, encoding="utf-8")

    closeout_args = argparse.Namespace(
        slug=args.slug,
        stage="closeout",
        artifact=str(summary_path),
        base_ref=None,
        context=[],
        path=[],
        extra_gemini_lens=[],
        sensitive=False,
        large_structural=False,
        performance_sensitive=False,
        use_existing_artifact=True,
        allow_dirty_path=[],
        max_artifact_chars=None,
        max_context_chars=None,
        max_total_chars=None,
        gemini_timeout_seconds=120,
        gemini_retries=1,
        repair_timeout_seconds=300,
        fallback=False,
        allow_large_diff_rerun=False,
    )
    checkpoint_result = command_checkpoint(closeout_args)
    if checkpoint_result != 0:
        if backup_text is None:
            summary_path.unlink(missing_ok=True)
        else:
            summary_path.write_text(backup_text, encoding="utf-8")
        if backup_manifest is None:
            closeout_manifest_path.unlink(missing_ok=True)
        else:
            closeout_manifest_path.write_text(backup_manifest, encoding="utf-8")
        return checkpoint_result

    refreshed_state = load_workflow_state(args.slug)
    refreshed_delivery = refresh_delivery_snapshot(refreshed_state.get(DELIVERY_KEY, {}))
    refreshed_inventory = closeout_inventory_text(
        args.slug,
        root,
        plan_path,
        reviews,
        refreshed_delivery,
        refreshed_state.get(DIRTY_OVERRIDE_KEY, {}),
        refreshed_state.get(CHECKPOINT_FALLBACK_KEY, {}),
    )
    refreshed_summary = compose_closeout_text(backup_text or "", refreshed_inventory)
    if refreshed_summary != summary_text:
        summary_path.write_text(refreshed_summary, encoding="utf-8")
        checkpoint_result = command_checkpoint(closeout_args)
        if checkpoint_result != 0:
            if backup_text is None:
                summary_path.unlink(missing_ok=True)
            else:
                summary_path.write_text(backup_text, encoding="utf-8")
            if backup_manifest is None:
                closeout_manifest_path.unlink(missing_ok=True)
            else:
                closeout_manifest_path.write_text(backup_manifest, encoding="utf-8")
            return checkpoint_result

    print(str(summary_path))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init")
    init_parser.add_argument("--slug", required=True)
    init_parser.add_argument("--path", action="append", default=[])
    init_parser.set_defaults(func=command_init)

    doctor_parser = subparsers.add_parser("doctor")
    doctor_parser.set_defaults(func=command_doctor)

    status_parser = subparsers.add_parser("status")
    status_parser.add_argument("--slug", required=True)
    status_parser.set_defaults(func=command_status)

    repair_parser = subparsers.add_parser("repair")
    repair_parser.add_argument("--slug", required=True)
    repair_parser.set_defaults(func=command_repair)

    checkpoint_parser = subparsers.add_parser("checkpoint")
    checkpoint_parser.add_argument("--slug", required=True)
    checkpoint_parser.add_argument("--stage", required=True, choices=CHECKPOINT_STAGES)
    checkpoint_parser.add_argument("--artifact")
    checkpoint_parser.add_argument("--base-ref")
    checkpoint_parser.add_argument("--context", action="append", default=[])
    checkpoint_parser.add_argument("--path", action="append", default=[])
    checkpoint_parser.add_argument("--extra-gemini-lens", action="append", default=[])
    checkpoint_parser.add_argument("--sensitive", action="store_true")
    checkpoint_parser.add_argument("--large-structural", action="store_true")
    checkpoint_parser.add_argument("--performance-sensitive", action="store_true")
    checkpoint_parser.add_argument("--use-existing-artifact", action="store_true")
    checkpoint_parser.add_argument("--allow-dirty-path", action="append", default=[])
    checkpoint_parser.add_argument("--max-artifact-chars", type=int)
    checkpoint_parser.add_argument("--max-context-chars", type=int)
    checkpoint_parser.add_argument("--max-total-chars", type=int)
    checkpoint_parser.add_argument("--gemini-timeout-seconds", type=int, default=120)
    checkpoint_parser.add_argument("--gemini-retries", type=int, default=1)
    checkpoint_parser.add_argument("--repair-timeout-seconds", type=int, default=300)
    checkpoint_parser.add_argument("--allow-large-diff-rerun", action="store_true")
    checkpoint_parser.add_argument("--fallback", action="store_true")
    checkpoint_parser.set_defaults(func=command_checkpoint)

    reconcile_parser = subparsers.add_parser("reconcile")
    reconcile_parser.add_argument("--slug", required=True)
    reconcile_parser.add_argument("--review", action="append", required=True)
    reconcile_parser.add_argument("--status", required=True)
    reconcile_parser.add_argument("--note", required=True)
    reconcile_parser.set_defaults(func=command_reconcile)

    block_parser = subparsers.add_parser("block")
    block_parser.add_argument("--slug", required=True)
    block_parser.add_argument("--reason")
    block_parser.add_argument("--clear", action="store_true")
    block_parser.set_defaults(func=command_block)

    discover_parser = subparsers.add_parser("discover")
    discover_parser.add_argument("--slug", required=True)
    discover_parser.add_argument("--required", action="store_true")
    discover_parser.add_argument("--count", type=int)
    discover_parser.add_argument("--question")
    discover_parser.add_argument("--recommendation")
    discover_parser.add_argument("--rationale")
    discover_parser.add_argument("--assumption", action="append", default=[])
    discover_parser.add_argument("--summary")
    discover_parser.add_argument("--complete", action="store_true")
    discover_parser.add_argument("--unresolved", type=str,
        help="Add an item to unresolved[]")
    discover_parser.add_argument("--resolve", type=str,
        help="Remove an item from unresolved[] by exact text match")
    discover_parser.add_argument("--defer", type=str,
        help="Mark an unresolved item as deferred by exact text match")
    discover_parser.add_argument("--non-goal", type=str, dest="non_goal",
        help="Add a string to non_goals[]")
    discover_parser.add_argument("--acceptance-criteria", type=str, dest="acceptance_criteria",
        help="Add a string to acceptance_criteria[]")
    discover_parser.add_argument("--answer", nargs=2, metavar=("QUESTION", "ANSWER"),
        help="Record answers[QUESTION] = ANSWER")
    discover_parser.add_argument("--force-complete", action="store_true")
    discover_parser.add_argument("--clear", action="store_true")
    discover_parser.set_defaults(func=command_discover)

    deliver_parser = subparsers.add_parser("deliver")
    deliver_parser.add_argument("--slug", required=True)
    deliver_parser.add_argument("--create-pr", action="store_true")
    deliver_parser.add_argument("--draft", action="store_true")
    deliver_parser.add_argument("--base")
    deliver_parser.add_argument("--title")
    deliver_parser.add_argument("--watch-ci", action="store_true")
    deliver_parser.add_argument("--interval", type=int, default=10)
    deliver_parser.add_argument("--merge-when-green", action="store_true")
    deliver_parser.add_argument("--auto-merge", action="store_true")
    deliver_parser.add_argument("--dry-run", action="store_true")
    deliver_parser.set_defaults(func=command_deliver)

    closeout_parser = subparsers.add_parser("closeout")
    closeout_parser.add_argument("--slug", required=True)
    closeout_parser.set_defaults(func=command_closeout)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
