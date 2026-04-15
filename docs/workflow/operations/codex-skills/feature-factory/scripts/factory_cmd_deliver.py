#!/usr/bin/env python3
"""command_deliver and command_closeout implementations."""
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
    DELIVERY_KEY,
    DIRTY_OVERRIDE_KEY,
    CHECKPOINT_FALLBACK_KEY,
    load_workflow_state,
    update_workflow_state,
    checkpoint_manifest_path,
    workflow_dir,
)

from factory_git import (  # noqa: E402
    current_branch_name,
    upstream_branch_name,
    commits_behind_upstream,
    command_path,
    git_output,
    ensure_sync,
)

from factory_stages import (  # noqa: E402
    VERIFY_CHECKPOINT,
    VERIFY_RECONCILIATION,
    REQUIRED_PREDELIVERY_STAGES,
    VERIFY_ON_CLOSEOUT_STAGES,
    verify_checkpoint_manifest,
    reconciliation_state,
    diff_review_budget_state,
)

from factory_review import (  # noqa: E402
    trim_detail,
)

from factory_deliver import (  # noqa: E402
    current_pr_payload,
    required_check_summary,
    build_delivery_record,
    gather_all_review_paths,
    refresh_delivery_snapshot,
    closeout_inventory_text,
    compose_closeout_text,
)

from factory_emit import _emit_next_action  # noqa: E402


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
                f"- spec: `docs/workflow/feature-runs/{args.slug}/spec.md`",
                f"- plan: `docs/workflow/feature-runs/{args.slug}/plan.md`",
                f"- tasks: `docs/workflow/feature-runs/{args.slug}/tasks.md`",
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
    _emit_next_action(args.slug, "deliver")
    return 0


def command_closeout(args: argparse.Namespace) -> int:
    from factory_cmd_checkpoint import command_checkpoint  # noqa: E402
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

    from factory_git import run  # noqa: E402
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
    _emit_next_action(args.slug, "closeout")
    return 0
