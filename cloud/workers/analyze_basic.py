#!/usr/bin/env python3
"""
Analyze Basic Worker - Tier 1 analysis for AI model behavior.

Computes win rates, confidence intervals, model comparisons, and
dimension impact analysis using the stats/ module.

Protocol:
- Reads JSON input from stdin
- Writes JSON output to stdout
- Logs structured JSON to stderr

Input format:
{
  "runId": string,
  "emitVignetteSemantics": boolean,
  "transcripts": [
    {
      "id": string,
      "modelId": string,
      "scenarioId": string,
      "decision": "A" | "B" | string,
      "summary": { "values": {...}, "score": number },
      "scenario": { "dimensions": {...} }
    }
  ]
}

Output format (see plan.md AnalysisOutput schema):
{
  "success": true,
  "analysis": {
    "perModel": {...},
    "preferenceSummary": {...},
    "reliabilitySummary": {...},
    "modelAgreement": {...},
    "dimensionAnalysis": {...},
    "mostContestedScenarios": [...],
    "methodsUsed": {...},
    "warnings": [...],
    "computedAt": string,
    "durationMs": number
  }
}
"""

import json
import math
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from common.errors import ErrorCode, ValidationError
from common.logging import get_logger
from stats.basic_stats import aggregate_transcripts_by_model, compute_visualization_data
from stats.model_comparison import compute_model_agreement
from stats.dimension_impact import compute_dimension_analysis
from stats.variance_analysis import compute_variance_analysis

log = get_logger("analyze_basic")

# Code version for reproducibility tracking
CODE_VERSION = "1.1.1"

SUMMARY_CONTRACT_VERSION = "vignette-semantics-v1"


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
        summary = t.get("summary", {})
        score = summary.get("score")

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
        summary = t.get("summary", {})
        score = summary.get("score")
        scenario = t.get("scenario", {})

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

    # Check for missing dimension data
    has_dimensions = any(
        t.get("scenario", {}).get("dimensions")
        for t in transcripts
    )
    if not has_dimensions:
        warnings.append({
            "code": "NO_DIMENSIONS",
            "message": "No scenario dimensions found in transcripts",
            "recommendation": "Variable impact analysis will be empty",
        })

    return warnings


def normalize_score(score: Any, orientation_flipped: bool) -> float | None:
    """Normalize a score onto the canonical 1-5 orientation."""
    try:
        numeric_score = float(score)
    except (TypeError, ValueError):
        return None

    if numeric_score < 1.0 or numeric_score > 5.0:
        return None

    return float(6 - numeric_score) if orientation_flipped else numeric_score


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

    for transcript in transcripts:
        model_id = transcript.get("modelId", "unknown")
        scenario_id = transcript.get("scenarioId", "unknown")
        summary = transcript.get("summary", {})
        score = summary.get("score")

        normalized_score = normalize_score(
            score,
            bool(transcript.get("orientationFlipped", False)),
        )
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
            signed_center = sum(mean - 3.0 for mean in scenario_means) / len(scenario_means)
            strength = sum(abs(mean - 3.0) for mean in scenario_means) / len(scenario_means)

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
                "byValue": model_stats.get("values", {}),
                "overallLean": overall_lean,
                "overallSignedCenter": overall_signed_center,
            },
            "preferenceStrength": preference_strength,
        }

    return {
        "perModel": per_model_summary,
    }


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


