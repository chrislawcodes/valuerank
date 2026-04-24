import argparse
import contextlib
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT_DIR = Path(__file__).resolve().parents[1]

STATE_SPEC = importlib.util.spec_from_file_location(
    "factory_state",
    SCRIPT_DIR / "factory_state.py",
)
assert STATE_SPEC and STATE_SPEC.loader
FACTORY_STATE = importlib.util.module_from_spec(STATE_SPEC)
sys.modules[STATE_SPEC.name] = FACTORY_STATE
STATE_SPEC.loader.exec_module(FACTORY_STATE)

CHECKPOINT_SPEC = importlib.util.spec_from_file_location(
    "factory_cmd_checkpoint",
    SCRIPT_DIR / "factory_cmd_checkpoint.py",
)
assert CHECKPOINT_SPEC and CHECKPOINT_SPEC.loader
CHECKPOINT = importlib.util.module_from_spec(CHECKPOINT_SPEC)
sys.modules[CHECKPOINT_SPEC.name] = CHECKPOINT
CHECKPOINT_SPEC.loader.exec_module(CHECKPOINT)


SLUG = "concern-lifecycle-cli"


def _base_state() -> dict:
    state = FACTORY_STATE._default_workflow_state()
    state["schema_version"] = 2
    return state


def _concern(
    concern_id: str,
    *,
    stage: str = "spec",
    reasoning: str = "reasoning text for concern lifecycle tests",
    addressed_at: int | None = None,
    addressed_by: str | None = None,
    deferred_reason: str | None = None,
    dismissed_reason: str | None = None,
) -> dict[str, object]:
    return {
        "id": concern_id,
        "stage": stage,
        "judge": "codex",
        "model": "gpt-5.4",
        "confidence": "high",
        "reasoning": reasoning,
        "round_raised": 3,
        "also_raised_in_round": [],
        "addressed_at": addressed_at,
        "addressed_by": addressed_by,
        "deferred_reason": deferred_reason,
        "dismissed_reason": dismissed_reason,
    }


def _args(stage: str, **overrides: object) -> argparse.Namespace:
    base = dict(
        slug=SLUG,
        stage=stage,
        address=None,
        defer=None,
        dismiss=None,
        evidence=None,
        reason=None,
        artifact=None,
        base_ref=None,
        context=[],
        path=[],
        extra_gemini_lens=[],
        sensitive=False,
        large_structural=False,
        performance_sensitive=False,
        use_existing_artifact=False,
        no_auto_context=True,
        allow_dirty_path=[],
        max_artifact_chars=50000,
        max_context_chars=100000,
        max_total_chars=180000,
        gemini_timeout_seconds=120,
        gemini_retries=1,
        repair_timeout_seconds=300,
        allow_large_diff_rerun=False,
        fallback=False,
        json=False,
        fast=False,
    )
    base.update(overrides)
    return argparse.Namespace(**base)


class ConcernLifecycleCliTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self._root_patch = patch.object(FACTORY_STATE, "FACTORY_RUNS_ROOT", Path(self._tmpdir.name))
        self._root_patch.start()
        self.addCleanup(self._root_patch.stop)

    def _write_state(self, stages: dict[str, dict], *, write_plan_artifact: bool = False) -> None:
        workflow_root = FACTORY_STATE.workflow_dir(SLUG)
        workflow_root.mkdir(parents=True, exist_ok=True)
        if write_plan_artifact:
            (workflow_root / "plan.md").write_text("# Plan\n\nMeaningful content.\n", encoding="utf-8")
        state = _base_state()
        state["stages"] = stages
        FACTORY_STATE.atomic_json_write(FACTORY_STATE.factory_state_path(SLUG), state)

    def _fake_stage_manifest_state(self, slug: str, stage: str) -> dict[str, object]:
        healthy_stages = {"spec", "plan"}
        return {
            "artifact_path": Path(f"{stage}.md"),
            "artifact_exists": stage in healthy_stages,
            "artifact_meaningful": stage in healthy_stages,
            "manifest_path": Path(f"{stage}.checkpoint.json"),
            "manifest_exists": stage in healthy_stages,
            "healthy": stage in healthy_stages,
            "detail": "",
        }

    def test_address_sets_addressed_at_and_addressed_by(self) -> None:
        concern = _concern("concern-1")
        self._write_state({"spec": {"unresolved_concerns": [concern]}})
        args = _args("spec", address="concern-1", evidence="fixed in commit abc")

        with patch.object(CHECKPOINT, "ensure_sync", return_value=None), \
            patch.object(CHECKPOINT.subprocess, "run") as run_mock:
            with contextlib.redirect_stdout(io.StringIO()) as stdout, contextlib.redirect_stderr(io.StringIO()):
                rc = CHECKPOINT.command_checkpoint(args)

        self.assertEqual(rc, 0)
        run_mock.assert_not_called()
        self.assertEqual(stdout.getvalue().strip(), "✓ concern concern-1 marked addressed")
        persisted = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
        updated = persisted["stages"]["spec"]["unresolved_concerns"][0]
        self.assertIsInstance(updated["addressed_at"], int)
        self.assertGreater(updated["addressed_at"], 0)
        self.assertEqual(updated["addressed_by"], "fixed in commit abc")

    def test_defer_sets_deferred_reason(self) -> None:
        concern = _concern("concern-2")
        self._write_state({"spec": {"unresolved_concerns": [concern]}})
        args = _args("spec", defer="concern-2", reason="follow-up")

        with patch.object(CHECKPOINT, "ensure_sync", return_value=None), \
            patch.object(CHECKPOINT.subprocess, "run") as run_mock:
            with contextlib.redirect_stdout(io.StringIO()) as stdout, contextlib.redirect_stderr(io.StringIO()):
                rc = CHECKPOINT.command_checkpoint(args)

        self.assertEqual(rc, 0)
        run_mock.assert_not_called()
        self.assertEqual(stdout.getvalue().strip(), "✓ concern concern-2 marked deferred")
        persisted = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
        updated = persisted["stages"]["spec"]["unresolved_concerns"][0]
        self.assertEqual(updated["deferred_reason"], "follow-up")

    def test_dismiss_sets_dismissed_reason(self) -> None:
        concern = _concern("concern-3")
        self._write_state({"spec": {"unresolved_concerns": [concern]}})
        args = _args("spec", dismiss="concern-3", reason="reviewer error")

        with patch.object(CHECKPOINT, "ensure_sync", return_value=None), \
            patch.object(CHECKPOINT.subprocess, "run") as run_mock:
            with contextlib.redirect_stdout(io.StringIO()) as stdout, contextlib.redirect_stderr(io.StringIO()):
                rc = CHECKPOINT.command_checkpoint(args)

        self.assertEqual(rc, 0)
        run_mock.assert_not_called()
        self.assertEqual(stdout.getvalue().strip(), "✓ concern concern-3 marked dismissed")
        persisted = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
        updated = persisted["stages"]["spec"]["unresolved_concerns"][0]
        self.assertEqual(updated["dismissed_reason"], "reviewer error")

    def test_address_without_evidence_returns_exit_2(self) -> None:
        concern = _concern("concern-4")
        self._write_state({"spec": {"unresolved_concerns": [concern]}})
        args = _args("spec", address="concern-4")

        with patch.object(CHECKPOINT, "ensure_sync", return_value=None):
            with contextlib.redirect_stdout(io.StringIO()) as stdout, contextlib.redirect_stderr(io.StringIO()) as stderr:
                rc = CHECKPOINT.command_checkpoint(args)

        self.assertEqual(rc, 2)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("--address requires --evidence TEXT", stderr.getvalue())

    def test_defer_without_reason_returns_exit_2(self) -> None:
        concern = _concern("concern-5")
        self._write_state({"spec": {"unresolved_concerns": [concern]}})
        args = _args("spec", defer="concern-5")

        with patch.object(CHECKPOINT, "ensure_sync", return_value=None):
            with contextlib.redirect_stdout(io.StringIO()) as stdout, contextlib.redirect_stderr(io.StringIO()) as stderr:
                rc = CHECKPOINT.command_checkpoint(args)

        self.assertEqual(rc, 2)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("--defer requires --reason TEXT", stderr.getvalue())

    def test_nonexistent_concern_id_returns_exit_2(self) -> None:
        concern = _concern("concern-6")
        self._write_state({"spec": {"unresolved_concerns": [concern]}})
        args = _args("spec", dismiss="missing-id", reason="reviewer error")

        with patch.object(CHECKPOINT, "ensure_sync", return_value=None):
            with contextlib.redirect_stdout(io.StringIO()) as stdout, contextlib.redirect_stderr(io.StringIO()) as stderr:
                rc = CHECKPOINT.command_checkpoint(args)

        self.assertEqual(rc, 2)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("concern id missing-id not found in any stage", stderr.getvalue())

    def test_next_stage_blocked_by_open_prior_stage_concerns(self) -> None:
        open_concern = _concern("open-1", reasoning="Open concern that should block the next checkpoint.")
        resolved_concern = _concern(
            "resolved-1",
            addressed_at=123,
            addressed_by="fixed in commit abc",
        )
        self._write_state(
            {
                "spec": {
                    "unresolved_concerns": [open_concern, resolved_concern],
                },
            }
        )
        args = _args("plan")

        with patch.object(CHECKPOINT, "ensure_sync", return_value=None), \
            patch.object(CHECKPOINT, "prerequisite_failure", return_value=None), \
            patch.object(CHECKPOINT.subprocess, "run") as run_mock:
            with contextlib.redirect_stdout(io.StringIO()) as stdout, contextlib.redirect_stderr(io.StringIO()) as stderr:
                rc = CHECKPOINT.command_checkpoint(args)

        self.assertEqual(rc, 2)
        run_mock.assert_not_called()
        self.assertEqual(stdout.getvalue(), "")
        stderr_text = stderr.getvalue()
        self.assertIn("blocked: unresolved-concerns-from-spec", stderr_text)
        self.assertIn("open-1", stderr_text)
        self.assertIn("checkpoint --address open-1 --evidence", stderr_text)
        self.assertNotIn("resolved-1", stderr_text)

    def test_next_stage_proceeds_when_prior_concerns_are_resolved(self) -> None:
        addressed = _concern(
            "resolved-addressed",
            addressed_at=123,
            addressed_by="fixed in commit abc",
        )
        deferred = _concern(
            "resolved-deferred",
            deferred_reason="follow-up",
        )
        dismissed = _concern(
            "resolved-dismissed",
            dismissed_reason="reviewer error",
        )
        self._write_state(
            {
                "spec": {
                    "unresolved_concerns": [addressed, deferred, dismissed],
                },
            },
            write_plan_artifact=True,
        )
        args = _args("plan")
        fake_result = subprocess.CompletedProcess(args=["repair"], returncode=0, stdout="", stderr="")

        with patch.object(CHECKPOINT, "ensure_sync", return_value=None), \
            patch.object(CHECKPOINT, "prerequisite_failure", return_value=None), \
            patch.object(CHECKPOINT, "stage_manifest_state", side_effect=self._fake_stage_manifest_state), \
            patch.object(CHECKPOINT, "reconciliation_state", return_value=(True, "")), \
            patch.object(CHECKPOINT, "revert_protected_files", return_value=[]), \
            patch.object(CHECKPOINT, "_emit_next_action", return_value=None), \
            patch.object(CHECKPOINT.subprocess, "run", return_value=fake_result) as run_mock:
            with contextlib.redirect_stdout(io.StringIO()) as stdout, contextlib.redirect_stderr(io.StringIO()):
                rc = CHECKPOINT.command_checkpoint(args)

        self.assertEqual(rc, 0)
        self.assertGreater(run_mock.call_count, 0)
        self.assertEqual(stdout.getvalue(), "")


if __name__ == "__main__":
    unittest.main()
