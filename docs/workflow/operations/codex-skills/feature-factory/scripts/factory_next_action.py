#!/usr/bin/env python3
"""Next-action decision tree for the feature factory workflow."""
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from factory_state import (  # noqa: E402
    BLOCKED_KEY,
    DISCOVERY_KEY,
    DELIVERY_KEY,
    PARALLEL_ANALYSIS_KEY,
    blocking_unresolved_items,
    load_workflow_state,
    workflow_dir,
)

from factory_stages import (  # noqa: E402
    CHECKPOINT_STAGES,
    diff_review_budget_state,
    later_progress_exists,
    status_md_changed_since_init,
)


def _stage_state(state: dict, stage: str) -> dict:
    stages = state.get("stages", {})
    stage_state = stages.get(stage, {}) if isinstance(stages, dict) else {}
    if not isinstance(stage_state, dict):
        stage_state = {}
    stage_state = dict(stage_state)
    if "adversarial_rounds" not in stage_state:
        try:
            stage_state["adversarial_rounds"] = int(state.get(f"{stage}_adversarial_rounds", 0) or 0)
        except (TypeError, ValueError):
            stage_state["adversarial_rounds"] = 0
    if "judge_rounds" not in stage_state:
        try:
            stage_state["judge_rounds"] = int(state.get(f"{stage}_judge_rounds", 0) or 0)
        except (TypeError, ValueError):
            stage_state["judge_rounds"] = 0
    if "judge_verdicts" not in stage_state or not isinstance(stage_state.get("judge_verdicts"), list):
        stage_state["judge_verdicts"] = []
    return stage_state


def _judge_panel_needed(state: dict) -> bool:
    for stage in CHECKPOINT_STAGES:
        stage_state = _stage_state(state, stage)
        adversarial_rounds = stage_state.get("adversarial_rounds", 0)
        judge_rounds = stage_state.get("judge_rounds", 0)
        judge_verdicts = stage_state.get("judge_verdicts", [])
        try:
            adversarial_rounds_int = int(adversarial_rounds)
        except (TypeError, ValueError):
            adversarial_rounds_int = 0
        try:
            judge_rounds_int = int(judge_rounds)
        except (TypeError, ValueError):
            judge_rounds_int = 0
        latest_round = judge_verdicts[-1] if judge_verdicts else []
        block_count = 0
        if isinstance(latest_round, list):
            for verdict in latest_round:
                if isinstance(verdict, dict) and verdict.get("verdict") == "block":
                    block_count += 1
        if adversarial_rounds_int >= 3 and judge_rounds_int == 0:
            return True
        if judge_rounds_int < 3 and block_count >= 2:
            return True
    return False


def recommended_next_action(
    slug: str,
    state: dict | None,
    stages: dict[str, dict[str, object]],
    reconciliation_ok: bool,
) -> str:
    if state is None:
        state = load_workflow_state(slug)
    blocked = state.get(BLOCKED_KEY, {})
    if blocked.get("active"):
        return "mark_blocked"
    discovery = state.get(DISCOVERY_KEY, {})
    if blocking_unresolved_items(discovery) or (discovery.get("required") and not discovery.get("complete")):
        return "discover"
    if _judge_panel_needed(state):
        return "judge_panel"
    stages_state = state.get("stages") or {}

    def _judge_advanced(stage_name: str) -> bool:
        """FR-001 — honor the judge panel's formal advance verdict.

        When judges voted advance, downstream behavior treats the stage as
        ready to hand off even if the artifact SHA has drifted since the
        last checkpoint. factory_cmd_checkpoint reseals the manifest lazily
        (FR-002) so the next checkpoint starts from a clean manifest.
        """
        stage_blob = stages_state.get(stage_name) or {}
        return stage_blob.get("judge_next_action") == "advance"

    if not stages["spec"]["artifact_exists"] or not stages["spec"]["artifact_meaningful"]:
        if later_progress_exists(stages, "spec")[0]:
            return "mark_blocked"
        return "author_spec"
    if not _judge_advanced("spec") and (
        not stages["spec"]["manifest_exists"] or not stages["spec"]["healthy"]
    ):
        return "repair_spec_checkpoint"
    if not stages["plan"]["artifact_exists"] or not stages["plan"]["artifact_meaningful"]:
        if later_progress_exists(stages, "plan")[0]:
            return "mark_blocked"
        return "author_plan"
    if not _judge_advanced("plan") and (
        not stages["plan"]["manifest_exists"] or not stages["plan"]["healthy"]
    ):
        return "repair_plan_checkpoint"
    if not stages["tasks"]["artifact_exists"] or not stages["tasks"]["artifact_meaningful"]:
        if later_progress_exists(stages, "tasks")[0]:
            return "mark_blocked"
        return "author_tasks"
    parallel = state.get(PARALLEL_ANALYSIS_KEY, {})
    if not parallel.get("reviewed"):
        return "record_parallel_analysis"
    if not _judge_advanced("tasks") and (
        not stages["tasks"]["manifest_exists"] or not stages["tasks"]["healthy"]
    ):
        return "repair_tasks_checkpoint"
    if not stages["diff"]["artifact_exists"]:
        return "dispatch_next_slice_to_codex"
    if not stages["diff"]["manifest_exists"] or not stages["diff"]["healthy"]:
        return "repair_diff_checkpoint"
    if diff_review_budget_state(slug).get("head_mismatch"):
        return "repair_diff_checkpoint"
    if not reconciliation_ok:
        return "reconcile_reviews"
    # If any tasks remain unchecked there are more slices to implement before delivering.
    tasks_path = workflow_dir(slug) / "tasks.md"
    if tasks_path.exists() and "- [ ]" in tasks_path.read_text(encoding="utf-8"):
        return "dispatch_next_slice_to_codex"
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
    postmortem_path = workflow_dir(slug) / "postmortem.md"
    if not postmortem_path.exists() or not postmortem_path.read_text(encoding="utf-8").strip():
        return "write_postmortem"
    if not status_md_changed_since_init(slug):
        return "update_status_md"
    return "done"
