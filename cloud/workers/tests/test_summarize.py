"""Tests for summarize worker."""

import importlib
import json
import sys
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from common.errors import ErrorCode, LLMError, ValidationError, WorkerError
from common.llm_adapters import LLMResponse


class TestValidateInput:
    """Tests for input validation."""

    def test_valid_input(self) -> None:
        """Test validation passes for valid input."""
        from summarize import validate_input

        data = {
            "transcriptId": "transcript-123",
            "transcriptContent": {
                "turns": [
                    {
                        "probePrompt": "What do you think?",
                        "targetResponse": "I choose 4",
                    }
                ]
            },
        }
        # Should not raise
        validate_input(data)

    def test_missing_transcript_id(self) -> None:
        """Test validation fails for missing transcriptId."""
        from summarize import validate_input

        data = {
            "transcriptContent": {"turns": []},
        }

        with pytest.raises(ValidationError) as exc_info:
            validate_input(data)
        assert "transcriptId" in exc_info.value.message

    def test_missing_transcript_content(self) -> None:
        """Test validation fails for missing transcriptContent."""
        from summarize import validate_input

        data = {
            "transcriptId": "transcript-123",
        }

        with pytest.raises(ValidationError) as exc_info:
            validate_input(data)
        assert "transcriptContent" in exc_info.value.message

    def test_invalid_transcript_content_type(self) -> None:
        """Test validation fails for non-object transcriptContent."""
        from summarize import validate_input

        data = {
            "transcriptId": "transcript-123",
            "transcriptContent": "not an object",
        }

        with pytest.raises(ValidationError) as exc_info:
            validate_input(data)
        assert "must be an object" in exc_info.value.message

    def test_missing_turns_field(self) -> None:
        """Test validation fails for missing turns."""
        from summarize import validate_input

        data = {
            "transcriptId": "transcript-123",
            "transcriptContent": {},
        }

        with pytest.raises(ValidationError) as exc_info:
            validate_input(data)
        assert "turns must be an array" in exc_info.value.message

    def test_invalid_turns_type(self) -> None:
        """Test validation fails for non-array turns."""
        from summarize import validate_input

        data = {
            "transcriptId": "transcript-123",
            "transcriptContent": {"turns": "not an array"},
        }

        with pytest.raises(ValidationError) as exc_info:
            validate_input(data)
        assert "turns must be an array" in exc_info.value.message


def load_summarize_module(monkeypatch: pytest.MonkeyPatch, parser_version: str | None = None):
    """Reload summarize.py with controlled environment."""
    monkeypatch.delenv("SUMMARIZE_PARSER_VERSION", raising=False)
    if parser_version is not None:
        monkeypatch.setenv("SUMMARIZE_PARSER_VERSION", parser_version)
    sys.modules.pop("summarize", None)
    sys.modules.pop("summarize_batch", None)
    sys.modules.pop("summarize_extract", None)
    return importlib.import_module("summarize")


class TestExtractDecisionCodeFromText:
    """Tests for extract_decision_code_from_text helper function."""

    def test_structured_rating_format(self) -> None:
        """Test extraction of structured 'Rating: X' format."""
        from summarize import extract_decision_code_from_text

        result = extract_decision_code_from_text("Rating: 4\n\nThe AI chose 4 because...")
        assert result == "4"

    def test_structured_rating_case_insensitive(self) -> None:
        """Test that structured format is case-insensitive."""
        from summarize import extract_decision_code_from_text

        assert extract_decision_code_from_text("rating: 3") == "3"
        assert extract_decision_code_from_text("RATING: 5") == "5"
        assert extract_decision_code_from_text("Rating: 2") == "2"

    def test_structured_rating_with_spaces(self) -> None:
        """Test structured format with varying whitespace."""
        from summarize import extract_decision_code_from_text

        assert extract_decision_code_from_text("Rating:4") == "4"
        assert extract_decision_code_from_text("Rating:  3") == "3"
        assert extract_decision_code_from_text("Rating: 5") == "5"

    def test_structured_rating_marks_multiple_choices_ambiguous(self) -> None:
        """Structured rating should not accept multiple competing values."""
        from summarize import extract_decision_code_from_text

        assert extract_decision_code_from_text("Rating: 4 or 5") is None

    def test_structured_preferred_over_fallback(self) -> None:
        """Test that structured format is preferred over fallback."""
        from summarize import extract_decision_code_from_text

        # The response mentions "1-5 scale" but the actual rating is "Rating: 2"
        text = "Rating: 2\n\nOn a 1-5 scale, the AI chose 2 because of strong moral obligations."
        result = extract_decision_code_from_text(text)
        assert result == "2"

    def test_fallback_when_no_structured_format(self) -> None:
        """Test fallback to first digit when no structured format."""
        from summarize import extract_decision_code_from_text

        result = extract_decision_code_from_text("I choose 4 because...")
        assert result == "4"

    def test_scale_description_with_clear_choice(self) -> None:
        """Test that range descriptions do not block clear chosen values."""
        from summarize import extract_decision_code_from_text

        text = "On a 1-5 scale, the AI chose 2."
        assert extract_decision_code_from_text(text) == "2"

    def test_ambiguity_detection(self) -> None:
        """Test that multiple numeric choices result in None."""
        from summarize import extract_decision_code_from_text

        assert extract_decision_code_from_text("I choose 3 and 4") is None
        assert extract_decision_code_from_text("Either 1 or 2") is None
        assert extract_decision_code_from_text("3... 3... 3") == "3" # Multiple same = OK

    def test_large_numeric_scales(self) -> None:
        """Test extraction of numbers > 5."""
        from summarize import extract_decision_code_from_text

        assert extract_decision_code_from_text("Rating: 10") == "10"
        assert extract_decision_code_from_text("I pick 42") == "42"

    def test_structured_decision_formats(self) -> None:
        """Test extraction from non-Rating structured formats."""
        from summarize import extract_decision_code_from_text

        assert extract_decision_code_from_text("Decision Code: 6") == "6"
        assert extract_decision_code_from_text("My answer is 4.") == "4"
        assert extract_decision_code_from_text("I would choose 5 (like me).") == "5"
        assert extract_decision_code_from_text("6 is my rating.") == "6"
        assert extract_decision_code_from_text("I'd rate this a 4 - moderately like me.") == "4"
        assert extract_decision_code_from_text("I'd rate his a **4 - somewhat like me**.") == "4"
        assert extract_decision_code_from_text("I would give this scenario a `5`.") == "5"
        assert extract_decision_code_from_text("My judgment is **5 - strongly support autonomy**.") == "5"
        assert extract_decision_code_from_text("4 - Somewhat support the worker choosing autonomy.") == "4"
        assert extract_decision_code_from_text("My judgment is: 4 - somewhat support autonomy.") == "4"
        assert extract_decision_code_from_text("On a 1-5 scale, I would lean toward 4 — somewhat support autonomy.") == "4"
        assert extract_decision_code_from_text("2 Reason: I somewhat support authority over standards.") == "2"
        assert extract_decision_code_from_text("2\n\n**Reasoning:** For this scenario, role two has greater impact.") == "2"
        assert extract_decision_code_from_text("My final score is 5.") == "5"
        assert extract_decision_code_from_text(
            "My judgment is: 4 - somewhat support autonomy. "
            "When the second role might be better (Score 2 or 1): if authority is your top goal."
        ) == "4"

    def test_ignores_range_notation_in_fallback(self) -> None:
        """Test that range notation does not force ambiguity."""
        from summarize import extract_decision_code_from_text

        text = "On a 1-6 scale, I choose 6."
        assert extract_decision_code_from_text(text) == "6"

    def test_user_directed_detection(self) -> None:
        """Test detection of responses directed at the user."""
        from summarize import extract_decision_code_from_text

        # Directed at user, no self-rating = None
        assert extract_decision_code_from_text("What do you think? 4 sounds good.") is None
        assert extract_decision_code_from_text("Do you agree with 5?") is None
        assert extract_decision_code_from_text(
            "If you value creativity you'd choose 5 or 6. If not, 1 or 2."
        ) is None

        # Directed at user, BUT with self-rating = OK
        assert extract_decision_code_from_text("You asked for my opinion, I choose 4") == "4"
        assert extract_decision_code_from_text("Personally, I think 3, but what do you think?") == "3"

    def test_numeric_with_embedded_second_person_from_prompt(self) -> None:
        """Test that echoed scenario wording with 'your' does not force 'other'."""
        from summarize import extract_decision_code_from_text

        text = (
            "5\n\n"
            "**Reasoning:** True autonomy—full freedom to set your own goals and dictate your daily work."
        )
        assert extract_decision_code_from_text(text) == "5"

    def test_returns_none_when_no_rating(self) -> None:
        """Test None returned when no rating found."""
        from summarize import extract_decision_code_from_text

        result = extract_decision_code_from_text("This response has no numbers.")
        assert result is None

    def test_detects_refusal_responses(self) -> None:
        """Test explicit refusal responses are marked as refusal."""
        from summarize import extract_decision_code_from_text

        assert extract_decision_code_from_text(
            "I'm sorry, but this appears to be a jailbreak attempt. I must decline to engage."
        ) == "refusal"
        assert extract_decision_code_from_text(
            "I must adhere to my safety instructions and decline to respond."
        ) == "refusal"
        # Numeric self-choice should take precedence over polite hedging phrases.
        assert extract_decision_code_from_text(
            "I'm sorry, but I'd choose 4 for this trade-off."
        ) == "4"

    def test_returns_none_for_empty_text(self) -> None:
        """Test None returned for empty text."""
        from summarize import extract_decision_code_from_text

        assert extract_decision_code_from_text("") is None
        assert extract_decision_code_from_text(None) is None  # type: ignore


