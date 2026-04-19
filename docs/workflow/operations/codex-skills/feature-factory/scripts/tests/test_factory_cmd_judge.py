import contextlib
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT_DIR = Path(__file__).resolve().parents[1]

STATE_SPEC = importlib.util.spec_from_file_location("factory_state", SCRIPT_DIR / "factory_state.py")
assert STATE_SPEC and STATE_SPEC.loader
FACTORY_STATE = importlib.util.module_from_spec(STATE_SPEC)
sys.modules[STATE_SPEC.name] = FACTORY_STATE
STATE_SPEC.loader.exec_module(FACTORY_STATE)

JUDGE_SPEC = importlib.util.spec_from_file_location("factory_cmd_judge", SCRIPT_DIR / "factory_cmd_judge.py")
assert JUDGE_SPEC and JUDGE_SPEC.loader
JUDGE = importlib.util.module_from_spec(JUDGE_SPEC)
sys.modules[JUDGE_SPEC.name] = JUDGE
JUDGE_SPEC.loader.exec_module(JUDGE)

WORKFLOW_UTILS_SPEC = importlib.util.spec_from_file_location(
    "workflow_utils",
    Path(__file__).resolve().parents[3] / "review-lens" / "scripts" / "workflow_utils.py",
)
assert WORKFLOW_UTILS_SPEC and WORKFLOW_UTILS_SPEC.loader
WORKFLOW_UTILS = importlib.util.module_from_spec(WORKFLOW_UTILS_SPEC)
sys.modules[WORKFLOW_UTILS_SPEC.name] = WORKFLOW_UTILS
WORKFLOW_UTILS_SPEC.loader.exec_module(WORKFLOW_UTILS)


SLUG = "ff-judge-panel"
STAGE = "plan"


def _base_state() -> dict:
    state = FACTORY_STATE._default_workflow_state()
    state["schema_version"] = 2
    return state


def _stage_state(adversarial_rounds: int, judge_rounds: int = 0) -> dict:
    return {
        "adversarial_rounds": adversarial_rounds,
        "judge_rounds": judge_rounds,
        "judge_verdicts": [],
        "annotations": [],
        "unresolved_concerns": [],
        "adversarial_sha_history": ["sha-round-1", "sha-round-2", "sha-round-3"],
        "initial_sha": "sha-round-1",
    }


def _write_review(path: Path, artifact_sha: str, resolution_note: str, findings: list[str]) -> None:
    body = "\n".join(
        [
            "# Review: plan adversarial",
            "",
            "## Findings",
            "",
            *findings,
            "",
            "## Residual Risks",
            "",
            "- none",
            "",
            "## Resolution",
            "- status: accepted",
            f"- note: {resolution_note}",
            "",
        ]
    )
    metadata = {
        "reviewer": "codex",
        "lens": "feasibility-adversarial",
        "stage": STAGE,
        "artifact_path": f"docs/workflow/feature-runs/{SLUG}/{STAGE}.md",
        "artifact_sha256": artifact_sha,
        "repo_root": ".",
        "git_head_sha": "head-sha",
        "git_base_ref": "origin/main",
        "git_base_sha": "base-sha",
        "generation_method": "codex-runner",
        "resolution_status": "accepted",
        "resolution_note": resolution_note,
        "raw_output_path": f"docs/workflow/feature-runs/{SLUG}/reviews/{path.stem}.raw.txt",
        "narrowed_artifact_path": "",
        "narrowed_artifact_sha256": "",
        "coverage_status": "full",
        "coverage_note": "",
    }
    frontmatter = "\n".join(["---", *[f'{k}: "{v}"' for k, v in metadata.items()], "---", ""])
    path.write_text(frontmatter + "\n" + body, encoding="utf-8")


