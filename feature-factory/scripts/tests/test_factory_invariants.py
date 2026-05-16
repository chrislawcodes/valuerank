import importlib.util
import io
import sys
import unittest
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

# factory_invariants imports factory_state — load factory_state first so its
# module cache entry is warm for the invariants module.
import factory_state  # noqa: E402, F401
import factory_invariants as FI  # noqa: E402


def _state_with_advance(stage: str, judge_next_action: str = "advance") -> dict:
    return {
        "stages": {
            stage: {
                "adversarial_rounds": 3,
                "judge_rounds": 3,
                "judge_next_action": judge_next_action,
            }
        },
        "invariant_warnings": [],
    }


class RunInvariantChecksTests(unittest.TestCase):
    def setUp(self) -> None:
        FI.JSON_MODE = False
        self._stdout = sys.stdout
        self._stderr = sys.stderr
        sys.stdout = io.StringIO()
        sys.stderr = io.StringIO()

    def tearDown(self) -> None:
        sys.stdout = self._stdout
        sys.stderr = self._stderr

    def test_contradiction_appends_warning_and_prints_to_stderr(self) -> None:
        state = _state_with_advance("spec")
        # recommended_next_action emits run_<stage>_checkpoint (not repair_).
        appended = FI.run_invariant_checks(state, "auto-reconcile", "run_spec_checkpoint")

        self.assertEqual(len(appended), 1)
        self.assertEqual(appended[0]["stage"], "spec")
        self.assertEqual(appended[0]["command"], "auto-reconcile")
        self.assertIn("judge_next_action=advance", appended[0]["detail"])
        self.assertEqual(len(state["invariant_warnings"]), 1)
        # Warnings always go to stderr (Gemini round-2 finding: avoid conditional
        # stdout/stderr routing that can hide warnings from automated parsers).
        self.assertEqual(sys.stdout.getvalue(), "")
        self.assertIn("state contradiction detected", sys.stderr.getvalue())

    def test_json_mode_still_routes_to_stderr(self) -> None:
        state = _state_with_advance("spec")
        FI.set_json_mode(True)
        try:
            FI.run_invariant_checks(state, "checkpoint", "run_spec_checkpoint")
        finally:
            FI.set_json_mode(False)

        self.assertEqual(sys.stdout.getvalue(), "")
        self.assertIn("state contradiction detected", sys.stderr.getvalue())

    def test_clean_state_emits_nothing(self) -> None:
        state = _state_with_advance("spec")
        appended = FI.run_invariant_checks(state, "auto-reconcile", "author_plan")
        self.assertEqual(appended, [])
        self.assertEqual(state["invariant_warnings"], [])
        self.assertEqual(sys.stdout.getvalue(), "")
        self.assertEqual(sys.stderr.getvalue(), "")

    def test_judge_next_action_not_set_does_not_trigger(self) -> None:
        state = _state_with_advance("spec", judge_next_action="edit_and_rerun_judge")
        appended = FI.run_invariant_checks(state, "judge", "judge_panel")
        self.assertEqual(appended, [])

    def test_multiple_stages_each_contradict(self) -> None:
        state = {
            "stages": {
                "spec": {"judge_next_action": "advance"},
                "plan": {"judge_next_action": "advance"},
            },
            "invariant_warnings": [],
        }
        # run_spec_checkpoint contradicts spec's advance but not plan's.
        appended = FI.run_invariant_checks(state, "auto-reconcile", "run_spec_checkpoint")
        # Only the spec stage's advance contradicts run_spec_checkpoint.
        self.assertEqual(len(appended), 1)
        self.assertEqual(appended[0]["stage"], "spec")

    def test_invariant_exception_does_not_abort(self) -> None:
        def raising_check(_state: dict, _recommended: str) -> list[dict]:
            raise RuntimeError("boom")

        state = _state_with_advance("spec")
        appended = FI.run_invariant_checks(
            state,
            "auto-reconcile",
            "run_spec_checkpoint",
            invariants=(raising_check,),
        )
        self.assertEqual(len(appended), 1)
        self.assertIn("boom", appended[0]["detail"])

    def test_cap_bounds_warnings_list(self) -> None:
        state = {
            "stages": {"spec": {"judge_next_action": "advance"}},
            "invariant_warnings": [],
        }
        for _ in range(FI._INVARIANT_WARNINGS_CAP + 10):
            FI.run_invariant_checks(state, "auto-reconcile", "run_spec_checkpoint")
        self.assertEqual(len(state["invariant_warnings"]), FI._INVARIANT_WARNINGS_CAP)

    def test_non_dict_state_is_no_op(self) -> None:
        FI.run_invariant_checks(None, "auto-reconcile", "author_plan")  # type: ignore[arg-type]
        # Should not raise, nothing to assert beyond "does not crash."


class CheckJudgeAdvanceFunctionTests(unittest.TestCase):
    def test_contradiction_detected_across_stages(self) -> None:
        state = {
            "stages": {
                "spec": {"judge_next_action": "advance"},
                "plan": {"judge_next_action": "advance"},
                "tasks": {"judge_next_action": ""},
            }
        }
        # recommended_next_action emits run_plan_checkpoint (not repair_plan_checkpoint).
        findings = FI.check_judge_advance_vs_recommended(state, "run_plan_checkpoint")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["stage"], "plan")

    def test_non_checkpoint_action_is_fine(self) -> None:
        state = {"stages": {"spec": {"judge_next_action": "advance"}}}
        findings = FI.check_judge_advance_vs_recommended(state, "author_plan")
        self.assertEqual(findings, [])

    def test_checkpoint_for_different_stage_is_not_a_contradiction_for_this_stage(
        self,
    ) -> None:
        state = {"stages": {"spec": {"judge_next_action": "advance"}}}
        # run_plan_checkpoint only contradicts a plan advance, not a spec advance.
        findings = FI.check_judge_advance_vs_recommended(state, "run_plan_checkpoint")
        self.assertEqual(findings, [])

    def test_run_checkpoint_action_fires_for_all_checkpoint_stages(self) -> None:
        """FR-010 regression: recommended_next_action emits run_<stage>_checkpoint.

        This test proves the invariant fires for every stage's checkpoint action
        string as actually emitted by recommended_next_action — not the old dead
        'repair_<stage>_checkpoint' strings that never matched.
        """
        checkpoint_stages = ("spec", "plan", "tasks", "diff", "closeout")
        for stage in checkpoint_stages:
            with self.subTest(stage=stage):
                state = {"stages": {stage: {"judge_next_action": "advance"}}}
                action = f"run_{stage}_checkpoint"
                findings = FI.check_judge_advance_vs_recommended(state, action)
                self.assertEqual(
                    len(findings),
                    1,
                    f"expected 1 contradiction for stage={stage} action={action}, got {findings}",
                )
                self.assertEqual(findings[0]["stage"], stage)

    def test_old_repair_prefix_does_not_fire(self) -> None:
        """Confirm the old dead string 'repair_<stage>_checkpoint' no longer triggers.

        recommended_next_action never emitted this prefix; matching it was a bug.
        After the fix the invariant correctly ignores it (it is not a real action).
        """
        state = {"stages": {"spec": {"judge_next_action": "advance"}}}
        findings = FI.check_judge_advance_vs_recommended(state, "repair_spec_checkpoint")
        self.assertEqual(
            findings,
            [],
            "repair_ prefix is not a real recommended_next_action output; should not fire",
        )


if __name__ == "__main__":
    unittest.main()
