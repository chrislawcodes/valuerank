import importlib.util
import io
import json
import sys
import unittest
from pathlib import Path
import tempfile
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "run_feature_workflow.py"
SPEC = importlib.util.spec_from_file_location("run_feature_workflow", SCRIPT_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def stage_state(
    *,
    artifact_exists: bool = False,
    artifact_meaningful: bool = False,
    manifest_exists: bool = False,
    healthy: bool = False,
    detail: str = "",
) -> dict[str, object]:
    return {
        "artifact_path": Path("/tmp/placeholder"),
        "artifact_exists": artifact_exists,
        "artifact_meaningful": artifact_meaningful,
        "manifest_path": Path("/tmp/placeholder.manifest"),
        "manifest_exists": manifest_exists,
        "healthy": healthy,
        "detail": detail,
    }


class RepairDecisionTests(unittest.TestCase):
    def test_repair_checkpoint_args_preserves_required_reviews(self) -> None:
        manifest = {
            "required_reviews": [
                {
                    "reviewer": "gemini",
                    "lens": "risk-adversarial",
                    "context_paths": ["docs/workflows/feature-workflow-repair/spec.md"],
                }
            ],
            "allowed_dirty_paths": ["docs/workflows/feature-workflow-repair"],
            "git_base_ref": "origin/main",
            "max_artifact_chars": 123,
        }
        with patch.object(MODULE, "load_checkpoint_manifest", return_value=manifest), patch.object(
            MODULE, "load_workflow_state", return_value={"dirty_overrides": {}}
        ):
            args = MODULE.repair_checkpoint_args(
                "feature-workflow-repair",
                "plan",
                stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=False, healthy=False),
            )

        self.assertEqual(args.required_reviews, manifest["required_reviews"])
        self.assertEqual(args.base_ref, "origin/main")
        self.assertEqual(args.allow_dirty_path, ["docs/workflows/feature-workflow-repair"])

    def test_stage_drift_class_distinguishes_missing_artifact_and_missing_manifest(self) -> None:
        blank_spec = stage_state()
        uncheckpointed_diff = stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=False, healthy=False)

        self.assertEqual(MODULE.stage_drift_class("spec", blank_spec), "missing-artifact")
        self.assertEqual(MODULE.stage_drift_class("diff", uncheckpointed_diff), "missing-manifest")

    def test_repair_is_preferred_for_meaningful_plan_artifact_without_manifest(self) -> None:
        stages = {
            "spec": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "plan": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=False, healthy=False),
            "tasks": stage_state(),
            "diff": stage_state(),
            "closeout": stage_state(),
        }
        action = MODULE.recommended_next_action(
            "feature-workflow-repair",
            {"blocked": {"active": False}, "delivery": {}},
            stages,
            True,
        )
        self.assertEqual(action, "repair_plan_checkpoint")

    def test_blank_spec_still_looks_like_authoring_not_repair(self) -> None:
        stages = {
            "spec": stage_state(),
            "plan": stage_state(),
            "tasks": stage_state(),
            "diff": stage_state(),
            "closeout": stage_state(),
        }
        action = MODULE.recommended_next_action(
            "feature-workflow-repair",
            {"blocked": {"active": False}, "delivery": {}},
            stages,
            True,
        )
        self.assertEqual(action, "author_spec")

    def test_recommended_next_action_prefers_discovery_before_spec(self) -> None:
        stages = {
            "spec": stage_state(),
            "plan": stage_state(),
            "tasks": stage_state(),
            "diff": stage_state(),
            "closeout": stage_state(),
        }
        action = MODULE.recommended_next_action(
            "feature-workflow-discovery-shaping",
            {
                "blocked": {"active": False},
                "delivery": {},
                "discovery": {"required": True, "complete": False},
            },
            stages,
            True,
        )
        self.assertEqual(action, "discover")

    def test_recommended_next_action_keeps_blocked_state_ahead_of_discovery(self) -> None:
        stages = {
            "spec": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "plan": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "tasks": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "diff": stage_state(),
            "closeout": stage_state(),
        }
        action = MODULE.recommended_next_action(
            "feature-workflow-discovery-shaping",
            {
                "blocked": {"active": True},
                "delivery": {},
                "discovery": {"required": True, "complete": False},
            },
            stages,
            True,
        )
        self.assertEqual(action, "mark_blocked")

    def test_diff_missing_artifact_keeps_implementation_flow_next(self) -> None:
        stages = {
            "spec": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "plan": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "tasks": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "diff": stage_state(artifact_exists=False, artifact_meaningful=False, manifest_exists=False, healthy=False),
            "closeout": stage_state(),
        }
        action = MODULE.recommended_next_action(
            "feature-workflow-repair",
            {"blocked": {"active": False}, "delivery": {}},
            stages,
            True,
        )
        self.assertEqual(action, "implement_next_slice")

    def test_stage_status_reports_repairable_for_meaningful_uncheckpointed_plan(self) -> None:
        state = stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=False, healthy=False)
        self.assertEqual(MODULE.stage_status_label("feature-workflow-repair", "plan", state), "repairable")

    def test_stub_artifact_is_not_considered_repairable(self) -> None:
        state = stage_state(artifact_exists=True, artifact_meaningful=False, manifest_exists=False, healthy=False)
        self.assertEqual(MODULE.stage_drift_class("spec", state), "stub-artifact")
        self.assertEqual(MODULE.stage_status_label("feature-workflow-repair", "spec", state), "stub-artifact")

    def test_recommended_next_action_blocks_stub_artifact_with_later_progress(self) -> None:
        stages = {
            "spec": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "plan": stage_state(artifact_exists=True, artifact_meaningful=False, manifest_exists=False, healthy=False),
            "tasks": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "diff": stage_state(),
            "closeout": stage_state(),
        }
        action = MODULE.recommended_next_action(
            "feature-workflow-repair",
            {"blocked": {"active": False}, "delivery": {}},
            stages,
            True,
        )
        self.assertEqual(action, "mark_blocked")

    def test_recommended_next_action_repairs_stale_diff_head(self) -> None:
        stages = {
            "spec": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "plan": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "tasks": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "diff": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "closeout": stage_state(),
        }
        with patch.object(
            MODULE,
            "diff_review_budget_state",
            return_value={"head_mismatch": True, "recorded_head_sha": "abc123", "current_head_sha": "def456"},
        ):
            action = MODULE.recommended_next_action(
                "feature-workflow-repair",
                {"blocked": {"active": False}, "delivery": {}},
                stages,
                True,
            )
        self.assertEqual(action, "repair_diff_checkpoint")

    def test_preferred_diff_base_ref_uses_last_reviewed_head_for_resumed_slice(self) -> None:
        with patch.object(
            MODULE,
            "diff_review_budget_state",
            return_value={
                "artifact_exists": True,
                "head_mismatch": True,
                "recorded_head_sha": "abc123def456",
                "suggested_base_ref": "abc123def456",
            },
        ):
            self.assertEqual(MODULE.preferred_diff_base_ref("feature-workflow-repair"), "abc123def456")

    def test_preferred_diff_base_ref_keeps_explicit_request(self) -> None:
        with patch.object(MODULE, "diff_review_budget_state", return_value={"suggested_base_ref": "abc123def456"}):
            self.assertEqual(MODULE.preferred_diff_base_ref("feature-workflow-repair", "origin/main"), "origin/main")

    def test_status_reports_resumed_diff_scope_basis(self) -> None:
        stages = {
            stage: stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True)
            for stage in ("spec", "plan", "tasks", "diff")
        }
        stages["closeout"] = stage_state()
        state = {"blocked": {"active": False}, "delivery": {}}
        diff_budget = {
            "artifact_exists": True,
            "artifact_bytes": 512,
            "large_artifact": False,
            "recorded_base_ref": "origin/main",
            "recorded_base_sha": "d3335ded7c643eda3d4ad7c2ac730325ff394d2c",
            "recorded_head_sha": "abc123def4567890",
            "current_head_sha": "fed456cba9876543",
            "head_mismatch": True,
            "scope_basis": "last-reviewed-head",
            "suggested_base_ref": "abc123def4567890",
            "artifact_changed_since_codex": False,
        }
        buffer = io.StringIO()
        with patch.object(MODULE, "ensure_sync"), patch.object(
            MODULE, "load_workflow_state", return_value=state
        ), patch.object(
            MODULE, "stage_manifest_state", side_effect=lambda _slug, stage: stages[stage]
        ), patch.object(
            MODULE, "reconciliation_state", return_value=(True, "")
        ), patch.object(
            MODULE, "current_branch_name", return_value="feature-branch"
        ), patch.object(
            MODULE, "upstream_branch_name", return_value="origin/feature-branch"
        ), patch.object(
            MODULE, "diff_review_budget_state", return_value=diff_budget
        ), redirect_stdout(buffer):
            MODULE.command_status(SimpleNamespace(slug="feature-workflow-repair"))

        output = buffer.getvalue()
        self.assertIn("diff-review-budget:", output)
        self.assertIn("recorded-base: origin/main [d3335ded7c64]", output)
        self.assertIn("scope-basis: last-reviewed-head [abc123def456]", output)

    def test_status_reports_discovery_progress(self) -> None:
        stages = {
            stage: stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True)
            for stage in ("spec", "plan", "tasks", "diff")
        }
        stages["closeout"] = stage_state()
        buffer = io.StringIO()
        discovery = {
            "required": True,
            "complete": False,
            "question_count": 5,
            "asked_count": 2,
            "questions": [
                {
                    "question": "What is the user-facing behavior?",
                    "recommendation": "Keep it minimal",
                    "rationale": "We only need the first enforceable slice right now.",
                    "updated_at": 1,
                }
            ],
            "assumptions": ["Faster clarity beats extra approval ceremony."],
            "summary": "Discovery is still in progress.",
            "updated_at": 1,
        }
        with patch.object(MODULE, "ensure_sync"), patch.object(
            MODULE, "load_workflow_state", return_value={"blocked": {"active": False}, "delivery": {}, "discovery": discovery}
        ), patch.object(
            MODULE, "stage_manifest_state", side_effect=lambda _slug, stage: stages[stage]
        ), patch.object(
            MODULE, "reconciliation_state", return_value=(True, "")
        ), patch.object(
            MODULE, "current_branch_name", return_value="feature-branch"
        ), patch.object(
            MODULE, "upstream_branch_name", return_value="origin/feature-branch"
        ), patch.object(
            MODULE, "diff_review_budget_state", return_value={"artifact_exists": False}
        ), patch.object(
            MODULE, "discovery_state", return_value=discovery
        ), redirect_stdout(buffer):
            MODULE.command_status(SimpleNamespace(slug="feature-workflow-discovery-shaping"))

        output = buffer.getvalue()
        self.assertIn("discovery:", output)
        self.assertIn("- required: yes", output)
        self.assertIn("- complete: no", output)
        self.assertIn("- question-count: 5", output)
        self.assertIn("- asked-count: 2", output)
        self.assertIn("- remaining: 3", output)

    def test_recommended_next_action_blocks_closeout_on_stale_delivery_head(self) -> None:
        stages = {
            stage: stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True)
            for stage in ("spec", "plan", "tasks", "diff")
        }
        stages["closeout"] = stage_state()
        with patch.object(MODULE, "diff_review_budget_state", return_value={"head_mismatch": False}):
            action = MODULE.recommended_next_action(
                "feature-workflow-repair",
                {"blocked": {"active": False}, "delivery": {"pr_url": "https://example.com", "head_mismatch": True}},
                stages,
                True,
            )
        self.assertEqual(action, "deliver")

    def test_command_deliver_blocks_when_reviewed_diff_head_moves(self) -> None:
        args = SimpleNamespace(
            slug="feature-workflow-repair",
            create_pr=False,
            draft=False,
            base=None,
            title=None,
            watch_ci=False,
            interval=10,
            merge_when_green=False,
            auto_merge=False,
            dry_run=False,
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            for stage in ("spec", "plan", "tasks", "diff"):
                (temp_root / f"{stage}.checkpoint.json").write_text("{}", encoding="utf-8")

            def manifest_path(_slug: str, stage: str) -> Path:
                return temp_root / f"{stage}.checkpoint.json"

            with patch.object(MODULE, "ensure_sync"), patch.object(
                MODULE, "command_path", return_value="/usr/bin/gh"
            ), patch.object(
                MODULE, "verify_checkpoint_manifest", return_value=(True, "")
            ), patch.object(
                MODULE, "reconciliation_state", return_value=(True, "")
            ), patch.object(
                MODULE,
                "diff_review_budget_state",
                return_value={"head_mismatch": True, "recorded_head_sha": "abc123", "current_head_sha": "def456"},
            ), patch.object(
                MODULE, "current_branch_name", return_value="feature-branch"
            ), patch.object(
                MODULE, "upstream_branch_name", return_value="origin/feature-branch"
            ), patch.object(
                MODULE, "checkpoint_manifest_path", side_effect=manifest_path
            ), patch.object(
                MODULE.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")
            ):
                with self.assertRaises(SystemExit) as ctx:
                    MODULE.command_deliver(args)

        self.assertIn("reviewed diff HEAD", str(ctx.exception))

    def test_command_repair_repairs_stale_diff_head(self) -> None:
        stages = {
            "spec": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "plan": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "tasks": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "diff": stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True),
            "closeout": stage_state(),
        }
        args = SimpleNamespace(slug="feature-workflow-repair")
        with patch.object(MODULE, "ensure_sync"), patch.object(
            MODULE, "load_workflow_state", return_value={"blocked": {"active": False}, "delivery": {}, "checkpoint_fallback": {}}
        ), patch.object(
            MODULE, "stage_manifest_state", side_effect=lambda _slug, stage: stages[stage]
        ), patch.object(
            MODULE, "stage_review_inventory", return_value=([], [])
        ), patch.object(
            MODULE, "diff_review_budget_state", return_value={"head_mismatch": True, "recorded_head_sha": "abc123", "current_head_sha": "def456"}
        ), patch.object(
            MODULE, "repair_checkpoint_args", return_value=SimpleNamespace(slug="feature-workflow-repair", stage="diff")
        ), patch.object(
            MODULE, "command_checkpoint", return_value=0
        ) as checkpoint_mock, patch.object(
            MODULE, "reconciliation_state", return_value=(True, "")
        ):
            exit_code = MODULE.command_repair(args)

        self.assertEqual(exit_code, 0)
        checkpoint_mock.assert_called_once()

    def test_command_checkpoint_blocks_spec_until_discovery_completes(self) -> None:
        args = SimpleNamespace(
            slug="feature-workflow-discovery-shaping",
            stage="spec",
            path=[],
            artifact="",
            base_ref=None,
            context=[],
            allow_dirty_path=[],
            max_artifact_chars=None,
            max_context_chars=None,
            max_total_chars=None,
            gemini_timeout_seconds=120,
            gemini_retries=1,
            repair_timeout_seconds=30,
            fallback=False,
            use_existing_artifact=False,
            allow_large_diff_rerun=False,
            required_reviews=None,
        )
        with patch.object(MODULE, "ensure_sync"), patch.object(
            MODULE, "prerequisite_failure", return_value=None
        ), patch.object(
            MODULE, "discovery_state", return_value={"required": True, "complete": False, "question_count": 5, "asked_count": 2}
        ):
            with self.assertRaises(SystemExit) as ctx:
                MODULE.command_checkpoint(args)

        self.assertIn("discovery", str(ctx.exception))

    def test_command_discover_records_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            state_path = temp_root / "workflow.json"
            args = SimpleNamespace(
                slug="feature-workflow-discovery-shaping",
                required=True,
                count=5,
                question="Should this slice prioritize speed or coverage?",
                recommendation="Prioritize speed",
                rationale="The plan already says to avoid extra approval ceremony.",
                assumption=["Keep the first slice small."],
                summary="Five questions are expected for the current ambiguous request.",
                complete=False,
            )
            with patch.object(MODULE, "ensure_sync"), patch.object(
                MODULE, "workflow_state_path", return_value=state_path
            ):
                exit_code = MODULE.command_discover(args)

            self.assertEqual(exit_code, 0)
            saved = json.loads(state_path.read_text(encoding="utf-8"))
            discovery = saved["discovery"]
            self.assertTrue(discovery["required"])
            self.assertFalse(discovery["complete"])
            self.assertEqual(discovery["question_count"], 5)
            self.assertEqual(discovery["asked_count"], 1)
            self.assertEqual(discovery["questions"][0]["question"], args.question)
            self.assertIn("Keep the first slice small.", discovery["assumptions"])
            self.assertIn("Five questions are expected", discovery["summary"])
            self.assertEqual(discovery["version"], 1)

    def test_command_discover_clear_resets_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            state_path = temp_root / "workflow.json"
            state_path.write_text(
                json.dumps(
                    {
                        "discovery": {
                            "version": 1,
                            "required": True,
                            "complete": False,
                            "question_count": 5,
                            "asked_count": 3,
                            "questions": [{"question": "a", "recommendation": "b", "rationale": "c"}],
                            "assumptions": ["x"],
                            "summary": "old",
                            "updated_at": 1,
                        }
                    }
                ),
                encoding="utf-8",
            )
            args = SimpleNamespace(
                slug="feature-workflow-discovery-shaping",
                required=False,
                count=None,
                question=None,
                recommendation=None,
                rationale=None,
                assumption=[],
                summary=None,
                complete=False,
                force_complete=False,
                clear=True,
            )
            with patch.object(MODULE, "ensure_sync"), patch.object(
                MODULE, "workflow_state_path", return_value=state_path
            ):
                exit_code = MODULE.command_discover(args)

            self.assertEqual(exit_code, 0)
            saved = json.loads(state_path.read_text(encoding="utf-8"))
            discovery = saved["discovery"]
            self.assertFalse(discovery["required"])
            self.assertTrue(discovery["complete"])
            self.assertEqual(discovery["question_count"], 0)
            self.assertEqual(discovery["asked_count"], 0)
            self.assertEqual(discovery["questions"], [])
            self.assertEqual(discovery["assumptions"], [])

    def test_command_discover_rejects_premature_completion_without_force(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            state_path = temp_root / "workflow.json"
            state_path.write_text(
                json.dumps(
                    {
                        "discovery": {
                            "version": 1,
                            "required": True,
                            "complete": False,
                            "question_count": 5,
                            "asked_count": 2,
                            "questions": [],
                            "assumptions": [],
                            "summary": "",
                            "updated_at": 1,
                        }
                    }
                ),
                encoding="utf-8",
            )
            args = SimpleNamespace(
                slug="feature-workflow-discovery-shaping",
                required=False,
                count=None,
                question=None,
                recommendation=None,
                rationale=None,
                assumption=[],
                summary=None,
                complete=True,
                force_complete=False,
                clear=False,
            )
            with patch.object(MODULE, "ensure_sync"), patch.object(
                MODULE, "workflow_state_path", return_value=state_path
            ):
                with self.assertRaises(SystemExit) as ctx:
                    MODULE.command_discover(args)

        self.assertIn("force-complete", str(ctx.exception))

    def test_command_deliver_dry_run_does_not_mutate_delivery_state(self) -> None:
        args = SimpleNamespace(
            slug="feature-workflow-repair",
            create_pr=True,
            draft=False,
            base=None,
            title=None,
            watch_ci=False,
            interval=10,
            merge_when_green=False,
            auto_merge=False,
            dry_run=True,
        )
        with patch.object(MODULE, "ensure_sync"), patch.object(
            MODULE, "command_path", return_value="/usr/bin/gh"
        ), patch.object(
            MODULE, "verify_checkpoint_manifest", return_value=(True, "")
        ), patch.object(
            MODULE, "reconciliation_state", return_value=(True, "")
        ), patch.object(
            MODULE, "current_branch_name", return_value="feature-branch"
        ), patch.object(
            MODULE, "upstream_branch_name", return_value="origin/feature-branch"
        ), patch.object(
            MODULE, "current_pr_payload", return_value=None
        ), patch.object(
            MODULE, "update_workflow_state"
        ) as update_mock, patch.object(
            MODULE.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout="", stderr="")
        ), patch.object(
            MODULE, "diff_review_budget_state", return_value={"head_mismatch": False}
        ), patch.object(
            MODULE, "required_check_summary", return_value=("unknown", [], "")
        ):
            exit_code = MODULE.command_deliver(args)

        self.assertEqual(exit_code, 0)
        update_mock.assert_not_called()

    def test_compose_closeout_text_preserves_existing_narrative(self) -> None:
        existing = "# Closeout: feature-workflow-repair\n\nThis is the authored summary.\n"
        inventory = "## Workflow Inventory\n\n# Closeout: feature-workflow-repair\n"
        composed = MODULE.compose_closeout_text(existing, inventory)

        self.assertTrue(composed.startswith(existing.rstrip()))
        self.assertIn("## Workflow Inventory", composed)
        self.assertIn("This is the authored summary.", composed)

    def test_compose_closeout_text_refreshes_existing_inventory(self) -> None:
        existing = (
            "# Closeout: feature-workflow-repair\n\n"
            "This is the authored summary.\n\n"
            "## Workflow Inventory\n\n"
            "- stale inventory entry\n"
        )
        inventory = "## Workflow Inventory\n\n- refreshed inventory entry\n"
        composed = MODULE.compose_closeout_text(existing, inventory)

        self.assertIn("This is the authored summary.", composed)
        self.assertNotIn("stale inventory entry", composed)
        self.assertIn("refreshed inventory entry", composed)

    def test_command_closeout_uses_active_review_chain_only(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            workflow_root = temp_root / "workflow"
            workflow_root.mkdir(parents=True, exist_ok=True)
            for stage in ("spec", "plan", "tasks", "diff"):
                (workflow_root / f"{stage}.checkpoint.json").write_text("{}", encoding="utf-8")
            manifest_path = workflow_root / "closeout.checkpoint.json"
            review_path = workflow_root / "reviews" / "diff.gemini.review.md"
            review_path.parent.mkdir(parents=True, exist_ok=True)
            review_path.write_text("---\nresolution_status: \"deferred\"\nresolution_note: \"deferred\"\n---\n", encoding="utf-8")

            def checkpoint_manifest_path(_slug: str, stage: str) -> Path:
                return workflow_root / f"{stage}.checkpoint.json"

            args = SimpleNamespace(slug="feature-workflow-discovery-shaping")
            with patch.object(MODULE, "ensure_sync"), patch.object(
                MODULE, "workflow_dir", return_value=workflow_root
            ), patch.object(
                MODULE, "checkpoint_manifest_path", side_effect=checkpoint_manifest_path
            ), patch.object(
                MODULE, "load_workflow_state", return_value={"delivery": {}, "dirty_overrides": {}, "checkpoint_fallback": {}}
            ), patch.object(
                MODULE, "gather_all_review_paths", return_value=[review_path]
            ) as gather_mock, patch.object(
                MODULE,
                "refresh_delivery_snapshot",
                return_value={"pr_number": 1, "pr_url": "https://example.com/pr/1", "checks_summary": "pass"},
            ), patch.object(
                MODULE, "run", return_value=None
            ):
                args.fallback = False
                MODULE.command_closeout(args)

        gather_mock.assert_called_once_with("feature-workflow-discovery-shaping", include_closeout=False)

    def test_record_checkpoint_fallback_persists_state(self) -> None:
        captured: dict[str, object] = {}

        def mutate(state: dict) -> None:
            captured.update(state)

        with patch.object(MODULE, "update_workflow_state", side_effect=lambda slug, mutate_fn: mutate_fn(captured) or captured):
            state = MODULE.record_checkpoint_fallback("feature-workflow-repair", "diff", "repair exited 1")

        self.assertTrue(state["checkpoint_fallback"]["used"])
        self.assertEqual(state["checkpoint_fallback"]["stage"], "diff")
        self.assertEqual(state["checkpoint_fallback"]["reason"], "repair exited 1")

    def test_command_checkpoint_does_not_record_failed_fallback(self) -> None:
        args = SimpleNamespace(
            slug="feature-workflow-repair",
            stage="diff",
            path=[],
            artifact="",
            base_ref=None,
            context=[],
            allow_dirty_path=[],
            max_artifact_chars=None,
            max_context_chars=None,
            max_total_chars=None,
            gemini_timeout_seconds=120,
            gemini_retries=1,
            repair_timeout_seconds=30,
            fallback=True,
            use_existing_artifact=True,
            allow_large_diff_rerun=False,
            required_reviews=None,
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            workflow_root = temp_root / "workflow"
            reviews_root = workflow_root / "reviews"
            reviews_root.mkdir(parents=True, exist_ok=True)
            artifact_path = reviews_root / "implementation.diff.patch"
            artifact_path.write_text("diff --git a/foo b/foo\n", encoding="utf-8")
            manifest_path = reviews_root / "diff.checkpoint.json"

            with patch.object(MODULE, "ensure_sync"), patch.object(
                MODULE, "workflow_dir", return_value=workflow_root
            ), patch.object(
                MODULE, "reviews_dir", return_value=reviews_root
            ), patch.object(
                MODULE, "default_artifact_path", return_value=artifact_path
            ), patch.object(
                MODULE, "checkpoint_manifest_path", return_value=manifest_path
            ), patch.object(
                MODULE, "prerequisite_failure", return_value=None
            ), patch.object(
                MODULE, "resolved_review_policy", return_value={
                    "sensitive": False,
                    "large_structural": False,
                    "performance_sensitive": False,
                    "extra_gemini_lenses": [],
                }
            ), patch.object(
                MODULE, "checkpoint_manifest", return_value={"stage": "diff", "required_reviews": []}
            ), patch.object(
                MODULE, "atomic_json_write"
            ), patch.object(
                MODULE, "update_workflow_state", return_value={}
            ), patch.object(
                MODULE, "diff_review_budget_state",
                return_value={
                    "artifact_exists": True,
                    "artifact_bytes": 20,
                    "large_artifact": False,
                    "recorded_base_ref": "",
                    "recorded_base_sha": "",
                    "recorded_head_sha": "",
                    "current_head_sha": "",
                    "head_mismatch": False,
                    "scope_basis": "branch-merge-base",
                    "suggested_base_ref": "",
                    "artifact_changed_since_codex": False,
                },
            ), patch.object(
                MODULE, "record_checkpoint_fallback"
            ) as record_fallback, patch.object(
                MODULE, "run_checkpoint_fallback", return_value=(False, "boom")
            ), patch.object(
                MODULE.subprocess, "run", return_value=SimpleNamespace(returncode=1, stdout="", stderr="repair failed")
            ):
                exit_code = MODULE.command_checkpoint(args)

        self.assertEqual(exit_code, 1)
        record_fallback.assert_not_called()

    def test_run_checkpoint_fallback_invokes_direct_review_runners(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            artifact = temp_root / "artifact.diff.patch"
            artifact.write_text("diff --git a/foo b/foo\n", encoding="utf-8")
            review_a = temp_root / "diff.gemini.risk.review.md"
            review_b = temp_root / "diff.codex.feasibility.review.md"
            manifest = {
                "artifact_path": str(artifact),
                "stage": "diff",
                "required_reviews": [
                    {
                        "reviewer": "gemini",
                        "lens": "risk-adversarial",
                        "path": str(review_a),
                        "context_paths": [],
                        "model": "gemini-2.5-pro",
                    },
                    {
                        "reviewer": "codex",
                        "lens": "feasibility-adversarial",
                        "path": str(review_b),
                        "context_paths": [],
                        "model": "gpt-5.4-mini",
                    },
                ],
            }
            manifest_path = temp_root / "spec.checkpoint.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            commands: list[list[str]] = []

            def fake_run(cmd, **kwargs):
                commands.append(list(cmd))
                return SimpleNamespace(returncode=0, stdout="", stderr="")

            with patch.object(MODULE.subprocess, "run", side_effect=fake_run):
                ok, detail = MODULE.run_checkpoint_fallback(manifest_path, Path("/Users/chrislaw/valuerank"), 120, 1)

        self.assertTrue(ok)
        self.assertEqual(detail, "")
        joined = "\n".join(" ".join(cmd) for cmd in commands)
        self.assertIn("run_gemini_review.py", joined)
        self.assertIn("run_codex_review.py", joined)
        self.assertIn("verify_review_checkpoint.py", joined)

    def test_command_checkpoint_uses_resumed_diff_base_ref(self) -> None:
        args = SimpleNamespace(
            slug="feature-workflow-repair",
            stage="diff",
            path=[],
            artifact="",
            base_ref=None,
            context=[],
            allow_dirty_path=[],
            max_artifact_chars=None,
            max_context_chars=None,
            max_total_chars=None,
            gemini_timeout_seconds=120,
            gemini_retries=1,
            repair_timeout_seconds=30,
            fallback=False,
            use_existing_artifact=False,
            allow_large_diff_rerun=False,
            required_reviews=None,
        )
        commands: list[list[str]] = []

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            workflow_root = temp_root / "workflow"
            reviews_root = workflow_root / "reviews"
            reviews_root.mkdir(parents=True, exist_ok=True)
            scope_manifest = workflow_root / "scope.json"
            scope_manifest.write_text(json.dumps({"paths": ["docs"], "allowed_dirty_paths": []}), encoding="utf-8")
            artifact_path = reviews_root / "implementation.diff.patch"
            manifest_path = reviews_root / "diff.checkpoint.json"

            def fake_run(cmd, **kwargs):
                commands.append(list(cmd))
                cmd_text = " ".join(cmd)
                if "write_canonical_diff.py" in cmd_text:
                    artifact_path.write_text("diff --git a/foo b/foo\n", encoding="utf-8")
                    artifact_path.with_suffix(".patch.json").write_text(
                        json.dumps(
                            {
                                "repo_root": ".",
                                "git_head_sha": "fed456cba9876543",
                                "git_base_ref": "abc123def4567890",
                                "git_base_sha": "1111111111111111",
                                "paths": ["docs"],
                                "allowed_dirty_paths": [],
                                "untracked_files_included": [],
                                "artifact_path": str(artifact_path),
                                "allow_empty_diff": False,
                            }
                        ),
                        encoding="utf-8",
                    )
                    return SimpleNamespace(returncode=0, stdout=str(artifact_path), stderr="")
                if "repair_review_checkpoint.py" in cmd_text:
                    return SimpleNamespace(returncode=0, stdout="", stderr="")
                raise AssertionError(f"unexpected command: {cmd}")

            with patch.object(MODULE, "ensure_sync"), patch.object(
                MODULE, "workflow_dir", return_value=workflow_root
            ), patch.object(
                MODULE, "reviews_dir", return_value=reviews_root
            ), patch.object(
                MODULE, "scope_manifest_path", return_value=scope_manifest
            ), patch.object(
                MODULE, "default_artifact_path", return_value=artifact_path
            ), patch.object(
                MODULE, "checkpoint_manifest_path", return_value=manifest_path
            ), patch.object(
                MODULE, "prerequisite_failure", return_value=None
            ), patch.object(
                MODULE, "resolved_review_policy", return_value={
                    "sensitive": False,
                    "large_structural": False,
                    "performance_sensitive": False,
                    "extra_gemini_lenses": [],
                }
            ), patch.object(
                MODULE, "diff_review_budget_state",
                return_value={
                    "artifact_exists": True,
                    "artifact_bytes": 20,
                    "large_artifact": False,
                    "recorded_base_ref": "origin/main",
                    "recorded_base_sha": "d3335ded7c643eda3d4ad7c2ac730325ff394d2c",
                    "recorded_head_sha": "abc123def4567890",
                    "current_head_sha": "fed456cba9876543",
                    "head_mismatch": True,
                    "scope_basis": "last-reviewed-head",
                    "suggested_base_ref": "abc123def4567890",
                    "artifact_changed_since_codex": False,
                },
            ), patch.object(
                MODULE, "required_reviews", return_value=[]
            ), patch.object(
                MODULE, "update_workflow_state", return_value={}
            ), patch.object(
                MODULE.subprocess, "run", side_effect=fake_run
            ):
                exit_code = MODULE.command_checkpoint(args)

        self.assertEqual(exit_code, 0)
        joined = "\n".join(" ".join(cmd) for cmd in commands)
        self.assertIn("--base-ref", joined)
        self.assertIn("abc123def4567890", joined)


class CheckpointMarkerTests(unittest.TestCase):
    """Tests for parse_checkpoint_markers, checkpoint_progress_state, and
    the checkpoint-scoped diff base logic."""

    def test_parse_checkpoint_markers_returns_zero_when_no_markers(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tasks = Path(tmp) / "tasks.md"
            tasks.write_text("# Tasks\n\n- [ ] Do something\n- [ ] Do something else\n")
            with patch.object(MODULE, "workflow_dir", return_value=Path(tmp)):
                count, sha = MODULE.parse_checkpoint_markers("slug")
        self.assertEqual(count, 0)
        self.assertEqual(sha, "")

    def test_parse_checkpoint_markers_counts_all_list_styles(self) -> None:
        content = (
            "# Tasks\n"
            "- Task A [CHECKPOINT]\n"
            "* Task B [CHECKPOINT]\n"
            "1. Task C [CHECKPOINT]\n"
            "- [ ] Task D [CHECKPOINT]\n"
            "- [x] Task E [CHECKPOINT]\n"
            "- [X] Task F [CHECKPOINT]\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            tasks = Path(tmp) / "tasks.md"
            tasks.write_text(content)
            with patch.object(MODULE, "workflow_dir", return_value=Path(tmp)):
                count, sha = MODULE.parse_checkpoint_markers("slug")
        self.assertEqual(count, 6)
        self.assertNotEqual(sha, "")

    def test_parse_checkpoint_markers_ignores_non_list_lines(self) -> None:
        content = (
            "# Tasks\n"
            "This line mentions [CHECKPOINT] but is not a list item.\n"
            "    [CHECKPOINT] also not a list item\n"
            "- Real checkpoint [CHECKPOINT]\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            tasks = Path(tmp) / "tasks.md"
            tasks.write_text(content)
            with patch.object(MODULE, "workflow_dir", return_value=Path(tmp)):
                count, sha = MODULE.parse_checkpoint_markers("slug")
        self.assertEqual(count, 1)

    def test_parse_checkpoint_markers_anchors_to_end_of_line(self) -> None:
        # [CHECKPOINT] mid-sentence should not match
        content = "- [ ] Explain how [CHECKPOINT] marker works in detail\n"
        with tempfile.TemporaryDirectory() as tmp:
            tasks = Path(tmp) / "tasks.md"
            tasks.write_text(content)
            with patch.object(MODULE, "workflow_dir", return_value=Path(tmp)):
                count, _ = MODULE.parse_checkpoint_markers("slug")
        self.assertEqual(count, 0)

    def test_parse_checkpoint_markers_returns_zero_when_file_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(MODULE, "workflow_dir", return_value=Path(tmp)):
                count, sha = MODULE.parse_checkpoint_markers("slug")
        self.assertEqual(count, 0)
        self.assertEqual(sha, "")

    def test_checkpoint_progress_defaults_when_absent(self) -> None:
        with patch.object(MODULE, "load_workflow_state", return_value={}):
            progress = MODULE.checkpoint_progress_state("slug")
        self.assertEqual(progress["index"], 0)
        self.assertEqual(progress["markers_sha"], "")
        self.assertEqual(progress["last_diff_head_sha"], "")

    def test_checkpoint_progress_normalizes_partial_state(self) -> None:
        partial = {MODULE.CHECKPOINT_PROGRESS_KEY: {"index": 2}}
        with patch.object(MODULE, "load_workflow_state", return_value=partial):
            progress = MODULE.checkpoint_progress_state("slug")
        self.assertEqual(progress["index"], 2)
        self.assertEqual(progress["markers_sha"], "")
        self.assertEqual(progress["last_diff_head_sha"], "")

    def test_advance_checkpoint_progress_increments_index(self) -> None:
        initial = {"index": 1, "markers_sha": "old", "last_diff_head_sha": "oldsha"}
        captured: list[dict] = []

        def fake_update(slug: str, fn) -> None:
            import copy
            state = {MODULE.CHECKPOINT_PROGRESS_KEY: copy.deepcopy(initial)}
            fn(state)
            captured.append(state[MODULE.CHECKPOINT_PROGRESS_KEY])

        with (
            patch.object(MODULE, "load_workflow_state", return_value={MODULE.CHECKPOINT_PROGRESS_KEY: initial}),
            patch.object(MODULE, "parse_checkpoint_markers", return_value=(3, "newsha")),
            patch.object(MODULE, "checkpoint_progress_state", return_value=initial),
            patch.object(MODULE, "update_workflow_state", side_effect=fake_update),
        ):
            MODULE._advance_checkpoint_progress("slug", "diff", "newhead")

        self.assertEqual(len(captured), 1)
        self.assertEqual(captured[0]["index"], 2)
        self.assertEqual(captured[0]["markers_sha"], "newsha")
        self.assertEqual(captured[0]["last_diff_head_sha"], "newhead")

    def test_advance_checkpoint_progress_no_op_for_non_diff(self) -> None:
        with patch.object(MODULE, "update_workflow_state") as mock_update:
            MODULE._advance_checkpoint_progress("slug", "spec", "sha")
        mock_update.assert_not_called()

    def test_advance_checkpoint_progress_no_op_when_no_markers(self) -> None:
        with (
            patch.object(MODULE, "parse_checkpoint_markers", return_value=(0, "")),
            patch.object(MODULE, "update_workflow_state") as mock_update,
        ):
            MODULE._advance_checkpoint_progress("slug", "diff", "sha")
        mock_update.assert_not_called()

    def test_sha_valid_ancestor_returns_false_for_empty(self) -> None:
        result = MODULE._sha_is_valid_ancestor("")
        self.assertFalse(result)

    def test_markers_sha_stable_across_non_marker_edits(self) -> None:
        """Adding a non-checkpoint task should not change the markers_sha."""
        base_content = "- Task A [CHECKPOINT]\n"
        extended_content = "- Task A [CHECKPOINT]\n- Task B no marker\n"
        with tempfile.TemporaryDirectory() as tmp:
            tasks = Path(tmp) / "tasks.md"
            tasks.write_text(base_content)
            with patch.object(MODULE, "workflow_dir", return_value=Path(tmp)):
                count1, sha1 = MODULE.parse_checkpoint_markers("slug")
            tasks.write_text(extended_content)
            with patch.object(MODULE, "workflow_dir", return_value=Path(tmp)):
                count2, sha2 = MODULE.parse_checkpoint_markers("slug")
        self.assertEqual(count1, count2)
        self.assertEqual(sha1, sha2)


class DefaultCodexModelTests(unittest.TestCase):
    def test_default_codex_model_constant_exists(self) -> None:
        self.assertEqual(MODULE.DEFAULT_CODEX_MODEL, "gpt-5.4-mini")

    def test_required_reviews_codex_entry_uses_constant(self) -> None:
        reviews = MODULE.required_reviews(
            "diff",
            sensitive=False,
            large_structural=False,
            performance_sensitive=False,
            extra_gemini=[],
        )
        codex_entries = [r for r in reviews if r.get("reviewer") == "codex"]
        self.assertTrue(codex_entries, "expected at least one codex reviewer entry")
        for entry in codex_entries:
            self.assertEqual(
                entry.get("model"),
                MODULE.DEFAULT_CODEX_MODEL,
                f"codex entry model should be DEFAULT_CODEX_MODEL, got {entry.get('model')!r}",
            )


class _CapturedBaseRef(Exception):
    """Sentinel exception raised by the preferred_diff_base_ref mock to abort command_checkpoint early."""

    def __init__(self, base_ref: object) -> None:
        self.base_ref = base_ref


class BaseRefResetTests(unittest.TestCase):
    """Tests that base_ref is reset to None in all three reset branches of command_checkpoint."""

    def _run_checkpoint_diff_get_base_ref(
        self,
        *,
        marker_count: int,
        index: int,
        stored_sha: str,
        last_head: str,
        ancestor_valid: bool,
        recorded_base_ref: str = "origin/main",
    ) -> object:
        """Run command_checkpoint diff stage and return the base_ref passed to preferred_diff_base_ref.

        Mocks preferred_diff_base_ref to raise _CapturedBaseRef so we can inspect what arg it received
        without needing to mock all of command_checkpoint's downstream subprocess calls.
        """

        def capturing_preferred(slug: str, base_ref: object) -> str:
            raise _CapturedBaseRef(base_ref)

        progress = {"index": index, "markers_sha": stored_sha, "last_diff_head_sha": last_head}

        args = SimpleNamespace(
            slug="test-slug",
            stage="diff",
            path=[],
            artifact="",
            base_ref=None,
            context=[],
            allow_dirty_path=[],
            max_artifact_chars=None,
            max_context_chars=None,
            max_total_chars=None,
            gemini_timeout_seconds=120,
            gemini_retries=1,
            repair_timeout_seconds=30,
            fallback=False,
            use_existing_artifact=False,
            allow_large_diff_rerun=False,
            required_reviews=None,
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            workflow_root = temp_root / "workflow"
            reviews_root = workflow_root / "reviews"
            reviews_root.mkdir(parents=True, exist_ok=True)

            try:
                with (
                    patch.object(MODULE, "ensure_sync"),
                    patch.object(MODULE, "workflow_dir", return_value=workflow_root),
                    patch.object(MODULE, "reviews_dir", return_value=reviews_root),
                    patch.object(MODULE, "prerequisite_failure", return_value=None),
                    patch.object(MODULE, "resolved_review_policy", return_value={
                        "sensitive": False,
                        "large_structural": False,
                        "performance_sensitive": False,
                        "extra_gemini_lenses": [],
                    }),
                    patch.object(MODULE, "diff_review_budget_state", return_value={
                        "artifact_exists": False,
                        "artifact_bytes": 0,
                        "large_artifact": False,
                        "recorded_base_ref": recorded_base_ref,
                        "recorded_base_sha": "aabbccddee",
                        "recorded_head_sha": "deadbeef111",
                        "current_head_sha": "newheadsha",
                        "head_mismatch": True,
                        "scope_basis": "last-reviewed-head",
                        "suggested_base_ref": "deadbeef111",
                        "artifact_changed_since_codex": False,
                    }),
                    patch.object(MODULE, "checkpoint_progress_state", return_value=progress),
                    patch.object(MODULE, "parse_checkpoint_markers", return_value=(marker_count, "CURRENT_SHA")),
                    patch.object(MODULE, "_sha_is_valid_ancestor", return_value=ancestor_valid),
                    patch.object(MODULE, "update_workflow_state"),
                    patch.object(MODULE, "preferred_diff_base_ref", side_effect=capturing_preferred),
                    redirect_stdout(io.StringIO()),
                ):
                    MODULE.command_checkpoint(args)
            except _CapturedBaseRef as e:
                return e.base_ref
            except (SystemExit, Exception):
                pass

        return None

    def test_index_overflow_clears_base_ref(self) -> None:
        """index >= marker_count triggers reset; preferred_diff_base_ref must receive None."""
        base_ref = self._run_checkpoint_diff_get_base_ref(
            marker_count=1,
            index=2,
            stored_sha="SHA1",
            last_head="abc123",
            ancestor_valid=True,
        )
        self.assertIsNone(base_ref, "expected preferred_diff_base_ref to be called with None after index overflow reset")

    def test_markers_sha_mismatch_clears_base_ref(self) -> None:
        """stored_sha != current_sha triggers reset; preferred_diff_base_ref must receive None."""
        base_ref = self._run_checkpoint_diff_get_base_ref(
            marker_count=1,
            index=1,
            stored_sha="OLD_SHA",
            last_head="abc123",
            ancestor_valid=True,
        )
        self.assertIsNone(base_ref, "expected preferred_diff_base_ref to be called with None after markers-sha mismatch reset")

    def test_dangling_sha_clears_base_ref(self) -> None:
        """last_head not a valid ancestor triggers reset; preferred_diff_base_ref must receive None."""
        base_ref = self._run_checkpoint_diff_get_base_ref(
            marker_count=1,
            index=1,
            stored_sha="CURRENT_SHA",
            last_head="dangling",
            ancestor_valid=False,
        )
        self.assertIsNone(base_ref, "expected preferred_diff_base_ref to be called with None after dangling SHA reset")

    def test_reset_uses_recorded_base_not_stale_head(self) -> None:
        """After an index-overflow reset, preferred_diff_base_ref is called with None (not the stale last_head SHA).

        This test verifies that:
        (a) The reset fires (confirmed by update_workflow_state being called).
        (b) preferred_diff_base_ref receives None — the stale last_head SHA "deadbeef111" is NOT passed
            as the requested base_ref, so it cannot pollute the diff base selection.
        (c) args.base_ref is set to whatever preferred_diff_base_ref returns ("origin/main" in this mock).
        """
        args_holder: list[object] = []
        received_base_ref: list[object] = []

        def fake_preferred(slug: str, base_ref: object) -> str:
            received_base_ref.append(base_ref)
            return "origin/main"

        progress = {"index": 2, "markers_sha": "SHA1", "last_diff_head_sha": "deadbeef111"}

        args = SimpleNamespace(
            slug="test-slug",
            stage="diff",
            path=[],
            artifact="",
            base_ref=None,
            context=[],
            allow_dirty_path=[],
            max_artifact_chars=None,
            max_context_chars=None,
            max_total_chars=None,
            gemini_timeout_seconds=120,
            gemini_retries=1,
            repair_timeout_seconds=30,
            fallback=False,
            use_existing_artifact=False,
            allow_large_diff_rerun=False,
            required_reviews=None,
        )
        args_holder.append(args)

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            workflow_root = temp_root / "workflow"
            reviews_root = workflow_root / "reviews"
            reviews_root.mkdir(parents=True, exist_ok=True)

            def capturing_scope(slug: str) -> Path:
                # Capture args.base_ref at the point after preferred_diff_base_ref has set it.
                raise _CapturedBaseRef(args_holder[0].base_ref)

            try:
                with (
                    patch.object(MODULE, "ensure_sync"),
                    patch.object(MODULE, "workflow_dir", return_value=workflow_root),
                    patch.object(MODULE, "reviews_dir", return_value=reviews_root),
                    patch.object(MODULE, "prerequisite_failure", return_value=None),
                    patch.object(MODULE, "resolved_review_policy", return_value={
                        "sensitive": False,
                        "large_structural": False,
                        "performance_sensitive": False,
                        "extra_gemini_lenses": [],
                    }),
                    patch.object(MODULE, "diff_review_budget_state", return_value={
                        "artifact_exists": False,
                        "artifact_bytes": 0,
                        "large_artifact": False,
                        "recorded_base_ref": "origin/main",
                        "recorded_base_sha": "aabbccddee",
                        "recorded_head_sha": "deadbeef111",
                        "current_head_sha": "newheadsha",
                        "head_mismatch": True,
                        "scope_basis": "last-reviewed-head",
                        "suggested_base_ref": "deadbeef111",
                        "artifact_changed_since_codex": False,
                    }),
                    patch.object(MODULE, "checkpoint_progress_state", return_value=progress),
                    patch.object(MODULE, "parse_checkpoint_markers", return_value=(1, "CURRENT_SHA")),
                    patch.object(MODULE, "_sha_is_valid_ancestor", return_value=True),
                    patch.object(MODULE, "update_workflow_state"),
                    patch.object(MODULE, "preferred_diff_base_ref", side_effect=fake_preferred),
                    patch.object(MODULE, "scope_manifest_path", side_effect=capturing_scope),
                    redirect_stdout(io.StringIO()),
                ):
                    MODULE.command_checkpoint(args)
            except _CapturedBaseRef as e:
                captured_result = e.base_ref
            except (SystemExit, Exception):
                captured_result = None
            else:
                captured_result = None

        # preferred_diff_base_ref should receive None (args.base_ref was reset, not the stale last_head)
        self.assertEqual(len(received_base_ref), 1, "expected preferred_diff_base_ref to be called once")
        self.assertIsNone(received_base_ref[0], "expected preferred_diff_base_ref to be called with None, not the stale 'deadbeef111'")
        # The resulting args.base_ref should be what preferred_diff_base_ref returned
        self.assertEqual(captured_result, "origin/main", "expected args.base_ref to be set to what preferred_diff_base_ref returned")


class RepairCloseoutTests(unittest.TestCase):
    """Tests for the closeout repair block added to command_repair."""

    def _base_stages(self) -> dict:
        healthy = stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True)
        return {s: healthy for s in ["spec", "plan", "tasks", "diff", "closeout"]}

    def test_repair_skips_closeout_when_not_checkpointed(self) -> None:
        """not-checkpointed closeout: repair succeeds, no block, command_checkpoint not called for closeout."""
        checkpoint_call_count: list[int] = [0]

        def counting_checkpoint(repair_args: object) -> int:
            checkpoint_call_count[0] += 1
            return 0

        stages = self._base_stages()
        stages["closeout"] = stage_state()  # not-checkpointed

        args = MODULE.argparse.Namespace(slug="test-slug")

        with (
            patch.object(MODULE, "ensure_sync"),
            patch.object(MODULE, "load_workflow_state", return_value={"blocked": {"active": False}, "delivery": {}}),
            patch.object(MODULE, "stage_manifest_state", side_effect=lambda slug, stage: stages[stage]),
            patch.object(MODULE, "stage_drift_class", side_effect=lambda stage, state: "not-checkpointed" if stage == "closeout" else "healthy"),
            patch.object(MODULE, "stage_repairable", return_value=False),
            patch.object(MODULE, "stage_review_inventory", return_value=([], [])),
            patch.object(MODULE, "command_checkpoint", side_effect=counting_checkpoint),
            patch.object(MODULE, "reconciliation_state", return_value=(True, "")),
            patch.object(MODULE, "recommended_next_action", return_value="closeout"),
            patch.object(MODULE, "stage_status_label", return_value="not-checkpointed"),
            patch.object(MODULE, "trim_detail", side_effect=lambda s: s),
            redirect_stdout(io.StringIO()),
        ):
            result = MODULE.command_repair(args)

        self.assertEqual(result, 0, "expected repair to succeed when closeout is not-checkpointed")
        self.assertEqual(checkpoint_call_count[0], 0, "command_checkpoint should not be called for not-checkpointed closeout")

    def test_repair_fixes_stale_closeout(self) -> None:
        """unhealthy-manifest + repairable: command_checkpoint called, closeout appears in repaired output."""
        checkpoint_calls: list[object] = []
        healthy = stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True)
        closeout_initial = stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=False)
        closeout_refreshed = stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True)

        call_count: list[int] = [0]

        def fake_manifest_state(slug: str, stage: str) -> dict:
            if stage == "closeout":
                call_count[0] += 1
                return closeout_initial if call_count[0] == 1 else closeout_refreshed
            return healthy

        args = MODULE.argparse.Namespace(slug="test-slug")
        output = io.StringIO()

        with (
            patch.object(MODULE, "ensure_sync"),
            patch.object(MODULE, "load_workflow_state", return_value={"blocked": {"active": False}, "delivery": {}}),
            patch.object(MODULE, "stage_manifest_state", side_effect=fake_manifest_state),
            patch.object(MODULE, "stage_drift_class", side_effect=lambda stage, state: "unhealthy-manifest" if stage == "closeout" else "healthy"),
            patch.object(MODULE, "stage_repairable", side_effect=lambda slug, stage, state: stage == "closeout"),
            patch.object(MODULE, "stage_review_inventory", return_value=([], [])),
            patch.object(MODULE, "command_checkpoint", side_effect=lambda a: checkpoint_calls.append(a) or 0),
            patch.object(MODULE, "reconciliation_state", return_value=(True, "")),
            patch.object(MODULE, "recommended_next_action", return_value="deliver"),
            patch.object(MODULE, "stage_status_label", return_value="ok"),
            patch.object(MODULE, "trim_detail", side_effect=lambda s: s),
            redirect_stdout(output),
        ):
            result = MODULE.command_repair(args)

        self.assertEqual(result, 0, "expected repair to succeed")
        self.assertEqual(len(checkpoint_calls), 1, "expected exactly one command_checkpoint call for closeout")
        self.assertIn("closeout", output.getvalue(), "expected closeout to appear in output")

    def test_repair_blocks_on_closeout_failure(self) -> None:
        """unhealthy-manifest + repairable but checkpoint returns 1: repair must return 1."""
        healthy = stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True)
        closeout_initial = stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=False)

        args = MODULE.argparse.Namespace(slug="test-slug")

        with (
            patch.object(MODULE, "ensure_sync"),
            patch.object(MODULE, "load_workflow_state", return_value={"blocked": {"active": False}, "delivery": {}}),
            patch.object(MODULE, "stage_manifest_state", side_effect=lambda slug, stage: closeout_initial if stage == "closeout" else healthy),
            patch.object(MODULE, "stage_drift_class", side_effect=lambda stage, state: "unhealthy-manifest" if stage == "closeout" else "healthy"),
            patch.object(MODULE, "stage_repairable", side_effect=lambda slug, stage, state: stage == "closeout"),
            patch.object(MODULE, "stage_review_inventory", return_value=([], [])),
            patch.object(MODULE, "command_checkpoint", return_value=1),
            patch.object(MODULE, "reconciliation_state", return_value=(True, "")),
            patch.object(MODULE, "recommended_next_action", return_value="deliver"),
            patch.object(MODULE, "stage_status_label", return_value="ok"),
            patch.object(MODULE, "trim_detail", side_effect=lambda s: s),
            redirect_stdout(io.StringIO()),
        ):
            result = MODULE.command_repair(args)

        self.assertEqual(result, 1, "expected repair to fail when closeout checkpoint returns non-zero")

    def test_repair_blocks_when_closeout_unhealthy_not_repairable(self) -> None:
        """unhealthy-manifest but not repairable: repair must return 1 without calling command_checkpoint."""
        checkpoint_calls: list[object] = []
        healthy = stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True)
        closeout_initial = stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=False)

        args = MODULE.argparse.Namespace(slug="test-slug")

        with (
            patch.object(MODULE, "ensure_sync"),
            patch.object(MODULE, "load_workflow_state", return_value={"blocked": {"active": False}, "delivery": {}}),
            patch.object(MODULE, "stage_manifest_state", side_effect=lambda slug, stage: closeout_initial if stage == "closeout" else healthy),
            patch.object(MODULE, "stage_drift_class", side_effect=lambda stage, state: "unhealthy-manifest" if stage == "closeout" else "healthy"),
            patch.object(MODULE, "stage_repairable", return_value=False),
            patch.object(MODULE, "stage_review_inventory", return_value=([], [])),
            patch.object(MODULE, "command_checkpoint", side_effect=lambda a: checkpoint_calls.append(a) or 0),
            patch.object(MODULE, "reconciliation_state", return_value=(True, "")),
            patch.object(MODULE, "recommended_next_action", return_value="deliver"),
            patch.object(MODULE, "stage_status_label", return_value="ok"),
            patch.object(MODULE, "trim_detail", side_effect=lambda s: s),
            redirect_stdout(io.StringIO()),
        ):
            result = MODULE.command_repair(args)

        self.assertEqual(result, 1, "expected repair to fail when closeout is unhealthy but not repairable")
        self.assertEqual(len(checkpoint_calls), 0, "command_checkpoint should not be called when closeout is not repairable")

    def test_repair_blocks_when_checkpoint_succeeds_but_closeout_remains_unhealthy(self) -> None:
        """command_checkpoint returns 0 but refreshed closeout is still unhealthy: repair must return 1."""
        healthy = stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True)
        closeout_initial = stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=False)
        closeout_still_unhealthy = stage_state(
            artifact_exists=True,
            artifact_meaningful=True,
            manifest_exists=True,
            healthy=False,
            detail="still broken after repair",
        )
        call_count: list[int] = [0]

        def fake_manifest_state(slug: str, stage: str) -> dict:
            if stage == "closeout":
                call_count[0] += 1
                # First call: initial state for the repair loop.
                # Second call: after checkpoint, refreshed state still unhealthy.
                return closeout_initial if call_count[0] == 1 else closeout_still_unhealthy
            return healthy

        args = MODULE.argparse.Namespace(slug="test-slug")

        with (
            patch.object(MODULE, "ensure_sync"),
            patch.object(MODULE, "load_workflow_state", return_value={"blocked": {"active": False}, "delivery": {}}),
            patch.object(MODULE, "stage_manifest_state", side_effect=fake_manifest_state),
            patch.object(MODULE, "stage_drift_class", side_effect=lambda stage, state: "unhealthy-manifest" if stage == "closeout" else "healthy"),
            patch.object(MODULE, "stage_repairable", side_effect=lambda slug, stage, state: stage == "closeout"),
            patch.object(MODULE, "stage_review_inventory", return_value=([], [])),
            patch.object(MODULE, "command_checkpoint", return_value=0),  # checkpoint "succeeds"
            patch.object(MODULE, "reconciliation_state", return_value=(True, "")),
            patch.object(MODULE, "recommended_next_action", return_value="deliver"),
            patch.object(MODULE, "stage_status_label", return_value="ok"),
            patch.object(MODULE, "trim_detail", side_effect=lambda s: s),
            redirect_stdout(io.StringIO()),
        ):
            result = MODULE.command_repair(args)

        self.assertEqual(result, 1, "expected repair to fail when closeout remains unhealthy even after checkpoint returns 0")

    def test_repair_skips_closeout_when_earlier_stage_blocked(self) -> None:
        """When an earlier stage (diff) fails and sets blocked_reason, the closeout repair must not run.

        This exercises the `if not blocked_reason:` guard that wraps the closeout block.
        """
        checkpoint_calls: list[object] = []
        healthy = stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=True)

        # diff is unhealthy + not repairable → will set blocked_reason during the main repair loop
        diff_unhealthy = stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=False)
        closeout_unhealthy = stage_state(artifact_exists=True, artifact_meaningful=True, manifest_exists=True, healthy=False)

        def fake_manifest_state(slug: str, stage: str) -> dict:
            if stage == "diff":
                return diff_unhealthy
            if stage == "closeout":
                return closeout_unhealthy
            return healthy

        def fake_drift(stage: str, state: object) -> str:
            if stage in {"diff", "closeout"}:
                return "unhealthy-manifest"
            return "healthy"

        def fake_repairable(slug: str, stage: str, state: object) -> bool:
            return False  # neither diff nor closeout is repairable

        args = MODULE.argparse.Namespace(slug="test-slug")

        with (
            patch.object(MODULE, "ensure_sync"),
            patch.object(MODULE, "load_workflow_state", return_value={"blocked": {"active": False}, "delivery": {}}),
            patch.object(MODULE, "stage_manifest_state", side_effect=fake_manifest_state),
            patch.object(MODULE, "stage_drift_class", side_effect=fake_drift),
            patch.object(MODULE, "stage_repairable", side_effect=fake_repairable),
            patch.object(MODULE, "stage_review_inventory", return_value=([], [])),
            patch.object(MODULE, "later_progress_exists", return_value=(False, "")),
            patch.object(MODULE, "command_checkpoint", side_effect=lambda a: checkpoint_calls.append(a) or 0),
            patch.object(MODULE, "reconciliation_state", return_value=(True, "")),
            patch.object(MODULE, "recommended_next_action", return_value="deliver"),
            patch.object(MODULE, "stage_status_label", return_value="ok"),
            patch.object(MODULE, "trim_detail", side_effect=lambda s: s),
            redirect_stdout(io.StringIO()),
        ):
            result = MODULE.command_repair(args)

        self.assertEqual(result, 1, "expected repair to fail due to diff being blocked")
        self.assertEqual(len(checkpoint_calls), 0, "command_checkpoint should not be called for closeout when earlier stage is blocked")


if __name__ == "__main__":
    unittest.main()