def build_pooled_aggregate_reliability(
    transcripts: list[dict[str, Any]],
    planned_scenario_ids: list[str],
    min_repeat_coverage_count: int,
    min_repeat_coverage_share: float,
    drift_warning_threshold: float,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    Build pooled aggregate reliability and aggregate semantic metadata.

    Repeatability is computed within each source run first, then rolled up
    across runs using run-level coverage counts as weights.
    """
    transcripts_by_run: dict[str, list[dict[str, Any]]] = defaultdict(list)
    pooled_unique_scenarios: dict[str, set[str]] = defaultdict(set)

    for transcript in transcripts:
        run_id = transcript.get("runId")
        if not isinstance(run_id, str) or run_id == "":
            continue
        transcripts_by_run[run_id].append(transcript)
        model_id = transcript.get("modelId")
        scenario_id = transcript.get("scenarioId")
        summary = transcript.get("summary", {})
        if isinstance(model_id, str) and model_id != "" and isinstance(scenario_id, str) and scenario_id != "":
            if summary.get("score") is not None:
                pooled_unique_scenarios[model_id].add(scenario_id)

    run_level_reliability: dict[str, dict[str, Any]] = {}
    run_level_preference: dict[str, dict[str, Any]] = {}
    run_level_variance: dict[str, dict[str, Any]] = {}
    model_ids: set[str] = set()

    for run_id, run_transcripts in transcripts_by_run.items():
        run_per_model = aggregate_transcripts_by_model(run_transcripts)
        run_level_preference[run_id] = build_preference_summary(run_transcripts, run_per_model)["perModel"]
        run_variance = compute_variance_analysis(run_transcripts)
        run_level_variance[run_id] = run_variance.get("perModel", {})
        run_level_reliability[run_id] = build_reliability_summary(run_variance)["perModel"]
        model_ids.update(run_per_model.keys())

    planned_condition_count = len(planned_scenario_ids)
    planned_condition_set = set(planned_scenario_ids)
    reliability_per_model: dict[str, Any] = {}
    per_model_repeat_coverage: dict[str, Any] = {}
    per_model_drift: dict[str, Any] = {}

    def weighted_average(metric_samples: list[tuple[int, float]]) -> float | None:
        if not metric_samples:
            return None
        total_weight = sum(weight for weight, _ in metric_samples if weight > 0)
        if total_weight <= 0:
            return None
        return round(
            sum(weight * value for weight, value in metric_samples if weight > 0) / total_weight,
            6,
        )

    for model_id in sorted(model_ids):
        repeated_condition_ids: set[str] = set()
        contributing_run_count = 0
        total_repeat_coverage_count = 0
        drift_samples: list[tuple[int, float]] = []
        reliability_samples: list[tuple[int, float]] = []
        noise_samples: list[tuple[int, float]] = []
        agreement_samples: list[tuple[int, float]] = []
        neutral_samples: list[tuple[int, float]] = []

        for run_id, model_reliability in run_level_reliability.items():
            model_summary = model_reliability.get(model_id)
            model_variance = run_level_variance.get(run_id, {}).get(model_id, {})
            model_preference = run_level_preference.get(run_id, {}).get(model_id, {})
            if not isinstance(model_summary, dict):
                continue

            run_repeated_conditions = {
                scenario_id
                for scenario_id, stats in model_variance.get("perScenario", {}).items()
                if isinstance(stats, dict) and int(stats.get("sampleCount", 0)) > 1
            }
            repeated_condition_ids.update(run_repeated_conditions)

            coverage_count = int(model_summary.get("coverageCount", 0))
            if coverage_count <= 0:
                continue

            contributing_run_count += 1
            total_repeat_coverage_count += coverage_count
            baseline_reliability = model_summary.get("baselineReliability")
            baseline_noise = model_summary.get("baselineNoise")
            directional_agreement = model_summary.get("directionalAgreement")
            neutral_share = model_summary.get("neutralShare")
            overall_signed_center = model_preference.get("preferenceDirection", {}).get("overallSignedCenter")

            if baseline_reliability is not None:
                reliability_samples.append((coverage_count, float(baseline_reliability)))
            if baseline_noise is not None:
                noise_samples.append((coverage_count, float(baseline_noise)))
            if directional_agreement is not None:
                agreement_samples.append((coverage_count, float(directional_agreement)))
            if neutral_share is not None:
                neutral_samples.append((coverage_count, float(neutral_share)))
            if overall_signed_center is not None:
                drift_samples.append((coverage_count, float(overall_signed_center)))

        repeat_coverage_breadth = (
            len(repeated_condition_ids & planned_condition_set)
            if planned_condition_set
            else len(repeated_condition_ids)
        )
        repeat_coverage_share = (
            round(repeat_coverage_breadth / planned_condition_count, 6)
            if planned_condition_count > 0
            else 0.0
        )
        unique_scenarios = repeat_coverage_breadth
        drift_sd = compute_weighted_standard_deviation(drift_samples)
        per_model_repeat_coverage[model_id] = {
            "repeatCoverageCount": total_repeat_coverage_count,
            "repeatCoverageShare": repeat_coverage_share,
            "contributingRunCount": contributing_run_count,
        }
        per_model_drift[model_id] = {
            "weightedOverallSignedCenterSd": drift_sd,
            "exceedsWarningThreshold": drift_sd is not None and drift_sd > drift_warning_threshold,
        }

        publishable = (
            total_repeat_coverage_count >= min_repeat_coverage_count
            and repeat_coverage_share >= min_repeat_coverage_share
            and len(reliability_samples) > 0
        )

        reliability_per_model[model_id] = {
            "baselineNoise": weighted_average(noise_samples) if publishable else None,
            "baselineReliability": weighted_average(reliability_samples) if publishable else None,
            "directionalAgreement": weighted_average(agreement_samples) if publishable else None,
            "neutralShare": weighted_average(neutral_samples) if publishable else None,
            "coverageCount": total_repeat_coverage_count,
            "uniqueScenarios": unique_scenarios,
        }

    return (
        {"perModel": reliability_per_model},
        {
            "perModelRepeatCoverage": per_model_repeat_coverage,
            "perModelDrift": per_model_drift,
        },
    )


def run_analysis(data: dict[str, Any]) -> dict[str, Any]:
    """Run full Tier 1 analysis and return result."""
    start_time = time.time()
    run_id = data["runId"]
    emit_vignette_semantics = bool(data.get("emitVignetteSemantics", True))
    aggregate_semantics = data.get("aggregateSemantics")
    transcripts = data.get("transcripts", [])

    # Legacy mode: return stub if only transcriptIds provided
    if not transcripts and "transcriptIds" in data:
        log.info(
            "Running stub analysis (legacy mode)",
            runId=run_id,
            transcriptCount=len(data["transcriptIds"]),
        )
        return {
            "success": True,
            "analysis": {
                "status": "STUB",
                "message": "Full analysis requires transcript data",
                "transcriptCount": len(data["transcriptIds"]),
                "completedAt": datetime.now(timezone.utc).isoformat(),
            },
        }

    log.info(
        "Running Tier 1 analysis",
        runId=run_id,
        transcriptCount=len(transcripts),
    )

    # Compute per-model statistics
    per_model = aggregate_transcripts_by_model(transcripts)

    # Extract aligned scores for model comparison
    model_scores = extract_model_scores(transcripts)

    # Compute model agreement
    model_agreement = compute_model_agreement(model_scores)

    # Compute dimension impact analysis
    dimension_analysis = compute_dimension_analysis(transcripts)

    # Compute variance analysis (for multi-sample runs)
    variance_analysis = compute_variance_analysis(transcripts)

    # Build explicit semantic summaries for baseline vignette runs only.
    preference_summary = None
    reliability_summary = None
    aggregate_metadata = None
    if emit_vignette_semantics:
        preference_summary = build_preference_summary(transcripts, per_model)
        if aggregate_semantics is not None:
            reliability_summary, aggregate_metadata = build_pooled_aggregate_reliability(
                transcripts,
                aggregate_semantics["plannedScenarioIds"],
                int(aggregate_semantics["minRepeatCoverageCount"]),
                float(aggregate_semantics["minRepeatCoverageShare"]),
                float(aggregate_semantics["driftWarningThreshold"]),
            )
        else:
            reliability_summary = build_reliability_summary(variance_analysis)

    # Find most contested scenarios
    contested = find_contested_scenarios(transcripts)

    # Compute visualization data
    visualization_data = compute_visualization_data(transcripts)

    # Generate warnings
    warnings = generate_warnings(transcripts, per_model)

    # Calculate duration
    duration_ms = int((time.time() - start_time) * 1000)

    log.info(
        "Analysis complete",
        runId=run_id,
        modelCount=len(per_model),
        durationMs=duration_ms,
    )

    return {
        "success": True,
        "analysis": {
            "perModel": per_model,
            "preferenceSummary": preference_summary,
            "reliabilitySummary": reliability_summary,
            "modelAgreement": model_agreement,
            "dimensionAnalysis": dimension_analysis,
            "varianceAnalysis": variance_analysis,  # Multi-sample variance metrics
            "mostContestedScenarios": contested,
            "visualizationData": visualization_data,
            "methodsUsed": {
                "winRateCI": "wilson_score",
                "modelComparison": "spearman_rho",
                "pValueCorrection": "holm_bonferroni",
                "effectSize": "cohens_d",
                "dimensionTest": "kruskal_wallis",
                "varianceMetrics": "sample_variance",
                "alpha": 0.05,
                "codeVersion": CODE_VERSION,
                "summaryContractVersion": SUMMARY_CONTRACT_VERSION,
            },
            "warnings": warnings,
            "computedAt": datetime.now(timezone.utc).isoformat(),
            "durationMs": duration_ms,
            "aggregateSemantics": aggregate_metadata,
        },
    }


def main() -> None:
    """Main entry point."""
    try:
        # Read JSON input from stdin
        input_data = sys.stdin.read()
        if not input_data.strip():
            result = {
                "success": False,
                "error": {
                    "message": "No input provided",
                    "code": ErrorCode.VALIDATION_ERROR.value,
                    "retryable": False,
                },
            }
            print(json.dumps(result))
            return

        try:
            data = json.loads(input_data)
        except json.JSONDecodeError as err:
            result = {
                "success": False,
                "error": {
                    "message": f"Invalid JSON input: {err}",
                    "code": ErrorCode.VALIDATION_ERROR.value,
                    "retryable": False,
                },
            }
            print(json.dumps(result))
            return

        # Validate input
        try:
            validate_input(data)
        except ValidationError as err:
            result = {
                "success": False,
                "error": err.to_dict(),
            }
            print(json.dumps(result))
            return

        # Run analysis
        result = run_analysis(data)

        # Output result
        print(json.dumps(result))

    except Exception as err:
        log.error("Analysis failed", err=str(err))
        result = {
            "success": False,
            "error": {
                "message": str(err),
                "code": ErrorCode.UNKNOWN.value,
                "retryable": True,
            },
        }
        print(json.dumps(result))


if __name__ == "__main__":
    main()
