"""
LLM Provider Adapters for Cloud Workers.

Adapted from src/llm_adapters.py for cloud worker use case.
Key differences from CLI version:
- Returns structured dict instead of string (includes tokens, timing)
- No print statements (uses structured logging)
- Includes model version when available
- Returns retryable classification on errors
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Optional
import time

import requests

from .config import get_config
from .errors import ErrorCode, LLMError, WorkerError
from .logging import get_logger

log = get_logger("llm_adapters")

# Constants
DEFAULT_TIMEOUT = 60
MAX_HTTP_RETRIES = 3
RETRY_BACKOFF_SECONDS = 2.0

# Rate limit retry configuration
MAX_RATE_LIMIT_RETRIES = 4
RATE_LIMIT_BACKOFF_SECONDS = [30, 60, 90, 120]  # Exponential backoff for 429 responses

# Provider detection patterns
PROVIDER_PATTERNS = {
    "openai": ["gpt", "text-", "o1", "davinci", "curie", "babbage", "ada"],
    "anthropic": ["claude"],
    "google": ["gemini"],
    "xai": ["grok"],
    "deepseek": ["deepseek"],
    "mistral": ["mistral"],
}


@dataclass
class LLMResponse:
    """Response from an LLM API call."""

    content: str
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    model_version: Optional[str] = None
    provider_metadata: Optional[dict[str, Any]] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON output."""
        result = {
            "content": self.content,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "modelVersion": self.model_version,
        }
        if self.provider_metadata is not None:
            result["providerMetadata"] = self.provider_metadata
        return result


# Mapping of provider-specific finish reasons to normalized values
FINISH_REASON_MAP: dict[str, dict[str, str]] = {
    "openai": {
        "stop": "stop",
        "length": "max_tokens",
        "content_filter": "content_filter",
        "function_call": "tool_use",
        "tool_calls": "tool_use",
    },
    "anthropic": {
        "end_turn": "stop",
        "max_tokens": "max_tokens",
        "stop_sequence": "stop_sequence",
        "tool_use": "tool_use",
    },
    "google": {
        "STOP": "stop",
        "SAFETY": "safety",
        "RECITATION": "recitation",
        "MAX_TOKENS": "max_tokens",
        "OTHER": "other",
        "BLOCKLIST": "blocklist",
        "PROHIBITED_CONTENT": "prohibited_content",
        "SPII": "spii",
        "MALFORMED_FUNCTION_CALL": "malformed_function_call",
    },
    "xai": {
        "stop": "stop",
        "length": "max_tokens",
    },
    "deepseek": {
        "stop": "stop",
        "length": "max_tokens",
        "content_filter": "content_filter",
        "tool_calls": "tool_use",
        "insufficient_system_resource": "system_error",
    },
    "mistral": {
        "stop": "stop",
        "length": "max_tokens",
        "tool_calls": "tool_use",
    },
}


def normalize_finish_reason(provider: str, raw_reason: Optional[str]) -> str:
    """Normalize provider-specific finish reason to a standard value."""
    if raw_reason is None:
        return "unknown"
    provider_map = FINISH_REASON_MAP.get(provider, {})
    return provider_map.get(raw_reason, raw_reason.lower())


def resolve_max_tokens(
    model_config: Optional[dict],
    default_max_tokens: int,
) -> Optional[int]:
    """
    Resolve the max_tokens value from model config.

    Rules:
    - If model_config has maxTokens: null, return None (unlimited)
    - If model_config has maxTokens: <number>, return that number
    - If model_config has no maxTokens key, return default_max_tokens

    Args:
        model_config: Optional model configuration dict
        default_max_tokens: Default value if not specified in config

    Returns:
        The resolved max_tokens value, or None for unlimited
    """
    if model_config is None:
        return default_max_tokens

    # Check if maxTokens key exists in config
    if "maxTokens" not in model_config:
        return default_max_tokens

    max_tokens_value = model_config["maxTokens"]

    # Explicit null means unlimited (no limit)
    if max_tokens_value is None:
        return None

    # Numeric value - use it directly
    if isinstance(max_tokens_value, (int, float)):
        return int(max_tokens_value)

    # Invalid value - fall back to default
    log.warn(
        "Invalid maxTokens value in model config, using default",
        value=max_tokens_value,
        default=default_max_tokens,
    )
    return default_max_tokens


