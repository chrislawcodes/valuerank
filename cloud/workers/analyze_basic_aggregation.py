"""Pure helper functions used by analyze_basic.py."""

import math
from typing import Any

from common.errors import ValidationError
from stats.decision_model import resolve_transcript_signed_distance


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
                "byValue": _compute_two_step_by_value(
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


def _compute_two_step_by_value(
    outcomes_by_scenario_value: dict[str, dict[str, list[str]]],
    pooled_values: dict[str, Any],
) -> dict[str, Any]:
    """
    Compute per-vignette-averaged winRate for each value.

    For each value:
      1. For each unique vignette containing that value, compute
         vignette_rate = prioritized / total (all statuses for that vignette).
         Skip vignettes where total == 0 for this value.
      2. winRate = mean(vignette_rates).
         If no vignettes contribute (empty list), fall back to 0.5.

    Returns a dict in the same shape as model_stats["values"] but with
    winRate replaced by the two-step average. The count fields are
    preserved from pooled_values (raw response counts) for reference.
    """
    # Collect all value IDs seen across all vignettes
    all_value_ids: set[str] = set()
    for vignette_values in outcomes_by_scenario_value.values():
        all_value_ids.update(vignette_values.keys())

    result: dict[str, Any] = {}
    for value_id in all_value_ids:
        vignette_rates: list[float] = []
        for vignette_outcomes in outcomes_by_scenario_value.values():
            statuses = vignette_outcomes.get(value_id, [])
            if not statuses:
                continue
            p = sum(1 for s in statuses if s == "prioritized")
            total = len(statuses)
            if total == 0:
                continue  # guard, should not occur
            vignette_rates.append(p / total)

        two_step_win_rate = (
            sum(vignette_rates) / len(vignette_rates)
            if vignette_rates
            else 0.5
        )

        # Preserve raw count fields from pooled stats if available
        pooled_entry = pooled_values.get(value_id, {})
        entry: dict[str, Any] = {
            "winRate": round(two_step_win_rate, 6),
        }
        if "count" in pooled_entry:
            entry["count"] = pooled_entry["count"]

        result[value_id] = entry

    # Include any values in pooled_values not seen in vignette outcomes
    # (edge case: transcripts have no summary.values data)
    for value_id, pooled_entry in pooled_values.items():
        if value_id not in result:
            entry = dict(pooled_entry)
            entry["winRate"] = 0.5
            result[value_id] = entry

    return result


def build_reliability_summary(variance_analysis: dict[str, Any]) -> dict[str, Any]:
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
