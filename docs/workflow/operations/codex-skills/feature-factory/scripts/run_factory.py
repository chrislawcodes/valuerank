#!/usr/bin/env python3
import argparse
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
    CHECKPOINT_PROGRESS_KEY,
    INIT_HEAD_SHA_KEY,
    checkpoint_manifest_path,
    default_artifact_path,
    default_discovery_state,
    reviews_dir,
    scope_manifest_path,
    workflow_dir,
    save_scope_manifest,
    load_workflow_state,
    save_workflow_state,
    update_workflow_state,
    load_checkpoint_manifest,
    parse_review_frontmatter,
    blocking_unresolved_items,
    discovery_state,
)

from factory_git import (  # noqa: E402
    _git_head_sha,
    _sha_is_valid_ancestor,
    command_path,
    current_branch_name,
    ensure_sync,
    ensure_file,
    run,
    upstream_branch_name,
)

from factory_stages import (  # noqa: E402
    CHECKPOINT_STAGES,
    VERIFY_RECONCILIATION,
    _default_checkpoint_progress,
    checkpoint_progress_state,
    diff_review_budget_state,
    later_progress_exists,
    parse_checkpoint_markers,
    parse_parallel_task_groups,
    preferred_diff_base_ref,
    prerequisite_failure,
    reconciliation_state,
    stage_drift_class,
    stage_manifest_state,
    stage_repairable,
    stage_review_inventory,
    stage_status_label,
)

from factory_review import (  # noqa: E402
    UPDATE_REVIEW,
    APPEND_RECONCILIATION,
    DEFAULT_CODEX_MODEL,
    _AUTO_ACCEPT_NOTE,
    checkpoint_manifest,
    trim_detail,
    detect_actionable_findings,
    _advance_checkpoint_progress,
    record_checkpoint_fallback,
    repair_checkpoint_args,
    required_reviews,
    resolved_review_policy,
    run_checkpoint_fallback,
)

from factory_emit import _emit_next_action  # noqa: E402
from factory_next_action import recommended_next_action  # noqa: E402
from factory_cmd_checkpoint import command_checkpoint  # noqa: E402
from factory_cmd_discover import command_discover  # noqa: E402
from factory_deliver import (  # noqa: E402
    compose_closeout_text,
    current_pr_payload,
    gather_all_review_paths,
    refresh_delivery_snapshot,
    required_check_summary,
)
from factory_cmd_deliver import command_deliver, command_closeout  # noqa: E402
from factory_cmd_block import command_block  # noqa: E402
from factory_cmd_judge import run_judge  # noqa: E402
from factory_cmd_implement import command_implement, command_parallel, _run_serial, _run_parallel  # noqa: E402
from factory_cmd_status import command_status, command_repair, command_doctor  # noqa: E402
from factory_invariants import run_invariant_checks, set_json_mode  # noqa: E402
from factory_mutating import (  # noqa: E402
    collect_mutating_command_names,
    enumerate_subparser_handlers,
    mutates_state,
)
from factory_stages import stage_manifest_state  # noqa: E402  (re-imported for invariant check)
from workflow_utils import resolve_stored_path  # noqa: E402


_MUTATING_CACHE: frozenset[str] | None = None


def _get_mutating_commands() -> frozenset[str]:
    global _MUTATING_CACHE
    if _MUTATING_CACHE is None:
        _MUTATING_CACHE = collect_mutating_command_names(
            handler for _, handler in enumerate_subparser_handlers(build_parser())
        )
    return _MUTATING_CACHE


def _run_post_invariants(slug: str | None, command_name: str) -> None:
    """Run invariant checks after a state-mutating command.

    Uses the same ``recon_ok`` signal as ``factory_cmd_status`` / the real
    checkpoint decision path, so the contradiction detector evaluates the
    user-visible next-action string — not a hypothetical happy-path one.
    Errors are swallowed — the invariant helper must never abort the caller.
    """
    if not slug:
        return
    try:
        from factory_stages import reconciliation_state  # local import — avoid cycles
        state = load_workflow_state(slug)
        stages = {name: stage_manifest_state(slug, name) for name in CHECKPOINT_STAGES}
        recon_ok, _ = reconciliation_state(slug)
        recommended = recommended_next_action(slug, state, stages, recon_ok)
        appended = run_invariant_checks(state, command_name, recommended)
        if appended:
            save_workflow_state(slug, state)
    except Exception:  # noqa: BLE001 — invariant failure must not abort the caller
        return