def get_config_value(
    model_config: Optional[dict],
    key: str,
    expected_type: type,
    min_val: Optional[float] = None,
    max_val: Optional[float] = None,
) -> Optional[Any]:
    """
    Get a typed value from model config with optional range validation.

    Args:
        model_config: Optional model configuration dict
        key: The config key to look up
        expected_type: Expected type (int, float, list, str)
        min_val: Optional minimum value for numeric types
        max_val: Optional maximum value for numeric types

    Returns:
        The config value if valid, None otherwise
    """
    if model_config is None or key not in model_config:
        return None

    value = model_config[key]

    if value is None:
        return None

    # For numeric types, accept int or float
    if expected_type in (int, float):
        if not isinstance(value, (int, float)):
            log.warn(f"Invalid {key} value type", value=value, expected=expected_type.__name__)
            return None
        if min_val is not None and value < min_val:
            log.warn(f"{key} below minimum", value=value, min=min_val)
            return None
        if max_val is not None and value > max_val:
            log.warn(f"{key} above maximum", value=value, max=max_val)
            return None
        return expected_type(value)

    # For other types, check directly
    if not isinstance(value, expected_type):
        log.warn(f"Invalid {key} value type", value=value, expected=expected_type.__name__)
        return None

    return value


def resolve_temperature(
    model_config: Optional[dict],
    default_temperature: float,
) -> float:
    """
    Resolve the temperature value from model config.

    Args:
        model_config: Optional model configuration dict
        default_temperature: Default value if not specified in config

    Returns:
        The resolved temperature value (0-2)
    """
    temp = get_config_value(model_config, "temperature", float, 0, 2)
    return temp if temp is not None else default_temperature


