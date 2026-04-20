"""Pure helper functions used by analyze_basic.py."""

import math
from typing import Any

from common.errors import ValidationError
from stats.decision_model import SIGNED_TO_BUCKET, resolve_transcript_signed_distance
from stats.preference_stats import compute_two_step_by_value

_CANONICAL_APPEAL_RANK: dict[str, int] = {
    # Vocabulary used by Definition.content.dimension_values (see scenario
    # content schema). 1-indexed so the full vocabulary has positive ranks and
    # differences produce a clean signed "net pressure" (target - opposing).
    "negligible": 1,
    "minimal": 2,
    "moderate": 3,
    "substantial": 4,
    "full": 5,
}
_POSITIVE_DIRECTION_BUCKETS: tuple[str, str] = (
    SIGNED_TO_BUCKET[2.0],
    SIGNED_TO_BUCKET[1.0],
)
_NEUTRAL_DIRECTION_BUCKETS: tuple[str, ...] = (
    SIGNED_TO_BUCKET[0.0],
)


def validate_input(data: dict[str, Any]) -> None:
    """Validate analyze basic input."""
    if "runId" not in data:
        raise ValidationError(message="Missing required field: runId")

    if "transcripts" not in data:
        # Legacy format: transcriptIds only (for backwards compatibility)
        if "transcriptIds" in data and isinstance(data["transcriptIds"], list):
            # Legacy mode - return stub response
            return
        raise ValidationError(message="Missing required field: transcripts")

    if not isinstance(data["transcripts"], list):
        raise ValidationError(message="transcripts must be an array")

    if "emitVignetteSemantics" in data and not isinstance(data["emitVignetteSemantics"], bool):
        raise ValidationError(message="emitVignetteSemantics must be a boolean")

    aggregate_semantics = data.get("aggregateSemantics")
    if aggregate_semantics is not None:
        if not isinstance(aggregate_semantics, dict):
            raise ValidationError(message="aggregateSemantics must be an object")
        if aggregate_semantics.get("mode") != "same_signature_v1":
            raise ValidationError(message="aggregateSemantics.mode must be same_signature_v1")
        planned_scenario_ids = aggregate_semantics.get("plannedScenarioIds")
        if not isinstance(planned_scenario_ids, list) or not all(isinstance(item, str) for item in planned_scenario_ids):
            raise ValidationError(message="aggregateSemantics.plannedScenarioIds must be an array of strings")
        for field in ("minRepeatCoverageCount", "lowCoverageCautionThreshold"):
            value = aggregate_semantics.get(field)
            if not isinstance(value, int) or value < 0:
                raise ValidationError(message=f"aggregateSemantics.{field} must be a non-negative integer")
        for field in ("minRepeatCoverageShare", "driftWarningThreshold"):
            value = aggregate_semantics.get(field)
            if not isinstance(value, (int, float)) or not math.isfinite(float(value)):
                raise ValidationError(message=f"aggregateSemantics.{field} must be a finite number")

        for transcript in data["transcripts"]:
            run_id = transcript.get("runId")
            if not isinstance(run_id, str) or run_id.strip() == "":
                raise ValidationError(message="aggregateSemantics requires transcript.runId for every transcript")


def extract_model_scores(transcripts: list[dict[str, Any]]) -> dict[str, list[float]]:
    """
    Extract aligned scores per model for comparison.

    Groups transcripts by scenarioId, then collects scores per model
    for scenarios that all models answered.
    """
    # Group by scenario
    by_scenario: dict[str, dict[str, float]] = {}
    for t in transcripts:
        scenario_id = t.get("scenarioId", "unknown")
        model_id = t.get("modelId", "unknown")
        score = resolve_transcript_signed_distance(t)

        if score is None:
            continue

        if scenario_id not in by_scenario:
            by_scenario[scenario_id] = {}
        by_scenario[scenario_id][model_id] = float(score)

    # Find models that answered all scenarios
    all_models = set()
    for model_scores in by_scenario.values():
        all_models.update(model_scores.keys())

    # Collect aligned scores
    result: dict[str, list[float]] = {m: [] for m in all_models}
    for scenario_id in sorted(by_scenario.keys()):
        scenario_scores = by_scenario[scenario_id]
        # Only include scenarios where all models have scores
        if set(scenario_scores.keys()) == all_models:
            for model_id, score in scenario_scores.items():
                result[model_id].append(score)

    # Filter out models with no aligned scores
    return {m: scores for m, scores in result.items() if scores}


