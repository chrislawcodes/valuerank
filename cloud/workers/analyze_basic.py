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
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from common.errors import ErrorCode, ValidationError
from common.logging import get_logger
from analyze_basic_aggregation import (
    build_preference_summary,
    build_reliability_summary,
    compute_weighted_standard_deviation,
    extract_model_scores,
    find_contested_scenarios,
    generate_warnings,
    validate_input,
)
from analyze_basic_metadata import (
    CODE_VERSION,
    SUMMARY_CONTRACT_VERSION,
    build_methods_used,
)
from stats.basic_stats import aggregate_transcripts_by_model, compute_visualization_data
from stats.decision_model import resolve_transcript_signed_distance
from stats.model_comparison import compute_model_agreement
from stats.dimension_impact import compute_dimension_analysis
from stats.variance_analysis import compute_variance_analysis

log = get_logger("analyze_basic")


def build_pooled_aggregate_reliability(
    transcripts: list[dict[str, Any]],
    planned_scenario_ids: list[str],
    min_repeat_coverage_count: int,
    min_repeat_coverage_share: float,
    drift_warning_threshold: float,
    run_context: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    Build pooled aggregate reliability and aggregate semantic metadata.

    Cross-run repeats (same scenarioId across different source runs) are treated as
    repeated observations. compute_variance_analysis is called once on all transcripts
    pooled together, treating cross-run repeats as within-run repeats.
    """
    transcripts_by_run: dict[str, list[dict[str, Any]]] = defaultdict(list)
    pooled_unique_scenarios: dict[str, set[str]] = defaultdict(set)
    # Track unique scenarioIds per (run_id, model_id) for drift weighting
    run_model_scenario_ids: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))

    for transcript in transcripts:
        run_id = transcript.get("runId")
        if not isinstance(run_id, str) or run_id == "":
            continue
        transcripts_by_run[run_id].append(transcript)
        model_id = transcript.get("modelId")
        scenario_id = transcript.get("scenarioId")
        if isinstance(model_id, str) and model_id != "" and isinstance(scenario_id, str) and scenario_id != "":
            if resolve_transcript_signed_distance(transcript) is not None:
                pooled_unique_scenarios[model_id].add(scenario_id)
                run_model_scenario_ids[run_id][model_id].add(scenario_id)

    run_level_preference: dict[str, dict[str, Any]] = {}
    run_level_per_model: dict[str, dict[str, Any]] = {}
    model_ids: set[str] = set()

    for run_id, run_transcripts in transcripts_by_run.items():
        run_per_model = aggregate_transcripts_by_model(run_transcripts)
        run_level_preference[run_id] = build_preference_summary(run_transcripts, run_per_model)["perModel"]
        run_level_per_model[run_id] = run_per_model
        model_ids.update(run_per_model.keys())

    # Pool ALL transcripts: cross-run repeats of same (modelId, scenarioId) become repeated samples
    pooled_variance = compute_variance_analysis(transcripts)
    pooled_reliability = build_reliability_summary(pooled_variance, run_context=run_context)
    pooled_per_model_reliability = pooled_reliability.get("perModel", {})

    planned_condition_count = len(planned_scenario_ids)
    reliability_per_model: dict[str, Any] = {}
    per_model_repeat_coverage: dict[str, Any] = {}
    per_model_drift: dict[str, Any] = {}

    for model_id in sorted(model_ids):
        # Get pooled reliability metrics for this model
        pooled_model_rel = pooled_per_model_reliability.get(model_id, {})

        # coverageCount from pooled result = number of scenarios with sampleCount > 1 across all runs
        total_repeat_coverage_count = int(pooled_model_rel.get("coverageCount", 0))
        repeat_coverage_share = (
            round(total_repeat_coverage_count / planned_condition_count, 6)
            if planned_condition_count > 0
            else 0.0
        )

        # Collect per-run data for contributingRunCount and drift
        contributing_run_count = 0
        drift_samples: list[tuple[int, float]] = []

        for run_id, run_per_model in run_level_per_model.items():
            if model_id not in run_per_model:
                continue
            contributing_run_count += 1

            # Collect drift: overallSignedCenter per run, weighted by unique scenarios in that run
            run_preference = run_level_preference.get(run_id, {}).get(model_id, {})
            osc = run_preference.get("preferenceDirection", {}).get("overallSignedCenter")
            unique_scen = len(run_model_scenario_ids.get(run_id, {}).get(model_id, set()))
            if osc is not None and unique_scen > 0:
                drift_samples.append((unique_scen, float(osc)))

        # Guard: drift SD requires at least 2 samples to be meaningful
        drift_sd = compute_weighted_standard_deviation(drift_samples) if len(drift_samples) >= 2 else None

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
            and pooled_model_rel.get("baselineReliability") is not None
        )

        reliability_per_model[model_id] = {
            "baselineNoise": pooled_model_rel.get("baselineNoise") if publishable else None,
            "baselineReliability": pooled_model_rel.get("baselineReliability") if publishable else None,
            "directionalAgreement": pooled_model_rel.get("directionalAgreement") if publishable else None,
            "neutralShare": pooled_model_rel.get("neutralShare") if publishable else None,
            "coverageCount": total_repeat_coverage_count,
            "uniqueScenarios": total_repeat_coverage_count,
        }
        if isinstance(pooled_model_rel.get("perScenario"), dict) and pooled_model_rel["perScenario"]:
            reliability_per_model[model_id]["perScenario"] = pooled_model_rel["perScenario"]
        if isinstance(pooled_model_rel.get("perPair"), dict) and pooled_model_rel["perPair"]:
            reliability_per_model[model_id]["perPair"] = pooled_model_rel["perPair"]

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

    # Scenario dimension values live at scenario.content.dimension_values in
    # the transcript payload (see Definition.content schema v1). The legacy
    # fallback to scenario.dimensions is kept so older payloads still work.
    scenario_dimensions_by_id: dict[str, dict[str, Any]] = {}
    for transcript in transcripts:
        scenario_id = transcript.get("scenarioId")
        scenario = transcript.get("scenario") if isinstance(transcript.get("scenario"), dict) else None
        dimensions: dict[str, Any] | None = None
        if scenario is not None:
            content = scenario.get("content")
            if isinstance(content, dict):
                raw = content.get("dimension_values")
                if isinstance(raw, dict):
                    dimensions = raw
            if dimensions is None:
                legacy = scenario.get("dimensions")
                if isinstance(legacy, dict):
                    dimensions = legacy
        if isinstance(scenario_id, str) and scenario_id not in scenario_dimensions_by_id and dimensions is not None:
            scenario_dimensions_by_id[scenario_id] = dimensions

    run_context: dict[str, Any] | None = None
    if aggregate_semantics is not None:
        value_pair = data.get("valuePair")
        if isinstance(value_pair, dict):
            value_key = value_pair.get("valueA")
            opposing_value_key = value_pair.get("valueB")
            if isinstance(value_key, str) and value_key.strip() != "" and isinstance(opposing_value_key, str) and opposing_value_key.strip() != "":
                planned_ids = aggregate_semantics.get("plannedScenarioIds", [])
                primary_condition_ids = [
                    item
                    for item in planned_ids
                    if isinstance(item, str) and item.strip() != ""
                ] if isinstance(planned_ids, list) else []
                run_context = {
                    "targetAnalysisRunId": run_id,
                    "targetCompanionRunId": data.get("targetCompanionRunId"),
                    "valueKey": value_key,
                    "opposingValueKey": opposing_value_key,
                    "primaryConditionIds": primary_condition_ids,
                    "companionConditionIds": list(primary_condition_ids),
                    "scenarioDimensionsById": scenario_dimensions_by_id,
                }

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
                run_context=run_context,
            )
        else:
            reliability_summary = build_reliability_summary(variance_analysis, run_context=run_context)

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
            "methodsUsed": build_methods_used(),
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
