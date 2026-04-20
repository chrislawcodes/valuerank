#!/usr/bin/env python3
"""Summarize worker.
Reads JSON from stdin and writes JSON to stdout.
"""

import hashlib
from typing import Any, Optional

from common.errors import ErrorCode, LLMError, ValidationError, WorkerError, classify_exception
from common.logging import get_logger
from common.llm_adapters import generate as llm_generate
from summarize_extract import (
    PARSER_VERSION,
    collect_scale_labels,
    # Retained as re-exports for test-level coverage of the parser primitives.
    # They are NOT called from extract_decision_result anymore — the probe
    # no longer presents 1-5 numeric labels, so numeric extraction caused more
    # false positives than true matches (e.g. latching onto inline "~1%").
    extract_decision_code,  # noqa: F401 — re-export for tests
    extract_decision_code_from_text,  # noqa: F401 — re-export for tests
    extract_leading_decision_code,  # noqa: F401 — re-export for tests
    extract_leading_text_label_decision,
    extract_leading_text_label_decision_relaxed,
    extract_text_label_decision,
    extract_text_label_decision_distinctive_tail,
    extract_text_label_decision_relaxed,
    is_refusal,
)
from summarize_llm import (
    DEFAULT_SUMMARY_MODEL,
    LLM_FALLBACK_MODEL,
    build_llm_decision_prompt,
)
from summarize_text import build_response_text, response_excerpt

log = get_logger("summarize")

# Compatibility hook for tests that patch `summarize.generate`.
generate = llm_generate

# Keep batch size aligned with the API-side PgBoss worker batch size ceiling.
MAX_SUMMARIZE_BATCH_SIZE = 500


def _validation_error(message: str, details: str | None = None) -> dict[str, Any]:
    return {
        "message": message,
        "code": ErrorCode.VALIDATION_ERROR.value,
        "retryable": False,
        "details": details,
    }


def validate_input(data: dict[str, Any]) -> None:
    """Validate summarize worker input."""
    required = ["transcriptId", "transcriptContent"]
    for field_name in required:
        if field_name not in data:
            raise ValidationError(
                message=f"Missing required field: {field_name}",
                details=f"Input must include: {', '.join(required)}",
            )

    content = data["transcriptContent"]
    if not isinstance(content, dict):
        raise ValidationError(message="transcriptContent must be an object")

    if "turns" not in content or not isinstance(content["turns"], list):
        raise ValidationError(message="transcriptContent.turns must be an array")


def is_batch_envelope(data: dict[str, Any]) -> bool:
    """Return True when the input is a batch-only worker envelope."""
    has_batch_field = "transcripts" in data
    has_single_fields = "transcriptId" in data or "transcriptContent" in data
    return has_batch_field and not has_single_fields


