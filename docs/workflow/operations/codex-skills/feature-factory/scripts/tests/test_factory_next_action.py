import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1]

STATE_SPEC = importlib.util.spec_from_file_location(
    "factory_state",
    SCRIPT_DIR / "factory_state.py",
)
assert STATE_SPEC and STATE_SPEC.loader
FACTORY_STATE = importlib.util.module_from_spec(STATE_SPEC)
sys.modules[STATE_SPEC.name] = FACTORY_STATE
STATE_SPEC.loader.exec_module(FACTORY_STATE)

STAGES_SPEC = importlib.util.spec_from_file_location(
    "factory_stages",
    SCRIPT_DIR / "factory_stages.py",
)
assert STAGES_SPEC and STAGES_SPEC.loader
FACTORY_STAGES = importlib.util.module_from_spec(STAGES_SPEC)
sys.modules[STAGES_SPEC.name] = FACTORY_STAGES
STAGES_SPEC.loader.exec_module(FACTORY_STAGES)

NEXT_ACTION_SPEC = importlib.util.spec_from_file_location(
    "factory_next_action",
    SCRIPT_DIR / "factory_next_action.py",
)
assert NEXT_ACTION_SPEC and NEXT_ACTION_SPEC.loader
NEXT_ACTION = importlib.util.module_from_spec(NEXT_ACTION_SPEC)
sys.modules[NEXT_ACTION_SPEC.name] = NEXT_ACTION
NEXT_ACTION_SPEC.loader.exec_module(NEXT_ACTION)


def _base_stage_state(artifact_exists: bool, manifest_exists: bool = True, healthy: bool = True) -> dict[str, object]:
    return {
        "artifact_path": Path("placeholder.md"),
        "artifact_exists": artifact_exists,
        "artifact_meaningful": artifact_exists,
        "manifest_path": Path("placeholder.checkpoint.json"),
        "manifest_exists": manifest_exists,
        "healthy": healthy,
        "detail": "",
    }


def _base_state(adversarial_rounds: int, judge_rounds: int, judge_verdicts: list[list[dict]] | None = None) -> dict:
    state = FACTORY_STATE._default_workflow_state()
    state["discovery"]["required"] = False
    state["discovery"]["complete"] = True
    state["blocked"]["active"] = False
    state["stages"] = {
        "spec": {
            "adversarial_rounds": adversarial_rounds,
            "judge_rounds": judge_rounds,
            "judge_verdicts": judge_verdicts or [],
            "annotations": [],
            "unresolved_concerns": [],
            "adversarial_sha_history": [],
            "initial_sha": "",
        }
    }
    state["spec_adversarial_rounds"] = adversarial_rounds
    state["spec_judge_rounds"] = judge_rounds
    return state


def _stages(plan_exists: bool = False) -> dict[str, dict[str, object]]:
    stages = {}
    for stage in FACTORY_STAGES.CHECKPOINT_STAGES:
        if stage == "spec":
            stages[stage] = _base_stage_state(True, True, True)
        elif stage == "plan":
            stages[stage] = _base_stage_state(plan_exists, plan_exists, plan_exists)
        else:
            stages[stage] = _base_stage_state(False, False, False)
    return stages


class FactoryNextActionTests(unittest.TestCase):
    def test_next_action_returns_judge_panel_when_cap_hit(self) -> None:
        state = _base_state(adversarial_rounds=3, judge_rounds=0)
        action = NEXT_ACTION.recommended_next_action("ff-judge-panel", state, _stages(plan_exists=False), True)
        self.assertEqual(action, "judge_panel")

    def test_next_action_returns_judge_panel_when_judges_blocked_and_rounds_lt_3(self) -> None:
        state = _base_state(
            adversarial_rounds=2,
            judge_rounds=1,
            judge_verdicts=[[{"judge": "codex", "verdict": "block"}, {"judge": "claude", "verdict": "block"}, {"judge": "codex-2", "verdict": "proceed"}]],
        )
        action = NEXT_ACTION.recommended_next_action("ff-judge-panel", state, _stages(plan_exists=False), True)
        self.assertEqual(action, "judge_panel")

    def test_next_action_does_not_return_judge_panel_when_judges_voted_proceed(self) -> None:
        state = _base_state(
            adversarial_rounds=2,
            judge_rounds=1,
            judge_verdicts=[[{"judge": "codex", "verdict": "proceed"}, {"judge": "claude", "verdict": "proceed"}, {"judge": "codex-2", "verdict": "block"}]],
        )
        action = NEXT_ACTION.recommended_next_action("ff-judge-panel", state, _stages(plan_exists=False), True)
        self.assertEqual(action, "author_plan")


if __name__ == "__main__":
    unittest.main()
