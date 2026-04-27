"""Slice 1 test — restatement judge prompt contains the quote-evidence rule."""
import unittest
from pathlib import Path


PROMPT_PATH = (
    Path(__file__).resolve().parents[2]
    / "judge-prompts"
    / "restatement.md"
)


class RestatementPromptTests(unittest.TestCase):
    """FR-008 + FR-009 + FR-010 — prompt text contract.

    Feature B Slice 1 adds the evidence requirement for severity-drop proceed
    claims. This test asserts the phrase is present AND that the preserved
    rules from PR #744 (first-round, true-saturation) are still in place.
    """

    def setUp(self) -> None:
        self.assertTrue(PROMPT_PATH.exists(), f"missing: {PROMPT_PATH}")
        self.text = PROMPT_PATH.read_text(encoding="utf-8")

    def test_contains_quote_evidence_requirement(self) -> None:
        """FR-008 — severity-drop claims must cite verbatim prior-round text."""
        self.assertIn("Evidence requirement for severity-drop claims", self.text)
        self.assertIn("quote the prior-round reasoning text verbatim", self.text)
        self.assertIn("at least 60", self.text)

    def test_mentions_shorter_text_fallback(self) -> None:
        """Per Gemini tasks HIGH F-02 — 60-char rule has an explicit short-text fallback."""
        self.assertIn("OR the full reasoning text if it is shorter", self.text)

    def test_names_fallback_rules(self) -> None:
        """FR-009 / FR-010 — preserved first-round and true-saturation rules."""
        self.assertIn("First-round case", self.text)
        self.assertIn("PROCEED-WITH-ANNOTATION", self.text)
        self.assertIn("True-saturation case", self.text)
        self.assertIn("70%+", self.text)

    def test_real_progress_case_remains_block(self) -> None:
        self.assertIn("Real-progress case", self.text)
        self.assertIn("BLOCK", self.text)


if __name__ == "__main__":
    unittest.main()
