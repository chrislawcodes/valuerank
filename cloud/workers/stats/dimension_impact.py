"""
Dimension impact analysis.

Analyzes which scenario dimensions (variables) have the most
impact on AI model decisions using ANOVA/Kruskal-Wallis tests.
"""

from typing import Any, TypedDict

import numpy as np
from scipy import stats


class DimensionEffect(TypedDict):
    """Effect of a single dimension on variance."""

    effectSize: float
    rank: int
    pValue: float
    significant: bool


class DimensionAnalysisResult(TypedDict):
    """Complete dimension impact analysis."""

    dimensions: dict[str, DimensionEffect]
    varianceExplained: float
    method: str


def compute_eta_squared(
    groups: list[list[float]],
    all_values: list[float],
) -> float:
    """
    Compute eta-squared (effect size for ANOVA).

    Eta-squared = SS_between / SS_total

    Interpretation:
    - 0.01: small
    - 0.06: medium
    - 0.14: large

    Args:
        groups: List of groups, each containing scores
        all_values: All values combined

    Returns:
        Eta-squared value between 0 and 1
    """
    if not groups or not all_values:
        return 0.0

    # Filter out empty groups
    groups = [g for g in groups if len(g) > 0]
    if len(groups) < 2:
        return 0.0

    grand_mean = np.mean(all_values)
    ss_total = sum((x - grand_mean) ** 2 for x in all_values)

    if ss_total == 0:
        return 0.0

    # SS between groups
    ss_between = sum(
        len(g) * (np.mean(g) - grand_mean) ** 2
        for g in groups
    )

    return float(ss_between / ss_total)


def analyze_dimension(
    scores: list[float],
    dimension_values: list[str],
) -> tuple[float, float, str]:
    """
    Analyze the effect of a single dimension on scores.

    Uses Kruskal-Wallis test (non-parametric alternative to ANOVA).

    Args:
        scores: Response scores
        dimension_values: Dimension value for each score (aligned)

    Returns:
        Tuple of (effect_size, p_value, method)
    """
    if len(scores) != len(dimension_values):
        raise ValueError("Scores and dimension values must have same length")

    if len(scores) < 3:
        return (0.0, 1.0, "kruskal_wallis")

    # Group scores by dimension value
    groups: dict[str, list[float]] = {}
    for score, dim_val in zip(scores, dimension_values):
        if dim_val not in groups:
            groups[dim_val] = []
        groups[dim_val].append(score)

    # Need at least 2 groups with data
    valid_groups = [g for g in groups.values() if len(g) >= 1]
    if len(valid_groups) < 2:
        return (0.0, 1.0, "kruskal_wallis")

    # Check if all groups have the same values (no variance)
    all_values = [v for g in valid_groups for v in g]
    if np.std(all_values) == 0:
        return (0.0, 1.0, "kruskal_wallis")

    # Kruskal-Wallis test
    try:
        h_stat, p_value = stats.kruskal(*valid_groups)
    except ValueError:
        # Can happen with constant values
        return (0.0, 1.0, "kruskal_wallis")

    # Effect size (eta-squared)
    effect_size = compute_eta_squared(valid_groups, all_values)

    return (effect_size, float(p_value), "kruskal_wallis")


def compute_dimension_effects(
    transcripts: list[dict[str, Any]],
    alpha: float = 0.05,
) -> dict[str, DimensionEffect]:
    """
    Compute effect sizes for all dimensions.

    Args:
        transcripts: List of transcript dicts with scenario.dimensions and summary.score
        alpha: Significance level

    Returns:
        Dict mapping dimension name to DimensionEffect
    """
    # Extract scores and dimensions
    scores: list[float] = []
    dimensions: dict[str, list[str]] = {}

    for t in transcripts:
        summary = t.get("summary", {})
        scenario = t.get("scenario", {})

        # Get score
        score = summary.get("score")
        if score is None:
            continue
        scores.append(float(score))

        # Get dimension values
        dim_values = scenario.get("dimensions", {})
        for dim_name, dim_value in dim_values.items():
            if dim_name not in dimensions:
                dimensions[dim_name] = []
            dimensions[dim_name].append(str(dim_value))

    if not scores or not dimensions:
        return {}

    # Analyze each dimension
    effects: list[tuple[str, float, float]] = []
    for dim_name, dim_values in dimensions.items():
        # Ensure alignment
        if len(dim_values) != len(scores):
            continue

        effect_size, p_value, _ = analyze_dimension(scores, dim_values)
        effects.append((dim_name, effect_size, p_value))

    # Sort by effect size and assign ranks
    effects.sort(key=lambda x: x[1], reverse=True)

    result: dict[str, DimensionEffect] = {}
    for rank, (dim_name, effect_size, p_value) in enumerate(effects, 1):
        result[dim_name] = DimensionEffect(
            effectSize=round(effect_size, 6),
            rank=rank,
            pValue=round(p_value, 6),
            significant=p_value < alpha,
        )

    return result


def compute_variance_explained(
    transcripts: list[dict[str, Any]],
) -> float:
    """
    Compute total variance explained by all dimensions (R-squared).

    Uses multiple regression conceptually, approximated by
    sum of eta-squared values (may overestimate with correlated dims).

    Args:
        transcripts: List of transcript dicts

    Returns:
        Approximate R-squared value between 0 and 1
    """
    effects = compute_dimension_effects(transcripts)

    if not effects:
        return 0.0

    # Sum of eta-squared (approximation)
    # Note: This is a simplification; proper R-squared would need regression
    total = sum(e["effectSize"] for e in effects.values())

    # Cap at 1.0 (can exceed due to approximation)
    return min(round(total, 6), 1.0)


def compute_dimension_analysis(
    transcripts: list[dict[str, Any]],
    alpha: float = 0.05,
) -> DimensionAnalysisResult:
    """
    Compute complete dimension impact analysis.

    Args:
        transcripts: List of transcript dicts
        alpha: Significance level

    Returns:
        DimensionAnalysisResult with dimensions, variance explained, method
    """
    dimensions = compute_dimension_effects(transcripts, alpha)
    variance = compute_variance_explained(transcripts)

    return DimensionAnalysisResult(
        dimensions=dimensions,
        varianceExplained=variance,
        method="kruskal_wallis",
    )
