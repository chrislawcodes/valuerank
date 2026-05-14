"""Tests for the ff-state-consistency fix.

Verifies that:
1. Checkpoint + status (no edit) → stage is reported done.
2. Checkpoint + edit artifact + status → stage falls through to live verify
   (stored sha != current hash → unhealthy when verify fails).
3. Checkpoint + reconcile-style append to plan.md + status → plan is STILL
   done because normalized_artifact_hash strips the reconciliation section.
4. tasks.md with plain bullets (no checkboxes) → loud SystemExit error.
5. tasks.md with proper - [ ] checkboxes → parses normally, no error.
"""
import argparse
import contextlib
import gc
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

SCRIPT_DIR = Path(__file__).resolve().parents[1]

# Load factory_state
_state_spec = importlib.util.spec_from_file_location(
    "factory_state", SCRIPT_DIR / "factory_state.py"
)
assert _state_spec and _state_spec.loader
FACTORY_STATE = importlib.util.module_from_spec(_state_spec)
sys.modules[_state_spec.name] = FACTORY_STATE
_state_spec.loader.exec_module(FACTORY_STATE)

# Load workflow_utils
_wu_spec = importlib.util.spec_from_file_location(
    "workflow_utils",
    Path(__file__).resolve().parents[3] / "review-lens" / "scripts" / "workflow_utils.py",
)
assert _wu_spec and _wu_spec.loader
WORKFLOW_UTILS = importlib.util.module_from_spec(_wu_spec)
sys.modules[_wu_spec.name] = WORKFLOW_UTILS
_wu_spec.loader.exec_module(WORKFLOW_UTILS)

# Load factory_stages
_stages_spec = importlib.util.spec_from_file_location(
    "factory_stages", SCRIPT_DIR / "factory_stages.py"
)
assert _stages_spec and _stages_spec.loader
FACTORY_STAGES = importlib.util.module_from_spec(_stages_spec)
sys.modules[_stages_spec.name] = FACTORY_STAGES
_stages_spec.loader.exec_module(FACTORY_STAGES)

# Load factory_cmd_checkpoint
_cp_spec = importlib.util.spec_from_file_location(
    "factory_cmd_checkpoint", SCRIPT_DIR / "factory_cmd_checkpoint.py"
)
assert _cp_spec and _cp_spec.loader
CHECKPOINT = importlib.util.module_from_spec(_cp_spec)
sys.modules[_cp_spec.name] = CHECKPOINT
_cp_spec.loader.exec_module(CHECKPOINT)


SLUG = "ff-state-consistency-test"


def _patch_all_factory_state_roots(tmpdir: Path) -> list:
    """Return started patches for every loaded factory_state module instance."""
    patches = []
    for mod in list(gc.get_objects()):
        if not isinstance(mod, types.ModuleType):
            continue
        if getattr(mod, "__name__", "") != "factory_state":
            continue
        if not hasattr(mod, "FACTORY_RUNS_ROOT"):
            continue
        p = patch.object(mod, "FACTORY_RUNS_ROOT", tmpdir)
        p.start()
        patches.append(p)
    return patches


def _build_workflow_dir(tmpdir: Path, slug: str = SLUG) -> Path:
    wdir = FACTORY_STATE.workflow_dir(slug)
    wdir.mkdir(parents=True, exist_ok=True)
    reviews = FACTORY_STATE.reviews_dir(slug)
    reviews.mkdir(parents=True, exist_ok=True)
    return wdir


def _write_state(tmpdir: Path, slug: str = SLUG, extra: dict | None = None) -> None:
    state = FACTORY_STATE._default_workflow_state()
    state["schema_version"] = 2
    if extra:
        state.update(extra)
    FACTORY_STATE.atomic_json_write(FACTORY_STATE.factory_state_path(slug), state)


