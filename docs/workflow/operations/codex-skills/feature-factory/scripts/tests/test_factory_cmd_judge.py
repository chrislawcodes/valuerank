import contextlib
import importlib.util
import io
import json
from collections import Counter
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

EMBEDDINGS_SPEC = importlib.util.spec_from_file_location("factory_embeddings", SCRIPT_DIR / "factory_embeddings.py")
assert EMBEDDINGS_SPEC and EMBEDDINGS_SPEC.loader
FACTORY_EMBEDDINGS = importlib.util.module_from_spec(EMBEDDINGS_SPEC)
sys.modules[EMBEDDINGS_SPEC.name] = FACTORY_EMBEDDINGS
EMBEDDINGS_SPEC.loader.exec_module(FACTORY_EMBEDDINGS)

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


def _stage_state(
    adversarial_rounds: int,
    judge_rounds: int = 0,
    judge_verdicts: list[list[dict]] | None = None,
) -> dict:
    state = {
        "adversarial_rounds": adversarial_rounds,
        "judge_rounds": judge_rounds,
        "judge_verdicts": judge_verdicts if judge_verdicts is not None else [],
        "annotations": [],
        "unresolved_concerns": [],
        "adversarial_sha_history": ["sha-round-1", "sha-round-2", "sha-round-3"],
        "initial_sha": "sha-round-1",
    }
    return state


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


def _detect_lens_from_prompt(prompt: str) -> str:
    """Identify the judge lens by distinctive phrasing in the system prompt.

    Multiple lenses can share a model (e.g., restatement + implementation-risk
    both use gpt-5.4 after PR #790), so model alone is no longer a unique
    discriminator. Use prompt content instead.
    """
    if "completeness auditor" in prompt:
        return "completeness"
    if "review-loop auditor" in prompt:
        return "restatement"
    if "implementation-risk assessor" in prompt:
        return "implementation-risk"
    raise AssertionError(f"unknown judge prompt: {prompt[:200]!r}")


