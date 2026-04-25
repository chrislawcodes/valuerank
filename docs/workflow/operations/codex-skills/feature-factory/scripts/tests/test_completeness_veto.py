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

STATE_SPEC = importlib.util.spec_from_file_location("factory_state", SCRIPT_DIR / "factory_state.py")
assert STATE_SPEC and STATE_SPEC.loader
FACTORY_STATE = importlib.util.module_from_spec(STATE_SPEC)
sys.modules[STATE_SPEC.name] = FACTORY_STATE
STATE_SPEC.loader.exec_module(FACTORY_STATE)

CHECKPOINT_SPEC = importlib.util.spec_from_file_location("factory_cmd_checkpoint", SCRIPT_DIR / "factory_cmd_checkpoint.py")
assert CHECKPOINT_SPEC and CHECKPOINT_SPEC.loader
CHECKPOINT = importlib.util.module_from_spec(CHECKPOINT_SPEC)
sys.modules[CHECKPOINT_SPEC.name] = CHECKPOINT
CHECKPOINT_SPEC.loader.exec_module(CHECKPOINT)

DELIVER_SPEC = importlib.util.spec_from_file_location("factory_cmd_deliver", SCRIPT_DIR / "factory_cmd_deliver.py")
assert DELIVER_SPEC and DELIVER_SPEC.loader
DELIVER = importlib.util.module_from_spec(DELIVER_SPEC)
sys.modules[DELIVER_SPEC.name] = DELIVER
DELIVER_SPEC.loader.exec_module(DELIVER)

JUDGE_SPEC = importlib.util.spec_from_file_location("factory_cmd_judge", SCRIPT_DIR / "factory_cmd_judge.py")
assert JUDGE_SPEC and JUDGE_SPEC.loader
JUDGE = importlib.util.module_from_spec(JUDGE_SPEC)
sys.modules[JUDGE_SPEC.name] = JUDGE
JUDGE_SPEC.loader.exec_module(JUDGE)

JUDGE_PROMPTS_SPEC = importlib.util.spec_from_file_location("judge_prompts", SCRIPT_DIR / "judge_prompts.py")
assert JUDGE_PROMPTS_SPEC and JUDGE_PROMPTS_SPEC.loader
JUDGE_PROMPTS = importlib.util.module_from_spec(JUDGE_PROMPTS_SPEC)
sys.modules[JUDGE_PROMPTS_SPEC.name] = JUDGE_PROMPTS
JUDGE_PROMPTS_SPEC.loader.exec_module(JUDGE_PROMPTS)


SLUG = "ff-completeness-veto"
STAGE = "plan"
_UNSET = object()


def _base_state() -> dict:
    state = FACTORY_STATE._default_workflow_state()
    state["schema_version"] = 2
    return state


def _concern(concern_id: str, *, addressed: bool = False) -> dict:
    return {
        "id": concern_id,
        "stage": STAGE,
        "judge": "completeness",
        "model": "gpt-5.4-mini",
        "confidence": 4,
        "reasoning": "Open HIGH concern for veto testing.",
        "round_raised": 1,
        "also_raised_in_round": [],
        "addressed_at": 111 if addressed else None,
        "addressed_by": "fixed" if addressed else None,
        "deferred_reason": None,
        "dismissed_reason": None,
    }


def _stage_state(*, concern: dict | None = None) -> dict:
    concerns = [concern] if concern is not None else []
    return {
        "adversarial_rounds": 3,
        "judge_rounds": 0,
        "judge_verdicts": [],
        "annotations": [],
        "unresolved_concerns": concerns,
        "adversarial_sha_history": ["sha-round-1", "sha-round-2", "sha-round-3"],
        "initial_sha": "sha-round-1",
    }


