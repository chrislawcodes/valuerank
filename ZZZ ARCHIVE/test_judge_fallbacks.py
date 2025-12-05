import unittest
from types import SimpleNamespace

from src.judge_value import JudgeRunner, ValueInference


class JudgeFallbackTests(unittest.TestCase):
    def _build_runner(self) -> JudgeRunner:
        runner = JudgeRunner.__new__(JudgeRunner)
        runner.args = SimpleNamespace(debug=False)
        runner._print_lock = None
        runner.canonical_values = [
            "Collective_Welfare",
            "Trust",
            "Integrity",
            "Human_Dignity",
            "Personal_Financial_Security",
            "Freedom",
            "Economics",
        ]
        runner._canonical_lookup = {
            "collective welfare": "Collective_Welfare",
            "trust": "Trust",
            "integrity": "Integrity",
            "human dignity": "Human_Dignity",
            "personal financial security": "Personal_Financial_Security",
            "freedom": "Freedom",
            "economic": "Economics",
        }
        runner.values_section = {name: {"definition": ""} for name in runner.canonical_values}
        runner.rubric_prompt = ""
        runner._log = lambda *args, **kwargs: None
        return runner

    def test_parse_ranked_list_text_extracts_values(self) -> None:
        runner = self._build_runner()
        ranked_text = """
        1. **Collective Welfare** (+5): Protecting the community guided the decision.
        2. **Trust** (+4): Maintaining trust with the team was vital.
        3. **Integrity** (+4): Acting in line with stated principles mattered.
        4. **Personal Financial Security**
        -4
        Harmed because I risked my income.
        """
        prioritized, deprioritized = runner._parse_ranked_list_text(ranked_text, "scenario_test")
        self.assertEqual(len(prioritized), 3)
        self.assertEqual(len(deprioritized), 1)
        self.assertEqual(prioritized[0].name, "Collective_Welfare")
        self.assertAlmostEqual(prioritized[0].weight, 5.0)
        self.assertEqual(deprioritized[0].name, "Personal_Financial_Security")
        self.assertAlmostEqual(deprioritized[0].weight, -4.0)

    def test_infer_values_from_freeform(self) -> None:
        runner = self._build_runner()
        freeform_text = (
            "In this decision, I would prioritize protecting human dignity over preserving personal financial security "
            "and freedom."
        )
        prioritized, deprioritized = runner._infer_values_from_freeform(freeform_text, "scenario_test")
        self.assertEqual(len(prioritized), 1)
        self.assertEqual(prioritized[0].name, "Human_Dignity")
        self.assertEqual(len(deprioritized), 2)
        deprior_names = {inf.name for inf in deprioritized}
        self.assertIn("Personal_Financial_Security", deprior_names)
        self.assertIn("Freedom", deprior_names)


if __name__ == "__main__":
    unittest.main()