def _model_response(model: str, verdict: str, reasoning: str, judge: str | None = None) -> str:
    """Build a fake JSON verdict for the given model.

    `judge` may be passed explicitly to disambiguate when multiple lenses
    share a model (PR #790). If omitted, falls back to the legacy
    model-only mapping for back-compat.
    """
    if judge is None:
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

    def test_judge_at_cap_recomputes_fresh_next_action(self) -> None:
        """After judge_rounds >= 3, subsequent judge calls must recompute the
        exhausted-payload next_action instead of returning a stale value left
        over from an earlier loop iteration.

        Regression test for the infinite-loop bug where
        `last_action_result["next"] == "judge_panel"` (set by an earlier
        checkpoint at the cap) was returned verbatim by judge, causing the
        orchestrator to be told "run judge_panel" forever.
        """
        stage_state = _stage_state(3, 3)
        stage_state["judge_verdicts"] = [
            [
                {
                    "judge": "completeness",
                    "model": "gpt-5.4-mini",
                    "verdict": "block",
                    "confidence": 4,
                    "reasoning": "Round 3 block example.",
                    "evidence": [],
                    "timestamp": "2026-04-18T10:00:00Z",
                },
                {
                    "judge": "restatement",
                    "model": "gpt-5.4",
                    "verdict": "block",
                    "confidence": 4,
                    "reasoning": "Round 3 block example.",
                    "evidence": [],
                    "timestamp": "2026-04-18T10:00:00Z",
                },
                {
                    "judge": "implementation-risk",
                    "model": "claude-sonnet-4-6",
                    "verdict": "proceed",
                    "confidence": 4,
                    "reasoning": "Round 3 proceed example.",
                    "evidence": [],
                    "timestamp": "2026-04-18T10:00:00Z",
                },
            ]
        ]
        _write_workflow(self._tmpdir.name, stage_state, [])

        # Simulate the stale state the prior buggy flow would leave behind.
        state_path = FACTORY_STATE.factory_state_path(SLUG)
        workflow_state = json.loads(state_path.read_text(encoding="utf-8"))
        workflow_state["last_action_result"] = {
            "next": "judge_panel",
            "reason": "stale remnant from earlier loop",
            "blockers": [],
            "outcome": "rejudge",
        }
        FACTORY_STATE.atomic_json_write(state_path, workflow_state)

        def _side_effect(cmd, *args, **kwargs):
            if cmd[0] == "git":
                return _make_git_response(cmd, Path(self._tmpdir.name))
            raise AssertionError("judge must not call any model when at cap")

        with patch.object(JUDGE.subprocess, "run", side_effect=_side_effect), \
            patch.object(JUDGE, "stage_manifest_state", side_effect=_fake_stage_manifest_state):
            with contextlib.redirect_stdout(io.StringIO()) as stdout, contextlib.redirect_stderr(io.StringIO()):
                rc = JUDGE.run_judge(SLUG, STAGE)

        self.assertEqual(rc, 0)
        # The runner must advance rather than regurgitate the stale
        # "judge_panel" next action. "repair_plan_checkpoint" or similar
        # forward-progressing action is expected here.
        self.assertNotEqual(stdout.getvalue().strip(), "→ next: judge_panel")
        state = json.loads(state_path.read_text(encoding="utf-8"))
        self.assertNotEqual(state["last_action_result"]["next"], "judge_panel")

    def test_judge_dispatches_three_parallel(self) -> None:
        stage_state = _stage_state(3)
        review_specs = [
            ("plan.codex.feasibility-adversarial.review.md", "sha-round-2", ["- HIGH: High finding from round 2."]),
            ("plan.gemini.testability-adversarial.review.md", "sha-round-3", ["- MEDIUM: Latest finding from round 3."]),
            ("plan.codex.edge-cases-adversarial.review.md", "sha-round-1", ["- LOW: Older finding."]),
        ]
        barrier = threading.Barrier(3)
        prompts: dict[str, str] = {}  # keyed by lens (PR #790: lenses can share a model)

        def side_effect(cmd, *args, **kwargs):
            if cmd[0] == "git":
                return _make_git_response(cmd, Path(self._tmpdir.name))
            if cmd[0] == "codex" or cmd[0] == "claude":
                barrier.wait(timeout=5)
                model = cmd[cmd.index("-m") + 1] if "-m" in cmd else cmd[cmd.index("--model") + 1]
                prompt = kwargs.get("input") if cmd[0] == "codex" else cmd[-1]
                lens = _detect_lens_from_prompt(prompt)
                prompts[lens] = prompt
                return subprocess.CompletedProcess(
                    cmd, 0,
                    stdout=_model_response(model, "proceed", f"{lens} ok", judge=lens),
                    stderr="",
                )
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

        # PR #790: assertions key by LENS, not model — restatement and
        # implementation-risk both use gpt-5.4, so model alone is ambiguous.
        self.assertIn("completeness", prompts)
        self.assertIn("restatement", prompts)
        self.assertIn("implementation-risk", prompts)
        self.assertIn("High finding from round 2", prompts["completeness"])
        self.assertIn("Spec content.", prompts["completeness"])
        self.assertIn("Latest finding from round 3", prompts["restatement"])
        self.assertIn("Older finding.", prompts["restatement"])
        self.assertIn("diff --git a/plan.md b/plan.md", prompts["implementation-risk"])
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
        self.assertEqual(state["stages"][STAGE]["judge_next_action"], "edit_and_rerun_judge")
        self.assertEqual(state["last_action_result"]["next"], "edit_and_rerun_judge")
        self.assertEqual(state["last_action_result"]["outcome"], "rejudge")

    def test_judge_round2_dispatches_after_round1_block(self) -> None:
        stage_state = _stage_state(3)
        review_specs = [("plan.codex.feasibility-adversarial.review.md", "sha-round-3", ["- HIGH: High finding."])]
        call_rounds: list[tuple[int, str]] = []

        def side_effect(cmd, *args, **kwargs):
            if cmd[0] == "git":
                return _make_git_response(cmd, Path(self._tmpdir.name))
            if cmd[0] == "codex" or cmd[0] == "claude":
                model = cmd[cmd.index("-m") + 1] if "-m" in cmd else cmd[cmd.index("--model") + 1]
                current_state = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
                judge_round = current_state["stages"][STAGE]["judge_rounds"]
                call_rounds.append((judge_round, model))
                verdict_by_round = {
                    0: {
                        "gpt-5.4-mini": "block",
                        "gpt-5.4": "block",
                        "claude-sonnet-4-6": "proceed",
                    },
                    1: {
                        "gpt-5.4-mini": "proceed",
                        "gpt-5.4": "proceed",
                        "claude-sonnet-4-6": "block",
                    },
                }[judge_round]
                verdict = verdict_by_round[model]
                return subprocess.CompletedProcess(cmd, 0, stdout=_model_response(model, verdict, f"{model} round {judge_round}"), stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        _write_workflow(self._tmpdir.name, stage_state, review_specs)
        with patch.object(JUDGE.subprocess, "run", side_effect=side_effect), \
            patch.object(JUDGE, "stage_manifest_state", side_effect=_fake_stage_manifest_state):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                first_rc = JUDGE.run_judge(SLUG, STAGE)
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                second_rc = JUDGE.run_judge(SLUG, STAGE)

        self.assertEqual(first_rc, 0)
        self.assertEqual(second_rc, 0)
        state = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
        self.assertEqual(state["stages"][STAGE]["judge_rounds"], 2)
        self.assertEqual(len(state["stages"][STAGE]["judge_verdicts"]), 2)
        self.assertEqual(state["stages"][STAGE]["judge_next_action"], "advance")
        self.assertEqual(Counter(round_index for round_index, _ in call_rounds), Counter({0: 3, 1: 3}))
        self.assertEqual(state["last_action_result"]["outcome"], "advance")

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

    def test_judge_auto_advance_at_round_3_with_unresolved_concerns(self) -> None:
        prior_rounds = [
            [
                {
                    "judge": "completeness",
                    "model": "gpt-5.4-mini",
                    "verdict": "block",
                    "confidence": 4,
                    "reasoning": "Shared concern about missing rollback path.",
                    "evidence": [],
                    "timestamp": "2026-04-18T10:15:30Z",
                }
            ],
            [
                {
                    "judge": "restatement",
                    "model": "gpt-5.4",
                    "verdict": "block",
                    "confidence": 4,
                    "reasoning": "Shared concern about missing rollback path.",
                    "evidence": [],
                    "timestamp": "2026-04-18T10:20:30Z",
                }
            ],
        ]
        stage_state = _stage_state(3, judge_rounds=2, judge_verdicts=prior_rounds)
        review_specs = [("plan.codex.feasibility-adversarial.review.md", "sha-round-3", ["- HIGH: High finding."])]

        def side_effect(cmd, *args, **kwargs):
            if cmd[0] == "git":
                return _make_git_response(cmd, Path(self._tmpdir.name))
            if cmd[0] == "codex" or cmd[0] == "claude":
                model = cmd[cmd.index("-m") + 1] if "-m" in cmd else cmd[cmd.index("--model") + 1]
                lens_detected = _detect_lens_from_prompt(kwargs.get("input") or cmd[-1])
                verdict = "block" if lens_detected != "implementation-risk" else "proceed"
                return subprocess.CompletedProcess(cmd, 0, stdout=_model_response(model, verdict, f"{lens_detected} round 2 {verdict}", judge=lens_detected), stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        _write_workflow(self._tmpdir.name, stage_state, review_specs)
        with patch.object(JUDGE.subprocess, "run", side_effect=side_effect), \
            patch.object(JUDGE, "stage_manifest_state", side_effect=_fake_stage_manifest_state), \
            patch.object(FACTORY_EMBEDDINGS, "cosine_similarity", return_value=0.9), \
            self.assertLogs(JUDGE.__name__, level="WARNING") as logs:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                rc = JUDGE.run_judge(SLUG, STAGE)

        self.assertEqual(rc, 0)
        state = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
        self.assertEqual(state["stages"][STAGE]["judge_rounds"], 3)
        concerns = state["stages"][STAGE]["unresolved_concerns"]
        self.assertEqual(len(concerns), 2)
        self.assertEqual(state["stages"][STAGE]["judge_next_action"], "advance")
        self.assertEqual(state["last_action_result"]["outcome"], "advance")
        self.assertIn("judge panel exhausted; advancing with unresolved concerns", state["last_action_result"]["reason"])
        self.assertTrue(any("judge panel exhausted; advancing with unresolved concerns" in line for line in logs.output))
        for concern in concerns:
            self.assertEqual(concern["also_raised_in_round"], [1, 2])

    def test_judge_also_raised_in_round_populated_when_similar(self) -> None:
        prior_rounds = [
            [
                {
                    "judge": "completeness",
                    "model": "gpt-5.4-mini",
                    "verdict": "block",
                    "confidence": 4,
                    "reasoning": "Round 1 concern about missing rollback path.",
                    "evidence": [],
                    "timestamp": "2026-04-18T10:15:30Z",
                }
            ],
            [
                {
                    "judge": "restatement",
                    "model": "gpt-5.4",
                    "verdict": "block",
                    "confidence": 4,
                    "reasoning": "Round 2 concern about missing rollback path.",
                    "evidence": [],
                    "timestamp": "2026-04-18T10:20:30Z",
                }
            ],
        ]
        stage_state = _stage_state(3, judge_rounds=2, judge_verdicts=prior_rounds)
        review_specs = [("plan.codex.feasibility-adversarial.review.md", "sha-round-3", ["- HIGH: High finding."])]

        def side_effect(cmd, *args, **kwargs):
            if cmd[0] == "git":
                return _make_git_response(cmd, Path(self._tmpdir.name))
            if cmd[0] == "codex" or cmd[0] == "claude":
                model = cmd[cmd.index("-m") + 1] if "-m" in cmd else cmd[cmd.index("--model") + 1]
                lens_detected = _detect_lens_from_prompt(kwargs.get("input") or cmd[-1])
                verdict = "block" if lens_detected != "implementation-risk" else "proceed"
                return subprocess.CompletedProcess(cmd, 0, stdout=_model_response(model, verdict, f"{lens_detected} round 3 {verdict}", judge=lens_detected), stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        _write_workflow(self._tmpdir.name, stage_state, review_specs)
        with patch.object(JUDGE.subprocess, "run", side_effect=side_effect), \
            patch.object(JUDGE, "stage_manifest_state", side_effect=_fake_stage_manifest_state), \
            patch.object(FACTORY_EMBEDDINGS, "cosine_similarity", return_value=0.9):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                rc = JUDGE.run_judge(SLUG, STAGE)

        self.assertEqual(rc, 0)
        state = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
        concerns = state["stages"][STAGE]["unresolved_concerns"]
        self.assertEqual(len(concerns), 2)
        self.assertTrue(all(concern["also_raised_in_round"] == [1, 2] for concern in concerns))

    def test_judge_also_raised_in_round_empty_when_dissimilar(self) -> None:
        prior_rounds = [
            [
                {
                    "judge": "completeness",
                    "model": "gpt-5.4-mini",
                    "verdict": "block",
                    "confidence": 4,
                    "reasoning": "Round 1 concern about missing rollback path.",
                    "evidence": [],
                    "timestamp": "2026-04-18T10:15:30Z",
                }
            ],
            [
                {
                    "judge": "restatement",
                    "model": "gpt-5.4",
                    "verdict": "block",
                    "confidence": 4,
                    "reasoning": "Round 2 concern about missing rollback path.",
                    "evidence": [],
                    "timestamp": "2026-04-18T10:20:30Z",
                }
            ],
        ]
        stage_state = _stage_state(3, judge_rounds=2, judge_verdicts=prior_rounds)
        review_specs = [("plan.codex.feasibility-adversarial.review.md", "sha-round-3", ["- HIGH: High finding."])]

        def side_effect(cmd, *args, **kwargs):
            if cmd[0] == "git":
                return _make_git_response(cmd, Path(self._tmpdir.name))
            if cmd[0] == "codex" or cmd[0] == "claude":
                model = cmd[cmd.index("-m") + 1] if "-m" in cmd else cmd[cmd.index("--model") + 1]
                lens_detected = _detect_lens_from_prompt(kwargs.get("input") or cmd[-1])
                verdict = "block" if lens_detected != "implementation-risk" else "proceed"
                return subprocess.CompletedProcess(cmd, 0, stdout=_model_response(model, verdict, f"{lens_detected} round 3 {verdict}", judge=lens_detected), stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        _write_workflow(self._tmpdir.name, stage_state, review_specs)
        with patch.object(JUDGE.subprocess, "run", side_effect=side_effect), \
            patch.object(JUDGE, "stage_manifest_state", side_effect=_fake_stage_manifest_state), \
            patch.object(FACTORY_EMBEDDINGS, "cosine_similarity", return_value=0.2):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                rc = JUDGE.run_judge(SLUG, STAGE)

        self.assertEqual(rc, 0)
        state = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
        concerns = state["stages"][STAGE]["unresolved_concerns"]
        self.assertEqual(len(concerns), 2)
        self.assertTrue(all(concern["also_raised_in_round"] == [] for concern in concerns))

    def test_judge_migration_bypass_logs_state_use(self) -> None:
        stage_state = _stage_state(0)
        review_specs: list[tuple[str, str, list[str]]] = []
        _write_workflow(self._tmpdir.name, stage_state, review_specs)
        verdicts = [
            {
                "judge": "completeness",
                "model": "gpt-5.4-mini",
                "verdict": "proceed",
                "confidence": 4,
                "reasoning": "completeness ok",
                "evidence": [{"artifact": "plan.md", "section": "Findings", "quote": "complete"}],
                "timestamp": "2026-04-19T12:00:00Z",
            },
            {
                "judge": "restatement",
                "model": "gpt-5.4",
                "verdict": "proceed",
                "confidence": 4,
                "reasoning": "restatement ok",
                "evidence": [{"artifact": "plan.md", "section": "Findings", "quote": "restated"}],
                "timestamp": "2026-04-19T12:00:00Z",
            },
            {
                "judge": "implementation-risk",
                "model": "claude-sonnet-4-6",
                "verdict": "proceed",
                "confidence": 4,
                "reasoning": "implementation risk acceptable",
                "evidence": [{"artifact": "plan.md", "section": "Findings", "quote": "risk"}],
                "timestamp": "2026-04-19T12:00:00Z",
            },
        ]

        with patch.object(JUDGE, "_validate_json_output", return_value=(verdicts, "sha-current", "sha-head")), \
            patch.object(JUDGE, "HeartbeatEmitter", return_value=contextlib.nullcontext()), \
            patch.object(JUDGE, "recommended_next_action", return_value="done"):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                rc = JUDGE.run_judge(SLUG, STAGE, migration_bypass=True)

        self.assertEqual(rc, 0)
        state = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
        uses = state.get("migration_bypass_uses", [])
        self.assertEqual(len(uses), 1)
        self.assertEqual(uses[0]["stage"], STAGE)
        self.assertIn("timestamp", uses[0])
        self.assertIn("operator_id", uses[0])


class ValidateVerdictMetadataTests(unittest.TestCase):
    """Regression tests for $schema / $id / title tolerance in _validate_verdict.

    Claude has been observed echoing JSON-Schema metadata fields ($schema,
    $id) back into the verdict when the prompt appendix includes the full
    schema. These fields have no semantic meaning; stripping them before
    the extra-fields check prevents false-block schema_violation fallbacks.
    """

    def _valid_verdict_with(self, **extras: object) -> dict:
        base = {
            "judge": "completeness",
            "model": "gpt-5.4-mini",
            "verdict": "proceed",
            "confidence": 3,
            "reasoning": "placeholder reasoning long enough to pass the minimum-length check",
            "evidence": [{"artifact": "spec", "section": "FR-1", "quote": "X"}],
            "timestamp": "2026-04-19T00:00:00Z",
        }
        base.update(extras)
        return base

    def test_bare_valid_verdict_passes(self) -> None:
        self.assertIsNone(JUDGE._validate_verdict(self._valid_verdict_with()))

    def test_schema_metadata_field_tolerated(self) -> None:
        v = self._valid_verdict_with(**{"$schema": "http://json-schema.org/draft-07/schema#"})
        self.assertIsNone(JUDGE._validate_verdict(v))
        self.assertNotIn("$schema", v)  # stripped in place

    def test_id_and_title_tolerated(self) -> None:
        v = self._valid_verdict_with(**{"$id": "x", "title": "y", "description": "z"})
        self.assertIsNone(JUDGE._validate_verdict(v))

    def test_non_metadata_extra_still_rejected(self) -> None:
        v = self._valid_verdict_with(verdict_extra_field="nope")
        err = JUDGE._validate_verdict(v)
        self.assertIsNotNone(err)
        self.assertIn("verdict_extra_field", err)


class StripMarkdownJsonFencesTests(unittest.TestCase):
    """Regression tests for the post-migration fix to _strip_markdown_json_fences.

    Claude (and some Codex CLI output modes) wrap JSON verdicts in
    ```json ... ``` markdown fences by default. The first production run
    of the migration script hit 2/6 schema_violation fallbacks purely
    because the fence wrapping was not being stripped before json.loads.
    """

    def test_plain_json_passes_through(self) -> None:
        raw = '{"verdict":"proceed","confidence":3}'
        self.assertEqual(JUDGE._strip_markdown_json_fences(raw), raw)

    def test_json_fence_with_language_tag_stripped(self) -> None:
        raw = '```json\n{"verdict":"block","confidence":4}\n```'
        stripped = JUDGE._strip_markdown_json_fences(raw)
        self.assertEqual(stripped, '{"verdict":"block","confidence":4}')
        # And the parser can now load it.
        self.assertEqual(json.loads(stripped)["verdict"], "block")

    def test_json_fence_without_language_tag_stripped(self) -> None:
        raw = '```\n{"verdict":"proceed","confidence":2}\n```'
        stripped = JUDGE._strip_markdown_json_fences(raw)
        self.assertEqual(stripped, '{"verdict":"proceed","confidence":2}')

    def test_surrounding_whitespace_stripped(self) -> None:
        raw = '   \n\n```json\n{"verdict":"proceed","confidence":5}\n```\n\n  '
        stripped = JUDGE._strip_markdown_json_fences(raw)
        self.assertEqual(stripped, '{"verdict":"proceed","confidence":5}')

    def test_empty_input_returns_empty(self) -> None:
        self.assertEqual(JUDGE._strip_markdown_json_fences(""), "")

    def test_only_opening_fence_still_stripped(self) -> None:
        # Malformed but we handle it: strip the opening fence even if no closer.
        raw = '```json\n{"verdict":"proceed"}'
        stripped = JUDGE._strip_markdown_json_fences(raw)
        self.assertEqual(stripped, '{"verdict":"proceed"}')


class ParseJsonRecursionRetryTests(unittest.TestCase):
    """Regression tests for _parse_json_with_recursion_retry.

    Codex hit `schema_violation: maximum recursion depth exceeded` repeatedly
    on the ff-reconciliation-hardening run because Python's `json.loads`
    is implemented recursively. A judge model that emits deeply-nested
    JSON (e.g., echoes the schema wrapped in many layers) trips the
    default ~1000 recursion limit and the FF runner cannot make progress.
    """

    def test_normal_json_parses(self) -> None:
        text = '{"verdict": "proceed", "confidence": 3}'
        parsed, error = JUDGE._parse_json_with_recursion_retry(text)
        self.assertIsNone(error)
        self.assertEqual(parsed["verdict"], "proceed")

    def test_invalid_json_returns_error_string(self) -> None:
        parsed, error = JUDGE._parse_json_with_recursion_retry("{not json}")
        self.assertIsNone(parsed)
        self.assertIsNotNone(error)
        # Existing behavior: non-recursion errors flow through unchanged.
        self.assertNotIn("maximum recursion depth", error)

    def test_deeply_nested_json_parses_after_retry(self) -> None:
        # Build JSON nested ~1500 levels — well past Python's default
        # recursion limit (~1000) but within the elevated retry cap (5000).
        depth = 1500
        nested = "[" * depth + "1" + "]" * depth
        parsed, error = JUDGE._parse_json_with_recursion_retry(nested)
        self.assertIsNone(error)
        # Verify the structure parsed correctly.
        cursor = parsed
        for _ in range(depth - 1):
            self.assertIsInstance(cursor, list)
            cursor = cursor[0]
        self.assertEqual(cursor, [1])

    def test_pathological_nesting_fails_cleanly(self) -> None:
        # If json.loads raises RecursionError EVEN at the elevated retry
        # limit, the helper must return a clear error message that names
        # the cap — NOT crash the process.
        with patch("json.loads", side_effect=RecursionError("test forced")):
            parsed, error = JUDGE._parse_json_with_recursion_retry("[]")
        self.assertIsNone(parsed)
        self.assertIsNotNone(error)
        self.assertIn("5000", error)
        self.assertIn("pathologically nested", error)

    def test_recursion_limit_restored_after_retry(self) -> None:
        # Whether the parse succeeds or not, sys.getrecursionlimit must
        # be the same after the call as before. Critical because elevated
        # limits leaking risk a real stack overflow on later code paths.
        limit_before = sys.getrecursionlimit()
        # Force the success-after-retry path.
        call_count = {"n": 0}
        original_loads = json.loads

        def first_recurse_then_succeed(text):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise RecursionError("test forced first call")
            return original_loads(text)

        with patch("json.loads", side_effect=first_recurse_then_succeed):
            parsed, error = JUDGE._parse_json_with_recursion_retry('{"x": 1}')
        self.assertIsNone(error)
        self.assertEqual(parsed, {"x": 1})
        self.assertEqual(sys.getrecursionlimit(), limit_before)
        # Also verify restore on the persistent-failure path.
        with patch("json.loads", side_effect=RecursionError("test forced")):
            JUDGE._parse_json_with_recursion_retry("[]")
        self.assertEqual(sys.getrecursionlimit(), limit_before)


if __name__ == "__main__":
    unittest.main()