def _write_state(tmpdir: str, stage_state: dict) -> None:
    with patch.object(FACTORY_STATE, "FACTORY_RUNS_ROOT", Path(tmpdir)):
        root = FACTORY_STATE.workflow_dir(SLUG)
        root.mkdir(parents=True, exist_ok=True)
        (root / "plan.md").write_text("# Plan\n\nMeaningful content for veto tests.\n", encoding="utf-8")
        (root / "spec.md").write_text("# Spec\n\nMeaningful content for veto tests.\n", encoding="utf-8")
        (root / "tasks.md").write_text("# Tasks\n\nMeaningful content for veto tests.\n", encoding="utf-8")
        reviews = FACTORY_STATE.reviews_dir(SLUG)
        reviews.mkdir(parents=True, exist_ok=True)
        state = _base_state()
        state["stages"] = {STAGE: stage_state}
        state[f"{STAGE}_adversarial_rounds"] = stage_state["adversarial_rounds"]
        state[f"{STAGE}_judge_rounds"] = stage_state["judge_rounds"]
        FACTORY_STATE.atomic_json_write(FACTORY_STATE.factory_state_path(SLUG), state)
        for stage in ("spec", "plan", "tasks", "diff"):
            manifest_path = FACTORY_STATE.checkpoint_manifest_path(SLUG, stage)
            if not manifest_path.exists():
                FACTORY_STATE.atomic_json_write(manifest_path, {"healthy": True})


def _make_git_response(cmd: list[str]) -> subprocess.CompletedProcess:
    if "rev-parse" in cmd and "HEAD" in cmd:
        return subprocess.CompletedProcess(cmd, 0, stdout="head-sha\n", stderr="")
    if "merge-base" in cmd:
        return subprocess.CompletedProcess(cmd, 0, stdout="base-sha\n", stderr="")
    if "diff" in cmd:
        return subprocess.CompletedProcess(cmd, 0, stdout="diff --git a/plan.md b/plan.md\n", stderr="")
    return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")


def _model_response(model: str, verdict: str, reasoning: str, ids: object = _UNSET) -> str:
    payload = {
        "judge": {
            "gpt-5.4-mini": "completeness",
            "gpt-5.4": "restatement",
            "claude-sonnet-4-6": "implementation-risk",
        }[model],
        "model": model,
        "verdict": verdict,
        "confidence": 4,
        "reasoning": reasoning,
        "evidence": [
            {"artifact": "plan.md", "section": "Findings", "quote": "supporting quote"},
        ],
        "timestamp": "2026-04-18T10:15:30Z",
    }
    if ids is not _UNSET:
        payload["unaddressed_high_finding_ids"] = ids
    return json.dumps(payload)


def _run_judge(
    tmpdir: str,
    stage_state: dict | None,
    responses: dict[str, tuple[str, str, object]],
    *,
    write_state: bool = True,
) -> tuple[int, dict]:
    if write_state:
        assert stage_state is not None
        _write_state(tmpdir, stage_state)
    def side_effect(cmd, *args, **kwargs):
        if cmd[0] == "git":
            return _make_git_response(cmd)
        if cmd[0] == "codex" or cmd[0] == "claude":
            model = cmd[cmd.index("-m") + 1] if "-m" in cmd else cmd[cmd.index("--model") + 1]
            verdict, reasoning, ids = responses[model]
            return subprocess.CompletedProcess(cmd, 0, stdout=_model_response(model, verdict, reasoning, ids), stderr="")
        raise AssertionError(f"unexpected command: {cmd}")

    with patch.object(JUDGE.subprocess, "run", side_effect=side_effect), \
        patch.object(JUDGE, "stage_manifest_state", side_effect=_fake_stage_manifest_state):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            rc = JUDGE.run_judge(SLUG, STAGE)
    state = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
    return rc, state


def _fake_stage_manifest_state(slug: str, stage: str) -> dict[str, object]:
    return {
        "artifact_path": FACTORY_STATE.workflow_dir(slug) / f"{stage}.md",
        "artifact_exists": True,
        "artifact_meaningful": True,
        "manifest_path": FACTORY_STATE.reviews_dir(slug) / f"{stage}.checkpoint.json",
        "manifest_exists": True,
        "healthy": True,
        "detail": "",
    }


class CompletenessVetoTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self._root_patch = patch.object(FACTORY_STATE, "FACTORY_RUNS_ROOT", Path(self._tmpdir.name))
        self._root_patch.start()
        self.addCleanup(self._root_patch.stop)

    def test_prompt_and_schema_include_structured_high_ids(self) -> None:
        system_prompt, user_prompt = JUDGE_PROMPTS.load_prompt("completeness")
        self.assertIn("unaddressed_high_finding_ids", system_prompt)
        self.assertIn("unaddressed_high_finding_ids", user_prompt)
        schema = json.loads((SCRIPT_DIR / "judge_schema.json").read_text(encoding="utf-8"))
        self.assertIn("unaddressed_high_finding_ids", schema["properties"])

    def test_veto_overrides_majority_proceed_when_open_high_ids_are_structured(self) -> None:
        concern = _concern("deadbeefcafe")
        rc, state = _run_judge(
            self._tmpdir.name,
            _stage_state(concern=concern),
            {
                "gpt-5.4-mini": ("block", "completeness blocks unresolved HIGH", ["deadbeefcafe"]),
                "gpt-5.4": ("proceed", "restatement ok", _UNSET),
                "claude-sonnet-4-6": ("proceed", "implementation risk acceptable", _UNSET),
            },
        )
        self.assertEqual(rc, 0)
        self.assertEqual(state["stages"][STAGE]["judge_next_action"], "edit_and_rerun_judge")
        self.assertEqual(state["last_action_result"]["next"], "edit_and_rerun_judge")
        self.assertEqual(state["last_action_result"]["outcome"], "rejudge")

    def test_veto_clears_after_concern_is_addressed(self) -> None:
        concern = _concern("deadbeefcafe")
        _write_state(self._tmpdir.name, _stage_state(concern=concern))
        address_args = argparse.Namespace(
            slug=SLUG,
            stage=STAGE,
            address="deadbeefcafe",
            defer=None,
            dismiss=None,
            evidence="fixed in commit abc123",
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
            keep_intermediates=False,
        )
        with patch.object(CHECKPOINT, "ensure_sync", return_value=None):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(CHECKPOINT.command_checkpoint(address_args), 0)

        rc, state = _run_judge(
            self._tmpdir.name,
            None,
            {
                "gpt-5.4-mini": ("block", "completeness blocked earlier concern", ["deadbeefcafe"]),
                "gpt-5.4": ("proceed", "restatement ok", _UNSET),
                "claude-sonnet-4-6": ("proceed", "implementation risk acceptable", _UNSET),
            },
            write_state=False,
        )
        self.assertEqual(rc, 0)
        self.assertEqual(state["stages"][STAGE]["judge_next_action"], "advance")
        self.assertEqual(state["last_action_result"]["outcome"], "advance")

    def test_empty_structured_ids_with_no_open_concerns_falls_back_to_majority(self) -> None:
        rc, state = _run_judge(
            self._tmpdir.name,
            _stage_state(),
            {
                "gpt-5.4-mini": ("block", "blocking for a different reason", []),
                "gpt-5.4": ("proceed", "restatement ok", _UNSET),
                "claude-sonnet-4-6": ("proceed", "implementation risk acceptable", _UNSET),
            },
        )
        self.assertEqual(rc, 0)
        self.assertEqual(state["stages"][STAGE]["judge_next_action"], "advance")
        self.assertEqual(state["last_action_result"]["outcome"], "advance")

    def test_fail_open_warns_when_ids_are_empty_and_concerns_remain(self) -> None:
        concern = _concern("deadbeefcafe")
        rc, state = _run_judge(
            self._tmpdir.name,
            _stage_state(concern=concern),
            {
                "gpt-5.4-mini": ("block", "blocked but forgot structured ids", []),
                "gpt-5.4": ("proceed", "restatement ok", _UNSET),
                "claude-sonnet-4-6": ("proceed", "implementation risk acceptable", _UNSET),
            },
        )
        self.assertEqual(rc, 0)
        warnings = state.get("invariant_warnings", [])
        self.assertTrue(warnings)
        self.assertEqual(warnings[-1]["command"], "judge")
        self.assertEqual(warnings[-1]["stage"], STAGE)
        self.assertIn("prompt may be malformed", warnings[-1]["detail"])
        self.assertEqual(state["stages"][STAGE]["judge_next_action"], "advance")

    def test_deliver_override_bypasses_veto(self) -> None:
        concern = _concern("deadbeefcafe")
        _write_state(self._tmpdir.name, _stage_state(concern=concern))

        def gh_side_effect(cmd, *args, **kwargs):
            if cmd[:3] == ["gh", "auth", "status"]:
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            if cmd[:3] == ["gh", "pr", "edit"]:
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        args = argparse.Namespace(
            slug=SLUG,
            create_pr=False,
            draft=False,
            base=None,
            title=None,
            override_judges=True,
            reason="ship with explicit operator review",
            refresh=False,
            resume_merge_wait=False,
            watch_ci=False,
            interval=10,
            merge_when_green=False,
            auto_merge=False,
            dry_run=True,
        )
        with patch.object(DELIVER, "ensure_sync", return_value=None), \
            patch.object(DELIVER, "command_path", return_value=True), \
            patch.object(DELIVER, "verify_checkpoint_manifest", return_value=(True, "")), \
            patch.object(DELIVER, "reconciliation_state", return_value=(True, "")), \
            patch.object(DELIVER, "current_branch_name", return_value="feature/branch"), \
            patch.object(DELIVER, "upstream_branch_name", return_value="origin/main"), \
            patch.object(DELIVER, "git_output", return_value="head-sha"), \
            patch.object(DELIVER, "commits_behind_upstream", return_value=0), \
            patch.object(DELIVER, "current_pr_payload", return_value={
                "number": 17,
                "url": "https://example.test/pr/17",
                "state": "OPEN",
                "isDraft": False,
                "headRefName": "feature/branch",
                "headRefOid": "head-sha",
                "baseRefName": "main",
                "mergeable": "MERGEABLE",
                "mergeStateStatus": "CLEAN",
                "body": "",
                "mergeCommit": None,
                "mergedAt": "",
            }), \
            patch.object(DELIVER, "required_check_summary", return_value=("pass", [], "")), \
            patch.object(DELIVER.subprocess, "run", side_effect=gh_side_effect), \
            patch.object(__import__("factory_deliver"), "check_implementation_rule", return_value=("ok", "")), \
            patch.dict(DELIVER.os.environ, {"USER": "test-operator"}, clear=False):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                rc = DELIVER.command_deliver(args)

        self.assertEqual(rc, 0)
        state = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
        self.assertIn("override", state)
        self.assertEqual(state["override"]["reason"], "ship with explicit operator review")

    def test_whitespace_override_reason_rejected_before_state_write(self) -> None:
        concern = _concern("deadbeefcafe")
        _write_state(self._tmpdir.name, _stage_state(concern=concern))
        args = argparse.Namespace(
            slug=SLUG,
            create_pr=False,
            draft=False,
            base=None,
            title=None,
            override_judges=True,
            reason="   ",
            refresh=False,
            resume_merge_wait=False,
            watch_ci=False,
            interval=10,
            merge_when_green=False,
            auto_merge=False,
            dry_run=False,
        )
        with patch.object(DELIVER, "ensure_sync", return_value=None), \
            patch.object(DELIVER, "command_path", return_value=True):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()) as stderr:
                with self.assertRaises(SystemExit) as ctx:
                    DELIVER.command_deliver(args)

        self.assertEqual(ctx.exception.code, 2)
        self.assertIn("requires --reason", stderr.getvalue())
        state = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
        self.assertNotIn("override", state)

    def test_legacy_missing_structured_ids_defaults_to_majority(self) -> None:
        concern = _concern("deadbeefcafe", addressed=True)
        rc, state = _run_judge(
            self._tmpdir.name,
            _stage_state(concern=concern),
            {
                "gpt-5.4-mini": ("block", "legacy block without structured ids", _UNSET),
                "gpt-5.4": ("proceed", "restatement ok", _UNSET),
                "claude-sonnet-4-6": ("proceed", "implementation risk acceptable", _UNSET),
            },
        )
        self.assertEqual(rc, 0)
        self.assertEqual(state["stages"][STAGE]["judge_next_action"], "advance")
        self.assertEqual(state["last_action_result"]["outcome"], "advance")


if __name__ == "__main__":
    unittest.main()
