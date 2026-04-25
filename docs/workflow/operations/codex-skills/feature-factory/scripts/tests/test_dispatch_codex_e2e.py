import argparse
import contextlib
import importlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import factory_cmd_dispatch
import factory_deliver
import factory_state
import run_factory


_REAL_POPEN = subprocess.Popen
_REAL_RUN = subprocess.run

SLUG = "dispatch-e2e"
DEFAULT_MODEL = "gpt-5.4-mini"
DEFAULT_PROMPT = "Dispatch Codex on this prompt."


class DispatchCodexE2ETests(unittest.TestCase):
    def setUp(self) -> None:
        global factory_cmd_dispatch, factory_deliver, factory_state, run_factory
        factory_cmd_dispatch = importlib.import_module("factory_cmd_dispatch")
        factory_deliver = importlib.import_module("factory_deliver")
        factory_state = importlib.import_module("factory_state")
        run_factory = importlib.import_module("run_factory")

        self.repo_dir_obj = tempfile.TemporaryDirectory()
        self.repo_dir = Path(self.repo_dir_obj.name)
        self.runs_root_obj = tempfile.TemporaryDirectory()
        self.runs_root = Path(self.runs_root_obj.name)
        self.addCleanup(self.repo_dir_obj.cleanup)
        self.addCleanup(self.runs_root_obj.cleanup)
        self._old_cwd = Path.cwd()
        os.chdir(self.repo_dir)
        self.addCleanup(lambda: os.chdir(self._old_cwd))

        init_result = subprocess.run(
            ["git", "init", "-b", "main"],
            cwd=self.repo_dir,
            capture_output=True,
            text=True,
        )
        if init_result.returncode != 0:
            subprocess.run(["git", "init"], cwd=self.repo_dir, check=True, capture_output=True, text=True)
            subprocess.run(
                ["git", "symbolic-ref", "HEAD", "refs/heads/main"],
                cwd=self.repo_dir,
                check=True,
                capture_output=True,
                text=True,
            )
        subprocess.run(["git", "config", "user.name", "Test"], cwd=self.repo_dir, check=True, capture_output=True, text=True)
        subprocess.run(
            ["git", "config", "user.email", "test@example.com"],
            cwd=self.repo_dir,
            check=True,
            capture_output=True,
            text=True,
        )
        (self.repo_dir / "README.md").write_text("baseline\n", encoding="utf-8")
        subprocess.run(["git", "add", "README.md"], cwd=self.repo_dir, check=True, capture_output=True, text=True)
        subprocess.run(["git", "commit", "-m", "baseline"], cwd=self.repo_dir, check=True, capture_output=True, text=True)
        subprocess.run(
            ["git", "update-ref", "refs/remotes/origin/main", "HEAD"],
            cwd=self.repo_dir,
            check=True,
            capture_output=True,
            text=True,
        )
        self.base_sha = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=self.repo_dir,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()

        self.slug = SLUG
        slug_root = self.runs_root / self.slug
        slug_root.mkdir(parents=True, exist_ok=True)
        (slug_root / "reviews").mkdir(exist_ok=True)

        self._runs_root_patch = mock.patch.object(factory_state, "FACTORY_RUNS_ROOT", self.runs_root)
        self._runs_root_patch.start()
        self.addCleanup(self._runs_root_patch.stop)

        for module, attr in (
            (factory_state, "REPO_ROOT"),
            (factory_deliver, "REPO_ROOT"),
        ):
            patcher = mock.patch.object(module, attr, self.repo_dir)
            patcher.start()
            self.addCleanup(patcher.stop)

        factory_state.update_workflow_state(self.slug, lambda state: state.setdefault("codex_dispatches", []))
        state_after_init = factory_state.load_workflow_state(self.slug)
        self.assertIn("stages", state_after_init)
        self.assertIn("codex_dispatches", state_after_init)

        self.codex_path = self.repo_dir / ".bin" / "codex"
        self.codex_path.parent.mkdir(parents=True, exist_ok=True)
        self.codex_path.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        self.codex_path.chmod(0o755)
        which_patcher = mock.patch.object(factory_cmd_dispatch.shutil, "which", return_value=str(self.codex_path))
        which_patcher.start()
        self.addCleanup(which_patcher.stop)

    def _dispatch_args(self, prompt_path: Path) -> argparse.Namespace:
        return run_factory.build_parser().parse_args(
            [
                "dispatch-codex",
                "--slug",
                self.slug,
                "--prompt-path",
                str(prompt_path),
                "--model",
                DEFAULT_MODEL,
            ]
        )

    def _read_state(self) -> dict:
        return json.loads(factory_state.factory_state_path(self.slug).read_text(encoding="utf-8"))

    def _current_head_sha(self) -> str:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=self.repo_dir,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()

    def _simulate_codex_writing(self, n_lines: int) -> None:
        target = self.repo_dir / "feature.py"
        existing = target.read_text(encoding="utf-8") if target.exists() else ""
        if existing and not existing.endswith("\n"):
            existing += "\n"
        new_content = existing + "\n".join(f"x{i} = {i}" for i in range(n_lines)) + "\n"
        target.write_text(new_content, encoding="utf-8")
        subprocess.run(["git", "add", "."], cwd=self.repo_dir, check=True, capture_output=True, text=True)
        subprocess.run(
            ["git", "commit", "-m", f"add {n_lines} lines"],
            cwd=self.repo_dir,
            check=True,
            capture_output=True,
            text=True,
        )

    def _argv_scoped_popen(self, n_lines_codex_writes: int = 500, returncode: int = 0):
        captured_real = _REAL_POPEN
        test = self

        class FakePopen:
            def __init__(self, *args, **kwargs):
                argv = args[0] if args else kwargs.get("args")
                if isinstance(argv, (list, tuple)):
                    argv_list = list(argv)
                elif argv is None:
                    argv_list = []
                else:
                    argv_list = [argv]
                self.args = argv_list
                if argv_list and argv_list[0] == str(test.codex_path):
                    # Always simulate the Codex write so the post-dispatch
                    # freshness path sees a real code delta, even when we force
                    # a non-zero exit for the record.
                    test._simulate_codex_writing(n_lines_codex_writes)
                    self._is_mock = True
                    self._returncode = returncode
                    self._stdout = ""
                    self._stderr = ""
                    self._real = None
                else:
                    self._is_mock = False
                    self._real = captured_real(*args, **kwargs)

            def communicate(self, input=None, timeout=None):
                if self._is_mock:
                    return (self._stdout, self._stderr)
                return self._real.communicate(input=input, timeout=timeout)

            def poll(self):
                if self._is_mock:
                    return self._returncode
                return self._real.poll()

            @property
            def returncode(self):
                if self._is_mock:
                    return self._returncode
                return self._real.returncode

            @property
            def pid(self):
                if self._is_mock:
                    return 99999
                return self._real.pid

            def wait(self, timeout=None):
                if self._is_mock:
                    return self._returncode
                return self._real.wait(timeout=timeout)

            def kill(self):
                if not self._is_mock:
                    self._real.kill()

            def terminate(self):
                if not self._is_mock:
                    self._real.terminate()

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_val, exc_tb):
                if not self._is_mock:
                    return self._real.__exit__(exc_type, exc_val, exc_tb)
                return None

        return mock.patch.object(factory_cmd_dispatch.subprocess, "Popen", FakePopen)

    def _run_dispatch(self, popen_cm, run_cm=None, prompt_text: str = DEFAULT_PROMPT):
        prompt_path = self.repo_dir / "prompt.txt"
        prompt_path.write_text(prompt_text, encoding="utf-8")
        args = self._dispatch_args(prompt_path)
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.ExitStack() as stack:
            stack.enter_context(contextlib.redirect_stdout(stdout))
            stack.enter_context(contextlib.redirect_stderr(stderr))
            stack.enter_context(popen_cm)
            if run_cm is not None:
                stack.enter_context(run_cm)
            try:
                rc = args.func(args)
            except SystemExit as exc:
                rc = exc.code
        return rc, stdout.getvalue(), stderr.getvalue(), prompt_path

    def test_e2e_canonical_suppression(self) -> None:
        rc, _, _, _ = self._run_dispatch(self._argv_scoped_popen(500, 0))
        self.assertEqual(rc, 0)

        state = self._read_state()
        record = state["codex_dispatches"][-1]
        post_dispatch_head = self._current_head_sha()
        self.assertEqual(record["lines_added_at_dispatch_time"], 500)
        self.assertEqual(record["head_sha"], post_dispatch_head)
        self.assertEqual(record["branch_base_sha"], self.base_sha)

        with mock.patch.object(factory_deliver, "_resolve_branch_base", return_value=self.base_sha), \
            mock.patch.object(factory_deliver, "_added_code_lines", return_value=500), \
            mock.patch.object(factory_deliver, "is_ancestor_of_head", return_value=True):
            status, note = factory_deliver.check_implementation_rule(self.slug)
        self.assertEqual(status, "suppressed")
        self.assertIn(record["ts"], note)
        self.assertIn(record["head_sha"][:7], note)
        self.assertIn("+500", note)

    def test_e2e_drift_triggers(self) -> None:
        rc, _, _, _ = self._run_dispatch(self._argv_scoped_popen(500, 0))
        self.assertEqual(rc, 0)
        self._simulate_codex_writing(100)

        with mock.patch.object(factory_deliver, "_resolve_branch_base", return_value=self.base_sha), \
            mock.patch.object(factory_deliver, "_added_code_lines", return_value=600), \
            mock.patch.object(factory_deliver, "is_ancestor_of_head", return_value=True):
            status, note = factory_deliver.check_implementation_rule(self.slug)
        self.assertEqual(status, "triggered")
        self.assertIn("600", note)

    def test_e2e_added_code_lines_failure_recompute(self) -> None:
        def side_effect(cmd, *args, **kwargs):
            if isinstance(cmd, list) and cmd[:2] == ["git", "diff"]:
                raise FileNotFoundError(2, "No such file or directory", "git")
            return _REAL_RUN(cmd, *args, **kwargs)

        rc, _, _, _ = self._run_dispatch(
            self._argv_scoped_popen(500, 0),
            run_cm=mock.patch.object(
                factory_deliver.subprocess,
                "run",
                side_effect=side_effect,
            ),
        )
        self.assertEqual(rc, 0)

        record = self._read_state()["codex_dispatches"][-1]
        self.assertIsNone(record["lines_added_at_dispatch_time"])
        self.assertIsNotNone(record["head_sha"])
        self.assertEqual(record["branch_base_sha"], self.base_sha)

        with mock.patch.object(factory_deliver, "_resolve_branch_base", return_value=self.base_sha), \
            mock.patch.object(factory_deliver, "_added_code_lines", return_value=500), \
            mock.patch.object(factory_deliver, "is_ancestor_of_head", return_value=True), \
            mock.patch.object(factory_deliver, "_recompute_lines_for_dispatch", return_value=500) as recompute:
            status, note = factory_deliver.check_implementation_rule(self.slug)
        self.assertEqual(status, "suppressed")
        self.assertIn(record["ts"], note)
        recompute.assert_called_once()

    def test_e2e_non_zero_codex_records(self) -> None:
        rc, _, _, _ = self._run_dispatch(self._argv_scoped_popen(500, returncode=1))
        self.assertEqual(rc, 1)

        state = self._read_state()
        record = state["codex_dispatches"][-1]
        self.assertEqual(record["exit_code"], 1)
        self.assertEqual(record["lines_added_at_dispatch_time"], 500)

        with mock.patch.object(factory_deliver, "_resolve_branch_base", return_value=self.base_sha), \
            mock.patch.object(factory_deliver, "_added_code_lines", return_value=500), \
            mock.patch.object(factory_deliver, "is_ancestor_of_head", return_value=True):
            status, note = factory_deliver.check_implementation_rule(self.slug)
        self.assertEqual(status, "triggered")
        self.assertIn("500", note)

    def test_e2e_rev_parse_head_failure(self) -> None:
        def side_effect(cmd, *args, **kwargs):
            if (
                isinstance(cmd, list)
                and len(cmd) >= 3
                and cmd[0] == "git"
                and cmd[1] == "rev-parse"
                and cmd[2] == "HEAD"
            ):
                raise FileNotFoundError(2, "No such file or directory", "git")
            return _REAL_RUN(cmd, *args, **kwargs)

        rc, _, _, _ = self._run_dispatch(
            self._argv_scoped_popen(500, 0),
            run_cm=mock.patch.object(factory_cmd_dispatch.subprocess, "run", side_effect=side_effect),
        )
        self.assertEqual(rc, 0)

        record = self._read_state()["codex_dispatches"][-1]
        self.assertIsNone(record["head_sha"])
        self.assertEqual(record["branch_base_sha"], self.base_sha)
        self.assertIsNotNone(record["lines_added_at_dispatch_time"])

        with mock.patch.object(factory_deliver, "_resolve_branch_base", return_value=self.base_sha), \
            mock.patch.object(factory_deliver, "_added_code_lines", return_value=500), \
            mock.patch.object(factory_deliver, "is_ancestor_of_head", return_value=False):
            status, note = factory_deliver.check_implementation_rule(self.slug)
        self.assertEqual(status, "triggered")
        self.assertIn("500", note)


if __name__ == "__main__":
    unittest.main()
