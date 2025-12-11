"""
Tests for compute_token_stats Python worker.

Tests EMA calculation, grouping logic, and error handling.
"""

import json
import pytest
from io import StringIO
from unittest.mock import patch

from compute_token_stats import (
    compute_new_average,
    group_probes_by_model,
    compute_stats,
    validate_input,
    main,
    EMA_ALPHA,
)
from common.errors import ValidationError


class TestComputeNewAverage:
    """Tests for EMA calculation."""

    def test_first_data_point_uses_new_average(self):
        """When no existing data, just use the new average."""
        new_avg, new_count = compute_new_average(
            old_avg=0, old_count=0, new_values=[100, 200, 300]
        )
        assert new_avg == 200.0  # Average of 100, 200, 300
        assert new_count == 3

    def test_ema_weights_new_data_by_alpha(self):
        """EMA should weight new data by alpha."""
        # Old average: 100, New values average: 200
        # With alpha=0.3: 0.3 * 200 + 0.7 * 100 = 60 + 70 = 130
        new_avg, new_count = compute_new_average(
            old_avg=100, old_count=50, new_values=[200]
        )
        expected = EMA_ALPHA * 200 + (1 - EMA_ALPHA) * 100
        assert new_avg == expected
        assert new_count == 51

    def test_ema_with_multiple_new_values(self):
        """EMA should average new values before applying alpha."""
        # Old average: 100, New values: [200, 300] -> new avg = 250
        # With alpha=0.3: 0.3 * 250 + 0.7 * 100 = 75 + 70 = 145
        new_avg, new_count = compute_new_average(
            old_avg=100, old_count=50, new_values=[200, 300]
        )
        expected = EMA_ALPHA * 250 + (1 - EMA_ALPHA) * 100
        assert new_avg == expected
        assert new_count == 52

    def test_empty_new_values_returns_old(self):
        """Empty new_values should return original values."""
        new_avg, new_count = compute_new_average(
            old_avg=100, old_count=50, new_values=[]
        )
        assert new_avg == 100
        assert new_count == 50

    def test_custom_alpha(self):
        """Custom alpha value should be respected."""
        # Old: 100, New: 200, alpha=0.5
        # 0.5 * 200 + 0.5 * 100 = 150
        new_avg, _ = compute_new_average(
            old_avg=100, old_count=50, new_values=[200], alpha=0.5
        )
        assert new_avg == 150.0


class TestGroupProbesByModel:
    """Tests for probe grouping logic."""

    def test_groups_probes_by_model_id(self):
        """Probes should be grouped by model ID."""
        probes = [
            {"modelId": "gpt-4", "inputTokens": 100, "outputTokens": 500},
            {"modelId": "gpt-4", "inputTokens": 150, "outputTokens": 600},
            {"modelId": "claude-3", "inputTokens": 200, "outputTokens": 800},
        ]
        grouped = group_probes_by_model(probes)

        assert len(grouped) == 2
        assert grouped["gpt-4"]["input"] == [100, 150]
        assert grouped["gpt-4"]["output"] == [500, 600]
        assert grouped["claude-3"]["input"] == [200]
        assert grouped["claude-3"]["output"] == [800]

    def test_skips_probes_without_model_id(self):
        """Probes without modelId should be skipped."""
        probes = [
            {"inputTokens": 100, "outputTokens": 500},  # No modelId
            {"modelId": "gpt-4", "inputTokens": 150, "outputTokens": 600},
        ]
        grouped = group_probes_by_model(probes)

        assert len(grouped) == 1
        assert "gpt-4" in grouped

    def test_skips_probes_with_missing_tokens(self):
        """Probes with missing token data should be skipped."""
        probes = [
            {"modelId": "gpt-4", "inputTokens": None, "outputTokens": 500},
            {"modelId": "gpt-4", "inputTokens": 100},  # No outputTokens
            {"modelId": "gpt-4", "inputTokens": 150, "outputTokens": 600},
        ]
        grouped = group_probes_by_model(probes)

        assert len(grouped["gpt-4"]["input"]) == 1
        assert grouped["gpt-4"]["input"] == [150]

    def test_handles_empty_list(self):
        """Empty probe list should return empty dict."""
        grouped = group_probes_by_model([])
        assert grouped == {}


