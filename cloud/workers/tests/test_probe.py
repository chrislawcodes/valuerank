"""Tests for probe worker."""

import json
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from common.errors import ErrorCode
from common.llm_adapters import LLMResponse


class TestValidateInput:
    """Tests for input validation."""

    def test_valid_input(self) -> None:
        """Test validation passes for valid input."""
        from probe import validate_input

        data = {
            "runId": "run-123",
            "scenarioId": "scenario-456",
            "modelId": "gpt-4",
            "scenario": {
                "preamble": "You are helpful.",
                "prompt": "Hello, world!",
                "followups": [],
            },
            "config": {
                "temperature": 0.7,
                "maxTokens": 1024,
                "maxTurns": 10,
            },
        }
        # Should not raise
        validate_input(data)

    def test_missing_required_field(self) -> None:
        """Test validation fails for missing fields."""
        from common.errors import ValidationError
        from probe import validate_input

        data = {
            "runId": "run-123",
            # Missing scenarioId, modelId, scenario, config
        }

        with pytest.raises(ValidationError) as exc_info:
            validate_input(data)

        assert "Missing required field" in exc_info.value.message

    def test_missing_scenario_prompt(self) -> None:
        """Test validation fails for missing prompt."""
        from common.errors import ValidationError
        from probe import validate_input

        data = {
            "runId": "run-123",
            "scenarioId": "scenario-456",
            "modelId": "gpt-4",
            "scenario": {
                "preamble": "You are helpful.",
                # Missing prompt
            },
            "config": {},
        }

        with pytest.raises(ValidationError) as exc_info:
            validate_input(data)

        assert "prompt" in exc_info.value.message

    def test_empty_prompt_rejected(self) -> None:
        """Test validation fails for empty prompt."""
        from common.errors import ValidationError
        from probe import validate_input

        data = {
            "runId": "run-123",
            "scenarioId": "scenario-456",
            "modelId": "gpt-4",
            "scenario": {
                "prompt": "   ",  # Whitespace only
            },
            "config": {},
        }

        with pytest.raises(ValidationError) as exc_info:
            validate_input(data)

        assert "empty" in exc_info.value.message.lower()


class TestEstimateTokens:
    """Tests for token estimation."""

    def test_empty_text(self) -> None:
        """Test token count for empty text."""
        from probe import estimate_tokens

        assert estimate_tokens("", "gpt-4") == 0

    def test_character_estimation(self) -> None:
        """Test character-based estimation for non-OpenAI models."""
        from probe import estimate_tokens

        # 100 characters / 4 = 25 tokens
        text = "a" * 100
        result = estimate_tokens(text, "claude-3-sonnet")
        assert result == 25

    def test_minimum_token_count(self) -> None:
        """Test minimum token count is 1 for non-empty text."""
        from probe import estimate_tokens

        # 1 character should still be at least 1 token
        result = estimate_tokens("a", "claude-3-sonnet")
        assert result >= 1


class TestTurn:
    """Tests for Turn dataclass."""

    def test_to_dict(self) -> None:
        """Test Turn serialization."""
        from probe import Turn

        turn = Turn(
            turn_number=1,
            prompt_label="scenario_prompt",
            probe_prompt="Hello",
            target_response="Hi there!",
            input_tokens=10,
            output_tokens=5,
        )
        d = turn.to_dict()

        assert d["turnNumber"] == 1
        assert d["promptLabel"] == "scenario_prompt"
        assert d["probePrompt"] == "Hello"
        assert d["targetResponse"] == "Hi there!"
        assert d["inputTokens"] == 10
        assert d["outputTokens"] == 5