def find_contested_scenarios(
    transcripts: list[dict[str, Any]],
    limit: int = 5,
) -> list[dict[str, Any]]:
    """
    Find scenarios with highest disagreement across models.

    Disagreement is measured by variance in scores across models.
    """
    import numpy as np

    # Group by scenario
    by_scenario: dict[str, list[tuple[str, float]]] = {}
    scenario_names: dict[str, str] = {}

    for t in transcripts:
        scenario_id = t.get("scenarioId", "unknown")
        model_id = t.get("modelId", "unknown")
        scenario = t.get("scenario", {})
        score = resolve_transcript_signed_distance(t)

        if score is None:
            continue

        if scenario_id not in by_scenario:
            by_scenario[scenario_id] = []
            scenario_names[scenario_id] = scenario.get("name", scenario_id)

        by_scenario[scenario_id].append((model_id, float(score)))

    # Calculate variance for each scenario
    contested: list[dict[str, Any]] = []
    for scenario_id, model_scores in by_scenario.items():
        if len(model_scores) < 2:
            continue

        scores = [s for _, s in model_scores]
        variance = float(np.var(scores))

        contested.append({
            "scenarioId": scenario_id,
            "scenarioName": scenario_names[scenario_id],
            "variance": round(variance, 6),
            "modelScores": {m: s for m, s in model_scores},
        })

    # Sort by variance descending
    contested.sort(key=lambda x: x["variance"], reverse=True)
    return contested[:limit]


def generate_warnings(
    transcripts: list[dict[str, Any]],
    per_model: dict[str, Any],
) -> list[dict[str, str]]:
    """Generate warnings for statistical assumption violations."""
    warnings: list[dict[str, str]] = []

    # Check sample sizes
    for model_id, stats in per_model.items():
        sample_size = stats.get("sampleSize", 0)
        if sample_size < 10:
            warnings.append({
                "code": "SMALL_SAMPLE",
                "message": f"Model {model_id} has only {sample_size} samples",
                "recommendation": "Results may have wide confidence intervals",
            })
        elif sample_size < 30:
            warnings.append({
                "code": "MODERATE_SAMPLE",
                "message": f"Model {model_id} has {sample_size} samples",
                "recommendation": "Consider using bootstrap confidence intervals",
            })

    transcripts_with_dimensions = sum(
        1
        for t in transcripts
        if t.get("scenario", {}).get("dimensions")
    )
    if transcripts_with_dimensions == 0:
        warnings.append({
            "code": "NO_DIMENSIONS",
            "message": "No scenario dimensions found in transcripts",
            "recommendation": "Variable impact analysis will be empty",
        })
    elif transcripts_with_dimensions < len(transcripts):
        warnings.append({
            "code": "PARTIAL_DIMENSIONS",
            "message": (
                f"Only {transcripts_with_dimensions} of {len(transcripts)} transcripts "
                "include scenario dimensions"
            ),
            "recommendation": "Condition grouping and variable impact may exclude uncovered scenarios",
        })

    return warnings


def build_preference_summary(
    transcripts: list[dict[str, Any]],
    per_model: dict[str, Any],
) -> dict[str, Any]:
    """
    Build explicit preference semantics for vignette analysis.

    Preference strength is computed from orientation-corrected per-scenario means
    so repeated probes do not overweight a single scenario.
    """
    scores_by_model_scenario: dict[str, dict[str, list[float]]] = {}
    outcomes_by_model_scenario_value: dict[str, dict[str, dict[str, list[str]]]] = {}
    # [model_id][scenario_id][value_id] -> list of "prioritized"|"deprioritized"|"neutral"

    for transcript in transcripts:
        model_id = transcript.get("modelId", "unknown")
        scenario_id = transcript.get("scenarioId", "unknown")
        # Collect per-value outcomes for two-step win rate computation.
        # Runs before the normalized_score guard so every transcript contributes
        # value outcomes even if it has no canonical signed-distance score.
        values_data = transcript.get("summary", {}).get("values", {})
        for value_id, status in values_data.items():
            if model_id not in outcomes_by_model_scenario_value:
                outcomes_by_model_scenario_value[model_id] = {}
            if scenario_id not in outcomes_by_model_scenario_value[model_id]:
                outcomes_by_model_scenario_value[model_id][scenario_id] = {}
            if value_id not in outcomes_by_model_scenario_value[model_id][scenario_id]:
                outcomes_by_model_scenario_value[model_id][scenario_id][value_id] = []
            outcomes_by_model_scenario_value[model_id][scenario_id][value_id].append(status)

        normalized_score = resolve_transcript_signed_distance(transcript)
        if normalized_score is None:
            continue

        if model_id not in scores_by_model_scenario:
            scores_by_model_scenario[model_id] = {}
        if scenario_id not in scores_by_model_scenario[model_id]:
            scores_by_model_scenario[model_id][scenario_id] = []

        scores_by_model_scenario[model_id][scenario_id].append(normalized_score)

    per_model_summary: dict[str, Any] = {}
    for model_id, model_stats in per_model.items():
        scenario_scores = scores_by_model_scenario.get(model_id, {})
        scenario_means = [
            sum(scores) / len(scores)
            for scores in scenario_scores.values()
            if scores
        ]

        overall_signed_center: float | None = None
        overall_lean: str | None = None
        preference_strength: float | None = None

        if scenario_means:
            # scenario_means are already signed distances (-2 to +2)
            signed_center = sum(scenario_means) / len(scenario_means)
            strength = sum(abs(mean) for mean in scenario_means) / len(scenario_means)

            overall_signed_center = round(float(signed_center), 6)
            preference_strength = round(float(strength), 6)

            if overall_signed_center > 0:
                overall_lean = "A"
            elif overall_signed_center < 0:
                overall_lean = "B"
            else:
                overall_lean = "NEUTRAL"

        per_model_summary[model_id] = {
            "preferenceDirection": {
                "byValue": compute_two_step_by_value(
                    outcomes_by_model_scenario_value.get(model_id, {}),
                    model_stats.get("values", {}),
                ),
                "overallLean": overall_lean,
                "overallSignedCenter": overall_signed_center,
            },
            "preferenceStrength": preference_strength,
        }

    return {
        "perModel": per_model_summary,
    }