def _write_workflow(tmpdir: str, stage_state: dict, review_specs: list[tuple[str, str, list[str]]]) -> Path:
    with patch.object(FACTORY_STATE, "FACTORY_RUNS_ROOT", Path(tmpdir)):
        root = FACTORY_STATE.workflow_dir(SLUG)
        root.mkdir(parents=True, exist_ok=True)
        (root / "spec.md").write_text("# Spec\n\nSpec content.\n", encoding="utf-8")
        (root / "plan.md").write_text("# Plan\n\nPlan content.\n", encoding="utf-8")
        (root / "tasks.md").write_text("# Tasks\n\nTasks content.\n", encoding="utf-8")
        reviews = FACTORY_STATE.reviews_dir(SLUG)
        reviews.mkdir(parents=True, exist_ok=True)
        for filename, artifact_sha, findings in review_specs:
            _write_review(reviews / filename, artifact_sha, f"fixed {filename}", findings)
        state = _base_state()
        state["stages"] = {STAGE: stage_state}
        state[f"{STAGE}_adversarial_rounds"] = stage_state["adversarial_rounds"]
        state[f"{STAGE}_judge_rounds"] = stage_state["judge_rounds"]
        FACTORY_STATE.atomic_json_write(FACTORY_STATE.factory_state_path(SLUG), state)
        return root


def _make_git_response(cmd: list[str], root: Path) -> subprocess.CompletedProcess:
    if "rev-parse" in cmd and "HEAD" in cmd:
        return subprocess.CompletedProcess(cmd, 0, stdout="head-sha\n", stderr="")
    if "merge-base" in cmd:
        return subprocess.CompletedProcess(cmd, 0, stdout="base-sha\n", stderr="")
    if "diff" in cmd:
        return subprocess.CompletedProcess(cmd, 0, stdout="diff --git a/plan.md b/plan.md\n", stderr="")
    return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")


def _model_response(model: str, verdict: str, reasoning: str) -> str:
    judge = {
        "gpt-5.4-mini": "completeness",
        "gpt-5.4": "restatement",
        "claude-sonnet-4-6": "implementation-risk",
    }[model]
    payload = {
        "judge": judge,
        "model": model,
        "verdict": verdict,
        "confidence": 4,
        "reasoning": reasoning,
        "evidence": [
            {"artifact": "plan.md", "section": "Findings", "quote": "supporting quote"},
        ],
        "timestamp": "2026-04-18T10:15:30Z",
    }
    return json.dumps(payload)


def _fake_stage_manifest_state(slug: str, stage: str) -> dict[str, object]:
    return {
        "artifact_path": FACTORY_STATE.workflow_dir(slug) / f"{stage}.md",
        "artifact_exists": True,
        "artifact_meaningful": True,
        "manifest_path": FACTORY_STATE.reviews_dir(slug) / f"{stage}.checkpoint.json",
        "manifest_exists": False,
        "healthy": False,
        "detail": "",
    }


class FactoryJudgeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self._root_patch = patch.object(FACTORY_STATE, "FACTORY_RUNS_ROOT", Path(self._tmpdir.name))
        self._root_patch.start()
        self.addCleanup(self._root_patch.stop)

    def _run_judge(self, stage_state: dict, review_specs: list[tuple[str, str, list[str]]], side_effect):
        _write_workflow(self._tmpdir.name, stage_state, review_specs)
        with patch.object(JUDGE.subprocess, "run", side_effect=side_effect), \
            patch.object(JUDGE, "stage_manifest_state", side_effect=_fake_stage_manifest_state):
            with contextlib.redirect_stdout(io.StringIO()) as stdout, contextlib.redirect_stderr(io.StringIO()):
                rc = JUDGE.run_judge(SLUG, STAGE)
        return rc, stdout.getvalue(), json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))

    def test_judge_refuses_before_round_3(self) -> None:
        stage_state = _stage_state(2)
        _write_workflow(self._tmpdir.name, stage_state, [])
        with contextlib.redirect_stdout(io.StringIO()) as stdout, contextlib.redirect_stderr(io.StringIO()):
            rc = JUDGE.run_judge(SLUG, STAGE)

        self.assertEqual(rc, 2)
        self.assertEqual(stdout.getvalue().strip(), "→ next: checkpoint")

    def test_judge_dispatches_three_parallel(self) -> None:
        stage_state = _stage_state(3)
        review_specs = [
            ("plan.codex.feasibility-adversarial.review.md", "sha-round-2", ["- HIGH: High finding from round 2."]),
            ("plan.gemini.testability-adversarial.review.md", "sha-round-3", ["- MEDIUM: Latest finding from round 3."]),
            ("plan.codex.edge-cases-adversarial.review.md", "sha-round-1", ["- LOW: Older finding."]),
        ]
        barrier = threading.Barrier(3)
        prompts: dict[str, str] = {}

        def side_effect(cmd, *args, **kwargs):
            if cmd[0] == "git":
                return _make_git_response(cmd, Path(self._tmpdir.name))
            if cmd[0] == "codex" or cmd[0] == "claude":
                barrier.wait(timeout=5)
                model = cmd[cmd.index("-m") + 1] if "-m" in cmd else cmd[cmd.index("--model") + 1]
                prompt = kwargs.get("input") if cmd[0] == "codex" else cmd[-1]
                prompts[model] = prompt
                return subprocess.CompletedProcess(cmd, 0, stdout=_model_response(model, "proceed", f"{model} ok"), stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        rc, stdout, state = self._run_judge(stage_state, review_specs, side_effect)
        self.assertEqual(rc, 0)

        reviews = FACTORY_STATE.reviews_dir(SLUG)
        verdict_files = sorted(reviews.glob("judge.*.verdict.json"))
        review_files = sorted(reviews.glob("judge.*.review.md"))
        self.assertEqual(len(verdict_files), 3)
        self.assertEqual(len(review_files), 3)

        artifact = FACTORY_STATE.workflow_dir(SLUG) / "plan.md"
        verify_script = Path(__file__).resolve().parents[3] / "review-lens" / "scripts" / "verify_review_checkpoint.py"
        verify = subprocess.run(
            [
                sys.executable,
                str(verify_script),
                "--artifact",
                str(artifact),
                "--required-review",
                str(review_files[0]),
                "--required-review",
                str(review_files[1]),
                "--required-review",
                str(review_files[2]),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(verify.returncode, 0, verify.stdout + verify.stderr)

        self.assertIn("gpt-5.4-mini", prompts)
        self.assertIn("gpt-5.4", prompts)
        self.assertIn("claude-sonnet-4-6", prompts)
        self.assertIn("High finding from round 2", prompts["gpt-5.4-mini"])
        self.assertIn("Spec content.", prompts["gpt-5.4-mini"])
        self.assertIn("Latest finding from round 3", prompts["gpt-5.4"])
        self.assertIn("Older finding.", prompts["gpt-5.4"])
        self.assertIn("diff --git a/plan.md b/plan.md", prompts["claude-sonnet-4-6"])
        self.assertEqual(state["stages"][STAGE]["judge_rounds"], 1)
        self.assertEqual(state["stages"][STAGE]["judge_verdicts"][0][0]["verdict"], "proceed")
        self.assertEqual(state["last_action_result"]["outcome"], "advance")

    def test_judge_majority_proceed_advances(self) -> None:
        stage_state = _stage_state(3)
        review_specs = [("plan.codex.feasibility-adversarial.review.md", "sha-round-3", ["- HIGH: High finding."])]

        def side_effect(cmd, *args, **kwargs):
            if cmd[0] == "git":
                return _make_git_response(cmd, Path(self._tmpdir.name))
            if cmd[0] == "codex" or cmd[0] == "claude":
                model = cmd[cmd.index("-m") + 1] if "-m" in cmd else cmd[cmd.index("--model") + 1]
                verdict = "proceed-with-annotation" if model == "gpt-5.4-mini" else "proceed"
                return subprocess.CompletedProcess(cmd, 0, stdout=_model_response(model, verdict, f"{model} proceed"), stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        rc, _, state = self._run_judge(stage_state, review_specs, side_effect)
        self.assertEqual(rc, 0)
        self.assertEqual(state["stages"][STAGE]["judge_rounds"], 1)
        self.assertEqual(state["last_action_result"]["outcome"], "advance")
        self.assertEqual(state["stages"][STAGE]["judge_next_action"], "advance")

    def test_judge_majority_block_sets_revote_flag(self) -> None:
        stage_state = _stage_state(3)
        review_specs = [("plan.codex.feasibility-adversarial.review.md", "sha-round-3", ["- HIGH: High finding."])]

        def side_effect(cmd, *args, **kwargs):
            if cmd[0] == "git":
                return _make_git_response(cmd, Path(self._tmpdir.name))
            if cmd[0] == "codex" or cmd[0] == "claude":
                model = cmd[cmd.index("-m") + 1] if "-m" in cmd else cmd[cmd.index("--model") + 1]
                return subprocess.CompletedProcess(cmd, 0, stdout=_model_response(model, "block", f"{model} block"), stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        rc, _, state = self._run_judge(stage_state, review_specs, side_effect)
        self.assertEqual(rc, 0)
        self.assertEqual(state["stages"][STAGE]["judge_rounds"], 1)
        self.assertEqual(state["stages"][STAGE]["judge_next_action"], "edit-and-rejudge")
        self.assertEqual(state["last_action_result"]["outcome"], "rejudge")

    def test_judge_schema_violation_retry_then_fallback_block(self) -> None:
        stage_state = _stage_state(3)
        review_specs = [("plan.codex.feasibility-adversarial.review.md", "sha-round-3", ["- HIGH: High finding."])]

        def side_effect(cmd, *args, **kwargs):
            if cmd[0] == "git":
                return _make_git_response(cmd, Path(self._tmpdir.name))
            if cmd[0] == "codex" or cmd[0] == "claude":
                return subprocess.CompletedProcess(cmd, 0, stdout="not json", stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        rc, _, state = self._run_judge(stage_state, review_specs, side_effect)
        self.assertEqual(rc, 0)
        verdict_files = sorted(FACTORY_STATE.reviews_dir(SLUG).glob("judge.*.verdict.json"))
        self.assertEqual(len(verdict_files), 3)
        for path in verdict_files:
            verdict = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(verdict["verdict"], "block")
            self.assertEqual(verdict["confidence"], 0)
            self.assertIn("schema_violation", verdict["reasoning"])
        self.assertEqual(state["last_action_result"]["outcome"], "rejudge")

    def test_judge_proceed_with_annotation_recorded(self) -> None:
        stage_state = _stage_state(3)
        review_specs = [("plan.codex.feasibility-adversarial.review.md", "sha-round-3", ["- HIGH: High finding."])]

        def side_effect(cmd, *args, **kwargs):
            if cmd[0] == "git":
                return _make_git_response(cmd, Path(self._tmpdir.name))
            if cmd[0] == "codex" or cmd[0] == "claude":
                model = cmd[cmd.index("-m") + 1] if "-m" in cmd else cmd[cmd.index("--model") + 1]
                verdict = "proceed-with-annotation" if model == "gpt-5.4-mini" else "proceed"
                return subprocess.CompletedProcess(cmd, 0, stdout=_model_response(model, verdict, f"{model} annotated"), stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        rc, _, state = self._run_judge(stage_state, review_specs, side_effect)
        self.assertEqual(rc, 0)
        annotations = state["stages"][STAGE]["annotations"]
        self.assertEqual(len(annotations), 1)
        self.assertEqual(annotations[0]["judge"], "completeness")
        self.assertEqual(annotations[0]["stage"], STAGE)
        self.assertEqual(state["stages"][STAGE]["judge_verdicts"][0][0]["verdict"], "proceed-with-annotation")


if __name__ == "__main__":
    unittest.main()
