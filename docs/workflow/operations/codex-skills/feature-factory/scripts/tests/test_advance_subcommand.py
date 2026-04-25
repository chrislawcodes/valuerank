import argparse
import contextlib
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch


SCRIPT_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPT_DIR / f"{name}.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


FACTORY_STATE = _load("factory_state")
ADVANCE = _load("factory_cmd_advance")
RUN_FACTORY = _load("run_factory")


SLUG = "advance-test"
FIXED_NOW = datetime(2026, 4, 24, 12, 34, 56, 789012)
FIXED_TS = FIXED_NOW.strftime("%Y%m%dT%H%M%S_%fZ")
FIXED_SHA = "deadbeef"


def _write_state(tmpdir: str) -> None:
    root = FACTORY_STATE.workflow_dir(SLUG)
    root.mkdir(parents=True, exist_ok=True)
    state = FACTORY_STATE._default_workflow_state()
    state["schema_version"] = 2
    state["stages"] = {}
    FACTORY_STATE.atomic_json_write(FACTORY_STATE.factory_state_path(SLUG), state)


def _read_state() -> dict:
    return json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))


class AdvanceSubcommandTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self._root_patch = patch.object(FACTORY_STATE, "FACTORY_RUNS_ROOT", Path(self._tmpdir.name))
        self._root_patch.start()
        self.addCleanup(self._root_patch.stop)
        _write_state(self._tmpdir.name)

    def _parser(self) -> argparse.ArgumentParser:
        return RUN_FACTORY.build_parser()

    def _run_command(self, reason: str, stage: str = "spec") -> tuple[int, str, str]:
        args = self._parser().parse_args([
            "advance",
            "--slug",
            SLUG,
            "--stage",
            stage,
            "--reason",
            reason,
        ])
        stdout = io.StringIO()
        stderr = io.StringIO()
        with patch.object(ADVANCE.subprocess, "run", return_value=subprocess.CompletedProcess(
            args=["git", "rev-parse", "HEAD"],
            returncode=0,
            stdout=FIXED_SHA + "\n",
            stderr="",
        )), patch.object(ADVANCE, "datetime") as datetime_mock, \
            contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            datetime_mock.utcnow.return_value = FIXED_NOW
            rc = args.func(args)
        return rc, stdout.getvalue(), stderr.getvalue()

    def test_happy_path_records_stage_and_annotation(self) -> None:
        rc, stdout, stderr = self._run_command("a meaningful reason for advance")

        self.assertEqual(rc, 0)
        self.assertEqual(stderr, "")
        self.assertIn("[workflow] ✓ advance (spec)", stdout)
        state = _read_state()
        self.assertEqual(state["stages"]["spec"]["judge_next_action"], "advance")
        self.assertEqual(state["annotations"][-1], {
            "stage": "spec",
            "ts": FIXED_TS,
            "reason": "a meaningful reason for advance",
            "head_sha": FIXED_SHA,
        })

    def test_reason_19_chars_rejects_without_mutation(self) -> None:
        before = _read_state()
        args = self._parser().parse_args([
            "advance",
            "--slug",
            SLUG,
            "--stage",
            "spec",
            "--reason",
            "abcdefghijklmnopqrs",
        ])
        with self.assertRaises(SystemExit) as ctx:
            with patch.object(ADVANCE.subprocess, "run", return_value=subprocess.CompletedProcess(
                args=["git", "rev-parse", "HEAD"],
                returncode=0,
                stdout=FIXED_SHA + "\n",
                stderr="",
            )), patch.object(ADVANCE, "datetime") as datetime_mock, \
                contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                datetime_mock.utcnow.return_value = FIXED_NOW
                args.func(args)

        self.assertEqual(ctx.exception.code, 2)
        after = _read_state()
        self.assertEqual(before, after)

    def test_reason_exactly_20_chars_passes(self) -> None:
        rc, _, _ = self._run_command("abcdefghijklmnopqrst")

        self.assertEqual(rc, 0)
        state = _read_state()
        self.assertEqual(state["stages"]["spec"]["judge_next_action"], "advance")
        self.assertEqual(state["annotations"][-1]["reason"], "abcdefghijklmnopqrst")

    def test_unknown_stage_rejected_by_argparse(self) -> None:
        before = _read_state()
        with self.assertRaises(SystemExit) as ctx:
            with contextlib.redirect_stderr(io.StringIO()):
                self._parser().parse_args([
                    "advance",
                    "--slug",
                    SLUG,
                    "--stage",
                    "bogus",
                    "--reason",
                    "a meaningful reason for advance",
                ])

        self.assertEqual(ctx.exception.code, 2)
        self.assertEqual(before, _read_state())

    def test_whitespace_trimmed_reason_below_minimum_rejects(self) -> None:
        before = _read_state()
        args = self._parser().parse_args([
            "advance",
            "--slug",
            SLUG,
            "--stage",
            "spec",
            "--reason",
            "abcdefghijklmnopqr   ",
        ])
        with self.assertRaises(SystemExit) as ctx:
            with patch.object(ADVANCE.subprocess, "run", return_value=subprocess.CompletedProcess(
                args=["git", "rev-parse", "HEAD"],
                returncode=0,
                stdout=FIXED_SHA + "\n",
                stderr="",
            )), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                args.func(args)

        self.assertEqual(ctx.exception.code, 2)
        self.assertEqual(before, _read_state())


if __name__ == "__main__":
    unittest.main()