@mutates_state("init")
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
    # For first-time init: require discovery before spec authoring.
    # Re-inits of an in-progress workflow preserve the existing discovery state.
    if not existing_state.get(INIT_HEAD_SHA_KEY):
        discovery = existing_state[DISCOVERY_KEY]
        discovery["required"] = True
        discovery["complete"] = False
    # Always reset checkpoint_progress on init so stale slice state from a
    # previous run does not corrupt the new one.
    existing_state[CHECKPOINT_PROGRESS_KEY] = _default_checkpoint_progress()
    # Record the HEAD SHA at init time so we can verify STATUS.md was updated.
    head_sha = _git_head_sha(REPO_ROOT)
    if head_sha:
        existing_state[INIT_HEAD_SHA_KEY] = head_sha
    save_workflow_state(args.slug, existing_state)
    print(str(root))
    return 0


@mutates_state("reconcile")
def command_reconcile(args: argparse.Namespace) -> int:
    ensure_sync()
    plan_path = workflow_dir(args.slug) / "plan.md"
    review_args = []
    for review in args.review:
        review_args.extend(["--review", str(Path(review).resolve())])

    run([sys.executable, str(UPDATE_REVIEW), *review_args, "--status", args.status, "--note", args.note])
    run([sys.executable, str(APPEND_RECONCILIATION), "--plan", str(plan_path), *review_args, "--status", args.status, "--note", args.note])
    run([sys.executable, str(VERIFY_RECONCILIATION), "--plan", str(plan_path), *review_args])
    _emit_next_action(args.slug, f"reconcile ({args.status})")
    return 0


@mutates_state("auto-reconcile")
def command_auto_reconcile(args: argparse.Namespace) -> int:
    """Auto-accept reviews with no HIGH or MEDIUM severity findings.

    Scans all open (resolution_status == "open") reviews for the given stage.
    Reviews with only LOW or no findings are accepted automatically.
    Reviews with actionable findings are left open and listed for human review.

    Prints a summary so the orchestrator knows exactly which reviews still need attention.
    """
    ensure_sync()
    manifest = load_checkpoint_manifest(args.slug, args.stage)
    if not manifest:
        raise SystemExit(f"no checkpoint manifest found for {args.slug}/{args.stage} — run checkpoint first")

    plan_path = workflow_dir(args.slug) / "plan.md"
    required = manifest.get("required_reviews", [])

    auto_accepted: list[str] = []
    needs_review: list[str] = []

    for spec in required:
        review_path = Path(resolve_stored_path(spec["path"], REPO_ROOT))
        if not review_path.exists():
            needs_review.append(f"{spec['path']} (missing)")
            continue
        try:
            data, _ = parse_review_frontmatter(review_path)
        except Exception:
            needs_review.append(f"{spec['path']} (unreadable)")
            continue

        status = data.get("resolution_status", "open")
        if status != "open":
            # Already reconciled — skip.
            continue

        if detect_actionable_findings(review_path):
            needs_review.append(spec["path"])
        else:
            # Auto-accept: write resolution into file and append to plan reconciliation table.
            run([
                sys.executable, str(UPDATE_REVIEW),
                "--review", str(review_path),
                "--status", "accepted",
                "--note", _AUTO_ACCEPT_NOTE,
            ])
            run([
                sys.executable, str(APPEND_RECONCILIATION),
                "--plan", str(plan_path),
                "--review", str(review_path),
                "--status", "accepted",
                "--note", _AUTO_ACCEPT_NOTE,
            ])
            auto_accepted.append(spec["path"])

    if auto_accepted:
        print(f"auto-accepted ({len(auto_accepted)}):")
        for path in auto_accepted:
            print(f"  {path}")
    if needs_review:
        print(f"needs-review ({len(needs_review)}):")
        for path in needs_review:
            print(f"  {path}")
    if not auto_accepted and not needs_review:
        print(f"all reviews for {args.stage} already reconciled")
    _emit_next_action(args.slug, f"auto-reconcile {args.stage}")
    return 0