def _bernoulli_pair_counts(stats: dict[str, Any]) -> tuple[int, int]:
    sample_count = int(stats.get("sampleCount", 0))
    if sample_count < 2:
        return 0, 0

    direction_counts = stats.get("directionCounts", {})
    if not isinstance(direction_counts, dict):
        direction_counts = {}

    trials = sample_count * (sample_count - 1) // 2
    matches = 0
    for count in direction_counts.values():
        if isinstance(count, int) and not isinstance(count, bool) and count > 1:
            matches += count * (count - 1) // 2
    return trials, matches


def _to_condition_rank(value: Any) -> int | None:
    if isinstance(value, str):
        return _CANONICAL_APPEAL_RANK.get(value)

    if isinstance(value, int) and not isinstance(value, bool):
        return value

    return None


def _direction_count(direction_counts: dict[str, Any], canonical_key: str, fallback_key: str) -> int:
    if canonical_key in direction_counts:
        value = direction_counts.get(canonical_key)
        if isinstance(value, int) and not isinstance(value, bool):
            return value

    value = direction_counts.get(fallback_key)
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    return 0


def _direction_counts_sum(
    direction_counts: dict[str, Any],
    keys: tuple[str, ...],
) -> int:
    total = 0
    for key in keys:
        value = direction_counts.get(key)
        if isinstance(value, int) and not isinstance(value, bool):
            total += value
    return total


def _build_per_pair_for_model(
    model_stats: dict[str, Any],
    run_context: dict[str, Any],
) -> dict[str, dict[str, Any]] | None:
    per_scenario = model_stats.get("perScenario", {})
    if not isinstance(per_scenario, dict) or not per_scenario:
        return None

    value_key = run_context.get("valueKey")
    opposing_value_key = run_context.get("opposingValueKey")
    target_analysis_run_id = run_context.get("targetAnalysisRunId")
    target_companion_run_id = run_context.get("targetCompanionRunId")
    primary_condition_ids = run_context.get("primaryConditionIds", [])
    companion_condition_ids = run_context.get("companionConditionIds", [])
    scenario_dimensions_by_id = run_context.get("scenarioDimensionsById", {})
    if not isinstance(scenario_dimensions_by_id, dict):
        scenario_dimensions_by_id = {}

    if not isinstance(value_key, str) or value_key.strip() == "":
        return None
    if not isinstance(opposing_value_key, str) or opposing_value_key.strip() == "":
        return None
    if not isinstance(target_analysis_run_id, str) or target_analysis_run_id.strip() == "":
        return None

    per_condition: list[dict[str, Any]] = []
    for scenario_id, stats in per_scenario.items():
        if not isinstance(scenario_id, str) or not isinstance(stats, dict):
            continue

        sample_count = int(stats.get("sampleCount", 0))
        if sample_count <= 0:
            continue

        direction_counts = stats.get("directionCounts", {})
        if not isinstance(direction_counts, dict):
            direction_counts = {}

        neutral_count = _direction_counts_sum(direction_counts, _NEUTRAL_DIRECTION_BUCKETS)
        trials = max(sample_count - neutral_count, 1)
        matches = _direction_counts_sum(direction_counts, _POSITIVE_DIRECTION_BUCKETS)
        win_rate = round(matches / trials, 6)

        scenario_dimensions = scenario_dimensions_by_id.get(scenario_id, {})
        net_pressure_rank: int | None = None
        if isinstance(scenario_dimensions, dict):
            target_rank = _to_condition_rank(scenario_dimensions.get(value_key))
            opposing_rank = _to_condition_rank(scenario_dimensions.get(opposing_value_key))
            if target_rank is not None and opposing_rank is not None:
                net_pressure_rank = target_rank - opposing_rank

        per_condition.append({
            "scenarioId": scenario_id,
            "netPressureRank": net_pressure_rank,
            "winRate": win_rate,
            "matches": matches,
            "trials": trials,
        })

    return {
        value_key: {
            "targetAnalysisRunId": target_analysis_run_id,
            "targetCompanionRunId": target_companion_run_id if isinstance(target_companion_run_id, str) and target_companion_run_id.strip() != "" else None,
            "primaryConditionIds": [
                item
                for item in primary_condition_ids
                if isinstance(item, str) and item.strip() != ""
            ] if isinstance(primary_condition_ids, list) else [],
            "companionConditionIds": [
                item
                for item in companion_condition_ids
                if isinstance(item, str) and item.strip() != ""
            ] if isinstance(companion_condition_ids, list) else [],
            "perCondition": per_condition,
        },
    }


