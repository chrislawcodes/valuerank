"""
Model comparison statistics.

Computes pairwise model agreement using Spearman's rho,
effect sizes using Cohen's d, and identifies outlier models.
"""

from typing import Any, TypedDict
import itertools

import numpy as np
from scipy import stats


class PairwiseAgreement(TypedDict):
    """Pairwise comparison result between two models."""

    spearmanRho: float
    pValue: float
    pValueCorrected: float
    significant: bool
    effectSize: float
    effectInterpretation: str


class ModelAgreementResult(TypedDict):
    """Complete model agreement analysis."""

    pairwise: dict[str, PairwiseAgreement]
    outlierModels: list[str]
    overallAgreement: float


def compute_effect_size(group1: list[float], group2: list[float]) -> float:
    """
    Compute Cohen's d effect size between two groups.

    Cohen's d = (mean1 - mean2) / pooled_std

    Interpretation:
    - |d| < 0.2: negligible
    - 0.2 <= |d| < 0.5: small
    - 0.5 <= |d| < 0.8: medium
    - |d| >= 0.8: large

    Args:
        group1: First group's scores
        group2: Second group's scores

    Returns:
        Cohen's d (can be negative)
    """
    if len(group1) < 2 or len(group2) < 2:
        return 0.0

    arr1 = np.array(group1)
    arr2 = np.array(group2)

    n1, n2 = len(arr1), len(arr2)
    var1, var2 = np.var(arr1, ddof=1), np.var(arr2, ddof=1)

    # Pooled standard deviation
    pooled_std = np.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2))

    if pooled_std == 0:
        return 0.0

    return float((np.mean(arr1) - np.mean(arr2)) / pooled_std)


def interpret_effect_size(d: float) -> str:
    """
    Interpret Cohen's d magnitude.

    Args:
        d: Cohen's d value

    Returns:
        Interpretation string
    """
    abs_d = abs(d)
    if abs_d < 0.2:
        return "negligible"
    elif abs_d < 0.5:
        return "small"
    elif abs_d < 0.8:
        return "medium"
    else:
        return "large"


def apply_holm_bonferroni(
    p_values: list[float],
    alpha: float = 0.05,
) -> list[tuple[float, bool]]:
    """
    Apply Holm-Bonferroni correction for multiple comparisons.

    More powerful than Bonferroni while still controlling family-wise error rate.

    Args:
        p_values: List of p-values from multiple tests
        alpha: Significance level (default 0.05)

    Returns:
        List of (corrected_p, is_significant) tuples
    """
    n = len(p_values)
    if n == 0:
        return []

    # Create index to track original positions
    indexed = [(p, i) for i, p in enumerate(p_values)]
    indexed.sort(key=lambda x: x[0])

    results = [None] * n

    for rank, (p, orig_idx) in enumerate(indexed):
        # Holm-Bonferroni: compare to alpha / (n - rank)
        adjusted_alpha = alpha / (n - rank)
        corrected_p = min(p * (n - rank), 1.0)
        significant = p <= adjusted_alpha

        # If any prior test was not significant, this one isn't either
        if rank > 0 and not results[indexed[rank - 1][1]][1]:
            significant = False

        results[orig_idx] = (corrected_p, significant)

    return results