class TestTranscript:
    """Tests for Transcript dataclass."""

    def test_to_dict(self) -> None:
        """Test Transcript serialization."""
        from datetime import datetime, timezone

        from probe import Transcript, Turn

        transcript = Transcript(
            turns=[
                Turn(
                    turn_number=1,
                    prompt_label="test",
                    probe_prompt="Hello",
                    target_response="Hi",
                )
            ],
            total_input_tokens=100,
            total_output_tokens=50,
            model_version="gpt-4-0613",
            started_at=datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
            completed_at=datetime(2024, 1, 1, 12, 0, 5, tzinfo=timezone.utc),
        )
        d = transcript.to_dict()

        assert len(d["turns"]) == 1
        assert d["totalInputTokens"] == 100
        assert d["totalOutputTokens"] == 50
        assert d["modelVersion"] == "gpt-4-0613"
        assert "2024-01-01" in d["startedAt"]


class TestRunProbe:
    """Tests for run_probe function."""

    @pytest.fixture
    def valid_input(self) -> dict[str, Any]:
        """Create valid probe input."""
        return {
            "runId": "run-123",
            "scenarioId": "scenario-456",
            "modelId": "gpt-4",
            "scenario": {
                "preamble": "You are a helpful assistant.",
                "prompt": "What is 2+2?",
                "followups": [
                    {"label": "followup_1", "prompt": "Are you sure?"},
                ],
            },
            "config": {
                "temperature": 0.7,
                "maxTokens": 1024,
                "maxTurns": 10,
            },
        }

    def test_single_turn_success(self, valid_input: dict[str, Any]) -> None:
        """Test successful single-turn probe."""
        from probe import run_probe

        # Remove followups for single turn test
        valid_input["scenario"]["followups"] = []

        with patch("probe.generate") as mock_generate:
            mock_generate.return_value = LLMResponse(
                content="The answer is 4.",
                input_tokens=50,
                output_tokens=10,
                model_version="gpt-4-0613",
            )

            result = run_probe(valid_input)

        assert result["success"] is True
        assert len(result["transcript"]["turns"]) == 1
        assert result["transcript"]["turns"][0]["targetResponse"] == "The answer is 4."
        assert result["transcript"]["totalInputTokens"] == 50
        assert result["transcript"]["totalOutputTokens"] == 10
        assert result["transcript"]["modelVersion"] == "gpt-4-0613"

    def test_multi_turn_success(self, valid_input: dict[str, Any]) -> None:
        """Test successful multi-turn probe."""
        from probe import run_probe

        with patch("probe.generate") as mock_generate:
            mock_generate.side_effect = [
                LLMResponse(content="4", input_tokens=50, output_tokens=5),
                LLMResponse(content="Yes, I'm sure.", input_tokens=60, output_tokens=8),
            ]

            result = run_probe(valid_input)

        assert result["success"] is True
        assert len(result["transcript"]["turns"]) == 2
        assert result["transcript"]["turns"][0]["promptLabel"] == "scenario_prompt"
        assert result["transcript"]["turns"][1]["promptLabel"] == "followup_1"
        assert result["transcript"]["totalInputTokens"] == 110  # 50 + 60
        assert result["transcript"]["totalOutputTokens"] == 13  # 5 + 8

    def test_llm_error_handling(self, valid_input: dict[str, Any]) -> None:
        """Test LLM error is properly returned."""
        from common.errors import LLMError
        from probe import run_probe

        with patch("probe.generate") as mock_generate:
            mock_generate.side_effect = LLMError(
                message="Rate limit exceeded",
                status_code=429,
            )

            result = run_probe(valid_input)

        assert result["success"] is False
        assert result["error"]["code"] == "RATE_LIMIT"
        assert result["error"]["retryable"] is True

    def test_timing_captured(self, valid_input: dict[str, Any]) -> None:
        """Test that timing information is captured."""
        from probe import run_probe

        valid_input["scenario"]["followups"] = []

        with patch("probe.generate") as mock_generate:
            mock_generate.return_value = LLMResponse(content="Response")

            result = run_probe(valid_input)

        assert result["success"] is True
        assert result["transcript"]["startedAt"] is not None
        assert result["transcript"]["completedAt"] is not None

    def test_respects_max_turns(self, valid_input: dict[str, Any]) -> None:
        """Test that maxTurns config is respected."""
        from probe import run_probe

        # Add many followups but set maxTurns to 2
        valid_input["scenario"]["followups"] = [
            {"label": f"followup_{i}", "prompt": f"Question {i}"}
            for i in range(5)
        ]
        valid_input["config"]["maxTurns"] = 2

        with patch("probe.generate") as mock_generate:
            mock_generate.return_value = LLMResponse(content="Response")

            result = run_probe(valid_input)

        assert result["success"] is True
        # maxTurns=2 means initial + 1 followup = 2 turns
        assert len(result["transcript"]["turns"]) == 2


