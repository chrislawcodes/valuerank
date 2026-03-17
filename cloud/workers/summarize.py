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
import hashlib
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
LEADING_BARE_NUMBER_PATTERN = re.compile(r"^\s*([1-9]\d*)\s*(?:[.!?])?\s*$", re.IGNORECASE)

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
LEADING_DECISION_PREFIX_PATTERN = re.compile(
    r"^\s*(?:"
    r"(?:my\s+)?(?:final\s+|overall\s+)?(?:judg(?:e)?ment|answer|response|decision|choice|rating|score)"
    r"(?:\s+on\s+the\s+scale)?\s*(?:(?:is)\s*[:=]?|[:=])?\s*"
    r"|level\s+of\s+support\s*[:=]?\s*"
    r"|in\s+short\s*[:,-]?\s*"
    r"|overall\s*[:,-]?\s*"
    r")",
    re.IGNORECASE,
)

# Default summary model if none specified
DEFAULT_SUMMARY_MODEL = "anthropic:claude-sonnet-4-20250514"
LLM_FALLBACK_MODEL = "xai:grok-4-1-fast-reasoning"
PARSER_VERSION = "job-choice-v2"


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


def normalize_for_match(text: str) -> str:
    sanitized = text.replace("**", " ").replace("__", " ").replace("`", " ")
    sanitized = re.sub(r"[^a-z0-9]+", " ", sanitized.lower())
    return re.sub(r"\s+", " ", sanitized).strip()


def build_response_text(transcript_content: dict[str, Any]) -> str:
    turns = transcript_content.get("turns", [])
    responses: list[str] = []
    for turn in turns:
        response = turn.get("targetResponse", "")
        if isinstance(response, str) and response:
            responses.append(response)
    return "\n".join(responses).strip()


def response_excerpt(text: str, limit: int = 280) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    return compact[:limit]


def response_segments(text: str) -> list[str]:
    segments: list[str] = []
    for block in re.split(r"[\n\r]+", text):
        stripped = block.strip()
        if not stripped:
            continue
        segments.extend(
            sentence.strip()
            for sentence in re.split(r"(?<=[.!?])\s+", stripped)
            if sentence.strip()
        )
    return segments


def strip_leading_decision_prefix(text: str) -> str:
    if not text:
        return ""

    stripped = text.replace("**", "").replace("__", "").replace("`", "").strip()
    previous = None
    while stripped and stripped != previous:
        previous = stripped
        stripped = LEADING_DECISION_PREFIX_PATTERN.sub("", stripped, count=1).strip()
    return stripped


def leading_response_candidates(text: str) -> list[tuple[str, bool]]:
    if not text:
        return []

    candidates: list[tuple[str, bool]] = []
    lines = [line.strip() for line in re.split(r"[\n\r]+", text) if line.strip()]
    segments = response_segments(text)

    for candidate in [
        lines[0] if lines else "",
        segments[0] if segments else "",
    ]:
        if not candidate:
            continue
        stripped = strip_leading_decision_prefix(candidate)
        for value, used_prefix_stripping in [
            (candidate, False),
            (stripped, stripped != candidate),
        ]:
            if value and not any(existing == value for existing, _ in candidates):
                candidates.append((value, used_prefix_stripping))

    return candidates


def collect_scale_labels(transcript_content: dict[str, Any]) -> list[dict[str, str]]:
    turns = transcript_content.get("turns", [])
    for turn in turns:
        probe_prompt = turn.get("probePrompt")
        if not isinstance(probe_prompt, str) or probe_prompt.strip() == "":
            continue

        numbered_labels: list[dict[str, str]] = []
        bullet_labels: list[str] = []

        for raw_line in probe_prompt.splitlines():
            line = raw_line.strip()
            if line == "":
                continue

            numbered_match = re.match(r"^(?P<code>[1-9]\d*)\s*-\s*(?P<label>.+)$", line)
            if numbered_match:
                numbered_labels.append(
                    {
                        "code": numbered_match.group("code"),
                        "label": numbered_match.group("label").strip(),
                    }
                )
                continue

            bullet_match = re.match(r"^-\s+(?P<label>.+)$", line)
            if bullet_match:
                bullet_labels.append(bullet_match.group("label").strip())

        if len(numbered_labels) >= 5:
            return numbered_labels
        if len(bullet_labels) == 5:
            return [
                {"code": code, "label": label}
                for code, label in zip(["5", "4", "3", "2", "1"], bullet_labels)
            ]

    return []


def extract_text_label_decision(text: str, scale_labels: list[dict[str, str]]) -> tuple[Optional[str], Optional[str]]:
    if not text or not scale_labels:
        return None, None

    segments = response_segments(text)
    if not segments:
        return None, None

    normalized_labels = [
        {
            "code": entry.get("code", ""),
            "label": entry.get("label", ""),
            "normalized": normalize_for_match(entry.get("label", "")),
        }
        for entry in scale_labels
        if entry.get("label")
    ]

    for segment in segments:
        normalized_segment = normalize_for_match(segment)
        if normalized_segment == "":
            continue

        prefix_matches = [
            entry
            for entry in normalized_labels
            if entry["normalized"]
            and (
                normalized_segment == entry["normalized"]
                or normalized_segment.startswith(entry["normalized"] + " ")
            )
        ]

        unique_prefix_matches = list({entry["code"]: entry for entry in prefix_matches}.values())
        if len(unique_prefix_matches) == 1:
            match = unique_prefix_matches[0]
            return match["code"], match["label"]
        if len(unique_prefix_matches) > 1:
            return None, None

    return None, None


