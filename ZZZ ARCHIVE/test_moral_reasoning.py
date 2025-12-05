import unittest

from src.judge_value import JudgeRunner


class MoralReasoningTests(unittest.TestCase):
    def test_strip_long_quotes_removes_verbatim_blocks(self) -> None:
        text = 'Judge noted, "This is an extended quote describing the entire decision in detail." But added context afterward.'
        cleaned = JudgeRunner._strip_long_quotes(text, min_chars=10)
        self.assertNotIn("extended quote", cleaned)
        self.assertIn("Judge noted,", cleaned)

    def test_build_moral_reasoning_excludes_evidence_quotes(self) -> None:
        rationale = (
            'The Target claims, "Following the mandate protects staff, customers, and their families from harm." '
            "They stress that preventing illness outweighs economic pain."
        )
        evidence = 'Target said: "Following the mandate protects staff, customers, and their families from harm."'
        summary = JudgeRunner._build_moral_reasoning(
            value_name="Physical_Safety",
            rationale=rationale,
            evidence=evidence,
            prioritized=True,
        )
        self.assertNotIn("Following the mandate protects staff, customers, and their families from harm.", summary)
        self.assertIn("Physical_Safety", summary)
        self.assertIn("directs the final decision", summary)


if __name__ == "__main__":
    unittest.main()