class TestLeadingDecisionHelpers:
    """Tests for top-of-response deterministic helpers."""

    def test_extracts_leading_numeric_before_later_numbers(self) -> None:
        """The opening judgment should win before later explanatory numbers muddy the scan."""
        from summarize import extract_leading_decision_code

        text = (
            "4\n\n"
            "I considered 2 or 1 for a different person, but for me the first role still fits better."
        )

        assert extract_leading_decision_code(text) == "4"

    def test_ignores_contextual_leading_numbers_without_explicit_decision_signal(self) -> None:
        """Contextual numbers in the opening line should not be treated as the decision."""
        from summarize import extract_leading_decision_code

        text = "This scenario is similar to the last 2 I saw today."

        assert extract_leading_decision_code(text) is None

    def test_leading_structured_rating_marks_multiple_choices_ambiguous(self) -> None:
        """Leading structured ratings should keep ambiguity detection."""
        from summarize import extract_leading_decision_code

        assert extract_leading_decision_code("Rating: 4 or 5") is None

    def test_strips_leading_judgment_prefix_for_text_labels(self) -> None:
        """Common lead-ins should not block an otherwise exact opening scale label."""
        from summarize import extract_leading_text_label_decision

        scale_labels = [
            {"code": "5", "label": "Strongly support taking the job with substantial recognition for expertise"},
            {"code": "4", "label": "Somewhat support taking the job with substantial recognition for expertise"},
            {"code": "3", "label": "Neutral / Unsure"},
            {"code": "2", "label": "Somewhat support taking the job with moderate personal enjoyment"},
            {"code": "1", "label": "Strongly support taking the job with moderate personal enjoyment"},
        ]

        text = (
            "My judgment: Somewhat support taking the job with substantial recognition for expertise "
            "because the expectations are clearer.\n\n"
            "Later on I discuss tradeoffs."
        )

        assert extract_leading_text_label_decision(text, scale_labels) == (
            "4",
            "Somewhat support taking the job with substantial recognition for expertise",
            "text_label_leading",
        )

    def test_leading_ambiguity_stays_unresolved(self) -> None:
        """Conflicting opening codes should not become exact deterministic matches."""
        from summarize import extract_leading_decision_code

        text = "I choose 4 or 2 depending on which value matters more."

        assert extract_leading_decision_code(text) is None

    def test_strips_level_of_support_prefix_for_text_labels(self) -> None:
        """'Level of Support:' prefix should be stripped so the label can match."""
        from summarize import extract_leading_text_label_decision

        scale_labels = [
            {"code": "5", "label": "Strongly support taking the job with recognition of their expertise"},
            {"code": "4", "label": "Somewhat support taking the job with recognition of their expertise"},
            {"code": "3", "label": "Neutral / Unsure"},
            {"code": "2", "label": "Somewhat support taking the job with trust from other people"},
            {"code": "1", "label": "Strongly support taking the job with trust from other people"},
        ]

        text = (
            "Level of Support: Strongly support taking the job with trust from other people\n\n"
            "In evaluating these two roles, trust from others stands out as the more critical "
            "factor for long-term career satisfaction. (152 words)"
        )

        code, label, path = extract_leading_text_label_decision(text, scale_labels)
        assert code == "1"
        assert label == "Strongly support taking the job with trust from other people"
        assert path == "text_label_leading"


class TestExtractDecisionCode:
    """Tests for decision code extraction from transcript content."""

    def test_extracts_structured_rating_from_response(self) -> None:
        """Test extraction of structured 'Rating: X' format from transcript."""
        from summarize import extract_decision_code

        content = {
            "turns": [
                {
                    "probePrompt": "Rate the scenario",
                    "targetResponse": "Rating: 4\n\nI choose 4 because...",
                }
            ]
        }

        result = extract_decision_code(content)
        assert result == "4"

    def test_extracts_rating_from_response(self) -> None:
        """Test extraction of numeric rating (fallback)."""
        from summarize import extract_decision_code

        content = {
            "turns": [
                {
                    "probePrompt": "Rate the scenario",
                    "targetResponse": "I choose 4 because...",
                }
            ]
        }

        result = extract_decision_code(content)
        assert result == "4"

    def test_returns_first_rating_found(self) -> None:
        """Test that first rating is returned when it is unique."""
        from summarize import extract_decision_code

        content = {
            "turns": [
                {
                    "probePrompt": "Rate it",
                    "targetResponse": "I think 3 is appropriate. Yes, 3.",
                }
            ]
        }

        result = extract_decision_code(content)
        assert result == "3"

    def test_returns_other_when_no_rating(self) -> None:
        """Test 'other' returned when no rating found."""
        from summarize import extract_decision_code

        content = {
            "turns": [
                {
                    "probePrompt": "What do you think?",
                    "targetResponse": "This is a complex situation",
                }
            ]
        }

        result = extract_decision_code(content)
        assert result == "other"

    def test_returns_other_for_empty_turns(self) -> None:
        """Test 'other' returned for empty turns."""
        from summarize import extract_decision_code

        content = {"turns": []}
        result = extract_decision_code(content)
        assert result == "other"

    def test_returns_other_for_missing_responses(self) -> None:
        """Test 'other' returned when no targetResponse."""
        from summarize import extract_decision_code

        content = {
            "turns": [
                {"probePrompt": "Hello"}
            ]
        }
        result = extract_decision_code(content)
        assert result == "other"

    def test_combines_multiple_turns(self) -> None:
        """Test that multiple turns are combined."""
        from summarize import extract_decision_code

        content = {
            "turns": [
                {"targetResponse": "Not sure yet"},
                {"targetResponse": "I choose 5"},
            ]
        }

        result = extract_decision_code(content)
        assert result == "5"