def extract_leading_decision_code(text: str) -> Optional[str]:
    for candidate, _used_prefix_stripping in leading_response_candidates(text):
        decision_code = extract_explicit_leading_decision_code(candidate)
        if decision_code is not None:
            return decision_code
    return None


def extract_leading_text_label_decision(
    text: str, scale_labels: list[dict[str, str]]
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    for candidate, used_prefix_stripping in leading_response_candidates(text):
        decision_code, matched_label = extract_text_label_decision(candidate, scale_labels)
        if decision_code is not None:
            parse_path = "text_label_leading" if used_prefix_stripping else "text_label_exact"
            return decision_code, matched_label, parse_path
    return None, None, None


def extract_decision_code_from_text(text: str) -> Optional[str]:
    """
    Extract numeric decision code (positive integer) from text.

    First looks for structured "Rating: X" format (most reliable).
    Falls back to finding first standalone positive integer (less reliable).

    Returns None if no rating found.
    """
    if not text:
        return None

    # Strip lightweight markdown markers that often surround numeric answers.
    sanitized_markdown_text = text.replace("**", "").replace("__", "").replace("`", "")

    # First, try structured "Rating: X" format (most reliable)
    structured_match = STRUCTURED_RATING_PATTERN.search(sanitized_markdown_text)
    if structured_match:
        suffix = sanitized_markdown_text[structured_match.end():structured_match.end() + 24]
        if AMBIGUOUS_SUFFIX_PATTERN.search(suffix):
            return None
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
        if REFUSAL_PATTERN.search(text):
            return "refusal"
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


def extract_explicit_leading_decision_code(text: str) -> Optional[str]:
    """
    Extract a decision from a leading candidate only when the candidate contains
    an explicit decision signal.

    This intentionally avoids the broad fallback number scan used for whole-response
    parsing, because opening lines often contain contextual numbers that are not
    the final decision.
    """
    if not text:
        return None

    sanitized_markdown_text = text.replace("**", "").replace("__", "").replace("`", "")

    structured_match = STRUCTURED_RATING_PATTERN.search(sanitized_markdown_text)
    if structured_match:
        suffix = sanitized_markdown_text[structured_match.end():structured_match.end() + 24]
        if AMBIGUOUS_SUFFIX_PATTERN.search(suffix):
            return None
        return structured_match.group(1)

    for pattern in STRUCTURED_DECISION_PATTERNS:
        matches = []
        for match in pattern.finditer(sanitized_markdown_text):
            suffix = sanitized_markdown_text[match.end():match.end() + 24]
            if AMBIGUOUS_SUFFIX_PATTERN.search(suffix):
                return None
            matches.append(match.group(1))
        if not matches:
            continue
        unique_values = list(dict.fromkeys(matches))
        if len(unique_values) == 1:
            return unique_values[0]
        return None

    bare_number_match = LEADING_BARE_NUMBER_PATTERN.match(sanitized_markdown_text)
    if bare_number_match:
        return bare_number_match.group(1)

    if REFUSAL_PATTERN.search(text):
        return "refusal"

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


def build_llm_decision_prompt(
    transcript_content: dict[str, Any], scale_labels: Optional[list[dict[str, str]]] = None
) -> str:
    """Build strict prompt for fallback LLM decision classification."""
    transcript_text = build_response_text(transcript_content)
    scale_section = ""
    if scale_labels:
        formatted_labels = "\n".join(
            f"- {entry['code']}: {entry['label']}" for entry in scale_labels
        )
        scale_section = f"Available scale labels:\n{formatted_labels}\n\n"

    return (
        "You are extracting a single final decision code from an AI response.\n"
        "Return exactly one token:\n"
        "- a positive integer (e.g. 1, 2, 6)\n"
        "- refusal\n"
        "- other\n"
        "No explanation, no punctuation, no extra words.\n\n"
        f"{scale_section}"
        "Transcript:\n"
        f"{transcript_text}\n"
        "\nAnswer:"
    )


def classify_decision_with_llm(
    transcript_content: dict[str, Any], scale_labels: Optional[list[dict[str, str]]] = None
) -> str:
    """
    Use fallback LLM to classify an unresolved decision.

    Returns decision code string, "refusal", or "other".
    """
    prompt = build_llm_decision_prompt(transcript_content, scale_labels)
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


def extract_decision_result(transcript_content: dict[str, Any]) -> dict[str, Any]:
    response_text = build_response_text(transcript_content)
    response_hash = hashlib.sha256(response_text.encode("utf-8")).hexdigest() if response_text else None
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
        text_label_code, matched_label, leading_text_label_path = extract_leading_text_label_decision(response_text, scale_labels)
        if text_label_code is not None:
            decision_code = text_label_code
            parse_path = leading_text_label_path or "text_label_exact"
        else:
            text_label_code, matched_label = extract_text_label_decision(response_text, scale_labels)
            if text_label_code is not None:
                decision_code = text_label_code
                parse_path = "text_label_exact"
            else:
                llm_decision_code = classify_decision_with_llm(transcript_content, scale_labels)
                if llm_decision_code != "other":
                    decision_code = llm_decision_code
                    decision_source = "llm"
                    parse_class = "fallback_resolved"
                    parse_path = "text_label_llm"
                else:
                    parse_class = "ambiguous"
                    parse_path = "text_label_ambiguous"
    elif decision_code == "other":
        llm_decision_code = classify_decision_with_llm(transcript_content)
        if llm_decision_code != "other":
            decision_code = llm_decision_code
            decision_source = "llm"
            parse_class = "fallback_resolved"
            parse_path = "numeric_llm"
        else:
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
