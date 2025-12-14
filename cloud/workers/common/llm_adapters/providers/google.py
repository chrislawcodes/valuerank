"""
Google Gemini API adapter.
"""

from dataclasses import dataclass
from typing import Any, Optional

from ...config import get_config
from ...errors import ErrorCode, LLMError
from ...logging import get_logger
from ..base import BaseLLMAdapter, post_json
from ..config_utils import get_config_value, resolve_max_tokens, resolve_temperature
from ..constants import DEFAULT_TIMEOUT, normalize_finish_reason
from ..types import LLMResponse

log = get_logger("llm_adapters.google")


@dataclass
class GeminiAdapter(BaseLLMAdapter):
    """Adapter for Google Gemini API."""

    api_key: Optional[str] = None
    base_url: str = "https://generativelanguage.googleapis.com/v1beta/models"
    timeout: int = DEFAULT_TIMEOUT

    def __post_init__(self) -> None:
        if self.api_key is None:
            self.api_key = get_config().google_api_key

    def generate(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        model_config: Optional[dict] = None,
        timeout: Optional[int] = None,
    ) -> LLMResponse:
        if not self.api_key:
            raise LLMError(
                message="GOOGLE_API_KEY is not set",
                code=ErrorCode.MISSING_API_KEY,
            )

        # Convert to Gemini format
        system_parts: list[str] = []
        contents: list[dict[str, Any]] = []

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "system":
                system_parts.append(content)
            else:
                gemini_role = "user" if role == "user" else "model"
                contents.append({"role": gemini_role, "parts": [{"text": content}]})

        if not contents:
            contents = [{"role": "user", "parts": [{"text": ""}]}]

        # Resolve config values (model_config overrides function args)
        resolved_max_tokens = resolve_max_tokens(model_config, max_tokens)
        resolved_temperature = resolve_temperature(model_config, temperature)

        # Build generation config
        generation_config: dict[str, Any] = {
            "temperature": resolved_temperature,
        }

        # Only add maxOutputTokens if not unlimited (None)
        # For Gemini 2.5 thinking models, omitting this allows full thinking + output
        if resolved_max_tokens is not None:
            generation_config["maxOutputTokens"] = resolved_max_tokens

        # Add optional config values (Google supports topP and stopSequences)
        top_p = get_config_value(model_config, "topP", float, 0, 1)
        if top_p is not None:
            generation_config["topP"] = top_p

        stop_seqs = get_config_value(model_config, "stopSequences", list)
        if stop_seqs is not None and len(stop_seqs) > 0:
            generation_config["stopSequences"] = stop_seqs

        # Note: Google does NOT support frequencyPenalty or presencePenalty

        payload: dict[str, Any] = {
            "contents": contents,
            "generationConfig": generation_config,
        }

        if system_parts:
            payload["systemInstruction"] = {"parts": [{"text": "\n\n".join(system_parts)}]}

        url = f"{self.base_url}/{model}:generateContent?key={self.api_key}"
        headers = {"Content-Type": "application/json"}

        effective_timeout = timeout if timeout is not None else self.timeout
        log.debug("Calling Gemini API", model=model, max_tokens=resolved_max_tokens)
        data = post_json(url, headers, payload, timeout=effective_timeout)

        try:
            # Check for prompt-level blocking first
            prompt_feedback = data.get("promptFeedback", {})
            prompt_block_reason = prompt_feedback.get("blockReason")

            if prompt_block_reason:
                # Prompt was blocked - no candidates will be returned
                provider_metadata = {
                    "provider": "google",
                    "finishReason": normalize_finish_reason("google", prompt_block_reason),
                    "raw": {
                        "promptFeedback": prompt_feedback,
                        "candidates": [],
                    },
                }
                log.warn(
                    "Gemini prompt blocked",
                    model=model,
                    block_reason=prompt_block_reason,
                    safety_ratings=prompt_feedback.get("safetyRatings"),
                )
                # Return empty content with metadata explaining why
                usage = data.get("usageMetadata", {})
                return LLMResponse(
                    content="",
                    input_tokens=usage.get("promptTokenCount"),
                    output_tokens=0,
                    model_version=None,
                    provider_metadata=provider_metadata,
                )

            candidates = data.get("candidates", [])
            if not candidates:
                # No candidates but no block reason - unexpected
                provider_metadata = {
                    "provider": "google",
                    "finishReason": "unknown",
                    "raw": {
                        "promptFeedback": prompt_feedback,
                        "candidates": [],
                    },
                }
                log.warn("Gemini response missing candidates", model=model)
                usage = data.get("usageMetadata", {})
                return LLMResponse(
                    content="",
                    input_tokens=usage.get("promptTokenCount"),
                    output_tokens=0,
                    model_version=None,
                    provider_metadata=provider_metadata,
                )

            candidate = candidates[0]
            raw_finish_reason = candidate.get("finishReason")
            safety_ratings = candidate.get("safetyRatings", [])

            parts = candidate.get("content", {}).get("parts", [])
            texts = [part.get("text", "") for part in parts if isinstance(part, dict)]
            content = "\n".join(text.strip() for text in texts if text.strip())

            # Gemini includes usage metadata
            usage = data.get("usageMetadata", {})

            # Build comprehensive provider metadata
            provider_metadata = {
                "provider": "google",
                "finishReason": normalize_finish_reason("google", raw_finish_reason),
                "raw": {
                    "finishReason": raw_finish_reason,
                    "safetyRatings": safety_ratings,
                    "promptFeedback": prompt_feedback,
                },
            }

            # Log warning if response was blocked by safety
            if raw_finish_reason and raw_finish_reason != "STOP":
                log.warn(
                    "Gemini non-standard finish",
                    model=model,
                    finish_reason=raw_finish_reason,
                    safety_ratings=safety_ratings,
                    content_length=len(content),
                )

            return LLMResponse(
                content=content,
                input_tokens=usage.get("promptTokenCount"),
                output_tokens=usage.get("candidatesTokenCount"),
                model_version=None,  # Gemini doesn't return model version
                provider_metadata=provider_metadata,
            )
        except (KeyError, TypeError) as exc:
            raise LLMError(
                message="Unexpected Gemini response format",
                code=ErrorCode.INVALID_RESPONSE,
                details=str(exc),
            )
