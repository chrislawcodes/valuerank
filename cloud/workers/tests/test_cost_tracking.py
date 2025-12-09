"""Tests for cost tracking functionality."""

import pytest

from common.cost import (
    ModelCost,
    CostSnapshot,
    calculate_cost,
    create_cost_snapshot,
)


class TestModelCost:
    """Tests for ModelCost class."""

    def test_calculate_cost_basic(self) -> None:
        """Test basic cost calculation."""
        cost = ModelCost(
            cost_input_per_million=2.5,
            cost_output_per_million=10.0,
        )

        # 1000 input tokens, 500 output tokens
        result = cost.calculate_cost(1000, 500)

        # Expected: (1000/1M * 2.5) + (500/1M * 10.0) = 0.0025 + 0.005 = 0.0075
        assert abs(result - 0.0075) < 0.0001

    def test_calculate_cost_one_million_tokens(self) -> None:
        """Test cost calculation with exactly one million tokens."""
        cost = ModelCost(
            cost_input_per_million=15.0,
            cost_output_per_million=75.0,
        )

        result = cost.calculate_cost(1_000_000, 1_000_000)

        # Expected: 15.0 + 75.0 = 90.0
        assert result == 90.0

    def test_calculate_cost_zero_tokens(self) -> None:
        """Test cost with zero tokens."""
        cost = ModelCost(
            cost_input_per_million=2.5,
            cost_output_per_million=10.0,
        )

        result = cost.calculate_cost(0, 0)
        assert result == 0.0

    def test_calculate_cost_none_tokens(self) -> None:
        """Test cost with None token values."""
        cost = ModelCost(
            cost_input_per_million=2.5,
            cost_output_per_million=10.0,
        )

        result = cost.calculate_cost(None, None)
        assert result == 0.0

    def test_calculate_cost_partial_none(self) -> None:
        """Test cost with partial None values."""
        cost = ModelCost(
            cost_input_per_million=2.5,
            cost_output_per_million=10.0,
        )

        # Only input tokens
        result = cost.calculate_cost(1000, None)
        assert abs(result - 0.0025) < 0.0001

        # Only output tokens
        result = cost.calculate_cost(None, 1000)
        assert abs(result - 0.01) < 0.0001


class TestCalculateCost:
    """Tests for calculate_cost function."""

    def test_calculate_cost_function(self) -> None:
        """Test the standalone calculate_cost function."""
        result = calculate_cost(
            input_tokens=10000,
            output_tokens=5000,
            cost_input_per_million=2.5,
            cost_output_per_million=10.0,
        )

        # Expected: (10000/1M * 2.5) + (5000/1M * 10.0) = 0.025 + 0.05 = 0.075
        assert abs(result - 0.075) < 0.0001


class TestCostSnapshot:
    """Tests for CostSnapshot class."""

    def test_to_dict(self) -> None:
        """Test serialization to dictionary."""
        snapshot = CostSnapshot(
            cost_input_per_million=2.5,
            cost_output_per_million=10.0,
            input_tokens=1000,
            output_tokens=500,
            estimated_cost=0.0075,
        )

        result = snapshot.to_dict()

        assert result["costInputPerMillion"] == 2.5
        assert result["costOutputPerMillion"] == 10.0
        assert result["inputTokens"] == 1000
        assert result["outputTokens"] == 500
        assert result["estimatedCost"] == 0.0075

    def test_to_dict_rounding(self) -> None:
        """Test that estimated cost is rounded to 6 decimal places."""
        snapshot = CostSnapshot(
            cost_input_per_million=2.5,
            cost_output_per_million=10.0,
            input_tokens=1,
            output_tokens=1,
            estimated_cost=0.0000125000001,  # Should be rounded
        )

        result = snapshot.to_dict()
        assert result["estimatedCost"] == 0.000013  # Rounded to 6 places


class TestCreateCostSnapshot:
    """Tests for create_cost_snapshot function."""

    def test_create_cost_snapshot_calculates_cost(self) -> None:
        """Test that create_cost_snapshot calculates estimated cost."""
        snapshot = create_cost_snapshot(
            input_tokens=1000,
            output_tokens=500,
            cost_input_per_million=2.5,
            cost_output_per_million=10.0,
        )

        assert snapshot.input_tokens == 1000
        assert snapshot.output_tokens == 500
        assert snapshot.cost_input_per_million == 2.5
        assert snapshot.cost_output_per_million == 10.0
        assert abs(snapshot.estimated_cost - 0.0075) < 0.0001

    def test_create_cost_snapshot_with_large_values(self) -> None:
        """Test with realistic large token counts."""
        # Claude 3 Opus pricing: $15/M input, $75/M output
        snapshot = create_cost_snapshot(
            input_tokens=50000,  # 50K input tokens
            output_tokens=10000,  # 10K output tokens
            cost_input_per_million=15.0,
            cost_output_per_million=75.0,
        )

        # Expected: (50000/1M * 15) + (10000/1M * 75) = 0.75 + 0.75 = 1.50
        assert abs(snapshot.estimated_cost - 1.50) < 0.0001


class TestCostIntegration:
    """Integration tests for cost tracking with probe output."""

    def test_cost_snapshot_in_transcript_format(self) -> None:
        """Test that cost snapshot matches expected transcript format."""
        snapshot = create_cost_snapshot(
            input_tokens=1000,
            output_tokens=500,
            cost_input_per_million=2.5,
            cost_output_per_million=10.0,
        )

        # This should match the format expected by the TypeScript API
        result = snapshot.to_dict()

        assert "costInputPerMillion" in result
        assert "costOutputPerMillion" in result
        assert "inputTokens" in result
        assert "outputTokens" in result
        assert "estimatedCost" in result

        # All values should be numbers (not strings)
        assert isinstance(result["costInputPerMillion"], (int, float))
        assert isinstance(result["costOutputPerMillion"], (int, float))
        assert isinstance(result["inputTokens"], int)
        assert isinstance(result["outputTokens"], int)
        assert isinstance(result["estimatedCost"], (int, float))
