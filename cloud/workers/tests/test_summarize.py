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


class TestExtractDecisionCode:
    """Tests for decision code extraction."""

    def test_extracts_rating_from_response(self) -> None:
        """Test extraction of numeric rating."""
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
        """Test that first rating is returned when multiple exist."""
        from summarize import extract_decision_code

        content = {
            "turns": [
                {
                    "probePrompt": "Rate it",
                    "targetResponse": "I think 3 is appropriate, but 4 could work",
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


class TestBuildSummaryPrompt:
    """Tests for prompt building."""

    def test_includes_transcript_text(self) -> None:
        """Test that prompt includes transcript text."""
        from summarize import build_summary_prompt

        content = {
            "turns": [
                {
                    "probePrompt": "What do you think?",
                    "targetResponse": "I think 4 is appropriate",
                }
            ]
        }

        prompt = build_summary_prompt(content)

        assert "What do you think?" in prompt
        assert "I think 4 is appropriate" in prompt
        assert "**User:**" in prompt
        assert "**Target:**" in prompt

    def test_handles_empty_turns(self) -> None:
        """Test prompt building with empty turns."""
        from summarize import build_summary_prompt

        content = {"turns": []}
        prompt = build_summary_prompt(content)

        assert "moral dilemma" in prompt.lower() or "conversation" in prompt.lower()

    def test_handles_missing_fields(self) -> None:
        """Test prompt building with missing turn fields."""
        from summarize import build_summary_prompt

        content = {
            "turns": [
                {"targetResponse": "Just a response"},
            ]
        }

        prompt = build_summary_prompt(content)
        assert "Just a response" in prompt


class TestGenerateSummary:
    """Tests for summary generation."""

    @patch("summarize.generate")
    def test_successful_generation(self, mock_generate: MagicMock) -> None:
        """Test successful summary generation."""
        from summarize import generate_summary

        mock_generate.return_value = LLMResponse(
            content="The AI prioritized safety concerns.",
        )

        result = generate_summary("anthropic:claude-3.5-sonnet", "test prompt")

        assert result == "The AI prioritized safety concerns."
        mock_generate.assert_called_once()

    @patch("summarize.generate")
    def test_truncates_long_summary(self, mock_generate: MagicMock) -> None:
        """Test that long summaries are truncated."""
        from summarize import generate_summary

        long_text = "x" * 500  # Longer than 300 chars
        mock_generate.return_value = LLMResponse(
            content=long_text,
        )

        result = generate_summary("anthropic:claude-3.5-sonnet", "test prompt")

        assert len(result) == 300

    @patch("summarize.generate")
    def test_handles_multiline_response(self, mock_generate: MagicMock) -> None:
        """Test that newlines are replaced with spaces."""
        from summarize import generate_summary

        mock_generate.return_value = LLMResponse(
            content="Line 1\nLine 2\nLine 3",
        )

        result = generate_summary("anthropic:claude-3.5-sonnet", "test prompt")

        assert "\n" not in result
        assert "Line 1 Line 2 Line 3" == result

    @patch("summarize.generate")
    def test_handles_llm_error(self, mock_generate: MagicMock) -> None:
        """Test handling of LLM errors."""
        from summarize import generate_summary

        mock_generate.side_effect = LLMError(
            message="API error",
            code=ErrorCode.SERVER_ERROR,
        )

        result = generate_summary("anthropic:claude-3.5-sonnet", "test prompt")

        assert "LLM error" in result

    @patch("summarize.generate")
    def test_handles_unexpected_error(self, mock_generate: MagicMock) -> None:
        """Test handling of unexpected errors."""
        from summarize import generate_summary

        mock_generate.side_effect = RuntimeError("Unexpected error")

        result = generate_summary("anthropic:claude-3.5-sonnet", "test prompt")

        assert "LLM error" in result


class TestRunSummarize:
    """Tests for run_summarize function."""

    @patch("summarize.generate_summary")
    @patch("summarize.extract_decision_code")
    def test_successful_summarization(
        self, mock_extract: MagicMock, mock_generate: MagicMock
    ) -> None:
        """Test successful summarization."""
        from summarize import run_summarize

        mock_extract.return_value = "4"
        mock_generate.return_value = "The AI chose option 4 for safety."

        data = {
            "transcriptId": "transcript-123",
            "modelId": "anthropic:claude-3.5-sonnet",
            "transcriptContent": {"turns": []},
        }

        result = run_summarize(data)

        assert result["success"] is True
        assert result["summary"]["decisionCode"] == "4"
        assert result["summary"]["decisionText"] == "The AI chose option 4 for safety."

    @patch("summarize.generate_summary")
    @patch("summarize.extract_decision_code")
    def test_uses_default_model(
        self, mock_extract: MagicMock, mock_generate: MagicMock
    ) -> None:
        """Test default model is used when not specified."""
        from summarize import DEFAULT_SUMMARY_MODEL, run_summarize

        mock_extract.return_value = "3"
        mock_generate.return_value = "Summary text"

        data = {
            "transcriptId": "transcript-123",
            "transcriptContent": {"turns": []},
        }

        run_summarize(data)

        mock_generate.assert_called_once()
        call_args = mock_generate.call_args
        assert call_args[0][0] == DEFAULT_SUMMARY_MODEL

    @patch("summarize.generate_summary")
    @patch("summarize.extract_decision_code")
    def test_handles_worker_error(
        self, mock_extract: MagicMock, mock_generate: MagicMock
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

    @patch("summarize.generate_summary")
    @patch("summarize.extract_decision_code")
    def test_handles_unexpected_error(
        self, mock_extract: MagicMock, mock_generate: MagicMock
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
