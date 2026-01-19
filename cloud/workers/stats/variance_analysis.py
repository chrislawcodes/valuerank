"""
Variance analysis for multi-sample runs.

Computes within-model and within-scenario variance statistics
to measure model consistency and response stability.
"""

from typing import Any, TypedDict
import numpy as np


class VarianceStats(TypedDict):
    """Variance statistics for a model-scenario pair."""

    sampleCount: int  # Number of samples (N)
    mean: float  # Mean score across samples
    stdDev: float  # Standard deviation (measures consistency)
    variance: float  # Variance (stdDev^2)
    min: float  # Minimum score
    max: float  # Maximum score
    range: float  # Max - Min (measures response spread)


class ModelVarianceStats(TypedDict):
    """Aggregated variance statistics for a model."""

    totalSamples: int  # Total transcript count
    uniqueScenarios: int  # Number of unique scenarios
    samplesPerScenario: int  # Samples per scenario-model pair
    avgWithinScenarioVariance: float  # Average variance within scenarios
    maxWithinScenarioVariance: float  # Maximum variance across scenarios
    consistencyScore: float  # 0-1 score where 1 = perfectly consistent
    perScenario: dict[str, VarianceStats]  # Variance per scenario


class RunVarianceAnalysis(TypedDict):
    """Complete variance analysis for a run."""

    isMultiSample: bool  # True if samplesPerScenario > 1
    samplesPerScenario: int  # Number of samples per scenario-model pair
    perModel: dict[str, ModelVarianceStats]  # Variance stats per model
    mostVariableScenarios: list[dict[str, Any]]  # Scenarios with highest variance
    leastVariableScenarios: list[dict[str, Any]]  # Scenarios with lowest variance


def compute_variance_stats(scores: list[float]) -> VarianceStats:
    """
    Compute variance statistics for a set of scores.

    Args:
        scores: List of numeric scores

    Returns:
        VarianceStats with mean, stdDev, variance, etc.
    """
    if not scores:
        return VarianceStats(
            sampleCount=0,
            mean=0.0,
            stdDev=0.0,
            variance=0.0,
            min=0.0,
            max=0.0,
            range=0.0,
        )

    arr = np.array(scores)
    n = len(arr)
    mean = float(np.mean(arr))
    std_dev = float(np.std(arr, ddof=1)) if n > 1 else 0.0

    return VarianceStats(
        sampleCount=n,
        mean=round(mean, 6),
        stdDev=round(std_dev, 6),
        variance=round(std_dev ** 2, 6),
        min=round(float(np.min(arr)), 6),
        max=round(float(np.max(arr)), 6),
        range=round(float(np.max(arr) - np.min(arr)), 6),
    )


def compute_consistency_score(variances: list[float], max_possible_variance: float = 4.0) -> float:
    """
    Compute a 0-1 consistency score from variances.

    A score of 1 means perfectly consistent (zero variance).
    A score of 0 means maximum variance.

    Args:
        variances: List of variance values
        max_possible_variance: Maximum possible variance (default 4.0 for 1-5 scale)

    Returns:
        Consistency score between 0 and 1
    """
    if not variances:
        return 1.0  # No data means consistent by default

    avg_variance = float(np.mean(variances))
    # Normalize: 0 variance = 1.0 consistency, max variance = 0.0 consistency
    score = 1.0 - (avg_variance / max_possible_variance)
    return round(max(0.0, min(1.0, score)), 6)


def compute_variance_analysis(
    transcripts: list[dict[str, Any]],
) -> RunVarianceAnalysis:
    """
    Compute variance analysis for multi-sample runs.

    Groups transcripts by (scenarioId, modelId) and computes
    within-group variance to measure model consistency.

    Args:
        transcripts: List of transcript dicts with modelId, scenarioId,
                    sampleIndex, and summary.score

    Returns:
        RunVarianceAnalysis with per-model and per-scenario variance stats
    """
    # Group by (scenarioId, modelId) -> list of scores
    grouped: dict[tuple[str, str], list[tuple[int, float]]] = {}
    scenario_names: dict[str, str] = {}

    for t in transcripts:
        scenario_id = t.get("scenarioId", "unknown")
        model_id = t.get("modelId", "unknown")
        sample_index = t.get("sampleIndex", 0)
        summary = t.get("summary", {})
        score = summary.get("score")
        scenario = t.get("scenario", {})

        if score is None:
            continue

        key = (scenario_id, model_id)
        if key not in grouped:
            grouped[key] = []
            scenario_names[scenario_id] = scenario.get("name", scenario_id)

        grouped[key].append((sample_index, float(score)))

    # Determine if this is a multi-sample run
    max_samples = max(len(scores) for scores in grouped.values()) if grouped else 1
    is_multi_sample = max_samples > 1

    # Compute per-model variance stats
    per_model: dict[str, ModelVarianceStats] = {}

    # First, group by model
    model_scenarios: dict[str, dict[str, list[float]]] = {}
    for (scenario_id, model_id), sample_scores in grouped.items():
        if model_id not in model_scenarios:
            model_scenarios[model_id] = {}
        # Extract just the scores (ignore sample index)
        scores = [s for _, s in sample_scores]
        model_scenarios[model_id][scenario_id] = scores

    # Compute stats for each model
    for model_id, scenarios in model_scenarios.items():
        per_scenario: dict[str, VarianceStats] = {}
        variances: list[float] = []
        total_samples = 0

        for scenario_id, scores in scenarios.items():
            stats = compute_variance_stats(scores)
            scenario_name = scenario_names.get(scenario_id, scenario_id)
            per_scenario[scenario_name] = stats
            if stats["sampleCount"] > 1:
                variances.append(stats["variance"])
            total_samples += stats["sampleCount"]

        avg_variance = float(np.mean(variances)) if variances else 0.0
        max_variance = float(np.max(variances)) if variances else 0.0

        per_model[model_id] = ModelVarianceStats(
            totalSamples=total_samples,
            uniqueScenarios=len(scenarios),
            samplesPerScenario=max_samples,
            avgWithinScenarioVariance=round(avg_variance, 6),
            maxWithinScenarioVariance=round(max_variance, 6),
            consistencyScore=compute_consistency_score(variances),
            perScenario=per_scenario,
        )

    # Find most/least variable scenarios (across all models)
    all_scenario_variances: list[dict[str, Any]] = []
    for (scenario_id, model_id), sample_scores in grouped.items():
        if len(sample_scores) > 1:
            scores = [s for _, s in sample_scores]
            stats = compute_variance_stats(scores)
            all_scenario_variances.append({
                "scenarioId": scenario_id,
                "scenarioName": scenario_names.get(scenario_id, scenario_id),
                "modelId": model_id,
                "variance": stats["variance"],
                "stdDev": stats["stdDev"],
                "range": stats["range"],
                "sampleCount": stats["sampleCount"],
                "mean": stats["mean"],
            })

    # Sort by variance
    all_scenario_variances.sort(key=lambda x: x["variance"], reverse=True)
    most_variable = all_scenario_variances[:5] if all_scenario_variances else []
    least_variable = all_scenario_variances[-5:][::-1] if len(all_scenario_variances) > 5 else []

    return RunVarianceAnalysis(
        isMultiSample=is_multi_sample,
        samplesPerScenario=max_samples,
        perModel=per_model,
        mostVariableScenarios=most_variable,
        leastVariableScenarios=least_variable,
    )