class BaseLLMAdapter(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    def generate(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        model_config: Optional[dict] = None,
    ) -> LLMResponse:
        """Generate a completion from the LLM.

        Args:
            model: Model identifier
            messages: List of message dicts with 'role' and 'content'
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            model_config: Optional provider-specific configuration (e.g., API parameter names)
        """
        pass


def _is_rate_limit_response(status_code: int, response_text: str) -> bool:
    """Check if a response indicates rate limiting."""
    if status_code == 429:
        return True
    # Some providers return 400/503 with rate limit messages
    text_lower = response_text.lower()
    return any(pattern in text_lower for pattern in [
        "rate limit",
        "rate_limit",
        "ratelimit",
        "too many requests",
        "quota exceeded",
        "requests per minute",
        "rpm limit",
        "tpm limit",
        "tokens per minute",
    ])


def _post_json(
    url: str,
    headers: dict[str, str],
    payload: dict,
    *,
    timeout: int = DEFAULT_TIMEOUT,
) -> dict:
    """Make a POST request with JSON body and retry logic.

    Includes intelligent rate limit handling with exponential backoff:
    - 429 responses trigger retries with 30s, 60s, 90s, 120s delays
    - Rate limit detection also checks response body for limit messages
    - Rate limit retries are independent of network error retries
    """
    last_exc: Optional[Exception] = None
    rate_limit_attempts = 0
    network_attempts = 0

    # Total max attempts: MAX_HTTP_RETRIES for network issues + MAX_RATE_LIMIT_RETRIES for rate limits
    max_total_attempts = MAX_HTTP_RETRIES + MAX_RATE_LIMIT_RETRIES

    while network_attempts < MAX_HTTP_RETRIES and rate_limit_attempts <= MAX_RATE_LIMIT_RETRIES:
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=timeout)

            if response.status_code >= 400:
                snippet = response.text[:500]

                # Check if this is a rate limit response
                if _is_rate_limit_response(response.status_code, snippet):
                    if rate_limit_attempts < MAX_RATE_LIMIT_RETRIES:
                        sleep_for = RATE_LIMIT_BACKOFF_SECONDS[rate_limit_attempts]
                        log.warn(
                            "Rate limited, retrying with backoff",
                            attempt=rate_limit_attempts + 1,
                            max_attempts=MAX_RATE_LIMIT_RETRIES,
                            sleep_seconds=sleep_for,
                            status_code=response.status_code,
                        )
                        rate_limit_attempts += 1
                        time.sleep(sleep_for)
                        continue
                    else:
                        raise LLMError(
                            message=f"Rate limited after {MAX_RATE_LIMIT_RETRIES} retries",
                            code=ErrorCode.RATE_LIMIT,
                            status_code=response.status_code,
                            details=snippet,
                        )

                raise LLMError(
                    message=f"HTTP {response.status_code}: {snippet}",
                    status_code=response.status_code,
                    details=snippet,
                )

            try:
                return response.json()
            except ValueError as exc:
                raise LLMError(
                    message="Failed to decode JSON response",
                    code=ErrorCode.INVALID_RESPONSE,
                    details=str(exc),
                )

        except requests.Timeout as exc:
            last_exc = exc
            network_attempts += 1
            if network_attempts < MAX_HTTP_RETRIES:
                sleep_for = RETRY_BACKOFF_SECONDS * network_attempts
                log.warn("Request timed out, retrying", attempt=network_attempts, sleep=sleep_for)
                time.sleep(sleep_for)
                continue
            raise LLMError(
                message=f"Request timed out after {timeout}s",
                code=ErrorCode.TIMEOUT,
                details=str(exc),
            )

        except requests.ConnectionError as exc:
            last_exc = exc
            network_attempts += 1
            if network_attempts < MAX_HTTP_RETRIES:
                sleep_for = RETRY_BACKOFF_SECONDS * network_attempts
                log.warn("Connection error, retrying", attempt=network_attempts, sleep=sleep_for)
                time.sleep(sleep_for)
                continue
            raise LLMError(
                message=f"Connection error: {exc}",
                code=ErrorCode.NETWORK_ERROR,
                details=str(exc),
            )

        except requests.RequestException as exc:
            raise LLMError(
                message=f"Request error: {exc}",
                code=ErrorCode.NETWORK_ERROR,
                details=str(exc),
            )

    # Should not reach here, but just in case
    raise LLMError(
        message=f"Failed after {max_total_attempts} attempts",
        code=ErrorCode.NETWORK_ERROR,
        details=str(last_exc) if last_exc else None,
    )


