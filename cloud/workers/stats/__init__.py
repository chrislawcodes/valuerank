"""
Stats module for Stage 11 Analysis.

This module provides statistical functions for analyzing AI model behavior:
- Confidence intervals (Wilson score)
- Basic statistics (win rates, means, std dev)
- Model comparison (Spearman's rho, Cohen's d)
- Dimension impact analysis (effect sizes, R-squared)
"""

from stats.confidence import wilson_score_ci, bootstrap_ci
from stats.basic_stats import (
    compute_win_rate,
    compute_value_stats,
    compute_model_summary,
)
from stats.model_comparison import (
    compute_pairwise_agreement,
    compute_effect_size,
    detect_outlier_models,
    apply_holm_bonferroni,
)
from stats.dimension_impact import (
    compute_dimension_effects,
    compute_variance_explained,
)

__all__ = [
    # Confidence intervals
    "wilson_score_ci",
    "bootstrap_ci",
    # Basic statistics
    "compute_win_rate",
    "compute_value_stats",
    "compute_model_summary",
    # Model comparison
    "compute_pairwise_agreement",
    "compute_effect_size",
    "detect_outlier_models",
    "apply_holm_bonferroni",
    # Dimension impact
    "compute_dimension_effects",
    "compute_variance_explained",
]
