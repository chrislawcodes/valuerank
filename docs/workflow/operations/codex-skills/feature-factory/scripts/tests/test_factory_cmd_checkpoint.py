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

WORKFLOW_UTILS_SPEC = importlib.util.spec_from_file_location(
    "workflow_utils",
    Path(__file__).resolve().parents[3] / "review-lens" / "scripts" / "workflow_utils.py",
)
assert WORKFLOW_UTILS_SPEC and WORKFLOW_UTILS_SPEC.loader
WORKFLOW_UTILS = importlib.util.module_from_spec(WORKFLOW_UTILS_SPEC)
sys.modules[WORKFLOW_UTILS_SPEC.name] = WORKFLOW_UTILS
WORKFLOW_UTILS_SPEC.loader.exec_module(WORKFLOW_UTILS)


def _base_state() -> dict:
    state = FACTORY_STATE._default_workflow_state()
    state["schema_version"] = 2
    return state


def _spec_stage_state(adversarial_rounds: int) -> dict:
    return {
        "adversarial_rounds": adversarial_rounds,
        "annotations": [],
        "adversarial_sha_history": [],
        "initial_sha": "",
    }


def _write_workflow_state(tmpdir: str, stage_state: dict) -> Path:
    with patch.object(FACTORY_STATE, "FACTORY_RUNS_ROOT", Path(tmpdir)):
        workflow_root = FACTORY_STATE.workflow_dir("ff-checkpoint-test")
        workflow_root.mkdir(parents=True, exist_ok=True)
        artifact_path = workflow_root / "spec.md"
        artifact_path.write_text("# Spec\n\nMeaningful content for checkpoint tests.\n", encoding="utf-8")
        state = _base_state()
        state["stages"] = {"spec": stage_state}
        state["spec_adversarial_rounds"] = stage_state["adversarial_rounds"]
        FACTORY_STATE.atomic_json_write(FACTORY_STATE.factory_state_path("ff-checkpoint-test"), state)
        return artifact_path


def _args(json_flag: bool = False) -> argparse.Namespace:
    return argparse.Namespace(
        slug="ff-checkpoint-test",
        stage="spec",
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
        json=json_flag,
        fast=False,
    )


def _fake_stage_manifest_state(slug: str, stage: str) -> dict[str, object]:
    if stage == "spec":
        return {
            "artifact_path": Path("spec.md"),
            "artifact_exists": True,
            "artifact_meaningful": True,
            "manifest_path": Path("spec.checkpoint.json"),
            "manifest_exists": True,
            "healthy": True,
            "detail": "",
        }
    return {
        "artifact_path": Path(f"{stage}.md"),
        "artifact_exists": False,
        "artifact_meaningful": False,
        "manifest_path": Path(f"{stage}.checkpoint.json"),
        "manifest_exists": False,
        "healthy": False,
        "detail": "",
    }


class FactoryCheckpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        # Patch every loaded factory_state module instance so that lazy imports
        # inside record_command_telemetry (and similar) also see the tmpdir.
        self._patches: list = []
        for mod in list(gc.get_objects()):
            if not isinstance(mod, types.ModuleType):
                continue
            if getattr(mod, "__name__", "") != "factory_state":
                continue
            if not hasattr(mod, "FACTORY_RUNS_ROOT"):
                continue
            p = patch.object(mod, "FACTORY_RUNS_ROOT", Path(self._tmpdir.name))
            p.start()
            self._patches.append(p)
        self.addCleanup(lambda: [p.stop() for p in self._patches])

    def _prepare_state(self, adversarial_rounds: int) -> Path:
        return _write_workflow_state(self._tmpdir.name, _spec_stage_state(adversarial_rounds))

    def test_effective_auto_context_defaults_to_spec_and_tasks_only(self) -> None:
        def enabled(stage: str) -> bool:
            return CHECKPOINT._effective_auto_context(argparse.Namespace(
                stage=stage,
                auto_context=False,
                no_auto_context=False,
            ))

        self.assertTrue(enabled("spec"))
        self.assertTrue(enabled("tasks"))
        self.assertFalse(enabled("plan"))
        self.assertFalse(enabled("diff"))

    def test_effective_auto_context_flags_override_stage_defaults(self) -> None:
        self.assertTrue(CHECKPOINT._effective_auto_context(argparse.Namespace(
            stage="diff",
            auto_context=True,
            no_auto_context=False,
        )))
        self.assertFalse(CHECKPOINT._effective_auto_context(argparse.Namespace(
            stage="spec",
            auto_context=False,
            no_auto_context=True,
        )))

    def test_checkpoint_increments_adversarial_rounds_on_success(self) -> None:
        self._prepare_state(2)
        args = _args()
        fake_result = subprocess.CompletedProcess(args=["repair"], returncode=0, stdout="", stderr="")
        with patch.object(CHECKPOINT, "ensure_sync", return_value=None), \
            patch.object(CHECKPOINT, "revert_protected_files", return_value=[]), \
            patch.object(CHECKPOINT, "stage_manifest_state", side_effect=_fake_stage_manifest_state), \
            patch.object(CHECKPOINT, "reconciliation_state", return_value=(True, "")), \
            patch.object(CHECKPOINT, "_emit_next_action", return_value=None), \
            patch.object(CHECKPOINT.subprocess, "run", return_value=fake_result):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                rc = CHECKPOINT.command_checkpoint(args)

        self.assertEqual(rc, 0)
        persisted = json.loads(FACTORY_STATE.factory_state_path("ff-checkpoint-test").read_text(encoding="utf-8"))
        spec_state = persisted["stages"]["spec"]
        expected_sha = WORKFLOW_UTILS.normalized_artifact_hash("spec", FACTORY_STATE.workflow_dir("ff-checkpoint-test") / "spec.md")
        self.assertEqual(spec_state["adversarial_rounds"], 3)
        self.assertEqual(persisted["spec_adversarial_rounds"], 3)
        self.assertEqual(spec_state["initial_sha"], expected_sha)
        self.assertEqual(spec_state["adversarial_sha_history"], [expected_sha])

    def test_checkpoint_decrements_on_dispatch_failure(self) -> None:
        self._prepare_state(2)
        args = _args()
        with patch.object(CHECKPOINT, "ensure_sync", return_value=None), \
            patch.object(CHECKPOINT, "revert_protected_files", return_value=[]), \
            patch.object(CHECKPOINT, "stage_manifest_state", side_effect=_fake_stage_manifest_state), \
            patch.object(CHECKPOINT, "reconciliation_state", return_value=(True, "")), \
            patch.object(CHECKPOINT, "_emit_next_action", return_value=None), \
            patch.object(CHECKPOINT.subprocess, "run", side_effect=RuntimeError("dispatch failed")):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(RuntimeError):
                    CHECKPOINT.command_checkpoint(args)

        persisted = json.loads(FACTORY_STATE.factory_state_path("ff-checkpoint-test").read_text(encoding="utf-8"))
        spec_state = persisted["stages"]["spec"]
        self.assertEqual(spec_state["adversarial_rounds"], 2)
        self.assertEqual(persisted["spec_adversarial_rounds"], 2)

    def test_checkpoint_records_initial_sha_on_first_call_and_appends_to_adversarial_sha_history_thereafter(self) -> None:
        self._prepare_state(0)
        args = _args()
        first_result = subprocess.CompletedProcess(args=["repair"], returncode=0, stdout="", stderr="")
        with patch.object(CHECKPOINT, "ensure_sync", return_value=None), \
            patch.object(CHECKPOINT, "revert_protected_files", return_value=[]), \
            patch.object(CHECKPOINT, "stage_manifest_state", side_effect=_fake_stage_manifest_state), \
            patch.object(CHECKPOINT, "reconciliation_state", return_value=(True, "")), \
            patch.object(CHECKPOINT, "_emit_next_action", return_value=None), \
            patch.object(CHECKPOINT.subprocess, "run", return_value=first_result):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                rc = CHECKPOINT.command_checkpoint(args)

        self.assertEqual(rc, 0)
        first_sha = WORKFLOW_UTILS.normalized_artifact_hash("spec", FACTORY_STATE.workflow_dir("ff-checkpoint-test") / "spec.md")
        persisted = json.loads(FACTORY_STATE.factory_state_path("ff-checkpoint-test").read_text(encoding="utf-8"))
        self.assertEqual(persisted["stages"]["spec"]["initial_sha"], first_sha)
        self.assertEqual(persisted["stages"]["spec"]["adversarial_sha_history"], [first_sha])

        artifact_path = FACTORY_STATE.workflow_dir("ff-checkpoint-test") / "spec.md"
        artifact_path.write_text("# Spec\n\nMeaningful content for checkpoint tests, revised.\n", encoding="utf-8")
        second_result = subprocess.CompletedProcess(args=["repair"], returncode=0, stdout="", stderr="")
        with patch.object(CHECKPOINT, "ensure_sync", return_value=None), \
            patch.object(CHECKPOINT, "revert_protected_files", return_value=[]), \
            patch.object(CHECKPOINT, "stage_manifest_state", side_effect=_fake_stage_manifest_state), \
            patch.object(CHECKPOINT, "reconciliation_state", return_value=(True, "")), \
            patch.object(CHECKPOINT, "_emit_next_action", return_value=None), \
            patch.object(CHECKPOINT.subprocess, "run", return_value=second_result):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                rc = CHECKPOINT.command_checkpoint(args)

        self.assertEqual(rc, 0)
        second_sha = WORKFLOW_UTILS.normalized_artifact_hash("spec", artifact_path)
        persisted = json.loads(FACTORY_STATE.factory_state_path("ff-checkpoint-test").read_text(encoding="utf-8"))
        self.assertEqual(persisted["stages"]["spec"]["initial_sha"], first_sha)
        self.assertEqual(persisted["stages"]["spec"]["adversarial_sha_history"], [first_sha, second_sha])


if __name__ == "__main__":
    unittest.main()
