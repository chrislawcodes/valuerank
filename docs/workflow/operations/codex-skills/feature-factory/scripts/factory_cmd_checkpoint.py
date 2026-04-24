#!/usr/bin/env python3
"""command_checkpoint implementation."""
import argparse
import json
import os
import subprocess
import sys
import tempfile
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
    update_stage_state,
    with_locked_state,
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
    CHECKPOINT_STAGES,
    STAGE_ARTIFACT_HEADINGS,
    _CHECKPOINT_MARKER_RE,
    parse_checkpoint_markers,
    checkpoint_progress_state,
    _default_checkpoint_progress,
    artifact_has_meaningful_content,
    diff_review_budget_state,
    preferred_diff_base_ref,
    prerequisite_failure,
    reconciliation_state,
    stage_manifest_state,
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
from factory_heartbeat import HeartbeatEmitter, set_activity as heartbeat_set_activity  # noqa: E402
from factory_next_action import recommended_next_action  # noqa: E402
from workflow_utils import normalized_artifact_hash  # noqa: E402
from factory_mutating import mutates_state  # noqa: E402


def _ensure_stage_state_blob(state: dict, stage: str) -> dict:
    stages = state.setdefault("stages", {})
    stage_state = stages.get(stage)
    if not isinstance(stage_state, dict):
        stage_state = {}
    stage_state.setdefault("adversarial_rounds", 0)
    stage_state.setdefault("judge_rounds", 0)
    stage_state.setdefault("judge_verdicts", [])
    stage_state.setdefault("annotations", [])
    stage_state.setdefault("unresolved_concerns", [])
    stage_state.setdefault("adversarial_sha_history", [])
    stage_state.setdefault("initial_sha", "")
    stages[stage] = stage_state
    try:
        schema_version = int(state.get("schema_version", 1))
    except (TypeError, ValueError):
        schema_version = 1
    if schema_version < 2:
        state["schema_version"] = 2
    return stage_state


def _stage_int(stage_state: dict, key: str) -> int:
    try:
        return int(stage_state.get(key, 0) or 0)
    except (TypeError, ValueError):
        return 0


def _judge_panel_payload_from_state(slug: str, state: dict) -> dict[str, object] | None:
    stages = state.get("stages", {})
    if not isinstance(stages, dict):
        stages = {}
    for stage in ("spec", "plan", "tasks", "diff", "closeout"):
        stage_state = stages.get(stage, {})
        if not isinstance(stage_state, dict):
            stage_state = {}
        adversarial_rounds = _stage_int(stage_state, "adversarial_rounds")
        judge_rounds = _stage_int(stage_state, "judge_rounds")
        judge_verdicts = stage_state.get("judge_verdicts", [])
        latest_round = judge_verdicts[-1] if isinstance(judge_verdicts, list) and judge_verdicts else []
        block_count = 0
        if isinstance(latest_round, list):
            for verdict in latest_round:
                if isinstance(verdict, dict) and verdict.get("verdict") == "block":
                    block_count += 1
        if adversarial_rounds >= 3 and judge_rounds == 0:
            return {
                "next": "judge_panel",
                "reason": f"{stage} reached adversarial round cap",
                "blockers": [f"{stage}.adversarial_rounds >= 3"],
            }
        if judge_rounds < 3 and block_count >= 2:
            return {
                "next": "judge_panel",
                "reason": f"{stage} judge panel voted block",
                "blockers": [f"{stage}.judge_verdicts[-1] block-majority"],
            }
    return None


def _checkpoint_next_action_payload(slug: str, state: dict, completed_stage: str) -> dict[str, object]:
    stages = {stage: stage_manifest_state(slug, stage) for stage in CHECKPOINT_STAGES}
    recon_ok, _ = reconciliation_state(slug)
    next_action = recommended_next_action(slug, state, stages, recon_ok)
    judge_panel_payload = _judge_panel_payload_from_state(slug, state)
    if next_action == "judge_panel" and judge_panel_payload is not None:
        return judge_panel_payload
    return {
        "next": next_action,
        "reason": f"{completed_stage} checkpoint completed",
        "blockers": [],
    }


def _persist_last_action_result(slug: str, payload: dict[str, object]) -> None:
    update_workflow_state(
        slug,
        lambda state: state.__setitem__("last_action_result", payload),
    )


