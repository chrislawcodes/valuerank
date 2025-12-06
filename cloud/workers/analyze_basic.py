#!/usr/bin/env python3
"""
Analyze Basic Worker - Stub for Tier 1 analysis.

This is a placeholder that returns success. Full implementation
will be added in Stage 11.

Protocol:
- Reads JSON input from stdin
- Writes JSON output to stdout
- Logs structured JSON to stderr

Input format:
{
  "runId": string,
  "transcriptIds": [string, ...]
}

Output format:
Success:
{
  "success": true,
  "analysis": {
    "status": "STUB",
    "message": "Full analysis will be implemented in Stage 11",
    "transcriptCount": number,
    "completedAt": string
  }
}
"""

import json
import sys
from datetime import datetime, timezone
from typing import Any

from common.errors import ErrorCode, ValidationError
from common.logging import get_logger

log = get_logger("analyze_basic")


def validate_input(data: dict[str, Any]) -> None:
    """Validate analyze basic input."""
    if "runId" not in data:
        raise ValidationError(message="Missing required field: runId")

    if "transcriptIds" not in data or not isinstance(data["transcriptIds"], list):
        raise ValidationError(message="transcriptIds must be an array")


def run_analysis(data: dict[str, Any]) -> dict[str, Any]:
    """Run stub analysis and return result."""
    run_id = data["runId"]
    transcript_ids = data["transcriptIds"]

    log.info(
        "Running stub analysis",
        runId=run_id,
        transcriptCount=len(transcript_ids),
    )

    # Stub implementation - just return success
    return {
        "success": True,
        "analysis": {
            "status": "STUB",
            "message": "Full analysis will be implemented in Stage 11",
            "transcriptCount": len(transcript_ids),
            "completedAt": datetime.now(timezone.utc).isoformat(),
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
        log.error("Analysis failed", err=err)
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
