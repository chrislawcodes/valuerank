"""Tests for factory_cmd_closeout.command_standalone_closeout.

Covers the four required test cases:
  a. All stages fully reviewed → zero skipped lenses in coverage summary.
  b. Diff-stage default reviews removed → diff_lenses_skipped stays empty.
  c. Empty state (no stages, no token_usage, no discovery) → refuse, exit 0, no files.
  d. Re-run is idempotent: generated section of closeout.md is identical on second call.
"""
import argparse
import gc
import importlib.util
import io
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_DIR = Path(__file__).resolve().parents[1]


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPT_DIR / f"{name}.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


FACTORY_STATE = _load("factory_state")
FACTORY_CMD_CLOSEOUT = _load("factory_cmd_closeout")

# Shorthand
command_standalone_closeout = FACTORY_CMD_CLOSEOUT.command_standalone_closeout
_GEN_START = FACTORY_CMD_CLOSEOUT._GEN_START
_GEN_END = FACTORY_CMD_CLOSEOUT._GEN_END


def _patch_factory_state_roots(runs_root: Path, repo_root: Path) -> list:
    """Return a list of started patches covering all factory_state instances in memory."""
    patches = []
    for mod in list(gc.get_objects()):
        if not isinstance(mod, types.ModuleType):
            continue
        if getattr(mod, "__name__", "") != "factory_state":
            continue
        if hasattr(mod, "FACTORY_RUNS_ROOT"):
            p = mock.patch.object(mod, "FACTORY_RUNS_ROOT", runs_root)
            p.start()
            patches.append(p)
        if hasattr(mod, "REPO_ROOT"):
            p = mock.patch.object(mod, "REPO_ROOT", repo_root)
            p.start()
            patches.append(p)
    # Also patch the closeout module's imported names
    for attr in ("workflow_dir", "reviews_dir", "load_workflow_state", "save_workflow_state"):
        if hasattr(FACTORY_CMD_CLOSEOUT, attr):
            fn = getattr(FACTORY_CMD_CLOSEOUT, attr)
            # The function refers to FACTORY_RUNS_ROOT inside factory_state —
            # already patched above. No additional patch needed.
    return patches


def _closeout_args(**overrides) -> argparse.Namespace:
    defaults = {
        "slug": "test-slug",
        "pr_url": None,
        "pr_number": None,
        "merge_sha": None,
        "note": None,
        "out": None,
    }
    defaults.update(overrides)
    return argparse.Namespace(**defaults)


class CloseoutCommandTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self.repo_root = Path(self._tmpdir.name)
        self.runs_root = self.repo_root / "docs" / "workflow" / "feature-runs"
        self.slug = "test-slug"
        self.workflow_dir = self.runs_root / self.slug
        self.workflow_dir.mkdir(parents=True, exist_ok=True)

        self._patches = _patch_factory_state_roots(self.runs_root, self.repo_root)
        self.addCleanup(lambda: [p.stop() for p in self._patches])

        # Suppress gh CLI detection in all tests
        self._gh_patch = mock.patch.object(
            FACTORY_CMD_CLOSEOUT, "_detect_pr_from_gh", return_value={}
        )
        self._gh_patch.start()
        self.addCleanup(self._gh_patch.stop)

    def _write_state(self, state: dict) -> None:
        FACTORY_STATE.save_workflow_state(self.slug, state)

    def _write_review(self, stage: str, reviewer: str, lens: str, content: str = "## Findings\n\nnone\n\n## Residual Risks\n\nnone") -> None:
        rdir = self.workflow_dir / "reviews"
        rdir.mkdir(parents=True, exist_ok=True)
        fname = f"{stage}.{reviewer}.{lens}.review.md"
        (rdir / fname).write_text(content, encoding="utf-8")

    def _make_state_with_stages(self) -> dict:
        state = FACTORY_STATE._default_workflow_state()
        state["schema_version"] = 2
        state["discovery"] = {
            "version": 2,
            "required": True,
            "complete": True,
            "question_count": 0,
            "asked_count": 0,
            "questions": [],
            "assumptions": [],
            "summary": "",
            "updated_at": 0,
            "answers": {},
            "non_goals": [],
            "acceptance_criteria": [],
            "unresolved": [],
        }
        state["stages"] = {
            "spec": {"adversarial_rounds": 3, "annotations": [], "adversarial_sha_history": [], "initial_sha": ""},
            "plan": {"adversarial_rounds": 3, "annotations": [], "adversarial_sha_history": [], "initial_sha": ""},
            "tasks": {"adversarial_rounds": 3, "annotations": [], "adversarial_sha_history": [], "initial_sha": ""},
            "diff": {"adversarial_rounds": 1, "annotations": [], "adversarial_sha_history": [], "initial_sha": ""},
        }
        state["token_usage"] = []
        return state

    def test_all_stages_fully_reviewed_zero_skipped(self) -> None:
        """a. Surviving default lenses present → coverage summary reports zero skipped."""
        state = self._make_state_with_stages()
        self._write_state(state)

        # Write the surviving default lenses for spec and plan only.
        for stage, lenses in [
            ("spec", [("codex", "feasibility-adversarial"), ("gemini", "requirements-adversarial")]),
            ("plan", [("codex", "implementation-adversarial"), ("gemini", "testability-adversarial")]),
        ]:
            for reviewer, lens in lenses:
                self._write_review(stage, reviewer, lens)

        args = _closeout_args(slug=self.slug, pr_url="https://example.com/pr/1", pr_number=1)
        rc = command_standalone_closeout(args)

        self.assertEqual(rc, 0)
        reloaded = FACTORY_STATE.load_workflow_state(self.slug)
        delivery = reloaded.get("delivery", {})
        cov = delivery.get("review_coverage_summary", {})

        # No stage should have skipped lenses.
        for stage in ["spec", "plan", "tasks", "diff", "closeout"]:
            skipped = cov.get(f"{stage}_lenses_skipped", [])
            self.assertEqual(skipped, [], f"Expected no skipped lenses for {stage}, got {skipped}")

    def test_diff_has_no_default_skipped_lenses(self) -> None:
        """b. Diff-stage no longer has default reviews, so skipped stays empty."""
        state = self._make_state_with_stages()
        self._write_state(state)

        # Write the surviving default lenses for spec/plan and one extra diff review.
        for stage, lenses in [
            ("spec", [("codex", "feasibility-adversarial"), ("gemini", "requirements-adversarial")]),
            ("plan", [("codex", "implementation-adversarial"), ("gemini", "testability-adversarial")]),
            ("diff", [("gemini", "quality-adversarial")]),
        ]:
            for reviewer, lens in lenses:
                self._write_review(stage, reviewer, lens)

        args = _closeout_args(slug=self.slug, pr_url="https://example.com/pr/2", pr_number=2)
        rc = command_standalone_closeout(args)

        self.assertEqual(rc, 0)
        reloaded = FACTORY_STATE.load_workflow_state(self.slug)
        delivery = reloaded.get("delivery", {})
        cov = delivery.get("review_coverage_summary", {})

        diff_skipped = cov.get("diff_lenses_skipped", [])
        self.assertEqual(diff_skipped, [])
        # Gemini quality should still be counted as run.
        diff_run = cov.get("diff_lenses_run", [])
        self.assertIn("gemini:quality-adversarial", diff_run)
        self.assertEqual(cov.get("closeout_lenses_skipped", []), [])

    def test_empty_state_refuses_and_exits_zero(self) -> None:
        """c. Empty state → refuses with informative message, exit 0, no files written."""
        # Write a state with none of the meaningful fields populated.
        # "Empty" = discovery never completed, no stages, no token_usage.
        empty_state = FACTORY_STATE._default_workflow_state()
        empty_state["stages"] = {}
        empty_state["token_usage"] = []
        empty_state["discovery"] = {
            "version": 2,
            "required": False,
            "complete": False,  # discovery was never completed
            "question_count": 0,
            "asked_count": 0,
            "questions": [],
            "assumptions": [],
            "summary": "",
            "updated_at": 0,
            "answers": {},
            "non_goals": [],
            "acceptance_criteria": [],
            "unresolved": [],
        }
        self._write_state(empty_state)

        expected_closeout = self.workflow_dir / "closeout.md"
        self.assertFalse(expected_closeout.exists())

        import io as _io
        stderr_buf = _io.StringIO()
        with mock.patch("sys.stderr", stderr_buf):
            rc = command_standalone_closeout(_closeout_args(slug=self.slug))

        self.assertEqual(rc, 0)
        self.assertFalse(expected_closeout.exists(), "closeout.md should not be written for empty state")
        self.assertIn("no runner state", stderr_buf.getvalue())

    def test_rerun_idempotent_generated_block(self) -> None:
        """d. Re-running closeout produces identical generated block."""
        state = self._make_state_with_stages()
        self._write_state(state)

        for stage, lenses in [
            ("spec", [("codex", "feasibility-adversarial"), ("gemini", "requirements-adversarial")]),
            ("plan", [("codex", "implementation-adversarial"), ("gemini", "testability-adversarial")]),
        ]:
            for reviewer, lens in lenses:
                self._write_review(stage, reviewer, lens)

        args = _closeout_args(
            slug=self.slug,
            pr_url="https://example.com/pr/3",
            pr_number=3,
            merge_sha="abc123",
            note="first run",
        )

        # First invocation
        rc1 = command_standalone_closeout(args)
        self.assertEqual(rc1, 0)
        closeout_path = self.workflow_dir / "closeout.md"
        text1 = closeout_path.read_text(encoding="utf-8")

        # Extract generated block from first run
        def _extract_generated(text: str) -> str:
            end_idx = text.find(_GEN_END)
            if end_idx < 0:
                return text
            return text[:end_idx + len(_GEN_END)]

        gen1 = _extract_generated(text1)

        # Add operator notes so we can verify they survive re-run
        with_notes = text1 + "\nHandwritten operator note here."
        closeout_path.write_text(with_notes, encoding="utf-8")

        # Second invocation
        rc2 = command_standalone_closeout(args)
        self.assertEqual(rc2, 0)
        text2 = closeout_path.read_text(encoding="utf-8")
        gen2 = _extract_generated(text2)

        # The generated blocks should be identical (modulo timestamp which is per-run,
        # but we check structural equality — all lines except "Closed at")
        gen1_lines = [l for l in gen1.splitlines() if not l.startswith("- Closed at:")]
        gen2_lines = [l for l in gen2.splitlines() if not l.startswith("- Closed at:")]
        self.assertEqual(gen1_lines, gen2_lines, "Generated block differs between runs")

        # Operator notes should be preserved
        self.assertIn("Handwritten operator note here.", text2)


if __name__ == "__main__":
    unittest.main()
