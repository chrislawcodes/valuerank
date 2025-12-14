"""
DeepSeek API adapter (OpenAI-compatible with streaming support).
"""

from dataclasses import dataclass
import json
from typing import Any, Generator, Optional

import requests

from ...config import get_config
from ...errors import ErrorCode, LLMError
from ...logging import get_logger
from ..base import BaseLLMAdapter, post_json
from ..config_utils import get_config_value, resolve_max_tokens, resolve_temperature
from ..constants import DEFAULT_TIMEOUT, normalize_finish_reason
from ..types import LLMResponse, StreamChunk

log = get_logger("llm_adapters.deepseek")


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
        timeout: Optional[int] = None,
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

        # DeepSeek max_tokens limits vary by model:
        # - deepseek-reasoner: 64K (65536)
        # - deepseek-chat and others: 8K (8192)
        if resolved_max_tokens is not None:
            max_limit = 65536 if "reasoner" in model else 8192
            resolved_max_tokens = min(resolved_max_tokens, max_limit)

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

        # Use provided timeout or fall back to adapter default
        effective_timeout = timeout if timeout is not None else self.timeout
        log.debug(
            "Calling DeepSeek API",
            model=model,
            max_tokens=resolved_max_tokens,
            timeout=effective_timeout,
        )
        data = post_json(self.base_url, headers, payload, timeout=effective_timeout)

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

    def generate_stream(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        model_config: Optional[dict] = None,
        timeout: Optional[int] = None,
    ) -> Generator[StreamChunk, None, None]:
        """
        Stream response from DeepSeek API, yielding chunks as they arrive.

        Yields StreamChunk objects with incremental content and token counts.
        Final chunk has done=True and includes input_tokens.
        """
        if not self.api_key:
            raise LLMError(
                message="DEEPSEEK_API_KEY is not set",
                code=ErrorCode.MISSING_API_KEY,
            )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        # Resolve config values
        resolved_max_tokens = resolve_max_tokens(model_config, max_tokens)
        resolved_temperature = resolve_temperature(model_config, temperature)

        # DeepSeek max_tokens limits vary by model
        if resolved_max_tokens is not None:
            max_limit = 65536 if "reasoner" in model else 8192
            resolved_max_tokens = min(resolved_max_tokens, max_limit)

        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": resolved_temperature,
            "stream": True,  # Enable streaming
            "stream_options": {"include_usage": True},  # Get token counts in stream
        }

        if resolved_max_tokens is not None:
            payload["max_tokens"] = resolved_max_tokens

        effective_timeout = timeout if timeout is not None else self.timeout
        log.debug("Starting DeepSeek streaming", model=model, max_tokens=resolved_max_tokens)

        try:
            response = requests.post(
                self.base_url,
                headers=headers,
                json=payload,
                timeout=effective_timeout,
                stream=True,
            )
            response.raise_for_status()
        except requests.exceptions.Timeout:
            raise LLMError(
                message=f"DeepSeek API timeout after {effective_timeout}s",
                code=ErrorCode.TIMEOUT,
            )
        except requests.exceptions.HTTPError as exc:
            # Try to extract error details from response body
            error_details = None
            status_code = None
            try:
                if exc.response is not None:
                    status_code = exc.response.status_code
                    # For streaming responses, read the content
                    error_body = exc.response.content.decode('utf-8', errors='replace')
                    if error_body:
                        error_details = error_body[:500]  # Limit size
            except Exception:
                pass

            error_code = (
                ErrorCode.SERVER_ERROR if status_code and status_code >= 500
                else ErrorCode.VALIDATION_ERROR
            )

            raise LLMError(
                message=f"DeepSeek API error ({status_code}): {exc}",
                code=error_code,
                details=error_details,
            )
        except requests.exceptions.RequestException as exc:
            raise LLMError(
                message=f"DeepSeek API request failed: {exc}",
                code=ErrorCode.NETWORK_ERROR,
            )

        accumulated_content = ""
        output_tokens = 0
        input_tokens = None
        model_version = None
        finish_reason = None
        chunk_count = 0

        try:
            for line in response.iter_lines():
                if not line:
                    continue

                line_str = line.decode("utf-8")
                if not line_str.startswith("data: "):
                    continue

                data_str = line_str[6:]  # Remove "data: " prefix
                if data_str == "[DONE]":
                    # Final chunk - include normalized finish_reason
                    normalized_finish = normalize_finish_reason("deepseek", finish_reason)
                    yield StreamChunk(
                        content=accumulated_content,
                        output_tokens=output_tokens,
                        done=True,
                        input_tokens=input_tokens,
                        model_version=model_version,
                        finish_reason=normalized_finish,
                    )
                    return

                try:
                    data = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                chunk_count += 1

                # Extract model version from first chunk
                if model_version is None:
                    model_version = data.get("model")

                # Handle usage info (comes in final chunk with stream_options)
                usage = data.get("usage")
                if usage:
                    input_tokens = usage.get("prompt_tokens")
                    output_tokens = usage.get("completion_tokens", output_tokens)

                # Extract content delta and finish_reason
                choices = data.get("choices", [])
                if choices:
                    choice = choices[0]
                    delta = choice.get("delta", {})
                    content_delta = delta.get("content", "")

                    # Check for finish_reason (indicates why generation stopped)
                    if choice.get("finish_reason"):
                        finish_reason = choice.get("finish_reason")

                    if content_delta:
                        accumulated_content += content_delta
                        # Estimate tokens (roughly 4 chars per token)
                        output_tokens = max(output_tokens, len(accumulated_content) // 4)

                        yield StreamChunk(
                            content=accumulated_content,
                            output_tokens=output_tokens,
                            done=False,
                        )

            # Stream ended without [DONE] - log details and yield final chunk
            log.warn(
                "DeepSeek stream ended without [DONE]",
                model=model,
                chunk_count=chunk_count,
                content_length=len(accumulated_content),
                output_tokens=output_tokens,
                finish_reason=finish_reason,
            )
            normalized_finish = normalize_finish_reason("deepseek", finish_reason)
            yield StreamChunk(
                content=accumulated_content,
                output_tokens=output_tokens,
                done=True,
                input_tokens=input_tokens,
                model_version=model_version,
                finish_reason=normalized_finish,
            )

        except Exception as exc:
            # Log details about partial response before raising error
            log.error(
                "DeepSeek stream failed",
                model=model,
                error=str(exc),
                chunk_count=chunk_count,
                content_length=len(accumulated_content),
                output_tokens=output_tokens,
                finish_reason=finish_reason,
                partial_content_preview=accumulated_content[-500:] if accumulated_content else None,
            )
            raise LLMError(
                message=f"Error reading DeepSeek stream: {exc}",
                code=ErrorCode.NETWORK_ERROR,
                details=(
                    f"chunks={chunk_count}, tokens~{output_tokens}, "
                    f"finish={finish_reason}, content_len={len(accumulated_content)}"
                ),
            )
