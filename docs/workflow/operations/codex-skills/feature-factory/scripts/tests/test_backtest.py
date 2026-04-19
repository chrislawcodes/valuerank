import contextlib
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


SCRIPT_DIR = Path(__file__).resolve().parents[1]

STATE_SPEC = importlib.util.spec_from_file_location("factory_state", SCRIPT_DIR / "factory_state.py")
assert STATE_SPEC and STATE_SPEC.loader
FACTORY_STATE = importlib.util.module_from_spec(STATE_SPEC)
sys.modules[STATE_SPEC.name] = FACTORY_STATE
STATE_SPEC.loader.exec_module(FACTORY_STATE)

BACKTEST_SPEC = importlib.util.spec_from_file_location("backtest", SCRIPT_DIR / "backtest.py")
assert BACKTEST_SPEC and BACKTEST_SPEC.loader
BACKTEST = importlib.util.module_from_spec(BACKTEST_SPEC)
sys.modules[BACKTEST_SPEC.name] = BACKTEST
BACKTEST_SPEC.loader.exec_module(BACKTEST)


SLUG = "ff-judge-panel"


def _state_with_feature(
    *,
    merged_at_iso8601: str,
    merged_sha: str = "merged-sha",
    unresolved_concerns: list[dict] | None = None,
    annotations: list[dict] | None = None,
    override: dict | None = None,
    last_action_result: dict | None = None,
) -> dict:
    state = FACTORY_STATE._default_workflow_state()
    state["schema_version"] = 2
    state["delivery"] = {
        "merged_at_iso8601": merged_at_iso8601,
        "merged_sha": merged_sha,
    }
    state["stages"] = {
        "plan": {
            "adversarial_rounds": 3,
            "judge_rounds": 0,
            "judge_verdicts": [],
            "annotations": annotations or [],
            "unresolved_concerns": unresolved_concerns or [],
            "adversarial_sha_history": ["sha-1", "sha-2"],
            "initial_sha": "sha-1",
        }
    }
    if override is not None:
        state["override"] = override
    if last_action_result is not None:
        state["last_action_result"] = last_action_result
    return state


def _incident_text(reasoning: str) -> str:
    return "\n".join(
        [
            "# Incident Post-Mortem",
            "",
            "Root cause:",
            reasoning,
            "",
            "Mitigation:",
            "Hotfix applied.",
        ]
    )


class BacktestTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self._root = Path(self._tmpdir.name) / "docs" / "workflow" / "feature-runs"
        self._root.mkdir(parents=True, exist_ok=True)
        self._incidents = Path(self._tmpdir.name) / "docs" / "incidents"
        self._incidents.mkdir(parents=True, exist_ok=True)
        self._root_patch = patch.object(FACTORY_STATE, "FACTORY_RUNS_ROOT", self._root)
        self._root_patch.start()
        self.addCleanup(self._root_patch.stop)

    def _write_feature(self, slug: str, state: dict) -> None:
        run_dir = FACTORY_STATE.workflow_dir(slug)
        run_dir.mkdir(parents=True, exist_ok=True)
        FACTORY_STATE.atomic_json_write(FACTORY_STATE.factory_state_path(slug), state)

    def _args(self, **overrides: object) -> SimpleNamespace:
        args = {
            "since": date(2026, 1, 1),
            "incidents_path": self._incidents,
            "output_csv": Path(self._tmpdir.name) / "out.csv",
            "output_md": Path(self._tmpdir.name) / "out.md",
            "include_overrides": False,
            "no_gh": False,
        }
        args.update(overrides)
        return SimpleNamespace(**args)

    def test_backtest_empty_corpus_returns_zero(self) -> None:
        with contextlib.redirect_stdout(io.StringIO()) as stdout:
            rc = BACKTEST.main(["--since", "2026-04-19", "--no-gh", "--incidents-path", str(self._incidents)])

        self.assertEqual(rc, 0)
        self.assertEqual(stdout.getvalue().strip(), "no features in range")

    def test_backtest_single_feature_clean_outcome(self) -> None:
        merged_at = "2026-01-02T12:00:00Z"
        self._write_feature("clean-feature", _state_with_feature(merged_at_iso8601=merged_at))

        def side_effect(cmd, *args, **kwargs):
            if cmd[0] == "gh":
                output = json.dumps(
                    [
                        {
                            "name": "build",
                            "head_sha": "merged-sha",
                            "conclusion": "success",
                            "created_at": "2026-01-02T13:00:00Z",
                        }
                    ]
                )
                return subprocess.CompletedProcess(cmd, 0, stdout=output, stderr="")
            if cmd[0] == "git":
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        with patch.object(BACKTEST.subprocess, "run", side_effect=side_effect):
            rows = BACKTEST.collect_feature_rows(self._args())

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].slug, "clean-feature")
        self.assertEqual(rows[0].outcome, "clean")
        self.assertFalse(rows[0].ci_data_unavailable)

    def test_backtest_feature_with_revert(self) -> None:
        merged_at = "2026-01-03T12:00:00Z"
        self._write_feature("reverted-feature", _state_with_feature(merged_at_iso8601=merged_at))

        def side_effect(cmd, *args, **kwargs):
            if cmd[0] == "gh":
                output = json.dumps(
                    [
                        {
                            "name": "build",
                            "head_sha": "merged-sha",
                            "conclusion": "success",
                            "created_at": "2026-01-03T13:00:00Z",
                        }
                    ]
                )
                return subprocess.CompletedProcess(cmd, 0, stdout=output, stderr="")
            if cmd[:4] == ["git", "-C", str(FACTORY_STATE.REPO_ROOT), "log"]:
                return subprocess.CompletedProcess(
                    cmd,
                    0,
                    stdout="abc123\x1fRevert merged-sha\x1f\x1e",
                    stderr="",
                )
            raise AssertionError(f"unexpected command: {cmd}")

        with patch.object(BACKTEST.subprocess, "run", side_effect=side_effect):
            rows = BACKTEST.collect_feature_rows(self._args())

        self.assertEqual(rows[0].outcome, "reverted")
        self.assertEqual(rows[0].reverts_7d, 1)
        self.assertIn("Revert merged-sha", rows[0].revert_messages[0])

    def test_backtest_concern_matches_incident(self) -> None:
        reasoning = "Missing rollback path in the plan."
        concern = {
            "stage": "plan",
            "round": 3,
            "judge": "completeness",
            "confidence": 4,
            "reasoning": reasoning,
            "also_raised_in_round": [1, 2],
        }
        self._write_feature(
            "incident-feature",
            _state_with_feature(merged_at_iso8601="2026-01-04T12:00:00Z", unresolved_concerns=[concern]),
        )
        (self._incidents / "incident-001.md").write_text(_incident_text(reasoning), encoding="utf-8")

        def side_effect(cmd, *args, **kwargs):
            if cmd[0] == "gh":
                output = json.dumps(
                    [
                        {
                            "name": "build",
                            "head_sha": "merged-sha",
                            "conclusion": "success",
                            "created_at": "2026-01-04T13:00:00Z",
                        }
                    ]
                )
                return subprocess.CompletedProcess(cmd, 0, stdout=output, stderr="")
            if cmd[0] == "git":
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        with patch.object(BACKTEST.subprocess, "run", side_effect=side_effect), \
            patch.object(BACKTEST.factory_embeddings, "cosine_similarity", return_value=0.9):
            rows = BACKTEST.collect_feature_rows(self._args())

        self.assertEqual(rows[0].outcome, "incident")
        self.assertEqual(rows[0].concerns_matched_to_incidents, 1)
        self.assertTrue(rows[0].incident_matches)

    def test_backtest_override_excluded_by_default(self) -> None:
        self._write_feature(
            "override-feature",
            _state_with_feature(
                merged_at_iso8601="2026-01-05T12:00:00Z",
                override={"reason": "calibration", "operator_id": "chris", "timestamp_iso8601_utc": "2026-01-05T12:00:00Z"},
            ),
        )

        with patch.object(BACKTEST.subprocess, "run", return_value=subprocess.CompletedProcess(["git"], 0, stdout="", stderr="")):
            rows = BACKTEST.collect_feature_rows(self._args(no_gh=True))

        self.assertEqual(rows, [])

    def test_backtest_override_included_with_flag(self) -> None:
        self._write_feature(
            "override-feature",
            _state_with_feature(
                merged_at_iso8601="2026-01-05T12:00:00Z",
                override={"reason": "calibration", "operator_id": "chris", "timestamp_iso8601_utc": "2026-01-05T12:00:00Z"},
            ),
        )

        with patch.object(BACKTEST.subprocess, "run", return_value=subprocess.CompletedProcess(["git"], 0, stdout="", stderr="")):
            rows = BACKTEST.collect_feature_rows(self._args(include_overrides=True, no_gh=True))

        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0].override_used)

    def test_backtest_ci_unavailable_when_no_gh(self) -> None:
        self._write_feature("no-gh-feature", _state_with_feature(merged_at_iso8601="2026-01-06T12:00:00Z"))

        with patch.object(BACKTEST.subprocess, "run", return_value=subprocess.CompletedProcess(["git"], 0, stdout="", stderr="")):
            rows = BACKTEST.collect_feature_rows(self._args(no_gh=True))

        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0].ci_data_unavailable)
        self.assertEqual(rows[0].outcome, "indeterminate")


if __name__ == "__main__":
    unittest.main()