def compute_pairwise_agreement(
    model_scores: dict[str, list[float]],
    alpha: float = 0.05,
) -> dict[str, PairwiseAgreement]:
    """
    Compute pairwise agreement between all model pairs.

    Uses Spearman's rho for rank correlation (non-parametric).

    Args:
        model_scores: Dict mapping model_id to list of scores (aligned by scenario)
        alpha: Significance level for tests

    Returns:
        Dict mapping "model1:model2" to PairwiseAgreement
    """
    model_ids = list(model_scores.keys())
    if len(model_ids) < 2:
        return {}

    # Compute all pairwise correlations first
    pairs = list(itertools.combinations(model_ids, 2))
    raw_results: list[tuple[str, str, float, float, float]] = []

    for model1, model2 in pairs:
        scores1 = model_scores[model1]
        scores2 = model_scores[model2]

        # Ensure same length (align by index)
        min_len = min(len(scores1), len(scores2))
        if min_len < 3:
            # Not enough data for correlation
            raw_results.append((model1, model2, 0.0, 1.0, 0.0))
            continue

        arr1 = np.array(scores1[:min_len])
        arr2 = np.array(scores2[:min_len])

        # Spearman's rho
        rho, p_value = stats.spearmanr(arr1, arr2)

        # Handle NaN (constant values)
        if np.isnan(rho):
            rho = 0.0
            p_value = 1.0

        # Effect size
        effect = compute_effect_size(list(arr1), list(arr2))

        raw_results.append((model1, model2, float(rho), float(p_value), effect))

    # Apply Holm-Bonferroni correction
    p_values = [r[3] for r in raw_results]
    corrected = apply_holm_bonferroni(p_values, alpha)

    # Build final results
    result: dict[str, PairwiseAgreement] = {}
    for i, (model1, model2, rho, p_val, effect) in enumerate(raw_results):
        corrected_p, significant = corrected[i]
        key = f"{model1}:{model2}"
        result[key] = PairwiseAgreement(
            spearmanRho=round(rho, 6),
            pValue=round(p_val, 6),
            pValueCorrected=round(corrected_p, 6),
            significant=significant,
            effectSize=round(effect, 6),
            effectInterpretation=interpret_effect_size(effect),
        )

    return result


def detect_outlier_models(
    model_scores: dict[str, list[float]],
    threshold: float = 2.0,
) -> list[str]:
    """
    Identify models that are statistical outliers.

    A model is an outlier if its mean agreement with others is
    more than `threshold` standard deviations from the mean.

    Args:
        model_scores: Dict mapping model_id to list of scores
        threshold: Number of standard deviations (default 2.0)

    Returns:
        List of outlier model IDs
    """
    model_ids = list(model_scores.keys())
    if len(model_ids) < 3:
        return []  # Need at least 3 models to detect outliers

    # Calculate mean pairwise correlation for each model
    agreements = compute_pairwise_agreement(model_scores)
    model_agreement_means: dict[str, list[float]] = {m: [] for m in model_ids}

    for pair_key, agreement in agreements.items():
        model1, model2 = pair_key.split(":")
        rho = agreement["spearmanRho"]
        model_agreement_means[model1].append(rho)
        model_agreement_means[model2].append(rho)

    # Calculate mean agreement per model
    mean_per_model = {
        m: np.mean(vals) if vals else 0.0
        for m, vals in model_agreement_means.items()
    }

    # Find outliers (low agreement with others)
    all_means = list(mean_per_model.values())
    if len(all_means) < 3:
        return []

    overall_mean = np.mean(all_means)
    overall_std = np.std(all_means, ddof=1)

    if overall_std == 0:
        return []

    outliers = []
    for model_id, mean_agreement in mean_per_model.items():
        z_score = (mean_agreement - overall_mean) / overall_std
        if abs(z_score) > threshold:
            outliers.append(model_id)

    return outliers


def compute_model_agreement(
    model_scores: dict[str, list[float]],
    alpha: float = 0.05,
) -> ModelAgreementResult:
    """
    Compute complete model agreement analysis.

    Args:
        model_scores: Dict mapping model_id to list of scores
        alpha: Significance level

    Returns:
        ModelAgreementResult with pairwise, outliers, and overall agreement
    """
    pairwise = compute_pairwise_agreement(model_scores, alpha)
    outliers = detect_outlier_models(model_scores)

    # Overall agreement is mean of all pairwise correlations
    if pairwise:
        all_rhos = [p["spearmanRho"] for p in pairwise.values()]
        overall = float(np.mean(all_rhos))
    else:
        overall = 1.0  # Single model or no comparisons

    return ModelAgreementResult(
        pairwise=pairwise,
        outlierModels=outliers,
        overallAgreement=round(overall, 6),
    )
