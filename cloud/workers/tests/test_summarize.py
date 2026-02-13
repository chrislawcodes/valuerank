"""Tests for summarize worker."""

import json
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


class TestClassifyDecisionWithLlm:
    """Tests for fallback LLM decision classification."""

    @patch("summarize.generate")
    def test_successful_numeric_classification(self, mock_generate: MagicMock) -> None:
        """Test successful numeric decision classification."""
        from summarize import classify_decision_with_llm

        mock_generate.return_value = LLMResponse(
            content="4",
        )

        result = classify_decision_with_llm({"turns": []})

        assert result == "4"
        mock_generate.assert_called_once()

    @patch("summarize.generate")
    def test_parses_refusal(self, mock_generate: MagicMock) -> None:
        """Test explicit refusal parsing."""
        from summarize import classify_decision_with_llm

        mock_generate.return_value = LLMResponse(
            content="refusal",
        )

        result = classify_decision_with_llm({"turns": []})

        assert result == "refusal"

    @patch("summarize.generate")
    def test_parses_number_from_verbose_output(self, mock_generate: MagicMock) -> None:
        """Test extraction from verbose LLM output."""
        from summarize import classify_decision_with_llm

        mock_generate.return_value = LLMResponse(
            content="Decision: 6",
        )

        result = classify_decision_with_llm({"turns": []})

        assert result == "6"

    @patch("summarize.generate")
    def test_handles_llm_error(self, mock_generate: MagicMock) -> None:
        """Test handling of LLM errors."""
        from summarize import classify_decision_with_llm

        mock_generate.side_effect = LLMError(
            message="API error",
            code=ErrorCode.SERVER_ERROR,
        )

        result = classify_decision_with_llm({"turns": []})

        assert result == "other"

    @patch("summarize.generate")
    def test_handles_unexpected_error(self, mock_generate: MagicMock) -> None:
        """Test handling of unexpected errors."""
        from summarize import classify_decision_with_llm

        mock_generate.side_effect = RuntimeError("Unexpected error")

        result = classify_decision_with_llm({"turns": []})

        assert result == "other"


class TestRunSummarize:
    """Tests for run_summarize function."""

    @patch("summarize.classify_decision_with_llm")
    @patch("summarize.extract_decision_code")
    def test_successful_summarization_with_structured_rating(
        self, mock_extract: MagicMock, mock_classify: MagicMock
    ) -> None:
        """Test successful summarization with rating."""
        from summarize import run_summarize

        mock_extract.return_value = "4"

        data = {
            "transcriptId": "transcript-123",
            "modelId": "anthropic:claude-3.5-sonnet",
            "transcriptContent": {"turns": []},
        }

        result = run_summarize(data)

        assert result["success"] is True
        assert result["summary"]["decisionCode"] == "4"
        assert result["summary"]["decisionSource"] == "deterministic"
        assert result["summary"]["decisionText"] is None
        mock_classify.assert_not_called()

    @patch("summarize.classify_decision_with_llm")
    @patch("summarize.extract_decision_code")
    def test_summarization_result_is_deterministic(
        self, mock_extract: MagicMock, mock_classify: MagicMock
    ) -> None:
        """Test that summarization uses deterministic rating."""
        from summarize import run_summarize

        mock_extract.return_value = "2"

        data = {
            "transcriptId": "transcript-123",
            "modelId": "anthropic:claude-3.5-sonnet",
            "transcriptContent": {"turns": []},
        }

        result = run_summarize(data)

        assert result["success"] is True
        assert result["summary"]["decisionCode"] == "2"
        assert result["summary"]["decisionSource"] == "deterministic"
        assert result["summary"]["decisionText"] is None
        mock_classify.assert_not_called()

    @patch("summarize.classify_decision_with_llm")
    @patch("summarize.extract_decision_code")
    def test_uses_llm_fallback_when_deterministic_is_other(
        self, mock_extract: MagicMock, mock_classify: MagicMock
    ) -> None:
        """Test fallback LLM is used when deterministic extraction fails."""
        from summarize import run_summarize

        mock_extract.return_value = "other"
        mock_classify.return_value = "5"

        data = {
            "transcriptId": "transcript-123",
            "modelId": "anthropic:claude-3.5-sonnet",
            "transcriptContent": {"turns": []},
        }

        result = run_summarize(data)

        assert result["success"] is True
        assert result["summary"]["decisionCode"] == "5"
        assert result["summary"]["decisionSource"] == "llm"
        mock_classify.assert_called_once()

    @patch("summarize.classify_decision_with_llm")
    @patch("summarize.extract_decision_code")
    def test_keeps_other_when_llm_fallback_unresolved(
        self, mock_extract: MagicMock, mock_classify: MagicMock
    ) -> None:
        """Test that unresolved fallback keeps deterministic other."""
        from summarize import run_summarize

        mock_extract.return_value = "other"
        mock_classify.return_value = "other"

        data = {
            "transcriptId": "transcript-123",
            "modelId": "anthropic:claude-3.5-sonnet",
            "transcriptContent": {"turns": []},
        }

        result = run_summarize(data)

        assert result["success"] is True
        assert result["summary"]["decisionCode"] == "other"
        assert result["summary"]["decisionSource"] == "deterministic"
        assert result["summary"]["decisionText"] is None

    @patch("summarize.classify_decision_with_llm")
    @patch("summarize.extract_decision_code")
    def test_uses_default_model(
        self, mock_extract: MagicMock, mock_classify: MagicMock
    ) -> None:
        """Test default model is used when not specified."""
        from summarize import run_summarize

        mock_extract.return_value = "3"

        data = {
            "transcriptId": "transcript-123",
            "transcriptContent": {"turns": []},
        }

        run_summarize(data)

        mock_classify.assert_not_called()

    @patch("summarize.classify_decision_with_llm")
    @patch("summarize.extract_decision_code")
    def test_handles_worker_error(
        self, mock_extract: MagicMock, mock_classify: MagicMock
    ) -> None:
        """Test handling of WorkerError."""
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

    @patch("summarize.classify_decision_with_llm")
    @patch("summarize.extract_decision_code")
    def test_handles_unexpected_error(
        self, mock_extract: MagicMock, mock_classify: MagicMock
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


class TestMain:
    """Tests for main entry point."""

    @patch("summarize.run_summarize")
    @patch("sys.stdin")
    def test_successful_execution(
        self, mock_stdin: MagicMock, mock_run: MagicMock, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """Test successful main execution."""
        from summarize import main

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
        from summarize import main

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
        from summarize import main

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
        from summarize import main

        mock_stdin.read.return_value = json.dumps({
            "transcriptId": "t-123",
            # Missing transcriptContent
        })

        main()

        captured = capsys.readouterr()
        result = json.loads(captured.out)
        assert result["success"] is False
        assert ErrorCode.VALIDATION_ERROR.value == result["error"]["code"]
