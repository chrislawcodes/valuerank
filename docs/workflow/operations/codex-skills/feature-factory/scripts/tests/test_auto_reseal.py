import argparse
import contextlib
import importlib.util
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


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS_DIR / f"{name}.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


FACTORY_STATE = _load("factory_state")
FACTORY_GIT = _load("factory_git")
FACTORY_REVIEW = _load("factory_review")
FACTORY_RECONCILE = _load("factory_reconcile")
FACTORY_CMD_RECONCILE = _load("factory_cmd_reconcile")


SLUG = "auto-reseal"


class AutoResealTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self.repo_dir = Path(self._tmpdir.name)
        self.runs_root = self.repo_dir / "docs" / "workflow" / "feature-runs"
        self.slug_dir = self.runs_root / SLUG
        self.reviews_dir = self.slug_dir / "reviews"
        self.reviews_dir.mkdir(parents=True, exist_ok=True)
        self._old_cwd = Path.cwd()
        os.chdir(self.repo_dir)
        self.addCleanup(lambda: os.chdir(self._old_cwd))

        subprocess.run(["git", "init", "-b", "main"], cwd=self.repo_dir, check=True, capture_output=True, text=True)
        subprocess.run(["git", "config", "user.name", "Test"], cwd=self.repo_dir, check=True, capture_output=True, text=True)
        subprocess.run(
            ["git", "config", "user.email", "test@example.com"],
            cwd=self.repo_dir,
            check=True,
            capture_output=True,
            text=True,
        )
        (self.repo_dir / ".git" / "info").mkdir(parents=True, exist_ok=True)
        exclude_path = self.repo_dir / ".git" / "info" / "exclude"
        exclude_path.write_text("docs/workflow/feature-runs/**/state.json\n", encoding="utf-8")

        self.review_path = self.reviews_dir / "spec.codex.feasibility-adversarial.review.md"
        self.plan_path = self.slug_dir / "plan.md"
        self.state_path = self.slug_dir / "state.json"
        self.review_path.write_text(
            "---\n"
            'reviewer: "codex"\n'
            'lens: "feasibility-adversarial"\n'
            'stage: "spec"\n'
            f'artifact_path: "docs/workflow/feature-runs/{SLUG}/spec.md"\n'
            'artifact_sha256: "abc123"\n'
            'resolution_status: "open"\n'
            'resolution_note: ""\n'
            "---\n\n"
            "# Review body\n\n"
            "## Findings\n\n"
            "- HIGH: example finding.\n",
            encoding="utf-8",
        )
        self.plan_path.write_text("# Plan\n\n## Review Reconciliation\n\n", encoding="utf-8")
        FACTORY_STATE.atomic_json_write(self.state_path, FACTORY_STATE._default_workflow_state())
        subprocess.run(
            ["git", "add", "docs/workflow/feature-runs/auto-reseal/reviews/spec.codex.feasibility-adversarial.review.md", "docs/workflow/feature-runs/auto-reseal/plan.md"],
            cwd=self.repo_dir,
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "seed workflow fixtures"],
            cwd=self.repo_dir,
            check=True,
            capture_output=True,
            text=True,
        )
        self.base_head = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=self.repo_dir,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()

        self._state_patch = mock.patch.object(FACTORY_STATE, "REPO_ROOT", self.repo_dir)
        self._runs_patch = mock.patch.object(FACTORY_STATE, "FACTORY_RUNS_ROOT", self.runs_root)
        self._cmd_root_patch = mock.patch.object(FACTORY_CMD_RECONCILE, "REPO_ROOT", self.repo_dir)
        self._state_patch.start()
        self._runs_patch.start()
        self._cmd_root_patch.start()
        self.addCleanup(self._state_patch.stop)
        self.addCleanup(self._runs_patch.stop)
        self.addCleanup(self._cmd_root_patch.stop)

    def _write_state(self) -> None:
        FACTORY_STATE.atomic_json_write(self.state_path, FACTORY_STATE._default_workflow_state())

    def _make_commit_side_effect(
        self,
        *,
        commit_paths: list[str],
        pre_commit_changes: dict[str, str] | None = None,
        post_commit_changes: dict[str, str] | None = None,
    ):
        original = FACTORY_RECONCILE.reconcile_review_full

        def _side_effect(*args, **kwargs):
            rc = original(*args, **kwargs)
            if rc != 0:
                return rc
            for rel_path, content in (pre_commit_changes or {}).items():
                target = self.repo_dir / rel_path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")
            subprocess.run(
                ["git", "add", "-A", "--", *commit_paths],
                cwd=self.repo_dir,
                check=True,
                capture_output=True,
                text=True,
            )
            subprocess.run(
                ["git", "commit", "-m", "reconcile review-only"],
                cwd=self.repo_dir,
                check=True,
                capture_output=True,
                text=True,
            )
            for rel_path, content in (post_commit_changes or {}).items():
                target = self.repo_dir / rel_path
                target.parent.mkdir(parents=True, exist_ok=True)
                if content is None:
                    target.unlink(missing_ok=True)
                else:
                    target.write_text(content, encoding="utf-8")
            return 0

        return _side_effect

    def _run_reconcile(self, side_effect, *, extra_patches=None) -> tuple[int, str, str]:
        stdout = io.StringIO()
        stderr = io.StringIO()
        args = argparse.Namespace(
            slug=SLUG,
            review=[str(self.review_path)],
            status="accepted",
            note="ok",
        )
        patches = [
            mock.patch.object(FACTORY_GIT, "ensure_sync", return_value=None),
            mock.patch.object(FACTORY_CMD_RECONCILE, "reconcile_review_full", side_effect=side_effect),
            mock.patch.object(FACTORY_CMD_RECONCILE, "_emit_next_action", return_value=None),
        ]
        if extra_patches:
            patches.extend(extra_patches)
        with contextlib.ExitStack() as stack:
            for patcher in patches:
                stack.enter_context(patcher)
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                rc = FACTORY_CMD_RECONCILE.command_reconcile(args)
        return rc, stdout.getvalue(), stderr.getvalue()

    def test_review_only_commit_advances_diff_head(self) -> None:
        rc, _, stderr = self._run_reconcile(
            self._make_commit_side_effect(
                commit_paths=[
                    "docs/workflow/feature-runs/auto-reseal/reviews/spec.codex.feasibility-adversarial.review.md",
                    "docs/workflow/feature-runs/auto-reseal/plan.md",
                ]
            )
        )
        self.assertEqual(rc, 0)
        self.assertNotIn("Traceback", stderr)
        state = FACTORY_STATE.load_workflow_state(SLUG)
        self.assertEqual(state["diff_review_budget"]["recorded_head"], self._current_head())
        self.assertGreater(state["diff_review_budget"]["last_review_only_advance_at"], 0)

    def test_production_code_commit_does_not_advance(self) -> None:
        production_file = self.repo_dir / "factory_deliver.py"
        production_file.write_text("print('baseline')\n", encoding="utf-8")
        subprocess.run(["git", "add", "factory_deliver.py"], cwd=self.repo_dir, check=True, capture_output=True, text=True)
        subprocess.run(["git", "commit", "-m", "seed production file"], cwd=self.repo_dir, check=True, capture_output=True, text=True)

        rc, _, _ = self._run_reconcile(
            self._make_commit_side_effect(
                commit_paths=[
                    "docs/workflow/feature-runs/auto-reseal/reviews/spec.codex.feasibility-adversarial.review.md",
                    "docs/workflow/feature-runs/auto-reseal/plan.md",
                    "factory_deliver.py",
                ],
                pre_commit_changes={"factory_deliver.py": "print('changed')\n"},
            )
        )
        self.assertEqual(rc, 0)
        state = FACTORY_STATE.load_workflow_state(SLUG)
        self.assertEqual(state["diff_review_budget"]["recorded_head"], "")
        self.assertEqual(state["diff_review_budget"]["last_review_only_advance_at"], 0)

    def test_preexisting_dirty_file_prevents_advance_when_dirty_set_changes(self) -> None:
        operator_file = self.repo_dir / "operator.py"
        operator_file.write_text("operator = 1\n", encoding="utf-8")
        subprocess.run(["git", "add", "operator.py"], cwd=self.repo_dir, check=True, capture_output=True, text=True)
        subprocess.run(["git", "commit", "-m", "seed operator file"], cwd=self.repo_dir, check=True, capture_output=True, text=True)
        operator_file.write_text("operator = 2\n", encoding="utf-8")

        rc, _, _ = self._run_reconcile(
            self._make_commit_side_effect(
                commit_paths=[
                    "docs/workflow/feature-runs/auto-reseal/reviews/spec.codex.feasibility-adversarial.review.md",
                    "docs/workflow/feature-runs/auto-reseal/plan.md",
                ],
                post_commit_changes={"operator.py": None},
            )
        )
        self.assertEqual(rc, 0)
        state = FACTORY_STATE.load_workflow_state(SLUG)
        self.assertEqual(state["diff_review_budget"]["recorded_head"], "")

    def test_active_merge_sentinel_blocks_auto_advance(self) -> None:
        git_dir = subprocess.run(
            ["git", "rev-parse", "--git-dir"],
            cwd=self.repo_dir,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        git_dir_path = Path(git_dir) if Path(git_dir).is_absolute() else self.repo_dir / git_dir
        (git_dir_path / "MERGE_HEAD").write_text("deadbeef\n", encoding="utf-8")
        self.addCleanup((git_dir_path / "MERGE_HEAD").unlink, missing_ok=True)

        def _manual_commit_side_effect(*args, **kwargs):
            rc = FACTORY_RECONCILE.reconcile_review_full(*args, **kwargs)
            if rc != 0:
                return rc
            subprocess.run(
                ["git", "add", "-A", "--",
                 "docs/workflow/feature-runs/auto-reseal/reviews/spec.codex.feasibility-adversarial.review.md",
                 "docs/workflow/feature-runs/auto-reseal/plan.md"],
                cwd=self.repo_dir,
                check=True,
                capture_output=True,
                text=True,
            )
            tree_sha = subprocess.run(
                ["git", "write-tree"],
                cwd=self.repo_dir,
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
            parent_sha = self._current_head()
            commit_sha = subprocess.run(
                ["git", "commit-tree", tree_sha, "-p", parent_sha, "-m", "reconcile review-only"],
                cwd=self.repo_dir,
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
            subprocess.run(
                ["git", "update-ref", "refs/heads/main", commit_sha],
                cwd=self.repo_dir,
                check=True,
                capture_output=True,
                text=True,
            )
            return 0

        rc, _, _ = self._run_reconcile(_manual_commit_side_effect)
        self.assertEqual(rc, 0)
        state = FACTORY_STATE.load_workflow_state(SLUG)
        self.assertEqual(state["diff_review_budget"]["recorded_head"], "")

    def _current_head(self) -> str:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=self.repo_dir,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
