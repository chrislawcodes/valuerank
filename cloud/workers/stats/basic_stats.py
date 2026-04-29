"""
Basic statistics computation for AI model analysis.

Computes win rates, means, standard deviations, and other
descriptive statistics per model and value.
"""

from typing import Any, NotRequired, TypedDict

import numpy as np

from stats.decision_model import SIGNED_TO_BUCKET, resolve_transcript_signed_distance


class ValueCounts(TypedDict):
    """Count of value prioritization outcomes."""

    prioritized: float
    deprioritized: float
    neutral: float


class ValueStats(TypedDict):
    """Statistics for a single value."""

    winRate: float
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
    conditionCount: NotRequired[int]
    values: dict[str, ValueStats]
    overall: ModelSummary


def compute_win_rate(prioritized: float, deprioritized: float, neutral: float = 0) -> float:
    """
    Compute win rate from prioritized/deprioritized/neutral counts.

    Win rate = prioritized / (prioritized + deprioritized + neutral)

    All decided responses (including neutral) are counted in the denominator.
    This is the "honest" formula: a value the model treats neutrally most
    of the time will score low, not fake-100%.

    Args:
        prioritized: Count of times the value was prioritized
        deprioritized: Count of times the value was deprioritized
        neutral: Count of neutral responses (default 0 for caller backwards compat)

    Returns:
        Win rate as a float between 0 and 1, or 0.5 if there is no data at all

    """
    total = prioritized + deprioritized + neutral
    if total == 0:
        return 0.5  # No data means neutral
    return prioritized / total


def compute_value_stats(
    prioritized: float,
    deprioritized: float,
    neutral: float = 0,
) -> ValueStats:
    """
    Compute complete statistics for a single value.

    Args:
        prioritized: Count of times value was prioritized
        deprioritized: Count of times value was deprioritized
        neutral: Count of neutral responses (counted in the win rate denominator)

    Returns:
        ValueStats with win rate and counts
    """
    win_rate = compute_win_rate(prioritized, deprioritized, neutral)

    return ValueStats(
        winRate=round(win_rate, 6),
        count=ValueCounts(
            prioritized=round(prioritized, 6),
            deprioritized=round(deprioritized, 6),
            neutral=round(neutral, 6),
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
    # Decision distribution: model -> canonical bucket -> count
    decision_dist: dict[str, dict[str, int]] = {}

    # Model-scenario scores: model -> scenario -> list of signed distances
    model_scenario_scores: dict[str, dict[str, list[float]]] = {}

    for t in transcripts:
        model_id = t.get("modelId", "unknown")
        scenario_id = t.get("scenarioId", "unknown")
        score = resolve_transcript_signed_distance(t)
        if score is None:
            continue

        # Build decision distribution
        if model_id not in decision_dist:
            decision_dist[model_id] = {b: 0 for b in SIGNED_TO_BUCKET.values()}
        bucket = SIGNED_TO_BUCKET.get(float(score))
        if bucket is not None:
            decision_dist[model_id][bucket] += 1

        # Build model-scenario matrix
        if model_id not in model_scenario_scores:
            model_scenario_scores[model_id] = {}
        if scenario_id not in model_scenario_scores[model_id]:
            model_scenario_scores[model_id][scenario_id] = []
        model_scenario_scores[model_id][scenario_id].append(float(score))

    # Compute averages for model-scenario matrix
    model_scenario_matrix: dict[str, dict[str, float]] = {}
    for model_id, scenarios in model_scenario_scores.items():
        model_scenario_matrix[model_id] = {}
        for scenario_id, scores in scenarios.items():
            if scores:
                model_scenario_matrix[model_id][scenario_id] = round(
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
        by_condition: dict[str, list[dict[str, Any]]] = {}
        for transcript in model_transcripts:
            scenario_id = transcript.get("scenarioId", "unknown")
            if scenario_id not in by_condition:
                by_condition[scenario_id] = []
            by_condition[scenario_id].append(transcript)

        accumulated_counts: dict[str, ValueCounts] = {}
        condition_means: list[float] = []

        for condition_transcripts in by_condition.values():
            condition_value_counts: dict[str, ValueCounts] = {}
            condition_scores: list[float] = []

            for transcript in condition_transcripts:
                summary = transcript.get("summary", {})
                values_data = summary.get("values", {})

                for value_id, status in values_data.items():
                    if value_id not in condition_value_counts:
                        condition_value_counts[value_id] = ValueCounts(
                            prioritized=0.0,
                            deprioritized=0.0,
                            neutral=0.0,
                        )

                    if status == "prioritized":
                        condition_value_counts[value_id]["prioritized"] += 1.0
                    elif status == "deprioritized":
                        condition_value_counts[value_id]["deprioritized"] += 1.0
                    else:
                        condition_value_counts[value_id]["neutral"] += 1.0

                score = resolve_transcript_signed_distance(transcript)
                if score is not None:
                    condition_scores.append(float(score))

            for value_id, counts in condition_value_counts.items():
                total = counts["prioritized"] + counts["deprioritized"] + counts["neutral"]
                if total <= 0:
                    continue

                if value_id not in accumulated_counts:
                    accumulated_counts[value_id] = ValueCounts(
                        prioritized=0.0,
                        deprioritized=0.0,
                        neutral=0.0,
                    )

                accumulated_counts[value_id]["prioritized"] = round(
                    accumulated_counts[value_id]["prioritized"] + counts["prioritized"] / total,
                    6,
                )
                accumulated_counts[value_id]["deprioritized"] = round(
                    accumulated_counts[value_id]["deprioritized"] + counts["deprioritized"] / total,
                    6,
                )
                accumulated_counts[value_id]["neutral"] = round(
                    accumulated_counts[value_id]["neutral"] + counts["neutral"] / total,
                    6,
                )

            if condition_scores:
                condition_means.append(float(np.mean(condition_scores)))

        # Compute value stats
        values: dict[str, ValueStats] = {}
        for value_id, counts in accumulated_counts.items():
            values[value_id] = compute_value_stats(
                counts["prioritized"],
                counts["deprioritized"],
                counts["neutral"],
            )

        result[model_id] = ModelStats(
            sampleSize=len(model_transcripts),
            conditionCount=len(by_condition),
            values=values,
            overall=compute_model_summary(condition_means),
        )

    return result