class TestMainFunction:
    """Tests for main stdin/stdout handling."""

    def test_empty_input(self, capsys: pytest.CaptureFixture[str]) -> None:
        """Test handling of empty input."""
        from io import StringIO
        import sys

        with patch.object(sys, "stdin", StringIO("")):
            from probe import main

            main()

        captured = capsys.readouterr()
        result = json.loads(captured.out)
        assert result["success"] is False
        assert "No input" in result["error"]["message"]

    def test_invalid_json_input(self, capsys: pytest.CaptureFixture[str]) -> None:
        """Test handling of invalid JSON."""
        from io import StringIO
        import sys

        with patch.object(sys, "stdin", StringIO("not valid json")):
            from probe import main

            main()

        captured = capsys.readouterr()
        result = json.loads(captured.out)
        assert result["success"] is False
        assert "Invalid JSON" in result["error"]["message"]

    def test_validation_error(self, capsys: pytest.CaptureFixture[str]) -> None:
        """Test handling of validation errors."""
        from io import StringIO
        import sys

        invalid_input = json.dumps({"runId": "test"})  # Missing required fields

        with patch.object(sys, "stdin", StringIO(invalid_input)):
            from probe import main

            main()

        captured = capsys.readouterr()
        result = json.loads(captured.out)
        assert result["success"] is False
        assert result["error"]["code"] == "VALIDATION_ERROR"

    def test_successful_execution(self, capsys: pytest.CaptureFixture[str]) -> None:
        """Test successful probe execution."""
        from io import StringIO
        import sys

        valid_input = json.dumps({
            "runId": "run-123",
            "scenarioId": "scenario-456",
            "modelId": "gpt-4",
            "scenario": {
                "prompt": "Hello",
            },
            "config": {},
        })

        with patch.object(sys, "stdin", StringIO(valid_input)):
            with patch("probe.generate") as mock_generate:
                mock_generate.return_value = LLMResponse(
                    content="Hi there!",
                    input_tokens=10,
                    output_tokens=5,
                )

                from probe import main

                main()

        captured = capsys.readouterr()
        result = json.loads(captured.out)
        assert result["success"] is True
        assert result["transcript"]["turns"][0]["targetResponse"] == "Hi there!"


class TestErrorClassification:
    """Tests for error classification in probe."""

    def test_auth_error_not_retryable(self) -> None:
        """Test that auth errors are not retryable."""
        from common.errors import LLMError
        from probe import run_probe

        data = {
            "runId": "run-123",
            "scenarioId": "scenario-456",
            "modelId": "gpt-4",
            "scenario": {"prompt": "Hello"},
            "config": {},
        }

        with patch("probe.generate") as mock_generate:
            mock_generate.side_effect = LLMError(
                message="Invalid API key",
                status_code=401,
            )

            result = run_probe(data)

        assert result["success"] is False
        assert result["error"]["code"] == "AUTH_ERROR"
        assert result["error"]["retryable"] is False

    def test_server_error_retryable(self) -> None:
        """Test that server errors are retryable."""
        from common.errors import LLMError
        from probe import run_probe

        data = {
            "runId": "run-123",
            "scenarioId": "scenario-456",
            "modelId": "gpt-4",
            "scenario": {"prompt": "Hello"},
            "config": {},
        }

        with patch("probe.generate") as mock_generate:
            mock_generate.side_effect = LLMError(
                message="Internal server error",
                status_code=500,
            )

            result = run_probe(data)

        assert result["success"] is False
        assert result["error"]["code"] == "SERVER_ERROR"
        assert result["error"]["retryable"] is True
