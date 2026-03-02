"""
Data types for LLM adapter responses.
"""

from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class LLMResponse:
    """Response from an LLM API call."""

    content: str
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    model_version: Optional[str] = None
    provider_metadata: Optional[dict[str, Any]] = None
    prompt_hash: Optional[str] = None
    temperature_sent: Optional[bool] = None
    temperature_value: Optional[float] = None
    seed_sent: Optional[bool] = None
    seed_value: Optional[int] = None
    adapter_mode: Optional[str] = None

    def __post_init__(self) -> None:
        """Backfill request instrumentation from the shared adapter context."""
        from .base import get_current_request_metadata

        metadata = get_current_request_metadata()
        if not metadata:
            return

        if self.prompt_hash is None:
            self.prompt_hash = metadata.get("prompt_hash")
        if self.temperature_sent is None:
            self.temperature_sent = metadata.get("temperature_sent")
        if self.temperature_value is None:
            self.temperature_value = metadata.get("temperature_value")
        if self.seed_sent is None:
            self.seed_sent = metadata.get("seed_sent")
        if self.seed_value is None:
            self.seed_value = metadata.get("seed_value")
        if self.adapter_mode is None:
            self.adapter_mode = metadata.get("adapter_mode")

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
        if self.prompt_hash is not None:
            result["promptHash"] = self.prompt_hash
        if self.temperature_sent is not None:
            result["temperatureSent"] = self.temperature_sent
        if self.temperature_value is not None:
            result["temperatureValue"] = self.temperature_value
        if self.seed_sent is not None:
            result["seedSent"] = self.seed_sent
        if self.seed_value is not None:
            result["seedValue"] = self.seed_value
        if self.adapter_mode is not None:
            result["adapterMode"] = self.adapter_mode
        return result


@dataclass
class StreamChunk:
    """A chunk from a streaming LLM response."""

    content: str  # The text content of this chunk
    output_tokens: int  # Cumulative output tokens so far
    done: bool = False  # True if this is the final chunk
    input_tokens: Optional[int] = None  # Only available on final chunk
    model_version: Optional[str] = None  # Only available on final chunk
    finish_reason: Optional[str] = None  # Only available on final chunk (normalized)