def _args(stage: str = "spec", artifact: str | None = None) -> argparse.Namespace:
    return argparse.Namespace(
        slug=SLUG,
        stage=stage,
        artifact=artifact,
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


def _fake_stage_manifest_state_healthy(slug: str, stage: str) -> dict:
    return {
        "artifact_path": Path(f"{stage}.md"),
        "artifact_exists": True,
        "artifact_meaningful": True,
        "manifest_path": Path(f"{stage}.checkpoint.json"),
        "manifest_exists": True,
        "healthy": True,
        "detail": "",
    }


def _run_checkpoint_success(wdir: Path, stage: str = "spec", artifact_content: str | None = None) -> int:
    """Run command_checkpoint with the repair subprocess stubbed to succeed.

    prerequisite_failure is patched to None so tests don't need to set up
    prior-stage state files.  parallel_analysis is patched on the state
    module so the tasks-stage guard doesn't fire.
    """
    artifact_path = wdir / f"{stage}.md"
    if artifact_content is not None:
        artifact_path.write_text(artifact_content, encoding="utf-8")
    elif not artifact_path.exists():
        artifact_path.write_text(f"# {stage.capitalize()}\n\nMeaningful content.\n", encoding="utf-8")

    args = _args(stage=stage, artifact=str(artifact_path))
    fake_result = subprocess.CompletedProcess(args=["repair"], returncode=0, stdout="", stderr="")
    # Ensure parallel_analysis is marked reviewed so the tasks guard doesn't block.
    with patch.object(CHECKPOINT, "ensure_sync", return_value=None), \
         patch.object(CHECKPOINT, "revert_protected_files", return_value=[]), \
         patch.object(CHECKPOINT, "stage_manifest_state", side_effect=_fake_stage_manifest_state_healthy), \
         patch.object(CHECKPOINT, "reconciliation_state", return_value=(True, "")), \
         patch.object(CHECKPOINT, "_emit_next_action", return_value=None), \
         patch.object(CHECKPOINT, "prerequisite_failure", return_value=None), \
         patch.object(CHECKPOINT.subprocess, "run", return_value=fake_result):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            rc = CHECKPOINT.command_checkpoint(args)
    return rc


class TestCompletedArtifactShaPersisted(unittest.TestCase):
    """Test 1: checkpoint persists completed_artifact_sha so status trusts it."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self._patches = _patch_all_factory_state_roots(Path(self._tmpdir.name))
        self.addCleanup(lambda: [p.stop() for p in self._patches])
        self._wdir = _build_workflow_dir(Path(self._tmpdir.name))
        _write_state(Path(self._tmpdir.name))

    def test_checkpoint_then_status_no_edit_reports_done(self) -> None:
        """After a successful checkpoint, stage_manifest_state returns healthy=True
        without invoking the live verify subprocess."""
        artifact_path = self._wdir / "spec.md"
        artifact_path.write_text("# Spec\n\nMeaningful content.\n", encoding="utf-8")
        rc = _run_checkpoint_success(self._wdir, stage="spec")
        self.assertEqual(rc, 0)

        # Confirm completed_artifact_sha was persisted.
        persisted = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
        stored_sha = persisted["stages"]["spec"]["completed_artifact_sha"]
        expected_sha = WORKFLOW_UTILS.normalized_artifact_hash("spec", artifact_path)
        self.assertEqual(stored_sha, expected_sha)

        # stage_manifest_state should return healthy without calling the live verify.
        # Patch verify_checkpoint_manifest to raise if called — it must NOT be called.
        with patch.object(FACTORY_STAGES, "verify_checkpoint_manifest",
                          side_effect=AssertionError("verify should not be called")) as mock_verify:
            # We need a manifest file to exist so stage_manifest_state doesn't short-circuit.
            manifest_path = FACTORY_STATE.checkpoint_manifest_path(SLUG, "spec")
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            manifest_path.write_text(
                json.dumps({"stage": "spec", "required_reviews": []}), encoding="utf-8"
            )
            result = FACTORY_STAGES.stage_manifest_state(SLUG, "spec")

        self.assertTrue(result["healthy"], "stage_manifest_state should report healthy")
        mock_verify.assert_not_called()


class TestArtifactEditFallsThrough(unittest.TestCase):
    """Test 2: checkpoint then edit artifact then status → live verify is called (hash drift)."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self._patches = _patch_all_factory_state_roots(Path(self._tmpdir.name))
        self.addCleanup(lambda: [p.stop() for p in self._patches])
        self._wdir = _build_workflow_dir(Path(self._tmpdir.name))
        _write_state(Path(self._tmpdir.name))

    def test_checkpoint_then_edit_then_status_falls_through_to_live_verify(self) -> None:
        """After checkpointing, editing the artifact changes the hash.  status should
        fall through to verify_checkpoint_manifest (not trust the stale stored sha)."""
        artifact_path = self._wdir / "spec.md"
        artifact_path.write_text("# Spec\n\nOriginal content.\n", encoding="utf-8")
        rc = _run_checkpoint_success(self._wdir, stage="spec")
        self.assertEqual(rc, 0)

        # Edit the artifact — simulates operator making a real change post-checkpoint.
        artifact_path.write_text("# Spec\n\nCompletely different content after edit.\n", encoding="utf-8")

        # Now stage_manifest_state must fall through to verify_checkpoint_manifest
        # because the stored sha no longer matches.
        manifest_path = FACTORY_STATE.checkpoint_manifest_path(SLUG, "spec")
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
            json.dumps({"stage": "spec", "required_reviews": []}), encoding="utf-8"
        )

        verify_called = []
        def _fake_verify(mp):
            verify_called.append(mp)
            return False, "artifact hash mismatch"

        with patch.object(FACTORY_STAGES, "verify_checkpoint_manifest", side_effect=_fake_verify):
            result = FACTORY_STAGES.stage_manifest_state(SLUG, "spec")

        self.assertFalse(result["healthy"], "Edited artifact should not be trusted as healthy")
        self.assertEqual(len(verify_called), 1, "verify_checkpoint_manifest must be called on hash drift")


