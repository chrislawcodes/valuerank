"""
Confidence interval calculations for statistical analysis.

Implements Wilson score interval for proportions (more accurate than
normal approximation for small samples or extreme proportions).
"""

import math
from typing import TypedDict

import numpy as np
from scipy import stats


class ConfidenceInterval(TypedDict):
    """Confidence interval result."""

    lower: float
    upper: float
    level: float
    method: str


def wilson_score_ci(
    successes: int,
    total: int,
    confidence: float = 0.95,
) -> ConfidenceInterval:
    """
    Calculate Wilson score confidence interval for a proportion.

    Wilson score is preferred over normal approximation because it:
    - Works well with small sample sizes
    - Never produces intervals outside [0, 1]
    - Is asymmetric near 0 or 1 (more accurate)

    Args:
        successes: Number of successes (e.g., times value was prioritized)
        total: Total number of trials
        confidence: Confidence level (default 0.95 for 95% CI)

    Returns:
        ConfidenceInterval with lower, upper, level, and method

    Raises:
        ValueError: If inputs are invalid
    """
    if total <= 0:
        raise ValueError("Total must be positive")
    if successes < 0:
        raise ValueError("Successes cannot be negative")
    if successes > total:
        raise ValueError("Successes cannot exceed total")
    if not 0 < confidence < 1:
        raise ValueError("Confidence must be between 0 and 1")

    # Handle edge cases
    if total == 0:
        return ConfidenceInterval(
            lower=0.0,
            upper=1.0,
            level=confidence,
            method="wilson_score",
        )

    p = successes / total
    n = total
    z = stats.norm.ppf((1 + confidence) / 2)
    z2 = z * z

    # Wilson score formula
    denominator = 1 + z2 / n
    center = (p + z2 / (2 * n)) / denominator
    margin = (z / denominator) * math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))

    lower = max(0.0, center - margin)
    upper = min(1.0, center + margin)

    return ConfidenceInterval(
        lower=round(lower, 6),
        upper=round(upper, 6),
        level=confidence,
        method="wilson_score",
    )


def bootstrap_ci(
    data: list[float],
    statistic: str = "mean",
    confidence: float = 0.95,
    n_bootstrap: int = 1000,
    seed: int | None = None,
) -> ConfidenceInterval:
    """
    Calculate bootstrap confidence interval for a statistic.

    Used when parametric assumptions may not hold.

    Args:
        data: Sample data
        statistic: "mean", "median", or "std"
        confidence: Confidence level (default 0.95)
        n_bootstrap: Number of bootstrap samples (default 1000)
        seed: Random seed for reproducibility

    Returns:
        ConfidenceInterval with lower, upper, level, and method

    Raises:
        ValueError: If inputs are invalid
    """
    if len(data) == 0:
        raise ValueError("Data cannot be empty")
    if not 0 < confidence < 1:
        raise ValueError("Confidence must be between 0 and 1")
    if statistic not in ("mean", "median", "std"):
        raise ValueError("Statistic must be 'mean', 'median', or 'std'")

    rng = np.random.default_rng(seed)
    arr = np.array(data)
    n = len(arr)

    # Calculate statistic function
    stat_funcs = {
        "mean": np.mean,
        "median": np.median,
        "std": np.std,
    }
    stat_func = stat_funcs[statistic]

    # Bootstrap resampling
    bootstrap_stats = []
    for _ in range(n_bootstrap):
        sample = rng.choice(arr, size=n, replace=True)
        bootstrap_stats.append(stat_func(sample))

    # Calculate percentile interval
    alpha = 1 - confidence
    lower_pct = 100 * (alpha / 2)
    upper_pct = 100 * (1 - alpha / 2)

    lower = float(np.percentile(bootstrap_stats, lower_pct))
    upper = float(np.percentile(bootstrap_stats, upper_pct))

    return ConfidenceInterval(
        lower=round(lower, 6),
        upper=round(upper, 6),
        level=confidence,
        method=f"bootstrap_{statistic}",
    )