def build_reliability_summary(
    variance_analysis: dict[str, Any],
    run_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Build baseline reliability semantics from repeated-trial variance analysis.

    Reliability is unavailable without actual repeat coverage and never falls back
    to cross-scenario spread metrics.
    """
    is_multi_sample = bool(variance_analysis.get("isMultiSample", False))
    per_model_variance = variance_analysis.get("perModel", {})

    per_model_summary: dict[str, Any] = {}
    for model_id, model_stats in per_model_variance.items():
        per_scenario = model_stats.get("perScenario", {})
        per_scenario_bernoulli: dict[str, dict[str, int]] = {}
        for scenario_id, stats in per_scenario.items():
            if not isinstance(scenario_id, str) or not isinstance(stats, dict):
                continue

            sample_count = int(stats.get("sampleCount", 0))
            if sample_count < 2:
                continue

            trials, matches = _bernoulli_pair_counts(stats)
            per_scenario_bernoulli[scenario_id] = {
                "trials": trials,
                "matches": matches,
            }

        repeated_scenarios = [
            stats
            for stats in per_scenario.values()
            if stats.get("sampleCount", 0) > 1
        ]
        coverage_count = len(repeated_scenarios)

        baseline_noise: float | None = None
        baseline_reliability: float | None = None
        directional_agreement: float | None = None
        neutral_share: float | None = None

        if coverage_count > 0:
            avg_within_scenario_variance = float(model_stats.get("avgWithinScenarioVariance", 0.0))
            baseline_noise = round(math.sqrt(max(avg_within_scenario_variance, 0.0)), 6)

            if is_multi_sample:
                consistency_score = model_stats.get("consistencyScore")
                if consistency_score is not None:
                    baseline_reliability = round(float(consistency_score), 6)

            agreement_weight = sum(
                int(stats.get("sampleCount", 0))
                for stats in repeated_scenarios
                if stats.get("directionalAgreement") is not None
            )
            if agreement_weight > 0:
                directional_agreement = round(
                    sum(
                        float(stats["directionalAgreement"]) * int(stats.get("sampleCount", 0))
                        for stats in repeated_scenarios
                        if stats.get("directionalAgreement") is not None
                    ) / agreement_weight,
                    6,
                )

            neutral_weight = sum(
                int(stats.get("sampleCount", 0))
                for stats in repeated_scenarios
                if stats.get("neutralShare") is not None
            )
            if neutral_weight > 0:
                neutral_share = round(
                    sum(
                        float(stats["neutralShare"]) * int(stats.get("sampleCount", 0))
                        for stats in repeated_scenarios
                        if stats.get("neutralShare") is not None
                    ) / neutral_weight,
                    6,
                )

        per_model_summary[model_id] = {
            "baselineNoise": baseline_noise,
            "baselineReliability": baseline_reliability,
            "directionalAgreement": directional_agreement,
            "neutralShare": neutral_share,
            "coverageCount": coverage_count,
            "uniqueScenarios": int(model_stats.get("uniqueScenarios", 0)),
        }

        if per_scenario_bernoulli:
            per_model_summary[model_id]["perScenario"] = per_scenario_bernoulli

        if run_context is not None:
            per_pair = _build_per_pair_for_model(model_stats, run_context)
            if per_pair:
                per_model_summary[model_id]["perPair"] = per_pair

    return {
        "perModel": per_model_summary,
    }


def compute_weighted_standard_deviation(samples: list[tuple[int, float]]) -> float | None:
    """Compute weighted standard deviation for (weight, value) samples."""
    if not samples:
        return None

    total_weight = sum(weight for weight, _ in samples if weight > 0)
    if total_weight <= 0:
        return None

    weighted_mean = sum(weight * value for weight, value in samples if weight > 0) / total_weight
    weighted_variance = sum(
        weight * ((value - weighted_mean) ** 2)
        for weight, value in samples
        if weight > 0
    ) / total_weight
    return round(math.sqrt(max(weighted_variance, 0.0)), 6)