def _rollback_adversarial_round(slug: str, stage: str) -> None:
    state = load_workflow_state(slug)
    stage_state = state.get("stages", {}).get(stage, {})
    if not isinstance(stage_state, dict):
        stage_state = {}
    current_rounds = _stage_int(stage_state, "adversarial_rounds")
    update_stage_state(
        slug,
        stage,
        {"adversarial_rounds": max(current_rounds - 1, 0)},
    )


def _prior_stage_for_checkpoint(stage: str) -> str | None:
    prior_stage_by_stage = {
        "plan": "spec",
        "tasks": "plan",
        "diff": "tasks",
    }
    return prior_stage_by_stage.get(stage)


def _concern_is_open(concern: dict) -> bool:
    return all(
        concern.get(field) is None
        for field in ("addressed_at", "deferred_reason", "dismissed_reason")
    )


def _concern_reasoning_snippet(concern: dict, limit: int = 60) -> str:
    reasoning = str(concern.get("reasoning", "") or "").strip()
    if not reasoning:
        return "(no reasoning)"
    return reasoning[:limit]


def _gc_review_intermediates(slug: str, stage: str, keep: bool) -> list[Path]:
    if keep:
        return []
    reviews = reviews_dir(slug)
    deleted: list[Path] = []
    for suffix in (
        ".narrowed.txt",
        ".narrowed.json",
        ".raw.txt",
        ".stdout.txt",
        ".stderr.txt",
    ):
        for path in sorted(reviews.glob(f"{stage}.*{suffix}")):
            path.unlink(missing_ok=True)
            deleted.append(path)
    return deleted


def _find_concerns_by_id(state: dict, concern_id: str) -> list[tuple[str, dict]]:
    """Return ALL matches so callers can detect ambiguity (P2-3 adversarial finding).

    Previously the helper returned the first hit, which silently resolved the
    wrong concern when two shared an ID (hash collision, copied state, etc.).
    """
    matches: list[tuple[str, dict]] = []
    stages = state.get("stages", {})
    if not isinstance(stages, dict):
        return matches
    for stage_name, stage_state in stages.items():
        if not isinstance(stage_state, dict):
            continue
        concerns = stage_state.get("unresolved_concerns", [])
        if not isinstance(concerns, list):
            continue
        for concern in concerns:
            if not isinstance(concern, dict):
                continue
            if str(concern.get("id", "") or "") == concern_id:
                matches.append((stage_name, concern))
    return matches


def _find_concern_by_id(state: dict, concern_id: str) -> tuple[str, dict] | None:
    """Back-compat shim — returns first match. New callers should use
    _find_concerns_by_id to detect ambiguity."""
    matches = _find_concerns_by_id(state, concern_id)
    return matches[0] if matches else None


def _render_open_concern_block(prior_stage: str, concerns: list[dict]) -> None:
    print(f"blocked: unresolved-concerns-from-{prior_stage}", file=sys.stderr)
    for concern in concerns:
        concern_id = str(concern.get("id", "") or "")
        snippet = _concern_reasoning_snippet(concern)
        print(f"- {concern_id}: {snippet}", file=sys.stderr)
        print(
            f"  checkpoint --address {concern_id} --evidence \"fixed in commit abc\"",
            file=sys.stderr,
        )
        print(
            f"  checkpoint --defer {concern_id} --reason \"follow-up\"",
            file=sys.stderr,
        )
        print(
            f"  checkpoint --dismiss {concern_id} --reason \"reviewer error\"",
            file=sys.stderr,
        )


def _nonblank(value: object) -> str | None:
    """Return value.strip() if it is non-empty after stripping, else None.

    P2-4 (adversarial review): whitespace-only --reason / --evidence strings
    pass truthiness checks but are meaningless. Treat them as missing.
    """
    if value is None:
        return None
    stripped = str(value).strip()
    return stripped if stripped else None