class TestPlanReconcileAppendStillHealthy(unittest.TestCase):
    """Test 3: reconcile-style append to plan.md still reports plan done.

    normalized_artifact_hash strips the ## Review Reconciliation section, so
    an append by the reconcile command does not change the hash.
    """

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self._patches = _patch_all_factory_state_roots(Path(self._tmpdir.name))
        self.addCleanup(lambda: [p.stop() for p in self._patches])
        self._wdir = _build_workflow_dir(Path(self._tmpdir.name))
        _write_state(Path(self._tmpdir.name))

    def test_reconcile_append_to_plan_does_not_invalidate_checkpoint(self) -> None:
        """Appending a ## Review Reconciliation section to plan.md must not
        change the normalized hash, so stage_manifest_state stays healthy."""
        plan_content = (
            "# Plan\n\n"
            "## Overview\n\nImplement the feature.\n\n"
            "## Implementation Steps\n\n- Step A\n- Step B\n"
        )
        artifact_path = self._wdir / "plan.md"
        artifact_path.write_text(plan_content, encoding="utf-8")
        rc = _run_checkpoint_success(self._wdir, stage="plan")
        self.assertEqual(rc, 0)

        # Simulate reconcile appending the reconciliation section.
        reconciled_content = (
            plan_content
            + "\n## Review Reconciliation\n\n"
            + "- Finding X addressed: changed Step A to include validation.\n"
        )
        artifact_path.write_text(reconciled_content, encoding="utf-8")

        # Confirm normalized hashes still match (the reconciliation section is stripped).
        original_sha = WORKFLOW_UTILS.normalized_artifact_hash("plan", artifact_path)
        plain_path = artifact_path.with_suffix(".plain.md")
        plain_path.write_text(plan_content, encoding="utf-8")
        plain_sha = WORKFLOW_UTILS.normalized_artifact_hash("plan", plain_path)
        self.assertEqual(original_sha, plain_sha, "Reconciliation section should be stripped by normalized_artifact_hash")
        plain_path.unlink()

        # stage_manifest_state should NOT call verify_checkpoint_manifest.
        manifest_path = FACTORY_STATE.checkpoint_manifest_path(SLUG, "plan")
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
            json.dumps({"stage": "plan", "required_reviews": []}), encoding="utf-8"
        )

        with patch.object(FACTORY_STAGES, "verify_checkpoint_manifest",
                          side_effect=AssertionError("verify should not be called for reconcile append")) as mock_verify:
            result = FACTORY_STAGES.stage_manifest_state(SLUG, "plan")

        self.assertTrue(result["healthy"], "plan stage should still be healthy after reconcile append")
        mock_verify.assert_not_called()


