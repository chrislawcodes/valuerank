#!/usr/bin/env python3
"""command_checkpoint implementation."""
import argparse
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
    CHECKPOINT_PROGRESS_KEY,
    DIRTY_OVERRIDE_KEY,
    PARALLEL_ANALYSIS_KEY,
    atomic_json_write,
    normalized_repo_path,
    workflow_dir,
    reviews_dir,
    scope_manifest_path,
    checkpoint_manifest_path,
    default_artifact_path,
    load_workflow_state,
    update_workflow_state,
    discovery_state,
    blocking_unresolved_items,
    discovery_blockers_are_malformed,
    save_scope_manifest,
)

from factory_git import (  # noqa: E402
    run,
    _sha_is_valid_ancestor,
    _git_head_sha,
    ensure_sync,
    revert_protected_files,
)

from factory_stages import (  # noqa: E402
    HARD_DIFF_ARTIFACT_MAX_CHARS,
    LARGE_DIFF_RERUN_WARN_CHARS,
    STAGE_ARTIFACT_HEADINGS,
    _CHECKPOINT_MARKER_RE,
    parse_checkpoint_markers,
    checkpoint_progress_state,
    _default_checkpoint_progress,
    artifact_has_meaningful_content,
    diff_review_budget_state,
    preferred_diff_base_ref,
    prerequisite_failure,
)

from factory_review import (  # noqa: E402
    WRITE_DIFF,
    REPAIR,
    SMALL_TASK_SET_THRESHOLD,
    trim_detail,
    required_reviews,
    resolved_review_policy,
    checkpoint_manifest,
    repair_checkpoint_args,
    run_checkpoint_fallback,
    record_checkpoint_fallback,
    _advance_checkpoint_progress,
    _AUTO_CONTEXT_MAX_FILES,
    _AUTO_CONTEXT_EXTENSIONS,
    _AUTO_CONTEXT_PATH_RE,
    _extract_file_paths_from_artifact,
)

from factory_emit import _emit_next_action  # noqa: E402


def command_checkpoint(args: argparse.Namespace) -> int:
    fast = getattr(args, "fast", False)
    if fast and args.stage != "diff":
        raise SystemExit("--fast requires --stage diff")

    ensure_sync()
    root = workflow_dir(args.slug)
    reviews = reviews_dir(args.slug)
    root.mkdir(parents=True, exist_ok=True)
    reviews.mkdir(parents=True, exist_ok=True)

    if not fast:
        prereq_error = prerequisite_failure(args.slug, args.stage)
        if prereq_error:
            raise SystemExit(prereq_error)
    if not fast and args.stage == "tasks":
        parallel = load_workflow_state(args.slug).get(PARALLEL_ANALYSIS_KEY, {})
        if not parallel.get("reviewed"):
            raise SystemExit(
                "tasks checkpoint requires parallel analysis first; "
                "run 'parallel --slug <slug> --note \"...\"' to record whether "
                "parallel implementation opportunities exist in tasks.md"
            )
    if not fast and args.stage == "spec":
        discovery = discovery_state(args.slug)
        blocking = blocking_unresolved_items(discovery)
        if blocking:
            if discovery_blockers_are_malformed(discovery):
                raise SystemExit(
                    "spec checkpoint requires discovery state to be repaired first; "
                    "use discover --clear to reset malformed discovery state"
                )
            raise SystemExit(
                "spec checkpoint requires discovery unresolved items to be resolved or deferred first; "
                "use discover --resolve or discover --defer before checkpointing spec"
            )
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
        if marker_count == 0:
            print(
                "warning: tasks.md has no [CHECKPOINT] markers — diff review will cover "
                "the full branch. Add [CHECKPOINT] markers to tasks.md to scope each "
                "diff review to a single implementation slice.",
                file=sys.stderr,
            )
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

    # Auto-add files mentioned in the spec/artifact as context so reviewers
    # can verify assumptions against real code rather than generating unfounded findings.
    if args.stage in ("spec", "plan") and not getattr(args, "no_auto_context", False):
        auto_context = _extract_file_paths_from_artifact(artifact_path, REPO_ROOT)
        for p in auto_context:
            if len(context_paths) >= _AUTO_CONTEXT_MAX_FILES:
                break
            if p not in context_paths:
                context_paths.append(p)

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

    reviews_arg = getattr(args, "required_reviews", None)
    if reviews_arg is None:
        small_task_set = False
        if args.stage in ("tasks", "closeout"):
            # For "tasks": count from the artifact (tasks.md is the artifact).
            # For "closeout": count from tasks.md in the workflow dir (artifact is closeout.md).
            tasks_file = artifact_path if args.stage == "tasks" else workflow_dir(args.slug) / "tasks.md"
            if tasks_file.exists():
                try:
                    task_text = tasks_file.read_text(encoding="utf-8")
                    task_count = sum(
                        1 for line in task_text.splitlines()
                        if line.strip().startswith("- [ ]") or line.strip().startswith("- [x]") or line.strip().startswith("- [X]")
                    )
                    if task_count < SMALL_TASK_SET_THRESHOLD:
                        small_task_set = True
                        print(
                            f"info: small task set ({task_count} tasks < {SMALL_TASK_SET_THRESHOLD} threshold) — "
                            f"skipping Gemini reviews for {args.stage} stage, running Codex review only.",
                            file=sys.stderr,
                        )
                except Exception:
                    pass  # count failed — fall back to full reviews
        reviews_arg = required_reviews(
            args.stage,
            policy["sensitive"],
            policy["large_structural"],
            policy["performance_sensitive"],
            policy["extra_gemini_lenses"],
            fast=fast,
            small_task_set=small_task_set,
        )

    manifest = checkpoint_manifest(
        args.slug,
        args.stage,
        artifact_path,
        args.base_ref,
        context_paths,
        reviews_arg,
        args.max_artifact_chars,
        args.max_context_chars,
        args.max_total_chars,
        allow_dirty_paths,
    )
    manifest_path = checkpoint_manifest_path(args.slug, args.stage)
    atomic_json_write(manifest_path, manifest)
    if args.stage == "diff":
        if allow_dirty_paths:
            update_workflow_state(
                args.slug,
                lambda state: state.__setitem__(
                    DIRTY_OVERRIDE_KEY,
                    {
                        "allowed_dirty_paths": allow_dirty_paths,
                        "used": True,
                        "updated_at": int(time.time()),
                    },
                ),
            )
        else:
            # No --allow-dirty-path on this run — clear any stale override from a prior run.
            update_workflow_state(
                args.slug,
                lambda state: state.pop(DIRTY_OVERRIDE_KEY, None),
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
            reverted = revert_protected_files()
            if reverted:
                print(f"reverted protected files: {', '.join(reverted)}", file=sys.stderr)
            _advance_checkpoint_progress(args.slug, args.stage, pending_head_sha)
            _emit_next_action(args.slug, f"{args.stage} checkpoint")
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
    reverted = revert_protected_files()
    if reverted:
        print(f"reverted protected files: {', '.join(reverted)}", file=sys.stderr)
    record_checkpoint_fallback(args.slug, args.stage, fallback_reason)
    _advance_checkpoint_progress(args.slug, args.stage, pending_head_sha)
    print(f"warning: fallback checkpoint path used for {args.stage} on {args.slug}: {fallback_reason}", file=sys.stderr)
    _emit_next_action(args.slug, f"{args.stage} checkpoint")
    return 0
