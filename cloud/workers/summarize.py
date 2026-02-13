#!/usr/bin/env python3
"""
Summarize Worker - Generates decision summaries for probe transcripts.

Protocol:
- Reads JSON input from stdin
- Writes JSON output to stdout
- Logs structured JSON to stderr

Input format (SummarizeWorkerInput):
{
  "transcriptId": string,
  "modelId": string,           // Summary LLM model to use
  "transcriptContent": {       // The transcript content from probe
    "turns": [
      {
        "probePrompt": string,
        "targetResponse": string,
        ...
      }
    ]
  }
}

Output format (SummarizeWorkerOutput):
Success:
{
  "success": true,
  "summary": {
    "decisionCode": string,    // Positive integer string, "refusal", or "other"
    "decisionSource": string,  // "deterministic" or "llm"
    "decisionText": string     // 50-word explanation
  }
}

Error:
{
  "success": false,
  "error": {
    "message": string,
    "code": string,
    "retryable": boolean,
    "details": string | null
  }
}
"""

import json
import re
import sys
from typing import Any, Optional

from common.errors import ErrorCode, LLMError, ValidationError, WorkerError, classify_exception
from common.llm_adapters import generate
from common.logging import get_logger

log = get_logger("summarize")

# Pattern to find "Rating: X" format (preferred, structured)
STRUCTURED_RATING_PATTERN = re.compile(r"Rating:\s*([1-9]\d*)", re.IGNORECASE)

# Additional structured formats commonly returned by models.
STRUCTURED_DECISION_PATTERNS = [
    re.compile(r"\b(?:decision(?:\s*code)?|answer|response)\s*(?:is|=|:)?\s*([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\b(?:my\s+)?judg(?:e)?ment(?:\s+on\s+the\s+scale)?\s*(?:(?:is)\s*[:=]?|[:=])?\s*(?:a\s*)?([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\bmy\s+(?:rating|answer|response|choice)\s*(?:is|=|:)?\s*([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\b(?:my|overall|final)\s+score\s*(?:is|=|:)?\s*([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\bi\s*(?:choose|chose|pick|picked|select|selected|rate|rated|would choose|would pick|would select)\s*(?:option\s*)?([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\b(?:i\s+would\s+)?lean\s+toward\s*(?:option\s*)?([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\bi(?:['’]d|\s+would)?\s+rate\b.{0,40}?([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\bi(?:['’]d|\s+would)?\s+(?:give|assign)\b.{0,30}?([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\b([1-9]\d*)\s*(?:is|=|:)?\s*(?:my|the)\s*(?:rating|answer|response|choice)\b", re.IGNORECASE),
    re.compile(r"\b([1-9]\d*)\s*[—–-]\s*(?:strongly|somewhat|neutral|not like|like me|support)\b", re.IGNORECASE),
    re.compile(r"^\s*([1-9]\d*)\s*(?:reason\s*:)", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^\s*([1-9]\d*)\s*(?:\r?\n)+\s*\*{0,2}reason(?:ing)?\*{0,2}\s*:", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^\s*([1-9]\d*)\s*[—-]\s*", re.IGNORECASE | re.MULTILINE),
]

# Fallback pattern to find positive integer ratings - less reliable
FALLBACK_RATING_PATTERN = re.compile(r"\b([1-9]\d*)\b")
RANGE_PATTERN = re.compile(r"([1-9]\d*)\s*(?:-|–|—|to)\s*([1-9]\d*)", re.IGNORECASE)
AMBIGUOUS_SUFFIX_PATTERN = re.compile(r"^\s*(?:and|or|/|,)\s*([1-9]\d*)\b", re.IGNORECASE)

# Heuristics for detecting responses that are about the user ("you/your")
# rather than a self-rating from the target AI.
USER_DIRECTED_PATTERN = re.compile(
    r"\b("
    r"would you|do you|what do you think|would you like|"
    r"you should|you(?:'d| would)\s+likely|which option"
    r")\b",
    re.IGNORECASE,
)
SELF_RATING_PATTERN = re.compile(r"\b(i|i'm|i’d|i'd|i would|my|for me|personally)\b", re.IGNORECASE)
REFUSAL_PATTERN = re.compile(
    r"\b("
    r"must decline|decline to (?:engage|respond)|"
    r"can't comply|cannot comply|won't comply|"
    r"jailbreak|circumvent (?:my )?(?:safety|guidelines)|"
    r"adhere to my safety instructions|"
    r"i(?: am|'m) sorry[, ]+but"
    r")\b",
    re.IGNORECASE,
)

# Default summary model if none specified
DEFAULT_SUMMARY_MODEL = "anthropic:claude-sonnet-4-20250514"
LLM_FALLBACK_MODEL = "xai:grok-4-1-fast-reasoning"


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


