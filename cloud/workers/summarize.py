#!/usr/bin/env python3
"""Summarize worker.
Reads JSON from stdin and writes JSON to stdout.
"""

import hashlib
from typing import Any

from common.errors import ErrorCode, LLMError, ValidationError, WorkerError, classify_exception
from common.logging import get_logger
from common.llm_adapters import generate as llm_generate
from summarize_extract import (
    PARSER_VERSION,
    collect_scale_labels,
    extract_decision_code,
    extract_decision_code_from_text,
    extract_leading_decision_code,
    extract_leading_text_label_decision,
    extract_leading_text_label_decision_relaxed,
    extract_text_label_decision,
    extract_text_label_decision_relaxed,
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
    response_text = build_response_text(transcript_content)
    response_hash = (
        hashlib.sha256(response_text.encode("utf-8")).hexdigest() if response_text else None
    )
    scale_labels = collect_scale_labels(transcript_content)

    leading_decision_code = extract_leading_decision_code(response_text)
    decision_code = leading_decision_code or extract_decision_code(transcript_content)
    decision_source = "deterministic"
    parse_class = "exact"
    parse_path = "numeric_leading" if leading_decision_code is not None else "numeric_deterministic"
    matched_label = None

    # If scale labels are present and the numeric result is not a valid scale code,
    # treat it as unresolved so label matching and LLM fallback can run.
    # This catches false positives like "(152 words)" appended by some models.
    if scale_labels and decision_code not in {"other", "refusal"}:
        valid_codes = {entry["code"] for entry in scale_labels if entry.get("code")}
        if decision_code not in valid_codes:
            decision_code = "other"

    if decision_code == "other" and scale_labels:
        text_label_code, matched_label, leading_text_label_path = (
            extract_leading_text_label_decision(response_text, scale_labels)
        )
        if text_label_code is not None:
            decision_code = text_label_code
            parse_path = leading_text_label_path or "text_label_exact"
        else:
            text_label_code, matched_label = extract_text_label_decision(response_text, scale_labels)
            if text_label_code is not None:
                decision_code = text_label_code
                parse_path = "text_label_exact"
            else:
                # Relaxed matching: strip filler words (their/the/a/an) before comparing.
                # Catches models that paraphrase slightly (e.g. "recognition of expertise"
                # instead of "recognition of their expertise").
                relaxed_code, matched_label, relaxed_path = (
                    extract_leading_text_label_decision_relaxed(response_text, scale_labels)
                )
                if relaxed_code is not None:
                    decision_code = relaxed_code
                    parse_path = relaxed_path or "text_label_relaxed"
                else:
                    relaxed_code, matched_label = extract_text_label_decision_relaxed(
                        response_text, scale_labels
                    )
                    if relaxed_code is not None:
                        decision_code = relaxed_code
                        parse_path = "text_label_relaxed"
                    else:
                        parse_class = "ambiguous"
                        parse_path = "text_label_ambiguous"
    elif decision_code == "other":
        parse_class = "ambiguous"
        parse_path = "numeric_ambiguous"

    metadata = {
        "parserVersion": PARSER_VERSION,
        "parseClass": parse_class,
        "parsePath": parse_path,
        "responseSha256": response_hash,
        "responseExcerpt": response_excerpt(response_text) if response_text else None,
        "matchedLabel": matched_label,
        "scaleLabels": scale_labels,
    }

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
        decision_code = decision_result["decisionCode"]
        decision_source = decision_result["decisionSource"]
        decision_metadata = decision_result["decisionMetadata"]

        # Log appropriate message based on what we found (or didn't find)
        if decision_metadata["parsePath"] in {"text_label_exact", "text_label_leading"}:
            log.info(
                "Resolved decision code from text scale label",
                transcriptId=transcript_id,
                rating=decision_code,
                matchedLabel=decision_metadata["matchedLabel"],
            )
        elif decision_source == "llm":
            log.info(
                "Resolved decision code with fallback LLM",
                transcriptId=transcript_id,
                rating=decision_code,
                fallbackModel=LLM_FALLBACK_MODEL,
            )
        elif decision_metadata["parseClass"] == "ambiguous":
            log.info(
                "Could not extract deterministic rating from transcript",
                transcriptId=transcript_id,
            )
        else:
            log.info(
                "Extracted deterministic rating",
                transcriptId=transcript_id,
                rating=decision_code,
            )

        # DEPRECATED: We no longer generate decision text
        decision_text = None

        log.info(
            "Summarization completed",
            transcriptId=transcript_id,
            decisionCode=decision_code,
            decisionSource=decision_source,
        )

        return {
            "success": True,
            "summary": {
                "decisionCode": decision_code,
                "decisionSource": decision_source,
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
