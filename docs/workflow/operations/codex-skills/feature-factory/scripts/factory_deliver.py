#!/usr/bin/env python3
"""GitHub CLI interaction, delivery records, and closeout text generation."""
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
import sys

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from factory_state import (  # noqa: E402
    REPO_ROOT,
    load_checkpoint_manifest,
)

REVIEW_SCRIPTS = REPO_ROOT / "docs" / "workflow" / "operations" / "codex-skills" / "review-lens" / "scripts"
if str(REVIEW_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(REVIEW_SCRIPTS))

from workflow_utils import resolve_stored_path  # noqa: E402

from factory_git import current_branch_name, command_path  # noqa: E402
from factory_stages import VERIFY_ON_CLOSEOUT_STAGES  # noqa: E402


# ---------------------------------------------------------------------------
# GitHub CLI helpers
# ---------------------------------------------------------------------------


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
            "number,url,state,isDraft,headRefName,headRefOid,baseRefName,mergeable,mergeStateStatus,statusCheckRollup,body,mergeCommit,mergedAt",
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


def _normalize_iso8601_utc(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        return ""
    candidate = value.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(candidate)
    except ValueError:
        return value.strip()
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


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
    merge_commit = ""
    if pr:
        raw_merge_commit = pr.get("mergeCommit")
        if isinstance(raw_merge_commit, dict):
            merge_commit = str(raw_merge_commit.get("oid", "") or "")
        elif isinstance(raw_merge_commit, str):
            merge_commit = raw_merge_commit
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
        "merge_wait_state": "none",
        "merged_sha": merge_commit,
        "merged_at_iso8601": _normalize_iso8601_utc(pr.get("mergedAt") if pr else ""),
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
    previous_wait_state = str(delivery.get("merge_wait_state", "none") or "none")
    if str(pr.get("state", "")).upper() == "OPEN" and previous_wait_state == "waiting":
        refreshed["merge_wait_state"] = previous_wait_state
        refreshed["merged_sha"] = delivery.get("merged_sha", "")
        refreshed["merged_at_iso8601"] = delivery.get("merged_at_iso8601", "")
    return refreshed


# ---------------------------------------------------------------------------
# Closeout text generation
# ---------------------------------------------------------------------------


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
