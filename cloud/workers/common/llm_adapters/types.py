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


@dataclass
class StreamChunk:
    """A chunk from a streaming LLM response."""

    content: str  # The text content of this chunk
    output_tokens: int  # Cumulative output tokens so far
    done: bool = False  # True if this is the final chunk
    input_tokens: Optional[int] = None  # Only available on final chunk
    model_version: Optional[str] = None  # Only available on final chunk
    finish_reason: Optional[str] = None  # Only available on final chunk (normalized)