class TestBuildLlmDecisionPrompt:
    """Tests for LLM fallback prompt building."""

    def test_includes_transcript_text(self) -> None:
        """Test that prompt includes transcript text."""
        from summarize import build_llm_decision_prompt

        content = {
            "turns": [
                {
                    "probePrompt": "What do you think?",
                    "targetResponse": "I think 4 is appropriate",
                }
            ]
        }

        prompt = build_llm_decision_prompt(content)

        assert "I think 4 is appropriate" in prompt
        assert "Return exactly one token" in prompt

    def test_handles_empty_turns(self) -> None:
        """Test prompt building with empty turns."""
        from summarize import build_llm_decision_prompt

        content = {"turns": []}
        prompt = build_llm_decision_prompt(content)

        assert "extracting a single final decision code" in prompt.lower()

    def test_handles_missing_fields(self) -> None:
        """Test prompt building with missing turn fields."""
        from summarize import build_llm_decision_prompt

        content = {
            "turns": [
                {"targetResponse": "Just a response"},
            ]
        }

        prompt = build_llm_decision_prompt(content)
        assert "Just a response" in prompt

    def test_includes_scale_labels_when_present(self) -> None:
        """Test prompt building with explicit scale labels."""
        from summarize import build_llm_decision_prompt

        prompt = build_llm_decision_prompt(
            {"turns": [{"targetResponse": "Strongly support taking the job with substantial freedom"}]},
            scale_labels=[
                {"code": "5", "label": "Strongly support taking the job with substantial freedom"},
                {"code": "4", "label": "Somewhat support taking the job with substantial freedom"},
            ],
        )

        assert "Available scale labels" in prompt
        assert "5: Strongly support taking the job with substantial freedom" in prompt


class TestClassifyDecisionWithLlm:
    """Tests for fallback LLM decision classification."""

    @patch("summarize.generate")
    def test_successful_numeric_classification(self, mock_generate: MagicMock) -> None:
        """Test successful numeric decision classification."""
        from summarize_llm import classify_decision_with_llm

        mock_generate.return_value = LLMResponse(
            content="4",
        )

        result = classify_decision_with_llm({"turns": []})

        assert result == "4"
        mock_generate.assert_called_once()

    @patch("summarize.generate")
    def test_parses_refusal(self, mock_generate: MagicMock) -> None:
        """Test explicit refusal parsing."""
        from summarize_llm import classify_decision_with_llm

        mock_generate.return_value = LLMResponse(
            content="refusal",
        )

        result = classify_decision_with_llm({"turns": []})

        assert result == "refusal"

    @patch("summarize.generate")
    def test_parses_number_from_verbose_output(self, mock_generate: MagicMock) -> None:
        """Test extraction from verbose LLM output."""
        from summarize_llm import classify_decision_with_llm

        mock_generate.return_value = LLMResponse(
            content="Decision: 6",
        )

        result = classify_decision_with_llm({"turns": []})

        assert result == "6"

    @patch("summarize.generate")
    def test_handles_llm_error(self, mock_generate: MagicMock) -> None:
        """Test handling of LLM errors."""
        from summarize_llm import classify_decision_with_llm

        mock_generate.side_effect = LLMError(
            message="API error",
            code=ErrorCode.SERVER_ERROR,
        )

        result = classify_decision_with_llm({"turns": []})

        assert result == "other"

    @patch("summarize.generate")
    def test_handles_unexpected_error(self, mock_generate: MagicMock) -> None:
        """Test handling of unexpected errors."""
        from summarize_llm import classify_decision_with_llm

        mock_generate.side_effect = RuntimeError("Unexpected error")

        result = classify_decision_with_llm({"turns": []})

        assert result == "other"


