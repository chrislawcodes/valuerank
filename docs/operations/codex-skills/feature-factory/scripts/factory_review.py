#!/usr/bin/env python3
"""Review orchestration, checkpoint manifests, fallback execution, and next-action logic.

Builds review specs, runs fallback reviews, manages checkpoint progress.
"""
import argparse
import concurrent.futures
import json
import subprocess
import sys
import time
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from factory_state import (  # noqa: E402
    REPO_ROOT,
    BLOCKED_KEY,
    DISCOVERY_KEY,
    DELIVERY_KEY,
    DIRTY_OVERRIDE_KEY,
    CHECKPOINT_FALLBACK_KEY,
    CHECKPOINT_PROGRESS_KEY,
    read_json_file,
    reviews_dir,
    blocking_unresolved_items,
    load_workflow_state,
    save_workflow_state,
    update_workflow_state,
    load_checkpoint_manifest,
    parse_review_frontmatter,
)

REVIEW_SCRIPTS = REPO_ROOT / "docs" / "operations" / "codex-skills" / "review-lens" / "scripts"
if str(REVIEW_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(REVIEW_SCRIPTS))

from workflow_utils import normalized_artifact_hash, repo_relative_path, resolve_stored_path  # noqa: E402

from factory_stages import (  # noqa: E402
    VERIFY_CHECKPOINT,
    diff_review_budget_state,
    parse_checkpoint_markers,
    checkpoint_progress_state,
    later_progress_exists,
)

from factory_git import current_branch_name  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

WRITE_DIFF = REVIEW_SCRIPTS / "write_canonical_diff.py"
REPAIR = REVIEW_SCRIPTS / "repair_review_checkpoint.py"
UPDATE_REVIEW = REVIEW_SCRIPTS / "update_review_resolution.py"
APPEND_RECONCILIATION = REVIEW_SCRIPTS / "append_reconciliation_entry.py"
RUN_GEMINI_REVIEW = REVIEW_SCRIPTS / "run_gemini_review.py"
RUN_CODEX_REVIEW = REVIEW_SCRIPTS / "run_codex_review.py"
DEFAULT_GEMINI_MODEL = "gemini-2.5-pro"
DEFAULT_CODEX_MODEL = "gpt-5.4-mini"

# EXPERIMENT: staggered-parallel Gemini reviews.
# Gemini reviews launch GEMINI_STAGGER_SECONDS apart without the file lock, so they overlap.
# Codex reviews always run fully in parallel with Gemini (different API, no rate limit).
# If rate-limit errors appear in review output → increase this value (try 60, 90, 120).
# If failures persist at 120 → set to None to revert to strict serial execution.
# See STATUS.md "Run reviews in parallel" for experiment tracking notes.
GEMINI_STAGGER_SECONDS: int | None = 30


# ---------------------------------------------------------------------------
# Review helpers
# ---------------------------------------------------------------------------


def trim_detail(text: str, limit: int = 240) -> str:
    stripped = " ".join(text.split())
    if len(stripped) <= limit:
        return stripped
    return stripped[: limit - 3] + "..."


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
    fast: bool = False,
) -> list[dict[str, str]]:
    if fast:
        return [
            {"reviewer": "gemini", "lens": "regression-adversarial", "model": DEFAULT_GEMINI_MODEL},
            {"reviewer": "codex", "lens": "correctness-adversarial", "model": DEFAULT_CODEX_MODEL},
        ]

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


# ---------------------------------------------------------------------------
# Checkpoint manifest & policy
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Fallback review execution
# ---------------------------------------------------------------------------


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

    def _already_done(spec: dict) -> bool:
        review_path = resolve_stored_path(spec["path"], REPO_ROOT)
        if not review_path.exists():
            return False
        try:
            data, _ = parse_review_frontmatter(review_path)
        except Exception:
            data = {}
        return data.get("artifact_sha256") == normalized_artifact_hash(checkpoint.get("stage", ""), artifact_path)

    def _run_review(spec: dict, no_gemini_lock: bool = False) -> str | None:
        if _already_done(spec):
            return None
        cmd = fallback_review_command(spec, artifact_path, checkpoint, workspace_dir, gemini_timeout_seconds, gemini_retries)
        if no_gemini_lock and spec.get("reviewer") == "gemini":
            cmd.append("--no-gemini-lock")
        timeout = gemini_timeout_seconds + 30 if spec.get("reviewer") == "gemini" else 210
        result = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout)
        if result.returncode != 0:
            return f"{spec['path']}: {trim_detail(result.stderr or result.stdout or 'review failed')}"
        return None

    all_specs = checkpoint.get("required_reviews", [])
    gemini_specs = [s for s in all_specs if s.get("reviewer") == "gemini"]
    codex_specs = [s for s in all_specs if s.get("reviewer") != "gemini"]
    parallel_gemini = GEMINI_STAGGER_SECONDS is not None

    failed: list[str] = []
    futures: list[concurrent.futures.Future[str | None]] = []

    with concurrent.futures.ThreadPoolExecutor() as executor:
        # Codex always runs in parallel with Gemini (different API, no rate limit concern).
        for spec in codex_specs:
            futures.append(executor.submit(_run_review, spec))

        if parallel_gemini:
            # EXPERIMENT: launch Gemini reviews GEMINI_STAGGER_SECONDS apart without the
            # file lock. See constant definition above for tuning / rollback instructions.
            for i, spec in enumerate(gemini_specs):
                if i > 0:
                    time.sleep(GEMINI_STAGGER_SECONDS)
                futures.append(executor.submit(_run_review, spec, True))
        else:
            # Serial fallback: run Gemini reviews one at a time (rate-limit safe).
            for spec in gemini_specs:
                err = _run_review(spec)
                if err:
                    failed.append(err)

        for future in concurrent.futures.as_completed(futures):
            err = future.result()
            if err:
                failed.append(err)

    verify = subprocess.run(
        [sys.executable, str(VERIFY_CHECKPOINT), "--checkpoint-manifest", str(manifest_path)],
        text=True,
        capture_output=True,
    )
    detail = (verify.stdout or verify.stderr or "").strip()
    if failed:
        detail = "; ".join([detail] + failed if detail else failed)
    return verify.returncode == 0 and not failed, detail


def record_checkpoint_fallback(slug: str, stage: str, reason: str) -> dict:
    def mutate(state: dict) -> None:
        state[CHECKPOINT_FALLBACK_KEY] = {
            "used": True,
            "stage": stage,
            "reason": reason,
            "updated_at": int(time.time()),
        }

    return update_workflow_state(slug, mutate)


# ---------------------------------------------------------------------------
# Checkpoint progress
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Next-action decision tree
# ---------------------------------------------------------------------------


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
    if blocking_unresolved_items(discovery) or (discovery.get("required") and not discovery.get("complete")):
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
    # Import here to avoid circular — refresh_delivery_snapshot is in factory_deliver
    from factory_deliver import refresh_delivery_snapshot  # noqa: E402
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
