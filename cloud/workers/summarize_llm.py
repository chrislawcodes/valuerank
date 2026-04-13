#!/usr/bin/env python3
"""LLM-backed helpers for the summarize worker."""

import re
import sys
from typing import Any, Optional

from common.errors import LLMError, WorkerError
from common.logging import get_logger
from summarize_text import build_response_text

log = get_logger("summarize")

# Default summary model if none specified.
DEFAULT_SUMMARY_MODEL = "anthropic:claude-sonnet-4-20250514"

LLM_FALLBACK_MODEL = "xai:grok-4-1-fast-reasoning"


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


def _resolve_generate():
    summarize_module = sys.modules.get("summarize")
    if summarize_module is not None:
        patched_generate = getattr(summarize_module, "generate", None)
        if patched_generate is not None:
            return patched_generate

    from common.llm_adapters import generate  # noqa: PLC0415

    return generate


def classify_decision_with_llm(
    transcript_content: dict[str, Any], scale_labels: Optional[list[dict[str, str]]] = None
) -> str:
    """
    Use fallback LLM to classify an unresolved decision.

    Returns decision code string, "refusal", or "other".
    """
    generate = _resolve_generate()
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
