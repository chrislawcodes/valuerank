"""
Cost calculation utilities for LLM token usage.

Calculates estimated costs based on input/output token counts
and per-million token pricing.
"""

from dataclasses import dataclass
from typing import Optional

from .logging import get_logger

log = get_logger("cost")


@dataclass
class ModelCost:
    """Cost configuration for a model."""

    cost_input_per_million: float
    cost_output_per_million: float

    def calculate_cost(
        self, input_tokens: Optional[int], output_tokens: Optional[int]
    ) -> float:
        """
        Calculate the estimated cost for token usage.

        Args:
            input_tokens: Number of input (prompt) tokens
            output_tokens: Number of output (completion) tokens

        Returns:
            Estimated cost in dollars
        """
        input_cost = 0.0
        output_cost = 0.0

        if input_tokens is not None and input_tokens > 0:
            input_cost = (input_tokens / 1_000_000) * self.cost_input_per_million

        if output_tokens is not None and output_tokens > 0:
            output_cost = (output_tokens / 1_000_000) * self.cost_output_per_million

        return input_cost + output_cost


def calculate_cost(
    input_tokens: Optional[int],
    output_tokens: Optional[int],
    cost_input_per_million: float,
    cost_output_per_million: float,
) -> float:
    """
    Calculate the estimated cost for token usage.

    Args:
        input_tokens: Number of input (prompt) tokens
        output_tokens: Number of output (completion) tokens
        cost_input_per_million: Cost per million input tokens in dollars
        cost_output_per_million: Cost per million output tokens in dollars

    Returns:
        Estimated cost in dollars
    """
    model_cost = ModelCost(
        cost_input_per_million=cost_input_per_million,
        cost_output_per_million=cost_output_per_million,
    )
    return model_cost.calculate_cost(input_tokens, output_tokens)


@dataclass
class CostSnapshot:
    """Snapshot of cost data at time of job execution."""

    cost_input_per_million: float
    cost_output_per_million: float
    input_tokens: int
    output_tokens: int
    estimated_cost: float

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON output."""
        return {
            "costInputPerMillion": self.cost_input_per_million,
            "costOutputPerMillion": self.cost_output_per_million,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "estimatedCost": round(self.estimated_cost, 6),  # Round to 6 decimal places
        }


def create_cost_snapshot(
    input_tokens: int,
    output_tokens: int,
    cost_input_per_million: float,
    cost_output_per_million: float,
) -> CostSnapshot:
    """
    Create a cost snapshot with calculated estimated cost.

    Args:
        input_tokens: Total input tokens used
        output_tokens: Total output tokens used
        cost_input_per_million: Cost per million input tokens
        cost_output_per_million: Cost per million output tokens

    Returns:
        CostSnapshot with calculated cost
    """
    estimated_cost = calculate_cost(
        input_tokens, output_tokens, cost_input_per_million, cost_output_per_million
    )

    return CostSnapshot(
        cost_input_per_million=cost_input_per_million,
        cost_output_per_million=cost_output_per_million,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        estimated_cost=estimated_cost,
    )
