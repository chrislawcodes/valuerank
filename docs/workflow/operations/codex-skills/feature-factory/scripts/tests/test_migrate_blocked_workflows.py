import contextlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT_DIR = Path(__file__).resolve().parents[1]

STATE_SPEC = importlib.util.spec_from_file_location("factory_state", SCRIPT_DIR / "factory_state.py")
assert STATE_SPEC and STATE_SPEC.loader
FACTORY_STATE = importlib.util.module_from_spec(STATE_SPEC)
sys.modules[STATE_SPEC.name] = FACTORY_STATE
STATE_SPEC.loader.exec_module(FACTORY_STATE)

MIGRATION_SPEC = importlib.util.spec_from_file_location(
    "migrate_blocked_workflows",
    SCRIPT_DIR / "migrate-blocked-workflows.py",
)
assert MIGRATION_SPEC and MIGRATION_SPEC.loader
MIGRATION = importlib.util.module_from_spec(MIGRATION_SPEC)
sys.modules[MIGRATION_SPEC.name] = MIGRATION
MIGRATION_SPEC.loader.exec_module(MIGRATION)


def _write_verdict_file(reviews_dir: Path, lens: str, verdict: str, reasoning: str) -> None:
    payload = {
        "judge": lens,
        "model": {
            "completeness": "gpt-5.4-mini",
            "restatement": "gpt-5.4",
            "implementation-risk": "claude-sonnet-4-6",
        }[lens],
        "verdict": verdict,
        "confidence": 4,
        "reasoning": reasoning,
        "evidence": [{"artifact": "plan.md", "section": "Findings", "quote": "evidence"}],
        "timestamp": "2026-04-19T12:00:00Z",
    }
    (reviews_dir / f"judge.{lens}.verdict.json").write_text(json.dumps(payload), encoding="utf-8")


def _base_state() -> dict:
    state = FACTORY_STATE._default_workflow_state()
    state["schema_version"] = 2
    return state


class MigrateBlockedWorkflowsTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self._root_patch = patch.object(FACTORY_STATE, "FACTORY_RUNS_ROOT", Path(self._tmpdir.name))
        self._root_patch.start()
        self.addCleanup(self._root_patch.stop)

    def _prepare_slug(self, slug: str, *, with_verdicts: bool = False) -> Path:
        workflow_root = FACTORY_STATE.workflow_dir(slug)
        workflow_root.mkdir(parents=True, exist_ok=True)
        (workflow_root / "plan.md").write_text("# Plan\n\nPlan content.\n", encoding="utf-8")
        reviews_dir = FACTORY_STATE.reviews_dir(slug)
        reviews_dir.mkdir(parents=True, exist_ok=True)
        if with_verdicts:
            _write_verdict_file(reviews_dir, "completeness", "proceed", "completeness ok")
            _write_verdict_file(reviews_dir, "restatement", "proceed-with-annotation", "restatement ok")
            _write_verdict_file(reviews_dir, "implementation-risk", "block", "implementation risk")
        state = _base_state()
        state["stages"] = {
            "plan": {
                "adversarial_rounds": 0,
                "judge_rounds": 0,
                "judge_verdicts": [],
                "annotations": [],
                "unresolved_concerns": [],
                "adversarial_sha_history": [],
                "initial_sha": "",
                "judge_next_action": "edit_and_rerun_judge",
            }
        }
        FACTORY_STATE.atomic_json_write(FACTORY_STATE.factory_state_path(slug), state)
        return workflow_root

    def test_dry_run_reports_targets_without_writing_summary(self) -> None:
        slug = "split-queue-orchestrator"
        self._prepare_slug(slug)
        summary_path = FACTORY_STATE.REPO_ROOT / "docs" / "workflow" / "feature-runs" / f"migration-ff-judge-panel-{MIGRATION._now_date()}.md"
        if summary_path.exists():
            summary_path.unlink()

        with patch.object(MIGRATION, "run_judge") as run_judge, \
            patch.object(MIGRATION.sys, "argv", ["migrate-blocked-workflows.py", "--slug", slug, "--dry-run"]):
            with contextlib.redirect_stdout(io.StringIO()) as stdout:
                rc = MIGRATION.main()

        self.assertEqual(rc, 0)
        run_judge.assert_not_called()
        self.assertIn("would run judge --slug split-queue-orchestrator --stage plan --json --migration-bypass", stdout.getvalue())
        self.assertFalse(summary_path.exists())

    def test_migration_writes_summary_from_verdict_files(self) -> None:
        slug = "split-queue-orchestrator"
        self._prepare_slug(slug, with_verdicts=True)
        summary_path = FACTORY_STATE.REPO_ROOT / "docs" / "workflow" / "feature-runs" / f"migration-ff-judge-panel-{MIGRATION._now_date()}.md"
        if summary_path.exists():
            summary_path.unlink()

        def fake_run_judge(slug_arg: str, stage: str, json_output: bool = False, prompt_override=None, override_reason=None, migration_bypass: bool = False):
            self.assertEqual(slug_arg, slug)
            self.assertEqual(stage, "plan")
            self.assertTrue(json_output)
            self.assertTrue(migration_bypass)
            payload = {
                "next": "judge_panel",
                "reason": "plan judge panel completed",
                "blockers": ["plan.adversarial_rounds < 3"],
                "outcome": "advance",
                "proceed_count": 2,
                "block_count": 1,
                "timestamp": "2026-04-19T12:00:00Z",
                "judge_round": 1,
            }
            print(json.dumps(payload))
            return 0

        with patch.object(MIGRATION, "run_judge", side_effect=fake_run_judge), \
            patch.object(MIGRATION.sys, "argv", ["migrate-blocked-workflows.py", "--slug", slug]):
            with contextlib.redirect_stdout(io.StringIO()) as stdout:
                rc = MIGRATION.main()

        self.assertEqual(rc, 0)
        self.assertTrue(summary_path.exists())
        summary = summary_path.read_text(encoding="utf-8")
        self.assertIn("split-queue-orchestrator", summary)
        self.assertIn("stage judged: `plan`", summary)
        self.assertIn("vote tally: proceed=2 block=1", summary)
        self.assertIn("final action: advanced", summary)
        self.assertIn("completeness: proceed", summary)
        self.assertIn("restatement: proceed-with-annotation", summary)
        self.assertIn("implementation-risk: block", summary)
        self.assertIn(str(summary_path), stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