def _handle_concern_lifecycle(args: argparse.Namespace) -> int | None:
    action: str | None = None
    concern_id: str | None = None
    evidence: str | None = None
    reason: str | None = None
    if getattr(args, "address", None):
        action = "addressed"
        concern_id = args.address
        evidence = _nonblank(getattr(args, "evidence", None))
        if evidence is None:
            print("--address requires --evidence TEXT (non-whitespace)", file=sys.stderr)
            return 2
    elif getattr(args, "defer", None):
        action = "deferred"
        concern_id = args.defer
        reason = _nonblank(getattr(args, "reason", None))
        if reason is None:
            print("--defer requires --reason TEXT (non-whitespace)", file=sys.stderr)
            return 2
    elif getattr(args, "dismiss", None):
        action = "dismissed"
        concern_id = args.dismiss
        reason = _nonblank(getattr(args, "reason", None))
        if reason is None:
            print("--dismiss requires --reason TEXT (non-whitespace)", file=sys.stderr)
            return 2
    else:
        return None

    if args.stage not in {"spec", "plan", "tasks"}:
        print("concern lifecycle flags only usable with --stage spec|plan|tasks", file=sys.stderr)
        return 2

    with with_locked_state(args.slug) as state:
        matches = _find_concerns_by_id(state, concern_id)
        if not matches:
            print(f"concern id {concern_id} not found in any stage", file=sys.stderr)
            return 2
        # P2-3 (adversarial review): ambiguous IDs must NOT silently resolve the
        # first match. Require disambiguation via --stage.
        if len(matches) > 1:
            stage_list = ", ".join(sorted({m[0] for m in matches}))
            matched_stages = [m[0] for m in matches]
            if matched_stages.count(args.stage) == 1:
                # --stage disambiguates uniquely.
                concern = next(c for s, c in matches if s == args.stage)
            else:
                print(
                    f"concern id {concern_id} matches multiple concerns across stages: "
                    f"{stage_list}. Disambiguate by running with --stage set to the "
                    f"stage containing exactly one matching concern, or use a longer "
                    f"concern id.",
                    file=sys.stderr,
                )
                return 2
        else:
            concern = matches[0][1]
        if action == "addressed":
            concern["addressed_at"] = int(time.time())
            concern["addressed_by"] = evidence
        elif action == "deferred":
            concern["deferred_reason"] = reason
        elif action == "dismissed":
            concern["dismissed_reason"] = reason

    print(f"✓ concern {concern_id} marked {action}")
    return 0


def _run_validation_only(slug: str, stage: str) -> int:
    """Feature B Slice 3 — re-seal the manifest against the current artifact
    SHA without dispatching any reviewer.

    Lets an operator who has edited the artifact past the 3-round adversarial
    cap re-sync the manifest instead of hand-editing review frontmatter SHAs.
    Pure manifest-sync tool — does NOT bypass the concern-lifecycle gate or
    the judge advance verdict.

    Flow (per spec FR-004-007):
      1. Load manifest; missing → exit 2.
      2. Pre-check: every review path exists + is writable. Any failure →
         exit 2 BEFORE any write so partial-state is impossible.
      3. Compute current artifact SHA.
      4. Read each review's frontmatter artifact_sha256.
      5. If all match → print success, exit 0 (no-op).
      6. Else: atomic-write each mismatching review with new SHA. Any failure
         mid-loop → exit 2 with clear error (already-written reviews keep new
         SHA; operator re-runs to catch the rest, per accepted Risk P3).
      7. On full success: append advance-with-drift-style annotation to
         stages[stage].annotations[] and print summary.
    """
    import re

    manifest_path = checkpoint_manifest_path(slug, stage)
    if not manifest_path.exists():
        print(
            f"no manifest to validate for stage={stage} — run checkpoint first",
            file=sys.stderr,
        )
        return 2

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"invalid manifest at {manifest_path}: {exc}", file=sys.stderr)
        return 2

    artifact_path = default_artifact_path(slug, stage)
    if not artifact_path.exists():
        print(f"no artifact to validate at {artifact_path}", file=sys.stderr)
        return 2
    current_sha = normalized_artifact_hash(stage, artifact_path)

    required_reviews = manifest.get("required_reviews") or []
    review_paths: list[Path] = []
    from workflow_utils import resolve_stored_path  # local import
    for entry in required_reviews:
        raw = entry.get("path")
        if not raw:
            continue
        review_paths.append(resolve_stored_path(raw, REPO_ROOT))

    # Pre-check every target file before any write (Gemini MEDIUM F-03 best-effort).
    pre_check_errors: list[str] = []
    for p in review_paths:
        if not p.exists():
            pre_check_errors.append(f"pre-check failed: {p} does not exist")
        elif not os.access(p, os.W_OK):
            pre_check_errors.append(f"pre-check failed: {p} not writable")
    if pre_check_errors:
        for err in pre_check_errors:
            print(err, file=sys.stderr)
        return 2

    # Classify each review as "needs update" or "already matches".
    frontmatter_re = re.compile(r'(artifact_sha256:\s*)"[^"]*"')
    needs_update: list[tuple[Path, str, str]] = []  # (path, old, new)
    old_shas: set[str] = set()
    for p in review_paths:
        content = p.read_text(encoding="utf-8")
        m = re.search(r'artifact_sha256:\s*"([a-f0-9]+)"', content)
        old = m.group(1) if m else ""
        old_shas.add(old)
        if old != current_sha:
            needs_update.append((p, old, current_sha))

    if not needs_update:
        print(f"manifest already matches artifact (sha={current_sha[:12]})")
        return 0

    # Atomic write per file: temp file in same dir + os.replace.
    for p, _old, _new in needs_update:
        try:
            content = p.read_text(encoding="utf-8")
            new_content = frontmatter_re.sub(
                lambda m: f'{m.group(1)}"{current_sha}"', content, count=1
            )
            fd, tmp_name = tempfile.mkstemp(dir=p.parent, prefix=".reseal.", suffix=".md")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as fh:
                    fh.write(new_content)
                os.replace(tmp_name, p)
            except Exception:
                Path(tmp_name).unlink(missing_ok=True)
                raise
        except Exception as exc:  # noqa: BLE001 — report + bail, partial is accepted risk
            print(
                f"reseal partial failure at {p}: {exc} — re-run --validation-only to recover",
                file=sys.stderr,
            )
            return 2

    # Record annotation on full success.
    old_sha_display = next(iter(old_shas - {current_sha}), "unknown")
    annotation = {
        "type": "validation-only-reseal",
        "old_sha": old_sha_display,
        "new_sha": current_sha,
        "at": int(time.time()),
        "files_updated": len(needs_update),
    }
    with with_locked_state(slug) as state:
        stages_state = state.setdefault("stages", {})
        stage_blob = stages_state.setdefault(stage, {})
        if not isinstance(stage_blob, dict):
            stage_blob = {}
            stages_state[stage] = stage_blob
        annotations = stage_blob.setdefault("annotations", [])
        if not isinstance(annotations, list):
            annotations = []
            stage_blob["annotations"] = annotations
        annotations.append(annotation)

    print(
        f"manifest re-sealed: {len(needs_update)} review file"
        f"{'s' if len(needs_update) != 1 else ''} updated to sha={current_sha[:12]}"
    )
    return 0