def extract_decision_result(transcript_content: dict[str, Any]) -> dict[str, Any]:
    """
    Parse a transcript's response text into decisionMetadata.

    The probe no longer presents 1-5 numeric labels — only bullets with
    verbatim text (e.g. "Strongly support choosing the approach relating
    to stewardship of the natural world"). So the parser tries text-label
    matching first (exact / leading / relaxed / distinctive-tail) and
    never scans for bare digits. Numeric-digit parsing was removed because
    it generated false positives on inline statistics like "~1%" or "data
    centers use 1% of electricity", landing wrong decisionCodes.

    Flow:
      1. Text-label matching against the probe's scale_labels.
      2. If no text match, check refusal pattern.
      3. Otherwise declare unparseable.
    """
    response_text = build_response_text(transcript_content)
    response_hash = (
        hashlib.sha256(response_text.encode("utf-8")).hexdigest() if response_text else None
    )
    scale_labels = collect_scale_labels(transcript_content)

    decision_source = "deterministic"
    matched_label: Optional[str] = None
    decision_code: str = "other"
    parse_class: str = "ambiguous"
    parse_path: str = "text_label_ambiguous"

    if scale_labels:
        text_label_code, matched_label_candidate, leading_text_label_path = (
            extract_leading_text_label_decision(response_text, scale_labels)
        )
        if text_label_code is not None:
            decision_code = text_label_code
            matched_label = matched_label_candidate
            parse_class = "exact"
            parse_path = leading_text_label_path or "text_label_exact"
        else:
            text_label_code, matched_label_candidate = extract_text_label_decision(
                response_text, scale_labels
            )
            if text_label_code is not None:
                decision_code = text_label_code
                matched_label = matched_label_candidate
                parse_class = "exact"
                parse_path = "text_label_exact"
            else:
                relaxed_code, relaxed_matched_label, relaxed_path = (
                    extract_leading_text_label_decision_relaxed(response_text, scale_labels)
                )
                if relaxed_code is not None:
                    decision_code = relaxed_code
                    matched_label = relaxed_matched_label
                    parse_class = "exact"
                    parse_path = relaxed_path or "text_label_relaxed"
                else:
                    relaxed_code, relaxed_matched_label = extract_text_label_decision_relaxed(
                        response_text, scale_labels
                    )
                    if relaxed_code is not None:
                        decision_code = relaxed_code
                        matched_label = relaxed_matched_label
                        parse_class = "exact"
                        parse_path = "text_label_relaxed"
                    else:
                        tail_code, tail_matched_label = (
                            extract_text_label_decision_distinctive_tail(
                                response_text, scale_labels
                            )
                        )
                        if tail_code is not None:
                            decision_code = tail_code
                            matched_label = tail_matched_label
                            parse_class = "exact"
                            parse_path = "text_label_distinctive_tail"

    is_refusal_response = is_refusal(response_text)
    if parse_class == "ambiguous" and is_refusal_response:
        decision_code = "refusal"
        parse_path = "refusal_detected"

    metadata = {
        "parserVersion": PARSER_VERSION,
        "parseClass": parse_class,
        "parsePath": parse_path,
        "responseSha256": response_hash,
        "responseExcerpt": response_excerpt(response_text) if response_text else None,
        "matchedLabel": matched_label,
        "scaleLabels": scale_labels,
        # First-class refusal signal. The TS resolver reads this via
        # RawDecisionEvidence.refusal and returns a refusal canonical.
        # Replaces the legacy decisionCode == "refusal" encoding.
        "refusal": is_refusal_response,
    }

    # `decisionCode` and `decisionSource` are kept here for internal use by
    # test assertions and parser debugging only. They are NOT forwarded into
    # `run_summarize`'s output dict — the TS write path explicitly ignores
    # them. The authoritative decision signal that reaches TS is
    # `decisionMetadata` (including `refusal`), from which TS builds the
    # canonical decision via `resolveCanonicalDecision`.
    return {
        "decisionCode": decision_code,
        "decisionSource": decision_source,
        "decisionMetadata": metadata,
    }


def run_summarize(data: dict[str, Any]) -> dict[str, Any]:
    """
    Execute the summarization.

    Args:
        data: Validated summarize worker input

    Returns:
        Success response with summary or error response
    """
    transcript_id = data["transcriptId"]
    model_id = data.get("modelId", DEFAULT_SUMMARY_MODEL)
    transcript_content = data["transcriptContent"]

    log.info(
        "Starting summarization",
        transcriptId=transcript_id,
        modelId=model_id,
    )

    try:
        decision_result = extract_decision_result(transcript_content)
        decision_metadata = decision_result["decisionMetadata"]

        # Log appropriate message based on what we found (or didn't find)
        if decision_metadata["parsePath"] in {"text_label_exact", "text_label_leading"}:
            log.info(
                "Resolved decision from text scale label",
                transcriptId=transcript_id,
                matchedLabel=decision_metadata["matchedLabel"],
                parsePath=decision_metadata["parsePath"],
            )
        elif decision_metadata["parseClass"] == "ambiguous":
            log.info(
                "Could not extract deterministic rating from transcript",
                transcriptId=transcript_id,
            )
        elif decision_metadata.get("refusal"):
            log.info(
                "Detected refusal response",
                transcriptId=transcript_id,
            )
        else:
            log.info(
                "Extracted deterministic rating",
                transcriptId=transcript_id,
                parsePath=decision_metadata["parsePath"],
            )

        # DEPRECATED: We no longer generate decision text
        decision_text = None

        log.info(
            "Summarization completed",
            transcriptId=transcript_id,
            parsePath=decision_metadata["parsePath"],
        )

        return {
            "success": True,
            "summary": {
                "decisionText": decision_text,
                "decisionMetadata": decision_metadata,
            },
        }

    except (WorkerError, LLMError) as err:
        log.error("Summarization failed", transcriptId=transcript_id, err=err)
        return {
            "success": False,
            "error": err.to_dict(),
        }
    except Exception as err:
        worker_err = classify_exception(err)
        log.error("Summarization failed with unexpected error", transcriptId=transcript_id, err=err)
        return {
            "success": False,
            "error": worker_err.to_dict(),
        }

if __name__ == "__main__":
    import summarize_batch

    summarize_batch.main()