@dataclass
class OpenAIAdapter(BaseLLMAdapter):
    """Adapter for OpenAI Chat Completions API."""

    api_key: Optional[str] = None
    base_url: str = "https://api.openai.com/v1/chat/completions"
    timeout: int = DEFAULT_TIMEOUT

    def __post_init__(self) -> None:
        if self.api_key is None:
            self.api_key = get_config().openai_api_key

    def generate(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        model_config: Optional[dict] = None,
    ) -> LLMResponse:
        if not self.api_key:
            raise LLMError(
                message="OPENAI_API_KEY is not set",
                code=ErrorCode.MISSING_API_KEY,
            )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        # Determine max_tokens parameter name from config
        # Newer OpenAI models (gpt-5.1, o1, o3) require "max_completion_tokens"
        # Older models use "max_tokens"
        max_tokens_param = "max_tokens"
        if model_config:
            max_tokens_param = model_config.get("maxTokensParam", "max_tokens")

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
            payload[max_tokens_param] = resolved_max_tokens

        # Add optional config values (OpenAI supports all of these)
        top_p = get_config_value(model_config, "topP", float, 0, 1)
        if top_p is not None:
            payload["top_p"] = top_p

        freq_penalty = get_config_value(model_config, "frequencyPenalty", float, -2, 2)
        if freq_penalty is not None:
            payload["frequency_penalty"] = freq_penalty

        pres_penalty = get_config_value(model_config, "presencePenalty", float, -2, 2)
        if pres_penalty is not None:
            payload["presence_penalty"] = pres_penalty

        stop_seqs = get_config_value(model_config, "stopSequences", list)
        if stop_seqs is not None and len(stop_seqs) > 0:
            payload["stop"] = stop_seqs

        log.debug("Calling OpenAI API", model=model, max_tokens_param=max_tokens_param, max_tokens=resolved_max_tokens)
        data = _post_json(self.base_url, headers, payload, timeout=self.timeout)

        try:
            choice = data["choices"][0]
            content = choice["message"]["content"]
            usage = data.get("usage", {})
            model_version = data.get("model")  # OpenAI returns resolved model ID

            # Capture provider metadata
            raw_finish_reason = choice.get("finish_reason")
            provider_metadata = {
                "provider": "openai",
                "finishReason": normalize_finish_reason("openai", raw_finish_reason),
                "raw": {
                    "id": data.get("id"),
                    "finish_reason": raw_finish_reason,
                    "system_fingerprint": data.get("system_fingerprint"),
                    "logprobs": choice.get("logprobs"),
                },
            }

            # Log warning if content was filtered
            if raw_finish_reason == "content_filter":
                log.warn(
                    "OpenAI content filtered",
                    model=model,
                    finish_reason=raw_finish_reason,
                )

            return LLMResponse(
                content=content.strip() if content else "",
                input_tokens=usage.get("prompt_tokens"),
                output_tokens=usage.get("completion_tokens"),
                model_version=model_version,
                provider_metadata=provider_metadata,
            )
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError(
                message="Unexpected OpenAI response format",
                code=ErrorCode.INVALID_RESPONSE,
                details=str(exc),
            )


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

        log.debug("Calling Anthropic API", model=model, max_tokens=effective_max_tokens)
        data = _post_json(self.base_url, headers, payload, timeout=self.timeout)

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

        log.debug("Calling Gemini API", model=model, max_tokens=resolved_max_tokens)
        data = _post_json(url, headers, payload, timeout=self.timeout)

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


