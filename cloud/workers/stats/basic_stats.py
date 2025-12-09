"""
Basic statistics computation for AI model analysis.

Computes win rates, means, standard deviations, and other
descriptive statistics per model and value.
"""

from typing import Any, TypedDict

import numpy as np

from stats.confidence import wilson_score_ci, ConfidenceInterval


class ValueCounts(TypedDict):
    """Count of value prioritization outcomes."""

    prioritized: int
    deprioritized: int
    neutral: int


class ValueStats(TypedDict):
    """Statistics for a single value."""

    winRate: float
    confidenceInterval: ConfidenceInterval
    count: ValueCounts


class ModelSummary(TypedDict):
    """Overall summary statistics for a model."""

    mean: float
    stdDev: float
    min: float
    max: float


class ModelStats(TypedDict):
    """Complete statistics for a model."""

    sampleSize: int
    values: dict[str, ValueStats]
    overall: ModelSummary


def compute_win_rate(prioritized: int, deprioritized: int) -> float:
    """
    Compute win rate from prioritized/deprioritized counts.

    Win rate = prioritized / (prioritized + deprioritized)
    Neutral responses are excluded from the denominator.

    Args:
        prioritized: Count of times value was prioritized
        deprioritized: Count of times value was deprioritized

    Returns:
        Win rate as a float between 0 and 1, or 0.5 if no data

    """
    total = prioritized + deprioritized
    if total == 0:
        return 0.5  # No data means neutral
    return prioritized / total


def compute_value_stats(
    prioritized: int,
    deprioritized: int,
    neutral: int = 0,
    confidence: float = 0.95,
) -> ValueStats:
    """
    Compute complete statistics for a single value.

    Args:
        prioritized: Count of times value was prioritized
        deprioritized: Count of times value was deprioritized
        neutral: Count of neutral responses (excluded from win rate)
        confidence: Confidence level for interval (default 0.95)

    Returns:
        ValueStats with win rate, confidence interval, and counts
    """
    win_rate = compute_win_rate(prioritized, deprioritized)
    total = prioritized + deprioritized

    # Wilson score CI uses successes/total
    if total > 0:
        ci = wilson_score_ci(prioritized, total, confidence)
    else:
        # No data - full uncertainty
        ci = ConfidenceInterval(
            lower=0.0,
            upper=1.0,
            level=confidence,
            method="wilson_score",
        )

    return ValueStats(
        winRate=round(win_rate, 6),
        confidenceInterval=ci,
        count=ValueCounts(
            prioritized=prioritized,
            deprioritized=deprioritized,
            neutral=neutral,
        ),
    )


def compute_model_summary(scores: list[float]) -> ModelSummary:
    """
    Compute summary statistics for a model's overall scores.

    Args:
        scores: List of score values

    Returns:
        ModelSummary with mean, stdDev, min, max
    """
    if not scores:
        return ModelSummary(
            mean=0.0,
            stdDev=0.0,
            min=0.0,
            max=0.0,
        )

    arr = np.array(scores)
    return ModelSummary(
        mean=round(float(np.mean(arr)), 6),
        stdDev=round(float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0, 6),
        min=round(float(np.min(arr)), 6),
        max=round(float(np.max(arr)), 6),
    )


class VisualizationData(TypedDict):
    """Data for frontend visualizations."""

    decisionDistribution: dict[str, dict[str, int]]  # model -> decision code -> count
    modelScenarioMatrix: dict[str, dict[str, float]]  # model -> scenario -> avg


def compute_visualization_data(
    transcripts: list[dict[str, Any]],
) -> VisualizationData:
    """
    Compute data needed for frontend visualizations.

    Args:
        transcripts: List of transcript dicts with modelId, scenarioId, summary.score

    Returns:
        VisualizationData with decision distribution and model-scenario matrix
    """
    # Decision distribution: model -> decision code (1-5) -> count
    decision_dist: dict[str, dict[str, int]] = {}

    # Model-scenario scores: model -> scenario -> list of scores
    model_scenario_scores: dict[str, dict[str, list[float]]] = {}

    for t in transcripts:
        model_id = t.get("modelId", "unknown")
        scenario = t.get("scenario", {})
        scenario_name = scenario.get("name", t.get("scenarioId", "unknown"))
        summary = t.get("summary", {})
        score = summary.get("score")

        if score is None:
            continue

        score_int = int(score)

        # Build decision distribution
        if model_id not in decision_dist:
            decision_dist[model_id] = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
        decision_key = str(score_int)
        if decision_key in decision_dist[model_id]:
            decision_dist[model_id][decision_key] += 1

        # Build model-scenario matrix
        if model_id not in model_scenario_scores:
            model_scenario_scores[model_id] = {}
        if scenario_name not in model_scenario_scores[model_id]:
            model_scenario_scores[model_id][scenario_name] = []
        model_scenario_scores[model_id][scenario_name].append(float(score))

    # Compute averages for model-scenario matrix
    model_scenario_matrix: dict[str, dict[str, float]] = {}
    for model_id, scenarios in model_scenario_scores.items():
        model_scenario_matrix[model_id] = {}
        for scenario_name, scores in scenarios.items():
            if scores:
                model_scenario_matrix[model_id][scenario_name] = round(
                    float(np.mean(scores)), 2
                )

    return VisualizationData(
        decisionDistribution=decision_dist,
        modelScenarioMatrix=model_scenario_matrix,
    )


def aggregate_transcripts_by_model(
    transcripts: list[dict[str, Any]],
) -> dict[str, ModelStats]:
    """
    Aggregate transcript data into per-model statistics.

    Args:
        transcripts: List of transcript dicts with modelId, decision, values

    Returns:
        Dict mapping modelId to ModelStats
    """
    # Group transcripts by model
    by_model: dict[str, list[dict[str, Any]]] = {}
    for t in transcripts:
        model_id = t.get("modelId", "unknown")
        if model_id not in by_model:
            by_model[model_id] = []
        by_model[model_id].append(t)

    result: dict[str, ModelStats] = {}

    for model_id, model_transcripts in by_model.items():
        # Count value outcomes across all transcripts
        value_counts: dict[str, ValueCounts] = {}
        scores: list[float] = []

        for t in model_transcripts:
            summary = t.get("summary", {})
            values_data = summary.get("values", {})

            for value_id, status in values_data.items():
                if value_id not in value_counts:
                    value_counts[value_id] = ValueCounts(
                        prioritized=0,
                        deprioritized=0,
                        neutral=0,
                    )

                if status == "prioritized":
                    value_counts[value_id]["prioritized"] += 1
                elif status == "deprioritized":
                    value_counts[value_id]["deprioritized"] += 1
                else:
                    value_counts[value_id]["neutral"] += 1

            # Collect overall score if present and not null
            if "score" in summary and summary["score"] is not None:
                scores.append(float(summary["score"]))

        # Compute value stats
        values: dict[str, ValueStats] = {}
        for value_id, counts in value_counts.items():
            values[value_id] = compute_value_stats(
                counts["prioritized"],
                counts["deprioritized"],
                counts["neutral"],
            )

        result[model_id] = ModelStats(
            sampleSize=len(model_transcripts),
            values=values,
            overall=compute_model_summary(scores),
        )

    return result