@mutates_state("checkpoint")
def command_checkpoint(args: argparse.Namespace) -> int:
    fast = getattr(args, "fast", False)
    if fast and args.stage != "diff":
        raise SystemExit("--fast requires --stage diff")

    # Feature B Slice 3 — --validation-only is mutually exclusive with all
    # state-mutating review modes. Argparse can't express this with required
    # args cleanly; check at runtime.
    if getattr(args, "validation_only", False):
        if getattr(args, "fallback", False):
            raise SystemExit("--validation-only cannot be combined with --fallback")
        if getattr(args, "address", None):
            raise SystemExit("--validation-only cannot be combined with --address")
        if getattr(args, "defer", None):
            raise SystemExit("--validation-only cannot be combined with --defer")
        if getattr(args, "dismiss", None):
            raise SystemExit("--validation-only cannot be combined with --dismiss")
        return _run_validation_only(args.slug, args.stage)

    ensure_sync()
    lifecycle_rc = _handle_concern_lifecycle(args)
    if lifecycle_rc is not None:
        return lifecycle_rc
    root = workflow_dir(args.slug)
    reviews = reviews_dir(args.slug)
    root.mkdir(parents=True, exist_ok=True)
    reviews.mkdir(parents=True, exist_ok=True)
    keep_intermediates = getattr(args, "keep_intermediates", False)
    with with_locked_state(args.slug):
        _gc_review_intermediates(args.slug, args.stage, keep_intermediates)

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
    prior_stage = _prior_stage_for_checkpoint(args.stage)
    if prior_stage is not None:
        prior_state = load_workflow_state(args.slug)
        stages = prior_state.get("stages", {})
        prior_stage_state = stages.get(prior_stage, {}) if isinstance(stages, dict) else {}
        open_concerns: list[dict] = []
        if isinstance(prior_stage_state, dict):
            concerns = prior_stage_state.get("unresolved_concerns", [])
            if isinstance(concerns, list):
                open_concerns = [
                    concern
                    for concern in concerns
                    if isinstance(concern, dict) and _concern_is_open(concern)
                ]
        if open_concerns:
            _render_open_concern_block(prior_stage, open_concerns)
            return 2
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

    artifact_sha = normalized_artifact_hash(args.stage, artifact_path)
    cap_hit_payload: dict[str, object] | None = None
    with with_locked_state(args.slug) as state:
        stage_state = _ensure_stage_state_blob(state, args.stage)
        current_rounds = _stage_int(stage_state, "adversarial_rounds")
        if current_rounds >= 3:
            cap_hit_payload = {
                "next": "judge_panel",
                "reason": f"{args.stage} reached adversarial round cap",
                "blockers": [f"{args.stage}.adversarial_rounds >= 3"],
            }
            state["last_action_result"] = cap_hit_payload
        else:
            next_rounds = current_rounds + 1
            stage_state["adversarial_rounds"] = next_rounds
            stage_state["adversarial_sha_history"] = list(stage_state.get("adversarial_sha_history", []))
            stage_state["adversarial_sha_history"].append(artifact_sha)
            if not str(stage_state.get("initial_sha", "")).strip():
                stage_state["initial_sha"] = artifact_sha
            state[f"{args.stage}_adversarial_rounds"] = next_rounds

    if cap_hit_payload is not None:
        if args.json:
            print(json.dumps(cap_hit_payload))
        else:
            print("→ next: judge_panel")
        return 2

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

    with HeartbeatEmitter(args.slug, args.stage):
        heartbeat_set_activity("awaiting reviewers")
        for review_spec in reviews_arg or []:
            reviewer = str(review_spec.get("reviewer", "")).strip()
            lens = str(review_spec.get("lens", "")).strip()
            if reviewer and lens:
                heartbeat_set_activity(f"dispatching {reviewer}.{lens}")
                heartbeat_set_activity(f"reviewer {reviewer}.{lens} running")
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
                _rollback_adversarial_round(args.slug, args.stage)
                print(
                    f"checkpoint blocked: repair exceeded {args.repair_timeout_seconds}s for "
                    f"{args.stage} on {args.slug}",
                    file=sys.stderr,
                )
                return 1
            fallback_reason = f"repair exceeded {args.repair_timeout_seconds}s"
        except Exception:
            _rollback_adversarial_round(args.slug, args.stage)
            raise
        else:
            heartbeat_set_activity("aggregating results")
            if result.returncode == 0:
                reverted = revert_protected_files()
                if reverted:
                    print(f"reverted protected files: {', '.join(reverted)}", file=sys.stderr)
                _advance_checkpoint_progress(args.slug, args.stage, pending_head_sha)
                post_state = load_workflow_state(args.slug)
                payload = _checkpoint_next_action_payload(args.slug, post_state, args.stage)
                _persist_last_action_result(args.slug, payload)
                heartbeat_set_activity("all reviews complete")
                if args.json:
                    print(json.dumps(payload))
                else:
                    _emit_next_action(args.slug, f"{args.stage} checkpoint")
                return 0
            if not args.fallback:
                _rollback_adversarial_round(args.slug, args.stage)
                return result.returncode
            fallback_reason = f"repair exited {result.returncode}"

        heartbeat_set_activity("reviewer gemini.requirements running")
        fallback_ok, fallback_detail = run_checkpoint_fallback(
            manifest_path,
            REPO_ROOT,
            args.gemini_timeout_seconds,
            args.gemini_retries,
        )
        if not fallback_ok:
            _rollback_adversarial_round(args.slug, args.stage)
            print(f"checkpoint blocked: fallback review path failed for {args.stage} on {args.slug}: {trim_detail(fallback_detail)}", file=sys.stderr)
            return 1
        reverted = revert_protected_files()
        if reverted:
            print(f"reverted protected files: {', '.join(reverted)}", file=sys.stderr)
        record_checkpoint_fallback(args.slug, args.stage, fallback_reason)
        _advance_checkpoint_progress(args.slug, args.stage, pending_head_sha)
        heartbeat_set_activity("aggregating results")
        print(f"warning: fallback checkpoint path used for {args.stage} on {args.slug}: {fallback_reason}", file=sys.stderr)
        post_state = load_workflow_state(args.slug)
        payload = _checkpoint_next_action_payload(args.slug, post_state, args.stage)
        _persist_last_action_result(args.slug, payload)
        heartbeat_set_activity("all reviews complete")
        if args.json:
            print(json.dumps(payload))
        else:
            _emit_next_action(args.slug, f"{args.stage} checkpoint")
        return 0
