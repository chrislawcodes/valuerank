"""
Mistral API adapter (OpenAI-compatible).
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

log = get_logger("llm_adapters.mistral")


@dataclass
class MistralAdapter(BaseLLMAdapter):
    """Adapter for Mistral API (OpenAI-compatible)."""

    api_key: Optional[str] = None
    base_url: str = "https://api.mistral.ai/v1/chat/completions"
    timeout: int = DEFAULT_TIMEOUT

    def __post_init__(self) -> None:
        if self.api_key is None:
            self.api_key = get_config().mistral_api_key

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
                message="MISTRAL_API_KEY is not set",
                code=ErrorCode.MISSING_API_KEY,
            )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        # Resolve config values (model_config overrides function args)
        resolved_max_tokens = resolve_max_tokens(model_config, max_tokens)
        resolved_temperature = resolve_temperature(model_config, temperature)

        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": resolved_temperature,
        }

        # Only add max_tokens if not unlimited (None)
        if resolved_max_tokens is not None:
            payload["max_tokens"] = resolved_max_tokens

        # Add optional config values (Mistral supports topP and stopSequences)
        top_p = get_config_value(model_config, "topP", float, 0, 1)
        if top_p is not None:
            payload["top_p"] = top_p

        stop_seqs = get_config_value(model_config, "stopSequences", list)
        if stop_seqs is not None and len(stop_seqs) > 0:
            payload["stop"] = stop_seqs

        # Note: Mistral does NOT support frequencyPenalty or presencePenalty

        # Use explicit timeout if provided, otherwise fall back to instance default
        effective_timeout = timeout if timeout is not None else self.timeout

        log.debug("Calling Mistral API", model=model, max_tokens=resolved_max_tokens)
        data = post_json(self.base_url, headers, payload, timeout=effective_timeout)

        try:
            choice = data["choices"][0]
            content = choice["message"]["content"]
            usage = data.get("usage", {})

            # Capture provider metadata (OpenAI-compatible format)
            raw_finish_reason = choice.get("finish_reason")
            provider_metadata = {
                "provider": "mistral",
                "finishReason": normalize_finish_reason("mistral", raw_finish_reason),
                "raw": {
                    "id": data.get("id"),
                    "finish_reason": raw_finish_reason,
                },
            }

            return LLMResponse(
                content=content.strip() if content else "",
                input_tokens=usage.get("prompt_tokens"),
                output_tokens=usage.get("completion_tokens"),
                model_version=data.get("model"),
                provider_metadata=provider_metadata,
            )
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError(
                message="Unexpected Mistral response format",
                code=ErrorCode.INVALID_RESPONSE,
                details=str(exc),
            )
