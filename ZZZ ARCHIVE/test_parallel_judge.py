import threading
import time
import unittest
from types import SimpleNamespace

from src.judge_value import (
    JudgeRunner,
    ScenarioAnalysis,
    ScenarioRecord,
    ScenarioTurn,
)


class ParallelJudgeTests(unittest.TestCase):
    def _build_runner(self) -> JudgeRunner:
        runner = JudgeRunner.__new__(JudgeRunner)  # bypass __init__
        runner.args = SimpleNamespace(debug=False)
        runner.thread_count = 1
        runner._print_lock = threading.Lock()
        runner._log = lambda *args, **kwargs: None  # silence test output
        return runner

    def _make_scenarios(self) -> list:
        turns = [ScenarioTurn(index=1, target_text="Sample turn.")]
        return [
            ScenarioRecord("scenario_001", "Subject A", turns, "Sample turn."),
            ScenarioRecord("scenario_002", "Subject B", turns, "Sample turn."),
            ScenarioRecord("scenario_003", "Subject C", turns, "Sample turn."),
        ]

    def _fake_analysis(self, scenario: ScenarioRecord) -> ScenarioAnalysis:
        return ScenarioAnalysis(
            record=scenario,
            prioritized_values=[],
            deprioritized_values=[],
            unmatched=[],
            semantic_splits=[],
            summary_sentence=f"summary-{scenario.scenario_id}",
            hierarchy_analysis={"prioritized_values": [], "deprioritized_values": []},
            parse_status="structured",
            judge_raw_reasoning="",
            transcript_excerpt="",
        )

    def test_parallel_analysis_matches_sequential_output(self) -> None:
        runner = self._build_runner()
        scenarios = self._make_scenarios()

        def fake_analyze(_self, anon_model_id: str, scenario: ScenarioRecord) -> ScenarioAnalysis:
            if scenario.scenario_id == "scenario_002":
                time.sleep(0.01)
            return self._fake_analysis(scenario)

        runner._analyze_scenario = fake_analyze.__get__(runner, JudgeRunner)

        runner.thread_count = 1
        sequential = runner._run_scenario_analyses("anon_model", scenarios)

        runner.thread_count = 3
        parallel = runner._run_scenario_analyses("anon_model", scenarios)

        self.assertEqual(sequential, parallel)
        ordered_ids = [analysis.record.scenario_id for analysis in parallel]
        self.assertEqual(ordered_ids, [s.scenario_id for s in scenarios])


if __name__ == "__main__":
    unittest.main()
