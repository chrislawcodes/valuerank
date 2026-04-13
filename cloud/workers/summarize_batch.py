#!/usr/bin/env python3
"""Batch entrypoint for the summarize worker.
Reads JSON from stdin and writes JSON to stdout.
"""

import json
import sys
from typing import Any

from common.errors import ErrorCode, ValidationError, classify_exception
from common.logging import get_logger
from summarize import (
    MAX_SUMMARIZE_BATCH_SIZE,
    _validation_error,
    is_batch_envelope,
    run_summarize,
    validate_input,
)

log = get_logger("summarize")


def run_summarize_batch(data: dict[str, Any]) -> dict[str, Any]:
    """Execute summarization for a batch of transcripts."""
    if not isinstance(data, dict):
        return {
            "success": False,
            "error": _validation_error("Batch input must be an object"),
        }

    transcripts = data.get("transcripts", [])
    if not isinstance(transcripts, list):
        return {
            "success": False,
            "error": _validation_error("transcripts must be an array"),
        }
    if len(transcripts) > MAX_SUMMARIZE_BATCH_SIZE:
        return {
            "success": False,
            "error": _validation_error(
                f"Batch size exceeds maximum of {MAX_SUMMARIZE_BATCH_SIZE}"
            ),
        }

    summaries: list[dict[str, Any]] = []
    failure_count = 0
    retryable_failure = False

    for batch_index, item in enumerate(transcripts):
        if not isinstance(item, dict):
            failure_count += 1
            summaries.append(
                {
                    "transcriptId": None,
                    "batchIndex": batch_index,
                    "success": False,
                    "error": _validation_error("Transcript item must be an object"),
                }
            )
            continue

        transcript_id = item.get("transcriptId")
        try:
            validate_input(item)
            result = run_summarize(item)
        except ValidationError as err:
            result = {
                "success": False,
                "error": err.to_dict(),
            }
        except Exception as err:
            worker_err = classify_exception(err)
            result = {
                "success": False,
                "error": worker_err.to_dict(),
            }

        if not result.get("success", False):
            failure_count += 1
            error = result.get("error")
            if isinstance(error, dict) and error.get("retryable") is True:
                retryable_failure = True

        summaries.append(
            {
                "transcriptId": transcript_id,
                "batchIndex": batch_index,
                **result,
            }
        )

    if failure_count > 0:
        return {
            "success": False,
            "error": {
                "message": f"{failure_count} transcript(s) failed",
                "code": "BATCH_PARTIAL_FAILURE",
                "retryable": retryable_failure,
                "details": {
                    "failedCount": failure_count,
                    "totalCount": len(transcripts),
                    "maxBatchSize": MAX_SUMMARIZE_BATCH_SIZE,
                },
            },
            "summaries": summaries,
        }

    return {
        "success": True,
        "summaries": summaries,
    }


def main() -> None:
    """Read JSON from stdin and write JSON to stdout."""
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            print(
                json.dumps(
                    {
                        "success": False,
                        "error": _validation_error("No input provided"),
                    }
                )
            )
            return

        try:
            data = json.loads(input_data)
        except json.JSONDecodeError as err:
            print(
                json.dumps(
                    {
                        "success": False,
                        "error": _validation_error(f"Invalid JSON input: {err}"),
                    }
                )
            )
            return

        if isinstance(data, dict):
            if "transcripts" in data:
                if not is_batch_envelope(data):
                    print(
                        json.dumps(
                            {
                                "success": False,
                                "error": _validation_error(
                                    "Batch envelopes cannot include transcriptId or transcriptContent"
                                ),
                            }
                        )
                    )
                    return

                result = run_summarize_batch(data)
            else:
                try:
                    validate_input(data)
                except ValidationError as err:
                    print(json.dumps({"success": False, "error": err.to_dict()}))
                    return

                result = run_summarize(data)
        else:
            print(
                json.dumps(
                    {
                        "success": False,
                        "error": _validation_error("Input must be a JSON object"),
                    }
                )
            )
            return

        print(json.dumps(result))

    except Exception as err:
        log.error("Unexpected error in summarize worker", err=err)
        print(
            json.dumps(
                {
                    "success": False,
                    "error": {
                        "message": str(err),
                        "code": ErrorCode.UNKNOWN.value,
                        "retryable": True,
                        "details": type(err).__name__,
                    },
                }
            )
        )