class TestTasksPlainBulletGuard(unittest.TestCase):
    """Tests 4 & 5: tasks.md checkbox guard."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self._patches = _patch_all_factory_state_roots(Path(self._tmpdir.name))
        self.addCleanup(lambda: [p.stop() for p in self._patches])
        self._wdir = _build_workflow_dir(Path(self._tmpdir.name))
        _write_state(Path(self._tmpdir.name))

    def _run_tasks_checkpoint(self, tasks_content: str) -> tuple[int | None, str]:
        """Run checkpoint --stage tasks, return (rc_or_None, exit_message_or_stderr).
        rc is None if SystemExit was raised."""
        artifact_path = self._wdir / "tasks.md"
        artifact_path.write_text(tasks_content, encoding="utf-8")
        args = _args(stage="tasks", artifact=str(artifact_path))
        args.no_auto_context = True
        fake_result = subprocess.CompletedProcess(args=["repair"], returncode=0, stdout="", stderr="")
        stderr_buf = io.StringIO()
        rc: int | None = None
        exit_msg: str = ""
        try:
            with patch.object(CHECKPOINT, "ensure_sync", return_value=None), \
                 patch.object(CHECKPOINT, "revert_protected_files", return_value=[]), \
                 patch.object(CHECKPOINT, "stage_manifest_state", side_effect=_fake_stage_manifest_state_healthy), \
                 patch.object(CHECKPOINT, "reconciliation_state", return_value=(True, "")), \
                 patch.object(CHECKPOINT, "_emit_next_action", return_value=None), \
                 patch.object(CHECKPOINT, "prerequisite_failure", return_value=None), \
                 patch.object(CHECKPOINT, "load_workflow_state",
                              return_value={"parallel_analysis": {"reviewed": True}}), \
                 patch.object(CHECKPOINT.subprocess, "run", return_value=fake_result):
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(stderr_buf):
                    rc = CHECKPOINT.command_checkpoint(args)
        except SystemExit as exc:
            exit_msg = str(exc)
            rc = None
        return rc, exit_msg or stderr_buf.getvalue()

    def test_plain_bullets_no_checkboxes_raises_loud_error(self) -> None:
        """tasks.md with plain bullets but no - [ ] lines must raise SystemExit with a clear message."""
        tasks_content = (
            "# Tasks\n\n"
            "- Implement feature A\n"
            "- Write unit tests\n"
            "- Update docs\n"
        )
        rc, output = self._run_tasks_checkpoint(tasks_content)
        self.assertIsNone(rc, "Expected SystemExit for plain-bullet tasks.md")
        self.assertIn("checkbox-style tasks", output)
        self.assertIn("plain bullets", output)

    def test_proper_checkboxes_parse_normally(self) -> None:
        """tasks.md with - [ ] checkboxes must not raise and checkpoint should succeed."""
        tasks_content = (
            "# Tasks\n\n"
            "## Slice 1\n\n"
            "- [ ] Implement feature A [CHECKPOINT]\n"
            "- [ ] Write unit tests\n"
            "- [x] Update docs\n"
        )
        # Also need parallel_analysis reviewed for tasks stage prereq.
        state = FACTORY_STATE._default_workflow_state()
        state["schema_version"] = 2
        state["parallel_analysis"] = {"reviewed": True}
        FACTORY_STATE.atomic_json_write(FACTORY_STATE.factory_state_path(SLUG), state)

        rc, output = self._run_tasks_checkpoint(tasks_content)
        self.assertEqual(rc, 0, f"Expected success for proper checkbox tasks.md, got: {output}")


if __name__ == "__main__":
    unittest.main()