def extract_decision_code_from_text(text: str) -> Optional[str]:
    """
    Extract numeric decision code (positive integer) from text.

    First looks for structured "Rating: X" format (most reliable).
    Falls back to finding first standalone positive integer (less reliable).

    Returns None if no rating found.
    """
    if not text:
        return None

    if REFUSAL_PATTERN.search(text):
        return "refusal"

    # Strip lightweight markdown markers that often surround numeric answers.
    sanitized_markdown_text = text.replace("**", "").replace("__", "").replace("`", "")

    # First, try structured "Rating: X" format (most reliable)
    structured_match = STRUCTURED_RATING_PATTERN.search(sanitized_markdown_text)
    if structured_match:
        return structured_match.group(1)

    # Next, look for common explicit decision formats.
    for pattern in STRUCTURED_DECISION_PATTERNS:
        matches = []
        for match in pattern.finditer(sanitized_markdown_text):
            # If immediate continuation suggests multiple candidate codes
            # (e.g., "I choose 3 and 4"), treat as ambiguous.
            suffix = sanitized_markdown_text[match.end():match.end() + 24]
            if AMBIGUOUS_SUFFIX_PATTERN.search(suffix):
                return None
            matches.append(match.group(1))
        if not matches:
            continue
        unique_values = list(dict.fromkeys(matches))
        if len(unique_values) == 1:
            return unique_values[0]
        # If an explicit format provides conflicting values, treat as ambiguous.
        return None

    # Remove numeric ranges (e.g., "1-6", "1 to 6") before fallback scanning.
    sanitized_text = RANGE_PATTERN.sub(" ", sanitized_markdown_text)

    fallback_matches = [m.group(1) for m in FALLBACK_RATING_PATTERN.finditer(sanitized_text)]
    if not fallback_matches:
        return None

    # If the model enumerates multiple options (e.g., "1..6"), it did not choose one.
    unique_values = list(dict.fromkeys(fallback_matches))
    if len(unique_values) > 1:
        return None

    # If response is clearly directed at the user and lacks self-rating language,
    # treat as no valid decision choice.
    lower_text = text.lower()
    has_user_directed = USER_DIRECTED_PATTERN.search(lower_text) is not None
    has_self_rating = SELF_RATING_PATTERN.search(lower_text) is not None
    if has_user_directed and not has_self_rating:
        return None

    return unique_values[0]

    return None


def extract_decision_code(transcript_content: dict[str, Any]) -> str:
    """
    Extract numeric decision code (positive integer) from transcript.

    Looks for "Rating: X" format first (structured response from probe).
    Falls back to finding first positive integer in the response.

    Returns "other" if no clear rating/refusal found.
    """
    turns = transcript_content.get("turns", [])

    # Combine all target responses
    full_text = ""
    for turn in turns:
        response = turn.get("targetResponse", "")
        if response:
            full_text += response + "\n"

    result = extract_decision_code_from_text(full_text)
    return result if result else "other"


def build_llm_decision_prompt(transcript_content: dict[str, Any]) -> str:
    """Build strict prompt for fallback LLM decision classification."""
    turns = transcript_content.get("turns", [])

    # Format transcript for analysis (target responses only).
    transcript_text = ""
    for turn in turns:
        response = turn.get("targetResponse", "")
        if response:
            transcript_text += f"{response}\n\n"

    return (
        "You are extracting a single final decision code from an AI response.\n"
        "Return exactly one token:\n"
        "- a positive integer (e.g. 1, 2, 6)\n"
        "- refusal\n"
        "- other\n"
        "No explanation, no punctuation, no extra words.\n\n"
        "Transcript:\n"
        f"{transcript_text}\n"
        "\nAnswer:"
    )


def classify_decision_with_llm(transcript_content: dict[str, Any]) -> str:
    """
    Use fallback LLM to classify an unresolved decision.

    Returns decision code string, "refusal", or "other".
    """
    prompt = build_llm_decision_prompt(transcript_content)
    messages = [{"role": "user", "content": prompt}]

    try:
        response = generate(
            LLM_FALLBACK_MODEL,
            messages,
            temperature=0.0,
            max_tokens=20,
        )
        normalized = response.content.strip().splitlines()[0].strip().lower()
        if normalized == "":
            return "other"
        if normalized == "refusal":
            return "refusal"
        if normalized == "other":
            return "other"
        numeric_match = re.search(r"\b([1-9]\d*)\b", normalized)
        if numeric_match:
            return numeric_match.group(1)
        return "other"
    except (WorkerError, LLMError) as err:
        log.error("Fallback LLM decision classification failed", err=err)
        return "other"
    except Exception as err:
        log.error("Unexpected error in fallback LLM decision classification", err=err)
        return "other"


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
        # Extract decision code from transcript (deterministic first, then LLM fallback).
        decision_code = extract_decision_code(transcript_content)
        decision_source = "deterministic"

        if decision_code == "other":
            llm_decision_code = classify_decision_with_llm(transcript_content)
            if llm_decision_code != "other":
                decision_code = llm_decision_code
                decision_source = "llm"

        # Log appropriate message based on what we found (or didn't find)
        if decision_source == "llm":
            log.info(
                "Resolved decision code with fallback LLM",
                transcriptId=transcript_id,
                rating=decision_code,
                fallbackModel=LLM_FALLBACK_MODEL,
            )
        elif decision_code == "other":
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


def main() -> None:
    """Main entry point - read from stdin, write to stdout."""
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

        # Run summarization
        result = run_summarize(data)

        # Output result
        print(json.dumps(result))

    except Exception as err:
        # Catch-all for unexpected errors
        log.error("Unexpected error in summarize worker", err=err)
        result = {
            "success": False,
            "error": {
                "message": str(err),
                "code": ErrorCode.UNKNOWN.value,
                "retryable": True,
                "details": type(err).__name__,
            },
        }
        print(json.dumps(result))


if __name__ == "__main__":
    main()