@dataclass
class XAIAdapter(BaseLLMAdapter):
    """Adapter for xAI Grok API (OpenAI-compatible)."""

    api_key: Optional[str] = None
    base_url: str = "https://api.x.ai/v1/chat/completions"
    timeout: int = DEFAULT_TIMEOUT

    def __post_init__(self) -> None:
        if self.api_key is None:
            self.api_key = get_config().xai_api_key

    def generate(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        model_config: Optional[dict] = None,
    ) -> LLMResponse:
        if not self.api_key:
            raise LLMError(
                message="XAI_API_KEY is not set",
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

        # Add optional config values (xAI supports all OpenAI-compatible options)
        top_p = get_config_value(model_config, "topP", float, 0, 1)
        if top_p is not None:
            payload["top_p"] = top_p

        freq_penalty = get_config_value(model_config, "frequencyPenalty", float, -2, 2)
        if freq_penalty is not None:
            payload["frequency_penalty"] = freq_penalty

        pres_penalty = get_config_value(model_config, "presencePenalty", float, -2, 2)
        if pres_penalty is not None:
            payload["presence_penalty"] = pres_penalty

        stop_seqs = get_config_value(model_config, "stopSequences", list)
        if stop_seqs is not None and len(stop_seqs) > 0:
            payload["stop"] = stop_seqs

        log.debug("Calling xAI API", model=model, max_tokens=resolved_max_tokens)
        data = _post_json(self.base_url, headers, payload, timeout=self.timeout)

        try:
            choice = data["choices"][0]
            content = choice["message"]["content"]
            usage = data.get("usage", {})

            # Capture provider metadata (OpenAI-compatible format)
            raw_finish_reason = choice.get("finish_reason")
            provider_metadata = {
                "provider": "xai",
                "finishReason": normalize_finish_reason("xai", raw_finish_reason),
                "raw": {
                    "id": data.get("id"),
                    "finish_reason": raw_finish_reason,
                    "system_fingerprint": data.get("system_fingerprint"),
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
                message="Unexpected xAI response format",
                code=ErrorCode.INVALID_RESPONSE,
                details=str(exc),
            )


@dataclass
class DeepSeekAdapter(BaseLLMAdapter):
    """Adapter for DeepSeek API (OpenAI-compatible)."""

    api_key: Optional[str] = None
    base_url: str = "https://api.deepseek.com/v1/chat/completions"
    timeout: int = DEFAULT_TIMEOUT

    def __post_init__(self) -> None:
        if self.api_key is None:
            self.api_key = get_config().deepseek_api_key

    def generate(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        model_config: Optional[dict] = None,
    ) -> LLMResponse:
        if not self.api_key:
            raise LLMError(
                message="DEEPSEEK_API_KEY is not set",
                code=ErrorCode.MISSING_API_KEY,
            )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        # Resolve config values (model_config overrides function args)
        resolved_max_tokens = resolve_max_tokens(model_config, max_tokens)
        resolved_temperature = resolve_temperature(model_config, temperature)

        # DeepSeek has a max of 8192 tokens for optimal quality
        if resolved_max_tokens is not None:
            resolved_max_tokens = min(resolved_max_tokens, 8192)

        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": resolved_temperature,
        }

        # Only add max_tokens if not unlimited (None)
        if resolved_max_tokens is not None:
            payload["max_tokens"] = resolved_max_tokens

        # Add optional config values (DeepSeek supports all OpenAI-compatible options)
        top_p = get_config_value(model_config, "topP", float, 0, 1)
        if top_p is not None:
            payload["top_p"] = top_p

        freq_penalty = get_config_value(model_config, "frequencyPenalty", float, -2, 2)
        if freq_penalty is not None:
            payload["frequency_penalty"] = freq_penalty

        pres_penalty = get_config_value(model_config, "presencePenalty", float, -2, 2)
        if pres_penalty is not None:
            payload["presence_penalty"] = pres_penalty

        stop_seqs = get_config_value(model_config, "stopSequences", list)
        if stop_seqs is not None and len(stop_seqs) > 0:
            payload["stop"] = stop_seqs

        log.debug("Calling DeepSeek API", model=model, max_tokens=resolved_max_tokens)
        data = _post_json(self.base_url, headers, payload, timeout=self.timeout)

        try:
            choice = data["choices"][0]
            content = choice["message"]["content"]
            usage = data.get("usage", {})

            # Capture provider metadata (OpenAI-compatible format)
            raw_finish_reason = choice.get("finish_reason")
            provider_metadata = {
                "provider": "deepseek",
                "finishReason": normalize_finish_reason("deepseek", raw_finish_reason),
                "raw": {
                    "id": data.get("id"),
                    "finish_reason": raw_finish_reason,
                },
            }

            # Log warning for content filter or system resource issues
            if raw_finish_reason in ("content_filter", "insufficient_system_resource"):
                log.warn(
                    "DeepSeek non-standard finish",
                    model=model,
                    finish_reason=raw_finish_reason,
                )

            return LLMResponse(
                content=content.strip() if content else "",
                input_tokens=usage.get("prompt_tokens"),
                output_tokens=usage.get("completion_tokens"),
                model_version=data.get("model"),
                provider_metadata=provider_metadata,
            )
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError(
                message="Unexpected DeepSeek response format",
                code=ErrorCode.INVALID_RESPONSE,
                details=str(exc),
            )


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

        log.debug("Calling Mistral API", model=model, max_tokens=resolved_max_tokens)
        data = _post_json(self.base_url, headers, payload, timeout=self.timeout)

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


def infer_provider(model: str) -> str:
    """Infer provider from model ID."""
    # Check for explicit prefix (e.g., "openai:gpt-4")
    if ":" in model:
        prefix, _ = model.split(":", 1)
        if prefix.lower() in PROVIDER_PATTERNS:
            return prefix.lower()

    model_lower = model.lower()

    for provider, patterns in PROVIDER_PATTERNS.items():
        if any(pattern in model_lower for pattern in patterns):
            return provider

    return "unknown"


class AdapterRegistry:
    """Registry mapping providers to adapter instances."""

    def __init__(self) -> None:
        self._adapters: dict[str, BaseLLMAdapter] = {}
        self._initialize_adapters()

    def _initialize_adapters(self) -> None:
        """Initialize adapters for providers with configured API keys."""
        config = get_config()

        if config.openai_api_key:
            self._adapters["openai"] = OpenAIAdapter()
        if config.anthropic_api_key:
            self._adapters["anthropic"] = AnthropicAdapter()
        if config.google_api_key:
            self._adapters["google"] = GeminiAdapter()
        if config.xai_api_key:
            self._adapters["xai"] = XAIAdapter()
        if config.deepseek_api_key:
            self._adapters["deepseek"] = DeepSeekAdapter()
        if config.mistral_api_key:
            self._adapters["mistral"] = MistralAdapter()

    def get(self, provider: str) -> BaseLLMAdapter:
        """Get adapter for a provider."""
        if provider not in self._adapters:
            # Try to create adapter on demand
            adapter = self._create_adapter(provider)
            if adapter:
                self._adapters[provider] = adapter
                return adapter
            raise LLMError(
                message=f"No adapter available for provider '{provider}'",
                code=ErrorCode.UNSUPPORTED_PROVIDER,
            )
        return self._adapters[provider]

    def _create_adapter(self, provider: str) -> Optional[BaseLLMAdapter]:
        """Try to create an adapter for a provider."""
        adapter_classes = {
            "openai": OpenAIAdapter,
            "anthropic": AnthropicAdapter,
            "google": GeminiAdapter,
            "xai": XAIAdapter,
            "deepseek": DeepSeekAdapter,
            "mistral": MistralAdapter,
        }

        if provider not in adapter_classes:
            return None

        return adapter_classes[provider]()

    def resolve_for_model(self, model: str) -> BaseLLMAdapter:
        """Get the appropriate adapter for a model ID."""
        provider = infer_provider(model)
        if provider == "unknown":
            raise LLMError(
                message=f"Cannot determine provider for model '{model}'",
                code=ErrorCode.UNSUPPORTED_PROVIDER,
            )
        return self.get(provider)


# Global registry instance
_registry: Optional[AdapterRegistry] = None


def get_registry() -> AdapterRegistry:
    """Get or create the global adapter registry."""
    global _registry
    if _registry is None:
        _registry = AdapterRegistry()
    return _registry


def generate(
    model: str,
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.7,
    max_tokens: int = 1024,
    model_config: Optional[dict] = None,
) -> LLMResponse:
    """
    Generate a completion using the appropriate adapter for the model.

    This is the main entry point for LLM generation.

    Args:
        model: Model ID (e.g., "gpt-4", "claude-3-sonnet-20240229")
        messages: List of message dicts with 'role' and 'content'
        temperature: Sampling temperature
        max_tokens: Maximum tokens to generate
        model_config: Optional provider-specific configuration from database

    Returns:
        LLMResponse with content and token counts
    """
    # Strip provider prefix if present
    clean_model = model.split(":", 1)[-1] if ":" in model else model

    adapter = get_registry().resolve_for_model(model)
    return adapter.generate(
        clean_model,
        messages,
        temperature=temperature,
        max_tokens=max_tokens,
        model_config=model_config,
    )
