#!/usr/bin/env python3
"""
Compute Token Stats Worker - Updates model token statistics after run completion.

Computes average input/output tokens per model from completed probes,
using exponential moving average (EMA) to weight recent data.

Protocol:
- Reads JSON input from stdin
- Writes JSON output to stdout
- Logs structured JSON to stderr

Input format:
{
  "runId": string,
  "probeResults": [
    {
      "modelId": string,
      "inputTokens": number,
      "outputTokens": number
    }
  ],
  "existingStats": {
    "<modelId>": {
      "avgInputTokens": number,
      "avgOutputTokens": number,
      "sampleCount": number
    }
  }
}

Output format:
{
  "success": true,
  "stats": {
    "<modelId>": {
      "avgInputTokens": number,
      "avgOutputTokens": number,
      "sampleCount": number
    }
  },
  "summary": {
    "modelsUpdated": number,
    "totalProbesProcessed": number
  }
}
"""

import json
import sys
import time
from typing import Any

from common.errors import ErrorCode, ValidationError
from common.logging import get_logger

log = get_logger("compute_token_stats")

# EMA weight for new data (0.3 = 30% weight on new data)
EMA_ALPHA = 0.3


def validate_input(data: dict[str, Any]) -> None:
    """Validate compute token stats input."""
    if "runId" not in data:
        raise ValidationError(message="Missing required field: runId")

    if "probeResults" not in data:
        raise ValidationError(message="Missing required field: probeResults")

    if not isinstance(data["probeResults"], list):
        raise ValidationError(message="probeResults must be an array")

    # existingStats is optional, defaults to empty dict


def compute_new_average(
    old_avg: float,
    old_count: int,
    new_values: list[float],
    alpha: float = EMA_ALPHA,
) -> tuple[float, int]:
    """
    Compute new average using exponential moving average.

    - alpha weight controls how much new data affects the average
    - Provides smooth updates without overreacting to outliers

    Args:
        old_avg: Previous average value
        old_count: Number of samples in previous average
        new_values: List of new values to incorporate
        alpha: Weight for new data (0-1, default 0.3)

    Returns:
        Tuple of (new_average, new_sample_count)
    """
    if len(new_values) == 0:
        return old_avg, old_count

    new_avg = sum(new_values) / len(new_values)
    new_count = len(new_values)

    if old_count == 0:
        # First data point - just use new average
        return new_avg, new_count

    # EMA: combined = alpha * new + (1 - alpha) * old
    combined_avg = alpha * new_avg + (1 - alpha) * old_avg
    combined_count = old_count + new_count

    return combined_avg, combined_count


def group_probes_by_model(
    probe_results: list[dict[str, Any]],
) -> dict[str, dict[str, list[int]]]:
    """
    Group probe results by model ID, collecting token counts.

    Args:
        probe_results: List of probe result records

    Returns:
        Dict mapping modelId to {"input": [tokens], "output": [tokens]}
    """
    grouped: dict[str, dict[str, list[int]]] = {}

    for probe in probe_results:
        model_id = probe.get("modelId")
        input_tokens = probe.get("inputTokens")
        output_tokens = probe.get("outputTokens")

        # Skip probes with missing data
        if not model_id:
            continue
        if input_tokens is None or output_tokens is None:
            continue
        if not isinstance(input_tokens, (int, float)) or not isinstance(
            output_tokens, (int, float)
        ):
            continue

        if model_id not in grouped:
            grouped[model_id] = {"input": [], "output": []}

        grouped[model_id]["input"].append(int(input_tokens))
        grouped[model_id]["output"].append(int(output_tokens))

    return grouped


def compute_stats(
    probe_results: list[dict[str, Any]],
    existing_stats: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """
    Compute new token statistics for each model.

    Args:
        probe_results: List of probe results with token data
        existing_stats: Map of modelId to existing statistics

    Returns:
        Dict mapping modelId to updated statistics
    """
    # Group probes by model
    grouped = group_probes_by_model(probe_results)

    if len(grouped) == 0:
        log.warn("No valid probe results with token data")
        return {}

    # Compute new stats for each model
    result: dict[str, dict[str, Any]] = {}

    for model_id, tokens in grouped.items():
        input_tokens = tokens["input"]
        output_tokens = tokens["output"]

        # Get existing stats or defaults
        existing = existing_stats.get(model_id, {})
        old_avg_input = existing.get("avgInputTokens", 0)
        old_avg_output = existing.get("avgOutputTokens", 0)
        old_count = existing.get("sampleCount", 0)

        # Compute new averages using EMA
        new_avg_input, _ = compute_new_average(old_avg_input, old_count, input_tokens)
        new_avg_output, new_count = compute_new_average(
            old_avg_output, old_count, output_tokens
        )

        result[model_id] = {
            "avgInputTokens": round(new_avg_input, 2),
            "avgOutputTokens": round(new_avg_output, 2),
            "sampleCount": new_count,
        }

        log.debug(
            f"Model {model_id}: input {old_avg_input:.1f} -> {new_avg_input:.1f}, "
            f"output {old_avg_output:.1f} -> {new_avg_output:.1f}, "
            f"samples {old_count} -> {new_count}",
            modelId=model_id,
            oldAvgInput=old_avg_input,
            newAvgInput=new_avg_input,
            oldAvgOutput=old_avg_output,
            newAvgOutput=new_avg_output,
        )

    return result


def main() -> None:
    """Main entry point for compute_token_stats worker."""
    start_time = time.time()

    try:
        # Read input from stdin
        try:
            input_data = json.load(sys.stdin)
        except json.JSONDecodeError as err:
            output = {
                "success": False,
                "error": {
                    "message": f"Invalid JSON input: {err}",
                    "code": ErrorCode.VALIDATION_ERROR.value,
                    "retryable": False,
                },
            }
            print(json.dumps(output))
            return

        run_id = input_data.get("runId", "unknown")
        log.info("Processing compute_token_stats job", runId=run_id)

        # Validate input
        try:
            validate_input(input_data)
        except ValidationError as err:
            output = {"success": False, "error": err.to_dict()}
            print(json.dumps(output))
            return

        probe_results = input_data["probeResults"]
        existing_stats = input_data.get("existingStats", {})

        log.info(
            f"Computing stats from {len(probe_results)} probe results",
            runId=run_id,
            probeCount=len(probe_results),
            existingModels=len(existing_stats),
        )

        # Compute new statistics
        new_stats = compute_stats(probe_results, existing_stats)

        # Calculate summary
        total_probes = sum(
            len(group_probes_by_model(probe_results).get(m, {}).get("input", []))
            for m in new_stats.keys()
        )

        duration_ms = int((time.time() - start_time) * 1000)

        log.info(
            f"Stats computation complete: {len(new_stats)} models updated",
            runId=run_id,
            modelsUpdated=len(new_stats),
            totalProbes=total_probes,
            durationMs=duration_ms,
        )

        # Output success result
        output = {
            "success": True,
            "stats": new_stats,
            "summary": {
                "modelsUpdated": len(new_stats),
                "totalProbesProcessed": total_probes,
                "durationMs": duration_ms,
            },
        }
        print(json.dumps(output))

    except Exception as e:
        log.error(f"Unexpected error: {str(e)}", err={"type": type(e).__name__, "message": str(e)})
        output = {
            "success": False,
            "error": {
                "message": str(e),
                "code": "UNKNOWN",
                "retryable": True,
            },
        }
        print(json.dumps(output))


if __name__ == "__main__":
    main()