class TestComputeStats:
    """Tests for overall stats computation."""

    def test_computes_new_stats_for_multiple_models(self):
        """Should compute stats for each model."""
        probes = [
            {"modelId": "gpt-4", "inputTokens": 100, "outputTokens": 500},
            {"modelId": "gpt-4", "inputTokens": 200, "outputTokens": 600},
            {"modelId": "claude-3", "inputTokens": 150, "outputTokens": 800},
        ]
        existing = {}

        stats = compute_stats(probes, existing)

        assert "gpt-4" in stats
        assert "claude-3" in stats
        assert stats["gpt-4"]["avgInputTokens"] == 150.0  # Avg of 100, 200
        assert stats["gpt-4"]["avgOutputTokens"] == 550.0  # Avg of 500, 600
        assert stats["gpt-4"]["sampleCount"] == 2
        assert stats["claude-3"]["avgInputTokens"] == 150.0
        assert stats["claude-3"]["avgOutputTokens"] == 800.0
        assert stats["claude-3"]["sampleCount"] == 1

    def test_applies_ema_to_existing_stats(self):
        """Should apply EMA when existing stats exist."""
        probes = [
            {"modelId": "gpt-4", "inputTokens": 300, "outputTokens": 1000},
        ]
        existing = {
            "gpt-4": {
                "avgInputTokens": 100,
                "avgOutputTokens": 500,
                "sampleCount": 50,
            }
        }

        stats = compute_stats(probes, existing)

        # EMA: 0.3 * 300 + 0.7 * 100 = 90 + 70 = 160
        expected_input = EMA_ALPHA * 300 + (1 - EMA_ALPHA) * 100
        assert stats["gpt-4"]["avgInputTokens"] == round(expected_input, 2)
        assert stats["gpt-4"]["sampleCount"] == 51

    def test_returns_empty_for_no_valid_probes(self):
        """Should return empty dict when no valid probes."""
        probes = [
            {"modelId": None, "inputTokens": 100, "outputTokens": 500},
        ]
        stats = compute_stats(probes, {})
        assert stats == {}


class TestValidateInput:
    """Tests for input validation."""

    def test_valid_input_passes(self):
        """Valid input should not raise."""
        data = {
            "runId": "run-123",
            "probeResults": [
                {"modelId": "gpt-4", "inputTokens": 100, "outputTokens": 500}
            ],
        }
        validate_input(data)  # Should not raise

    def test_missing_run_id_raises(self):
        """Missing runId should raise ValidationError."""
        data = {"probeResults": []}
        with pytest.raises(ValidationError) as exc_info:
            validate_input(data)
        assert "runId" in str(exc_info.value)

    def test_missing_probe_results_raises(self):
        """Missing probeResults should raise ValidationError."""
        data = {"runId": "run-123"}
        with pytest.raises(ValidationError) as exc_info:
            validate_input(data)
        assert "probeResults" in str(exc_info.value)

    def test_non_array_probe_results_raises(self):
        """Non-array probeResults should raise ValidationError."""
        data = {"runId": "run-123", "probeResults": "not-an-array"}
        with pytest.raises(ValidationError) as exc_info:
            validate_input(data)
        assert "array" in str(exc_info.value)


class TestMainFunction:
    """Tests for the main entry point."""

    def test_successful_computation(self):
        """Main should output success JSON on valid input."""
        input_data = {
            "runId": "run-123",
            "probeResults": [
                {"modelId": "gpt-4", "inputTokens": 100, "outputTokens": 500},
                {"modelId": "gpt-4", "inputTokens": 200, "outputTokens": 600},
            ],
            "existingStats": {},
        }

        with patch("sys.stdin", StringIO(json.dumps(input_data))):
            with patch("sys.stdout", new_callable=StringIO) as mock_stdout:
                main()
                output = json.loads(mock_stdout.getvalue())

        assert output["success"] is True
        assert "stats" in output
        assert "gpt-4" in output["stats"]
        assert output["summary"]["modelsUpdated"] == 1
        assert output["summary"]["totalProbesProcessed"] == 2

    def test_validation_error_returns_failure(self):
        """Validation errors should return success=false with error."""
        input_data = {"probeResults": []}  # Missing runId

        with patch("sys.stdin", StringIO(json.dumps(input_data))):
            with patch("sys.stdout", new_callable=StringIO) as mock_stdout:
                main()
                output = json.loads(mock_stdout.getvalue())

        assert output["success"] is False
        assert "error" in output
        assert output["error"]["code"] == "VALIDATION_ERROR"

    def test_handles_empty_probes(self):
        """Should handle runs with no probe results."""
        input_data = {
            "runId": "run-123",
            "probeResults": [],
            "existingStats": {},
        }

        with patch("sys.stdin", StringIO(json.dumps(input_data))):
            with patch("sys.stdout", new_callable=StringIO) as mock_stdout:
                main()
                output = json.loads(mock_stdout.getvalue())

        assert output["success"] is True
        assert output["stats"] == {}
        assert output["summary"]["modelsUpdated"] == 0

    def test_uses_existing_stats_for_ema(self):
        """Should incorporate existing stats in EMA calculation."""
        input_data = {
            "runId": "run-123",
            "probeResults": [
                {"modelId": "gpt-4", "inputTokens": 300, "outputTokens": 1000},
            ],
            "existingStats": {
                "gpt-4": {
                    "avgInputTokens": 100,
                    "avgOutputTokens": 500,
                    "sampleCount": 50,
                }
            },
        }

        with patch("sys.stdin", StringIO(json.dumps(input_data))):
            with patch("sys.stdout", new_callable=StringIO) as mock_stdout:
                main()
                output = json.loads(mock_stdout.getvalue())

        assert output["success"] is True
        stats = output["stats"]["gpt-4"]
        # EMA applied: 0.3 * 300 + 0.7 * 100 = 160
        expected_input = EMA_ALPHA * 300 + (1 - EMA_ALPHA) * 100
        assert stats["avgInputTokens"] == round(expected_input, 2)
        assert stats["sampleCount"] == 51
