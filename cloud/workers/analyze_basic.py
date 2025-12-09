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
from datetime import datetime, timezone
from typing import Any

from common.errors import ErrorCode, ValidationError
from common.logging import get_logger
from stats.basic_stats import aggregate_transcripts_by_model, compute_visualization_data
from stats.model_comparison import compute_model_agreement
from stats.dimension_impact import compute_dimension_analysis

log = get_logger("analyze_basic")

# Code version for reproducibility tracking
CODE_VERSION = "1.0.0"


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


def run_analysis(data: dict[str, Any]) -> dict[str, Any]:
    """Run full Tier 1 analysis and return result."""
    start_time = time.time()
    run_id = data["runId"]
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
            "modelAgreement": model_agreement,
            "dimensionAnalysis": dimension_analysis,
            "mostContestedScenarios": contested,
            "visualizationData": visualization_data,
            "methodsUsed": {
                "winRateCI": "wilson_score",
                "modelComparison": "spearman_rho",
                "pValueCorrection": "holm_bonferroni",
                "effectSize": "cohens_d",
                "dimensionTest": "kruskal_wallis",
                "alpha": 0.05,
                "codeVersion": CODE_VERSION,
            },
            "warnings": warnings,
            "computedAt": datetime.now(timezone.utc).isoformat(),
            "durationMs": duration_ms,
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