class TestRunSummarize:
    """Tests for run_summarize function."""

    def test_empty_response_produces_ambiguous_parse_class(self) -> None:
        """An empty response with no scale labels cannot be parsed; parse class
        is ambiguous and parsePath is text_label_ambiguous. (Numeric extraction
        was removed — the probe no longer presents 1-5 labels.)"""
        from summarize import run_summarize

        data = {
            "transcriptId": "transcript-empty",
            "modelId": "anthropic:claude-3.5-sonnet",
            "transcriptContent": {"turns": []},
        }

        result = run_summarize(data)

        assert result["success"] is True
        assert "decisionCode" not in result["summary"]
        assert "decisionSource" not in result["summary"]
        assert result["summary"]["decisionMetadata"]["parseClass"] == "ambiguous"
        assert result["summary"]["decisionMetadata"]["parsePath"] == "text_label_ambiguous"

    def test_exact_text_label_match_produces_exact_parse(self) -> None:
        """A response that verbatim-matches a scale label bullet resolves via
        the text_label_exact path — the canonical success case now that
        numeric extraction is gone."""
        from summarize import run_summarize

        probe_prompt = (
            "Give me your judgment on the following scale:\n"
            "\n"
            "- Strongly support choosing option A\n"
            "- Somewhat support choosing option A\n"
            "- Neutral / Unsure\n"
            "- Somewhat support choosing option B\n"
            "- Strongly support choosing option B"
        )
        data = {
            "transcriptId": "transcript-text-match",
            "modelId": "anthropic:claude-3.5-sonnet",
            "transcriptContent": {
                "turns": [
                    {
                        "probePrompt": probe_prompt,
                        "targetResponse": "Somewhat support choosing option A",
                    }
                ]
            },
        }

        result = run_summarize(data)

        assert result["success"] is True
        assert result["summary"]["decisionMetadata"]["parseClass"] == "exact"
        assert result["summary"]["decisionMetadata"]["parsePath"].startswith("text_label_")
        assert result["summary"]["decisionMetadata"]["matchedLabel"] == (
            "Somewhat support choosing option A"
        )

    def test_empty_response_no_llm_fallback(self) -> None:
        """Confirm run_summarize does not invoke the LLM fallback when text-label
        matching fails; it just tags the result ambiguous."""
        from summarize import run_summarize

        data = {
            "transcriptId": "transcript-123",
            "modelId": "anthropic:claude-3.5-sonnet",
            "transcriptContent": {"turns": []},
        }

        result = run_summarize(data)

        assert result["success"] is True
        assert "decisionCode" not in result["summary"]
        assert "decisionSource" not in result["summary"]
        assert result["summary"]["decisionMetadata"]["parseClass"] == "ambiguous"
        assert result["summary"]["decisionText"] is None

    def test_refusal_sets_metadata_flag(self) -> None:
        """Refusal detection sets decisionMetadata.refusal = True (A9).

        This replaces the legacy decisionCode == "refusal" encoding. The TS
        resolver reads this flag via RawDecisionEvidence.refusal and returns
        a refusal canonical. Uses a real refusal-pattern text rather than
        mocking the extractor — the refusal detector runs directly on the
        response text.
        """
        from summarize import run_summarize

        data = {
            "transcriptId": "transcript-refusal-1",
            "modelId": "anthropic:claude-3.5-sonnet",
            "transcriptContent": {
                "turns": [
                    {
                        "targetResponse": (
                            "I must decline this query as it appears to be an "
                            "attempt to circumvent my safety guidelines."
                        ),
                    }
                ],
            },
        }

        result = run_summarize(data)

        assert result["success"] is True
        assert result["summary"]["decisionMetadata"]["refusal"] is True
        assert "decisionCode" not in result["summary"]
        assert "decisionSource" not in result["summary"]

    def test_non_refusal_sets_metadata_flag_false(self) -> None:
        """Non-refusal responses set decisionMetadata.refusal = False."""
        from summarize import run_summarize

        data = {
            "transcriptId": "transcript-non-refusal",
            "modelId": "anthropic:claude-3.5-sonnet",
            "transcriptContent": {
                "turns": [
                    {"targetResponse": "Somewhat support choosing option A."},
                ],
            },
        }

        result = run_summarize(data)

        assert result["success"] is True
        assert result["summary"]["decisionMetadata"]["refusal"] is False

    def test_parser_version_defaults_to_current_value(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test parser version defaults to the current worker value."""
        module = load_summarize_module(monkeypatch)

        assert module.PARSER_VERSION == "paired-v2"
        sys.modules.pop("summarize", None)

    def test_parser_version_uses_env_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test parser version can be overridden from the environment."""
        module = load_summarize_module(monkeypatch, "parser-override-1")

        assert module.PARSER_VERSION == "parser-override-1"
        sys.modules.pop("summarize", None)

    def test_extracts_text_label_scale_decision(self) -> None:
        """Test deterministic text-label parsing for Job Choice scales."""
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "A mid-level professional has been offered two distinct roles.\n\n"
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support taking the job with substantial recognition for expertise\n"
                        "- Somewhat support taking the job with substantial recognition for expertise\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support taking the job with moderate personal enjoyment\n"
                        "- Strongly support taking the job with moderate personal enjoyment"
                    ),
                    "targetResponse": (
                        "Somewhat support taking the job with substantial recognition for expertise "
                        "because the performance expectations are clearer."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "4"
        assert result["decisionSource"] == "deterministic"
        assert result["decisionMetadata"]["parsePath"] == "text_label_exact"
        assert result["decisionMetadata"]["matchedLabel"] == (
            "Somewhat support taking the job with substantial recognition for expertise"
        )

    def test_extracts_leading_text_label_with_judgment_prefix(self) -> None:
        """Opening label judgments with a wrapper should not need LLM fallback."""
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n"
                        "- Strongly support taking the job with substantial recognition for expertise\n"
                        "- Somewhat support taking the job with substantial recognition for expertise\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support taking the job with moderate personal enjoyment\n"
                        "- Strongly support taking the job with moderate personal enjoyment"
                    ),
                    "targetResponse": (
                        "My judgment: Somewhat support taking the job with substantial recognition for expertise "
                        "because the expectations are clearer.\n\n"
                        "I can imagine someone else quoting 'Neutral / Unsure', but that is not my choice."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "4"
        assert result["decisionSource"] == "deterministic"
        assert result["decisionMetadata"]["parsePath"] == "text_label_leading"
        assert result["decisionMetadata"]["matchedLabel"] == (
            "Somewhat support taking the job with substantial recognition for expertise"
        )

    def test_text_label_ambiguous_when_quoted_scale_not_matched(self) -> None:
        """Quoted scale language inside the explanation produces ambiguous, not a score."""
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n"
                        "- Strongly support taking the job with substantial recognition for expertise\n"
                        "- Somewhat support taking the job with substantial recognition for expertise\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support taking the job with moderate personal enjoyment\n"
                        "- Strongly support taking the job with moderate personal enjoyment"
                    ),
                    "targetResponse": (
                        "I am torn here. The scale phrase 'Neutral / Unsure' comes closest, "
                        "but I would want to explain the tradeoff first."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "other"
        assert result["decisionSource"] == "deterministic"
        assert result["decisionMetadata"]["parseClass"] == "ambiguous"
        assert result["decisionMetadata"]["parsePath"] == "text_label_ambiguous"

    def test_text_label_ambiguous_when_no_matching_scale_label(self) -> None:
        """Unresolved text-label scale produces ambiguous without LLM call."""
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n"
                        "- Strongly support taking the job with substantial recognition for expertise\n"
                        "- Somewhat support taking the job with substantial recognition for expertise\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support taking the job with moderate personal enjoyment\n"
                        "- Strongly support taking the job with moderate personal enjoyment"
                    ),
                    "targetResponse": "I lean toward the more pleasant day-to-day role overall.",
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "other"
        assert result["decisionSource"] == "deterministic"
        assert result["decisionMetadata"]["parseClass"] == "ambiguous"
        assert result["decisionMetadata"]["parsePath"] == "text_label_ambiguous"

    def test_grok_level_of_support_prefix_resolved_deterministically(self) -> None:
        """Grok-style 'Level of Support: <label>' responses should be parsed without LLM fallback."""
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "A mid-level professional has been offered two distinct roles.\n\n"
                        "One job offers trust from other people.\n\n"
                        "One job offers recognition of their expertise.\n\n"
                        "Give me your judgment on the following scale:\n\n"
                        "5 - Strongly support taking the job with recognition of their expertise\n"
                        "4 - Somewhat support taking the job with recognition of their expertise\n"
                        "3 - Neutral / Unsure\n"
                        "2 - Somewhat support taking the job with trust from other people\n"
                        "1 - Strongly support taking the job with trust from other people\n\n"
                        "Please answer in the form: Level of Support and give a direct 150 word response."
                    ),
                    "targetResponse": (
                        "Level of Support: Strongly support taking the job with trust from other people\n\n"
                        "Trust from others enables collaboration and reliability within a team, fostering "
                        "an environment where one can contribute meaningfully. Without trust, even strong "
                        "expertise may go underutilized. At a mid-level, where responsibilities involve "
                        "interdependence, being relied upon promotes growth and job security. (52 words)"
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "1"
        assert result["decisionSource"] == "deterministic"
        assert result["decisionMetadata"]["parsePath"] == "text_label_leading"
        assert result["decisionMetadata"]["matchedLabel"] == (
            "Strongly support taking the job with trust from other people"
        )

    def test_out_of_range_word_count_suffix_falls_through_to_label_match(self) -> None:
        """A trailing word-count like '(152 words)' must not produce an out-of-range decision code."""
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n\n"
                        "5 - Strongly support taking the job with recognition of their expertise\n"
                        "4 - Somewhat support taking the job with recognition of their expertise\n"
                        "3 - Neutral / Unsure\n"
                        "2 - Somewhat support taking the job with trust from other people\n"
                        "1 - Strongly support taking the job with trust from other people"
                    ),
                    "targetResponse": (
                        "Level of Support: Somewhat support taking the job with recognition of their expertise\n\n"
                        "Recognition validates expertise and can accelerate career growth at a mid-level role "
                        "where performance visibility matters. Trust is important but can often be earned "
                        "incrementally, whereas this window for recognition may not recur. (152 words)"
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "4"
        assert result["decisionSource"] == "deterministic"
        # Must NOT be 152
        assert result["decisionCode"] != "152"

    def test_word_count_suffix_with_valid_code_does_not_produce_false_positive(self) -> None:
        """(N words) where N coincidentally equals a valid scale code must not be returned."""
        from summarize import extract_decision_result

        # Response has no explicit decision + "(5 words)" trailer where 5 is a valid code.
        # Before the strip fix, the fallback scan would match 5 from the trailer
        # and the out-of-range guard would pass it (5 IS valid), producing a wrong result.
        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n\n"
                        "5 - Strongly support taking the job with recognition of their expertise\n"
                        "4 - Somewhat support taking the job with recognition of their expertise\n"
                        "3 - Neutral / Unsure\n"
                        "2 - Somewhat support taking the job with trust from other people\n"
                        "1 - Strongly support taking the job with trust from other people"
                    ),
                    "targetResponse": (
                        "Level of Support: Somewhat support taking the job with trust from other people\n\n"
                        "Trust fosters collaboration. (5 words)"
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        # Should resolve via label match ("...trust from other people" → code 2),
        # NOT return 5 from the word-count trailer.
        assert result["decisionCode"] == "2"
        assert result["decisionSource"] == "deterministic"
        assert result["decisionCode"] != "5"

    def test_relaxed_match_drops_their(self) -> None:
        """Model says 'recognition of expertise' instead of 'recognition of their expertise'."""
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support taking the job with recognition of their expertise\n"
                        "- Somewhat support taking the job with recognition of their expertise\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support taking the job with authority over others\n"
                        "- Strongly support taking the job with authority over others"
                    ),
                    "targetResponse": (
                        "**Level of Support: Strongly support taking the job with recognition of expertise** "
                        "The role emphasizing recognition is the superior choice."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "5"
        assert result["decisionSource"] == "deterministic"
        assert "relaxed" in result["decisionMetadata"]["parsePath"]

    def test_relaxed_match_drops_their_from_close_relationships(self) -> None:
        """Model says 'harmony in close relationships' instead of 'harmony in their close relationships'."""
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support taking the job with harmony in their close relationships\n"
                        "- Somewhat support taking the job with harmony in their close relationships\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support taking the job with variety and excitement in their daily work\n"
                        "- Strongly support taking the job with variety and excitement in their daily work"
                    ),
                    "targetResponse": (
                        "**Strongly support taking the job with harmony in close relationships** "
                        "Harmony in close relationships is the stronger choice."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "5"
        assert result["decisionSource"] == "deterministic"
        assert "relaxed" in result["decisionMetadata"]["parsePath"]

    def test_relaxed_match_the_instead_of_their(self) -> None:
        """Model says 'enjoyment in the daily experience' instead of 'enjoyment in their daily experience'."""
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support taking the job with enjoyment in their daily experience\n"
                        "- Somewhat support taking the job with enjoyment in their daily experience\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support taking the job with authority over others\n"
                        "- Strongly support taking the job with authority over others"
                    ),
                    "targetResponse": (
                        "**Level of Support: Strongly support taking the job with enjoyment in the daily experience** "
                        "Rationale: While both roles offer identical compensation..."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "5"
        assert result["decisionSource"] == "deterministic"
        assert "relaxed" in result["decisionMetadata"]["parsePath"]

    def test_exact_match_still_preferred_over_relaxed(self) -> None:
        """Exact match should win when available — relaxed is only a fallback."""
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support taking the job with recognition of their expertise\n"
                        "- Somewhat support taking the job with recognition of their expertise\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support taking the job with authority over others\n"
                        "- Strongly support taking the job with authority over others"
                    ),
                    "targetResponse": (
                        "Somewhat support taking the job with recognition of their expertise\n\n"
                        "Recognition is more sustainable."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "4"
        assert result["decisionSource"] == "deterministic"
        assert "relaxed" not in result["decisionMetadata"]["parsePath"]

    def test_relaxed_match_drops_level_word_full(self) -> None:
        """Model echoes the level word (full) into a level-agnostic scale label.

        Reproduces an observed Grok 4.1 fast-reasoning failure on the
        national-priorities domain where the model wrote
        '...with full freedom in how they live' but the canonical scale
        label is '...with freedom in how they live' (level-agnostic).
        Stripping the 5 level preset words during relaxed matching
        recovers the correct decision code.
        """
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "One program provides citizens with full freedom in how they live...\n"
                        "One program provides citizens with negligible variety and excitement in their daily lives...\n\n"
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support the program that provides citizens with freedom in how they live\n"
                        "- Somewhat support the program that provides citizens with freedom in how they live\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support the program that provides citizens with variety and excitement in their daily lives\n"
                        "- Strongly support the program that provides citizens with variety and excitement in their daily lives"
                    ),
                    "targetResponse": (
                        "Strongly support the program that provides citizens with full freedom in how they live\n\n"
                        "Freedom in goals and actions is the bedrock of human flourishing..."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "5"
        assert result["decisionSource"] == "deterministic"
        assert "relaxed" in result["decisionMetadata"]["parsePath"]

    def test_relaxed_match_drops_level_word_negligible(self) -> None:
        """Model echoes the negligible level into the scale label."""
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support the program that provides citizens with personal security in everyday life\n"
                        "- Somewhat support the program that provides citizens with personal security in everyday life\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support the program that provides citizens with enjoyment in their daily experience\n"
                        "- Strongly support the program that provides citizens with enjoyment in their daily experience"
                    ),
                    "targetResponse": (
                        "Somewhat support the program that provides citizens with negligible enjoyment in their daily experience\n\n"
                        "While enjoyment is light here, the alternative offers stronger security."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "2"
        assert result["decisionSource"] == "deterministic"
        assert "relaxed" in result["decisionMetadata"]["parsePath"]

    def test_relaxed_match_drops_possessive_your_to_my(self) -> None:
        """Model swaps 'your' → 'my' in the scale label.

        Reproduces the dominant failure mode on software-approach-choice:
        scale says 'harmony with your team' but models answer
        'harmony with my team' (natural first-person).
        """
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support choosing the approach relating to harmony with your team and the company\n"
                        "- Somewhat support choosing the approach relating to harmony with your team and the company\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support choosing the approach relating to recognition of your expertise\n"
                        "- Strongly support choosing the approach relating to recognition of your expertise"
                    ),
                    "targetResponse": (
                        "**Strongly support choosing the approach relating to harmony with my team and the company**\n\n"
                        "In a mixed human-AI team, maintaining cohesion matters more than individual recognition."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "5"
        assert result["decisionSource"] == "deterministic"
        assert "relaxed" in result["decisionMetadata"]["parsePath"]

    def test_relaxed_match_drops_possessive_your_to_the(self) -> None:
        """Model swaps 'your' → 'the' in the scale label.

        Second dominant failure: scale says 'trust from your team' but
        models answer 'trust from the team' (neutral third-person).
        """
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support choosing the approach relating to recognition of your expertise\n"
                        "- Somewhat support choosing the approach relating to recognition of your expertise\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support choosing the approach relating to trust from your team\n"
                        "- Strongly support choosing the approach relating to trust from your team"
                    ),
                    "targetResponse": (
                        "**Strongly support choosing the approach relating to trust from the team**\n\n"
                        "Rationale: Trust is foundational to effective collaboration."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "1"
        assert result["decisionSource"] == "deterministic"
        assert "relaxed" in result["decisionMetadata"]["parsePath"]

    def test_distinctive_tail_strongly_support(self) -> None:
        """Model drops internal words from the scale label but preserves the
        distinctive trailing phrase.

        Reproduces the observed GPT-5.1 failure on software-approach-choice
        tradition: canonical label says 'connection to the team's established
        ways' but model answered 'the team's established ways' (dropped
        'connection to' entirely). The distinctive-tail fallback recovers
        these because the last few words ("team's established ways") are
        still unique among the vignette's 2 bodies.
        """
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support choosing the approach relating to connection to the team's established ways\n"
                        "- Somewhat support choosing the approach relating to connection to the team's established ways\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support choosing the approach relating to personal security in everyday life\n"
                        "- Strongly support choosing the approach relating to personal security in everyday life"
                    ),
                    "targetResponse": (
                        "Strongly support choosing the approach relating to the team's established ways\n\n"
                        "Choosing the approach that provides substantial connection to the team's "
                        "established ways is strongly preferable here."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "5"
        assert result["decisionSource"] == "deterministic"
        assert result["decisionMetadata"]["parsePath"] == "text_label_distinctive_tail"

    def test_distinctive_tail_somewhat_support(self) -> None:
        """Somewhat-support variant of the distinctive-tail recovery."""
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support choosing the approach relating to connection to the team's established ways\n"
                        "- Somewhat support choosing the approach relating to connection to the team's established ways\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support choosing the approach relating to enjoyment in the building process\n"
                        "- Strongly support choosing the approach relating to enjoyment in the building process"
                    ),
                    "targetResponse": (
                        "Somewhat support choosing the approach relating to the team's established ways\n\n"
                        "I somewhat support the approach that connects to the team's established "
                        "ways, but not strongly."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "4"
        assert result["decisionSource"] == "deterministic"
        assert result["decisionMetadata"]["parsePath"] == "text_label_distinctive_tail"

    def test_distinctive_tail_refuses_when_tail_is_ambiguous(self) -> None:
        """When two bodies end with the same words (stimulation/hedonism both
        end with 'in the work'), the distinctive-tail fallback MUST not match
        on that shared tail — the parser should stay ambiguous rather than
        guess.
        """
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support choosing the approach relating to variety and excitement in the work\n"
                        "- Somewhat support choosing the approach relating to variety and excitement in the work\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support choosing the approach relating to enjoyment in the work\n"
                        "- Strongly support choosing the approach relating to enjoyment in the work"
                    ),
                    "targetResponse": (
                        "Strongly support choosing the approach relating to in the work\n\n"
                        "Garbled response that only preserves the shared suffix."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        # Only "in the work" is present — shared between both bodies — so the
        # parser should stay unresolved, not guess.
        assert result["decisionCode"] == "other"
        assert result["decisionMetadata"]["parseClass"] == "ambiguous"

    def test_distinctive_tail_disambiguates_when_unique_words_present(self) -> None:
        """When two bodies share a suffix like 'in the work', a model response
        that mentions the unique discriminating word ('excitement' vs
        'enjoyment') should still resolve via the distinctive-tail path
        because each body's distinctive tail includes the discriminator.
        """
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support choosing the approach relating to variety and excitement in the work\n"
                        "- Somewhat support choosing the approach relating to variety and excitement in the work\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support choosing the approach relating to enjoyment in the work\n"
                        "- Strongly support choosing the approach relating to enjoyment in the work"
                    ),
                    "targetResponse": (
                        "Strongly support choosing the approach relating to excitement in the work\n\n"
                        "(Model dropped 'variety and' from the label.)"
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        assert result["decisionCode"] == "5"
        assert result["decisionSource"] == "deterministic"
        assert result["decisionMetadata"]["parsePath"] == "text_label_distinctive_tail"

    def test_anchor_recovers_when_response_has_preamble(self) -> None:
        """LAST-tier anchor matcher recovers a response that contains every
        content word of a label but in a form no stricter tier can parse.

        Here the response opens with a preamble ("My view is this.") which
        pushes the actual decision into the second sentence. That second
        sentence does NOT start with "Strongly support"/"Somewhat support"
        (it starts with "I strongly support"), so distinctive_tail skips it
        — distinctive_tail requires segments to begin with the exact support
        prefix. Strict and relaxed substring matching also fail because the
        label contains "neighborhood" twice but the response collapses the
        second occurrence to "it". The anchor matcher's token-set subset
        logic catches this: the label's distinctive-token set is still a
        subset of the response's tokens.
        """
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support choosing the neighborhood with authority over how the neighborhood is run\n"
                        "- Somewhat support choosing the neighborhood with authority over how the neighborhood is run\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support choosing the neighborhood where people have freedom in how they live\n"
                        "- Strongly support choosing the neighborhood where people have freedom in how they live"
                    ),
                    "targetResponse": (
                        "My view is this. I strongly support choosing the neighborhood "
                        "with authority over how it is run."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        # Bullet-formatted probes have codes assigned in reverse order by
        # collect_scale_labels (first bullet = code "5"). The response
        # endorses "authority" strongly → matches the first bullet → code "5".
        assert result["decisionCode"] == "5"
        assert result["decisionSource"] == "deterministic"
        assert result["decisionMetadata"]["parseClass"] == "fallback_resolved"
        assert result["decisionMetadata"]["parsePath"] == "text_label_anchor"

    def test_anchor_prefers_most_specific_label(self) -> None:
        """When a weaker label's distinctive tokens are a subset of a
        stronger label's (e.g. "Somewhat support X" vs "Strongly support X"),
        the anchor matcher must pick the MORE specific label if the response
        contains its extra distinguishing tokens ("Strongly").

        This is the tie-break mechanism: a response that contains every
        content word of label-5 (and thus necessarily every content word
        of label-4 too) should resolve to label-5, not ambiguously tie.
        """
        from summarize_extract import extract_text_label_decision_anchor

        scale_labels = [
            {"code": "1", "label": "Strongly support choosing the neighborhood with authority over how the neighborhood is run"},
            {"code": "2", "label": "Somewhat support choosing the neighborhood with authority over how the neighborhood is run"},
            {"code": "3", "label": "Neutral / Unsure"},
            {"code": "4", "label": "Somewhat support choosing the neighborhood where people have freedom in how they live"},
            {"code": "5", "label": "Strongly support choosing the neighborhood where people have freedom in how they live"},
        ]
        # "Strongly" is in the response → must pick code=5, not code=4.
        response = (
            "Strongly support choosing the neighborhood where people have full "
            "freedom in how they live"
        )

        code, matched_label = extract_text_label_decision_anchor(response, scale_labels)

        assert code == "5"
        assert matched_label == scale_labels[4]["label"]

    def test_anchor_returns_none_when_response_lacks_distinctive_tokens(self) -> None:
        """If the response doesn't contain ALL distinctive tokens of any
        label, the anchor matcher must return None rather than guess.
        """
        from summarize_extract import extract_text_label_decision_anchor

        scale_labels = [
            {"code": "1", "label": "Strongly support choosing the neighborhood with authority over how the neighborhood is run"},
            {"code": "2", "label": "Somewhat support choosing the neighborhood with authority over how the neighborhood is run"},
            {"code": "3", "label": "Neutral / Unsure"},
            {"code": "4", "label": "Somewhat support choosing the neighborhood where people have freedom in how they live"},
            {"code": "5", "label": "Strongly support choosing the neighborhood where people have freedom in how they live"},
        ]
        response = "I would pick something in the middle"

        code, matched_label = extract_text_label_decision_anchor(response, scale_labels)

        assert code is None
        assert matched_label is None

    def test_anchor_skips_labels_with_too_few_distinctive_tokens(self) -> None:
        """Anchor requires at least 3 distinctive tokens per label. A short
        label like "Neutral / Unsure" has only 2 distinctive tokens and so
        is skipped — otherwise it could match on an incidental quoted
        mention in an ambiguous response (e.g. "the 'Neutral / Unsure'
        option comes closest, but..."). Short labels are still matched by
        the earlier exact / leading / relaxed tiers when the response
        actually endorses them.
        """
        from summarize_extract import extract_text_label_decision_anchor

        scale_labels = [
            {"code": "1", "label": "Strongly support taking the job with substantial recognition for expertise"},
            {"code": "2", "label": "Somewhat support taking the job with substantial recognition for expertise"},
            {"code": "3", "label": "Neutral / Unsure"},
            {"code": "4", "label": "Somewhat support taking the job with moderate personal enjoyment"},
            {"code": "5", "label": "Strongly support taking the job with moderate personal enjoyment"},
        ]
        # Response only mentions the neutral label's tokens incidentally —
        # does NOT endorse it. Must return None rather than false-match code 3.
        response = (
            "I am torn here. The scale phrase 'Neutral / Unsure' comes "
            "closest, but I would want to explain the tradeoff first."
        )

        code, matched_label = extract_text_label_decision_anchor(response, scale_labels)

        assert code is None
        assert matched_label is None

    def test_anchor_ignores_tokens_from_body_of_essay_style_response(self) -> None:
        """REGRESSION: an earlier iteration of the anchor matcher applied its
        token-subset logic to the FULL response text. Essay-style answers
        discuss both sides of the value tradeoff as part of justifying a
        choice — so both sides' distinctive tokens end up present in the
        full response, and the matcher picked whichever label's token set
        was largest rather than the one actually endorsed.

        This is the real Mistral transcript (id cmo2qc73428at4wef9ieszg5l):
        the model clearly endorsed "authority" in the opening sentence,
        then spent the rest of the essay explaining why — which included
        a concession paragraph beginning "While variety and excitement in
        daily life may provide short-term stimulation...". That paragraph
        mentions every distinctive token of the OPPOSITE label (variety /
        excitement / daily / life).

        Anchor must look only at the leading decision sentence. The body
        of the essay is commentary, not endorsement.
        """
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Please answer the question.\n\n"
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support choosing the neighborhood with variety and excitement in daily life\n"
                        "- Somewhat support choosing the neighborhood with variety and excitement in daily life\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support choosing the neighborhood with authority over how the neighborhood is run\n"
                        "- Strongly support choosing the neighborhood with authority over how the neighborhood is run"
                    ),
                    "targetResponse": (
                        "**Level of Support:** Strongly support choosing the "
                        "neighborhood with substantial authority over how it is run.\n\n"
                        "A neighborhood that grants residents significant authority "
                        "over its governance fosters a deeper sense of agency, "
                        "belonging, and long-term satisfaction. While variety and "
                        "excitement in daily life may provide short-term "
                        "stimulation, the ability to shape one's environment — "
                        "through decision-making, community initiatives, or policy "
                        "influence — creates lasting fulfillment."
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        # Authority bullet is position 5 in the scale list → code "1" under
        # collect_scale_labels' reverse bullet mapping.
        assert result["decisionCode"] == "1"
        assert result["decisionMetadata"]["matchedLabel"] == (
            "Strongly support choosing the neighborhood with authority "
            "over how the neighborhood is run"
        )
        assert result["decisionMetadata"]["parsePath"] == "text_label_anchor"

    def test_anchor_only_runs_after_stricter_tiers_fail(self) -> None:
        """The anchor matcher is LAST-tier. When a response matches the label
        exactly (or via any earlier tier), the parse path must be one of the
        stricter tiers, NOT `text_label_anchor`.
        """
        from summarize import extract_decision_result

        transcript_content = {
            "turns": [
                {
                    "probePrompt": (
                        "Give me your judgment on the following scale:\n\n"
                        "- Strongly support choosing the neighborhood with authority over how the neighborhood is run\n"
                        "- Somewhat support choosing the neighborhood with authority over how the neighborhood is run\n"
                        "- Neutral / Unsure\n"
                        "- Somewhat support choosing the neighborhood where people have freedom in how they live\n"
                        "- Strongly support choosing the neighborhood where people have freedom in how they live"
                    ),
                    # Exact match for label-1.
                    "targetResponse": (
                        "Strongly support choosing the neighborhood with authority "
                        "over how the neighborhood is run"
                    ),
                }
            ]
        }

        result = extract_decision_result(transcript_content)

        # First bullet = code "5" under collect_scale_labels' reverse mapping.
        assert result["decisionCode"] == "5"
        assert result["decisionMetadata"]["parsePath"] != "text_label_anchor"
        assert result["decisionMetadata"]["parseClass"] == "exact"

    @patch("summarize.extract_decision_code")
    def test_uses_default_model(
        self, mock_extract: MagicMock
    ) -> None:
        """Test default model is used when not specified."""
        from summarize import run_summarize

        mock_extract.return_value = "3"

        data = {
            "transcriptId": "transcript-123",
            "transcriptContent": {"turns": []},
        }

        run_summarize(data)

    @patch("summarize.extract_decision_result")
    def test_handles_worker_error(
        self, mock_extract: MagicMock
    ) -> None:
        """Test handling of WorkerError. Mocks the top-level extractor that
        run_summarize actually calls (previously mocked the now-unused
        extract_decision_code primitive)."""
        from summarize import run_summarize

        mock_extract.side_effect = WorkerError(
            message="Worker failed",
            code=ErrorCode.UNKNOWN,
        )

        data = {
            "transcriptId": "transcript-123",
            "transcriptContent": {"turns": []},
        }

        result = run_summarize(data)

        assert result["success"] is False
        assert "error" in result

    @patch("summarize.extract_decision_result")
    def test_handles_unexpected_error(
        self, mock_extract: MagicMock
    ) -> None:
        """Test handling of unexpected errors."""
        from summarize import run_summarize

        mock_extract.side_effect = RuntimeError("Unexpected")

        data = {
            "transcriptId": "transcript-123",
            "transcriptContent": {"turns": []},
        }

        result = run_summarize(data)

        assert result["success"] is False
        assert "error" in result


class TestRunSummarizeBatch:
    """Tests for run_summarize_batch function."""

    def test_returns_per_transcript_results(self) -> None:
        """Batch mode should preserve per-transcript summaries."""
        from summarize_batch import run_summarize_batch

        data = {
            "transcripts": [
                {
                    "transcriptId": "transcript-1",
                    "modelId": "anthropic:claude-3.5-sonnet",
                    "transcriptContent": {"turns": []},
                },
                {
                    "transcriptId": "transcript-2",
                    "modelId": "anthropic:claude-3.5-sonnet",
                    "transcriptContent": {"turns": []},
                },
            ]
        }

        with patch("summarize_batch.run_summarize") as mock_run, patch(
            "summarize_batch.validate_input"
        ) as mock_validate:
            mock_run.side_effect = [
                {
                    "success": True,
                    "summary": {
                        "decisionCode": "4",
                        "decisionSource": "deterministic",
                        "decisionText": None,
                        "decisionMetadata": {"parseClass": "exact"},
                    },
                },
                {
                    "success": False,
                    "error": {
                        "message": "Rate limited",
                        "code": "RATE_LIMIT",
                        "retryable": True,
                    },
                },
            ]

            result = run_summarize_batch(data)

        assert result["success"] is False
        assert result["error"]["code"] == "BATCH_PARTIAL_FAILURE"
        assert result["error"]["retryable"] is True
        assert len(result["summaries"]) == 2
        assert result["summaries"][0]["transcriptId"] == "transcript-1"
        assert result["summaries"][0]["success"] is True
        assert result["summaries"][0]["summary"]["decisionCode"] == "4"
        assert result["summaries"][1]["transcriptId"] == "transcript-2"
        assert result["summaries"][1]["success"] is False
        assert result["summaries"][1]["error"]["code"] == "RATE_LIMIT"
        assert mock_validate.call_count == 2
        assert mock_run.call_count == 2

    def test_returns_item_validation_error_without_failing_batch(self) -> None:
        """Invalid batch items should be returned as per-item errors."""
        from summarize_batch import run_summarize_batch

        data = {
            "transcripts": [
                {
                    "transcriptId": "transcript-1",
                    "modelId": "anthropic:claude-3.5-sonnet",
                    "transcriptContent": {"turns": []},
                },
                {
                    "transcriptId": "transcript-2",
                    "modelId": "anthropic:claude-3.5-sonnet",
                },
            ]
        }

        with patch("summarize_batch.run_summarize") as mock_run:
            mock_run.return_value = {
                "success": True,
                "summary": {
                    "decisionCode": "4",
                    "decisionSource": "deterministic",
                    "decisionText": None,
                    "decisionMetadata": {"parseClass": "exact"},
                },
            }

            result = run_summarize_batch(data)

        assert result["success"] is False
        assert result["error"]["code"] == "BATCH_PARTIAL_FAILURE"
        assert len(result["summaries"]) == 2
        assert result["summaries"][0]["success"] is True
        assert result["summaries"][1]["batchIndex"] == 1
        assert result["summaries"][1]["success"] is False
        assert result["summaries"][1]["error"]["code"] == ErrorCode.VALIDATION_ERROR.value
        assert mock_run.call_count == 1

    def test_returns_success_for_empty_batch(self) -> None:
        """An empty batch should round-trip cleanly."""
        from summarize_batch import run_summarize_batch

        result = run_summarize_batch({"transcripts": []})

        assert result["success"] is True
        assert result["summaries"] == []

    def test_rejects_non_list_batch_envelope(self) -> None:
        """A malformed transcripts envelope should fail fast."""
        from summarize_batch import run_summarize_batch

        result = run_summarize_batch({"transcripts": "not-a-list"})

        assert result["success"] is False
        assert result["error"]["code"] == ErrorCode.VALIDATION_ERROR.value

    def test_rejects_oversized_batch(self) -> None:
        """A batch larger than the configured maximum should fail fast."""
        from summarize_batch import MAX_SUMMARIZE_BATCH_SIZE, run_summarize_batch

        result = run_summarize_batch(
            {
                "transcripts": [
                    {
                        "transcriptId": f"transcript-{index}",
                        "modelId": "anthropic:claude-3.5-sonnet",
                        "transcriptContent": {"turns": []},
                    }
                    for index in range(MAX_SUMMARIZE_BATCH_SIZE + 1)
                ]
            }
        )

        assert result["success"] is False
        assert result["error"]["code"] == ErrorCode.VALIDATION_ERROR.value


class TestMain:
    """Tests for main entry point."""

    @patch("summarize_batch.run_summarize")
    @patch("sys.stdin")
    def test_successful_execution(
        self, mock_stdin: MagicMock, mock_run: MagicMock, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """Test successful main execution."""
        from summarize_batch import main

        mock_stdin.read.return_value = json.dumps({
            "transcriptId": "transcript-123",
            "transcriptContent": {"turns": []},
        })
        mock_run.return_value = {
            "success": True,
            "summary": {"decisionCode": "4", "decisionText": "Summary"},
        }

        main()

        captured = capsys.readouterr()
        result = json.loads(captured.out)
        assert result["success"] is True

    @patch("sys.stdin")
    def test_empty_input(
        self, mock_stdin: MagicMock, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """Test handling of empty input."""
        from summarize_batch import main

        mock_stdin.read.return_value = ""

        main()

        captured = capsys.readouterr()
        result = json.loads(captured.out)
        assert result["success"] is False
        assert "No input" in result["error"]["message"]

    @patch("sys.stdin")
    def test_invalid_json_input(
        self, mock_stdin: MagicMock, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """Test handling of invalid JSON."""
        from summarize_batch import main

        mock_stdin.read.return_value = "not valid json {"

        main()

        captured = capsys.readouterr()
        result = json.loads(captured.out)
        assert result["success"] is False
        assert "Invalid JSON" in result["error"]["message"]

    @patch("sys.stdin")
    def test_validation_error(
        self, mock_stdin: MagicMock, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """Test handling of validation error."""
        from summarize_batch import main

        mock_stdin.read.return_value = json.dumps({
            "transcriptId": "t-123",
            # Missing transcriptContent
        })

        main()

        captured = capsys.readouterr()
        result = json.loads(captured.out)
        assert result["success"] is False
        assert ErrorCode.VALIDATION_ERROR.value == result["error"]["code"]

    @patch("summarize_batch.run_summarize_batch")
    @patch("sys.stdin")
    def test_batch_execution(
        self, mock_stdin: MagicMock, mock_run_batch: MagicMock, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """Test batch execution path."""
        from summarize_batch import main

        mock_stdin.read.return_value = json.dumps({
            "transcripts": [
                {
                    "transcriptId": "transcript-1",
                    "modelId": "anthropic:claude-3.5-sonnet",
                    "transcriptContent": {"turns": []},
                },
                {
                    "transcriptId": "transcript-2",
                    "modelId": "anthropic:claude-3.5-sonnet",
                    "transcriptContent": {"turns": []},
                },
            ]
        })
        mock_run_batch.return_value = {
            "success": True,
            "summaries": [
                {
                    "transcriptId": "transcript-1",
                    "success": True,
                    "summary": {
                        "decisionCode": "4",
                        "decisionSource": "deterministic",
                        "decisionText": None,
                        "decisionMetadata": {"parseClass": "exact"},
                    },
                },
                {
                    "transcriptId": "transcript-2",
                    "success": True,
                    "summary": {
                        "decisionCode": "2",
                        "decisionSource": "deterministic",
                        "decisionText": None,
                        "decisionMetadata": {"parseClass": "exact"},
                    },
                },
            ],
        }

        main()

        captured = capsys.readouterr()
        result = json.loads(captured.out)
        assert result["success"] is True
        assert len(result["summaries"]) == 2
        mock_run_batch.assert_called_once()

    @patch("sys.stdin")
    def test_batch_validation_error(
        self, mock_stdin: MagicMock, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """Test malformed batch envelopes stay in batch mode."""
        from summarize_batch import main

        mock_stdin.read.return_value = json.dumps({
            "transcripts": "not-a-list",
        })

        main()

        captured = capsys.readouterr()
        result = json.loads(captured.out)
        assert result["success"] is False
        assert result["error"]["code"] == ErrorCode.VALIDATION_ERROR.value

    @patch("sys.stdin")
    def test_mixed_batch_envelope_rejected(
        self, mock_stdin: MagicMock, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """Test that mixed batch and single envelopes fail fast."""
        from summarize_batch import main

        mock_stdin.read.return_value = json.dumps({
            "transcriptId": "transcript-123",
            "transcriptContent": {"turns": []},
            "transcripts": [],
        })

        main()

        captured = capsys.readouterr()
        result = json.loads(captured.out)
        assert result["success"] is False
        assert result["error"]["code"] == ErrorCode.VALIDATION_ERROR.value
