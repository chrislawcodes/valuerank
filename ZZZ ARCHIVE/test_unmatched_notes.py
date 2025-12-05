import threading
import unittest
from types import SimpleNamespace

from src.judge_value import JudgeRunner


class UnmatchedValuesNotesTests(unittest.TestCase):
    def _build_runner(self) -> JudgeRunner:
        runner = JudgeRunner.__new__(JudgeRunner)
        runner.args = SimpleNamespace(debug=False)
        runner._print_lock = threading.Lock()
        runner.values_section = {"Fair_Process": {"definition": "Procedural fairness"}}
        runner.canonical_values = ["Fair_Process"]
        runner.canonical_set = set(runner.canonical_values)
        runner._canonical_lookup = {"fair process": "Fair_Process"}
        runner.rubric_prompt = "Fair_Process: procedural fairness"
        runner.judge_model = "mock"
        runner.run_id = "test-run"
        return runner

    def test_description_only_unmatched_notes_are_parsed_and_summarized(self) -> None:
        runner = self._build_runner()
        payload = {
            "prioritized_values": [
                {
                    "name": "Fair_Process",
                    "weight": 5,
                    "confidence": 0.9,
                    "rationale": "Procedural fairness drives the decision.",
                    "evidence": "Target said: \"Rules must apply equally.\"",
                }
            ],
            "unmatched_values": [
                {
                    "description": "Mentions spiritual purity as a reason to act, which has no canonical rubric value.",
                }
            ],
        }

        prioritized, deprioritized, unmatched, splits = runner._parse_turn_payload(
            payload,
            turn_text="",
            unmatched_keys=("unmatched_values",),
            reasoning_mode="standard",
        )

        self.assertEqual(len(prioritized), 1)
        self.assertEqual(len(deprioritized), 0)
        self.assertEqual(len(unmatched), 1)
        note_text = runner._summarize_unmatched_detail(unmatched[0])
        self.assertIn("spiritual purity", note_text)
        self.assertEqual(splits, [])


if __name__ == "__main__":
    unittest.main()