@mutates_state("judge")
def command_judge(args: argparse.Namespace) -> int:
    return run_judge(
        args.slug,
        args.stage,
        json_output=args.json,
        prompt_override=args.prompt_override,
        override_reason=args.override_reason,
        migration_bypass=args.migration_bypass,
    )


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
    lifecycle_group = checkpoint_parser.add_mutually_exclusive_group()
    lifecycle_group.add_argument("--address", metavar="CONCERN_ID")
    lifecycle_group.add_argument("--defer", metavar="CONCERN_ID")
    lifecycle_group.add_argument("--dismiss", metavar="CONCERN_ID")
    checkpoint_parser.add_argument("--evidence", metavar="TEXT")
    checkpoint_parser.add_argument("--reason", metavar="TEXT")
    checkpoint_parser.add_argument("--artifact")
    checkpoint_parser.add_argument("--base-ref")
    checkpoint_parser.add_argument("--context", action="append", default=[])
    checkpoint_parser.add_argument("--path", action="append", default=[])
    checkpoint_parser.add_argument("--extra-gemini-lens", action="append", default=[])
    checkpoint_parser.add_argument("--sensitive", action="store_true")
    checkpoint_parser.add_argument("--large-structural", action="store_true")
    checkpoint_parser.add_argument("--performance-sensitive", action="store_true")
    checkpoint_parser.add_argument("--use-existing-artifact", action="store_true")
    checkpoint_parser.add_argument("--no-auto-context", action="store_true",
                                   help="Disable automatic context file extraction from the artifact")
    checkpoint_parser.add_argument("--allow-dirty-path", action="append", default=[])
    checkpoint_parser.add_argument("--max-artifact-chars", type=int, default=50000)
    checkpoint_parser.add_argument("--max-context-chars", type=int, default=60000)
    checkpoint_parser.add_argument("--max-total-chars", type=int, default=250000)
    checkpoint_parser.add_argument("--gemini-timeout-seconds", type=int, default=120)
    checkpoint_parser.add_argument("--gemini-retries", type=int, default=1)
    checkpoint_parser.add_argument("--repair-timeout-seconds", type=int, default=300)
    checkpoint_parser.add_argument("--allow-large-diff-rerun", action="store_true")
    checkpoint_parser.add_argument("--fallback", action="store_true")
    checkpoint_parser.add_argument("--json", action="store_true")
    checkpoint_parser.add_argument(
        "--keep-intermediates",
        action="store_true",
        help="Preserve review intermediate files for debugging instead of deleting them at checkpoint start",
    )
    checkpoint_parser.add_argument("--fast", action="store_true",
        help="Fast path: skip prerequisites, run 1 Gemini + 1 Codex review. Requires --stage diff.")
    checkpoint_parser.add_argument("--validation-only", action="store_true",
        help="Re-seal the manifest against the current artifact SHA without dispatching any reviewer. "
             "Used to re-sync after post-cap edits. Mutually exclusive with --fallback, --address, --defer, --dismiss.")
    checkpoint_parser.set_defaults(func=command_checkpoint)

    reconcile_parser = subparsers.add_parser("reconcile")
    reconcile_parser.add_argument("--slug", required=True)
    reconcile_parser.add_argument("--review", action="append", required=True)
    reconcile_parser.add_argument("--status", required=True)
    reconcile_parser.add_argument("--note", required=True)
    reconcile_parser.set_defaults(func=command_reconcile)

    auto_reconcile_parser = subparsers.add_parser(
        "auto-reconcile",
        help="Auto-accept reviews with no HIGH or MEDIUM findings; list remaining ones for human review",
    )
    auto_reconcile_parser.add_argument("--slug", required=True)
    auto_reconcile_parser.add_argument(
        "--stage",
        required=True,
        choices=["spec", "plan", "tasks", "diff", "closeout"],
    )
    auto_reconcile_parser.set_defaults(func=command_auto_reconcile)

    block_parser = subparsers.add_parser("block")
    block_parser.add_argument("--slug", required=True)
    block_parser.add_argument("--reason")
    block_parser.add_argument("--clear", action="store_true")
    block_parser.set_defaults(func=command_block)

    judge_parser = subparsers.add_parser("judge")
    judge_parser.add_argument("--slug", required=True)
    judge_parser.add_argument("--stage", required=True, choices=CHECKPOINT_STAGES)
    judge_parser.add_argument("--json", action="store_true")
    judge_parser.add_argument("--prompt-override", type=Path)
    judge_parser.add_argument("--override-reason")
    judge_parser.add_argument("--migration-bypass", action="store_true")
    judge_parser.set_defaults(func=command_judge)

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
    discover_parser.add_argument("--non-goal", action="append", dest="non_goal", default=None,
        help="Add a string to non_goals[]. Repeat the flag to append multiple values. "
             "If --clear-non-goals is also set, the clear applies BEFORE these appends in the same invocation. "
             "Empty/whitespace-only values are rejected.")
    discover_parser.add_argument("--acceptance-criteria", action="append", dest="acceptance_criteria", default=None,
        help="Add a string to acceptance_criteria[]. Repeat the flag to append multiple values. "
             "If --clear-acceptance-criteria is also set, the clear applies BEFORE these appends in the same invocation. "
             "Empty/whitespace-only values are rejected.")
    discover_parser.add_argument("--clear-non-goals", action="store_true",
        help="Empty discovery.non_goals[] BEFORE any --non-goal appends in the same invocation.")
    discover_parser.add_argument("--clear-acceptance-criteria", action="store_true",
        help="Empty discovery.acceptance_criteria[] BEFORE any --acceptance-criteria appends in the same invocation.")
    discover_parser.add_argument("--answer", nargs=2, metavar=("QUESTION", "ANSWER"),
        help="Record answers[QUESTION] = ANSWER")
    discover_parser.add_argument("--force-complete", action="store_true")
    discover_parser.add_argument("--clear", action="store_true")
    discover_parser.set_defaults(func=command_discover)

    parallel_parser = subparsers.add_parser(
        "parallel",
        help="Record parallel task analysis result before tasks checkpoint",
    )
    parallel_parser.add_argument("--slug", required=True)
    parallel_parser.add_argument(
        "--note",
        required=True,
        help="Explain what was found or why nothing was safe to parallelise",
    )
    parallel_parser.add_argument(
        "--found",
        action="store_true",
        help="Mark that parallel opportunities were found and annotated with [P:] in tasks.md",
    )
    parallel_parser.set_defaults(func=command_parallel)

    implement_parser = subparsers.add_parser("implement", help="dispatch Codex for next checkpoint slice")
    implement_parser.add_argument("--slug", required=True, help="workflow slug")
    implement_parser.add_argument(
        "--max-workers",
        type=int,
        default=4,
        dest="max_workers",
        help="max concurrent Codex workers (default: 4)",
    )
    implement_parser.set_defaults(func=command_implement)

    deliver_parser = subparsers.add_parser("deliver")
    deliver_parser.add_argument("--slug", required=True)
    deliver_parser.add_argument("--create-pr", action="store_true")
    deliver_parser.add_argument("--draft", action="store_true")
    deliver_parser.add_argument("--base")
    deliver_parser.add_argument("--title")
    deliver_parser.add_argument("--override-judges", action="store_true")
    deliver_parser.add_argument("--reason")
    deliver_parser.add_argument("--refresh", action="store_true")
    deliver_parser.add_argument("--resume-merge-wait", action="store_true")
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
    # FR-009: route invariant-warning output to stderr (always).
    set_json_mode(bool(getattr(args, "json", False)))
    command_name = getattr(args, "_factory_command", None) or _infer_command_name(args)
    # Diff round-1 finding: run invariants in a `finally` so contradictions
    # introduced by a partial-state write before an exception still get
    # caught — the exact class of bug the guardrail exists to detect.
    exit_code = 0
    try:
        exit_code = args.func(args)
        return exit_code
    finally:
        if command_name in _get_mutating_commands():
            _run_post_invariants(getattr(args, "slug", None), command_name)


def _infer_command_name(args: argparse.Namespace) -> str | None:
    """Best-effort extraction of the subcommand name from parsed argparse args."""
    # argparse doesn't expose the selected subcommand name cleanly; inspect the
    # configured func and map it back to a known subcommand.
    func = getattr(args, "func", None)
    if func is None:
        return None
    qualname = getattr(func, "__qualname__", "") or ""
    name = getattr(func, "__name__", "") or ""
    # Common mapping — command_X -> X
    if name.startswith("command_"):
        return name[len("command_"):].replace("_", "-")
    # run_judge is wrapped in a lambda for the judge subcommand.
    if "run_judge" in qualname or name == "<lambda>":
        return "judge"
    return None


if __name__ == "__main__":
    raise SystemExit(main())
