"""
Anthropic Messages API adapter.
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

log = get_logger("llm_adapters.anthropic")


@dataclass
class AnthropicAdapter(BaseLLMAdapter):
    """Adapter for Anthropic Messages API."""

    api_key: Optional[str] = None
    base_url: str = "https://api.anthropic.com/v1/messages"
    api_version: str = "2023-06-01"
    timeout: int = DEFAULT_TIMEOUT

    def __post_init__(self) -> None:
        if self.api_key is None:
            self.api_key = get_config().anthropic_api_key

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
                message="ANTHROPIC_API_KEY is not set",
                code=ErrorCode.MISSING_API_KEY,
            )

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": self.api_version,
            "Content-Type": "application/json",
        }

        # Convert messages to Anthropic format (separate system from conversation)
        system_parts: list[str] = []
        anthropic_messages: list[dict[str, str]] = []

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "system":
                system_parts.append(content)
            else:
                anthropic_messages.append({"role": role, "content": content})

        if not anthropic_messages:
            anthropic_messages = [{"role": "user", "content": ""}]

        # Resolve config values (model_config overrides function args)
        # Note: Anthropic requires max_tokens, so use a high default if unlimited
        resolved_max_tokens = resolve_max_tokens(model_config, max_tokens)
        resolved_temperature = resolve_temperature(model_config, temperature)
        # Anthropic requires max_tokens - use 8192 as default for "unlimited"
        effective_max_tokens = resolved_max_tokens if resolved_max_tokens is not None else 8192

        payload: dict[str, Any] = {
            "model": model,
            "max_tokens": effective_max_tokens,
            "messages": anthropic_messages,
            "temperature": resolved_temperature,
        }

        if system_parts:
            payload["system"] = "\n\n".join(system_parts)

        # Add optional config values (Anthropic supports topP and stopSequences)
        top_p = get_config_value(model_config, "topP", float, 0, 1)
        if top_p is not None:
            payload["top_p"] = top_p

        stop_seqs = get_config_value(model_config, "stopSequences", list)
        if stop_seqs is not None and len(stop_seqs) > 0:
            payload["stop_sequences"] = stop_seqs

        # Note: Anthropic does NOT support frequencyPenalty or presencePenalty

        effective_timeout = timeout if timeout is not None else self.timeout
        log.debug("Calling Anthropic API", model=model, max_tokens=effective_max_tokens)
        data = post_json(self.base_url, headers, payload, timeout=effective_timeout)

        try:
            content_list = data.get("content", [])
            text_parts = []
            for item in content_list:
                if isinstance(item, dict) and item.get("type") == "text":
                    text_parts.append(item.get("text", ""))

            usage = data.get("usage", {})
            model_version = data.get("model")

            # Capture provider metadata
            raw_stop_reason = data.get("stop_reason")
            provider_metadata = {
                "provider": "anthropic",
                "finishReason": normalize_finish_reason("anthropic", raw_stop_reason),
                "raw": {
                    "id": data.get("id"),
                    "stop_reason": raw_stop_reason,
                    "stop_sequence": data.get("stop_sequence"),
                },
            }

            return LLMResponse(
                content="\n".join(text_parts).strip(),
                input_tokens=usage.get("input_tokens"),
                output_tokens=usage.get("output_tokens"),
                model_version=model_version,
                provider_metadata=provider_metadata,
            )
        except (KeyError, TypeError) as exc:
            raise LLMError(
                message="Unexpected Anthropic response format",
                code=ErrorCode.INVALID_RESPONSE,
                details=str(exc),
            )
