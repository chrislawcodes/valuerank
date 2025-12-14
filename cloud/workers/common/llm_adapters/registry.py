"""
Adapter registry for managing LLM provider adapters.
"""

from typing import Generator, Optional

from ..config import get_config
from ..errors import ErrorCode, LLMError
from .base import BaseLLMAdapter
from .constants import PROVIDER_PATTERNS
from .providers import (
    AnthropicAdapter,
    DeepSeekAdapter,
    GeminiAdapter,
    MistralAdapter,
    OpenAIAdapter,
    XAIAdapter,
)
from .types import LLMResponse, StreamChunk


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
        adapter_classes: dict[str, type[BaseLLMAdapter]] = {
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
    timeout: Optional[int] = None,
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
        timeout: HTTP request timeout in seconds (defaults to adapter's default)

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
        timeout=timeout,
    )


def generate_stream(
    model: str,
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.7,
    max_tokens: int = 1024,
    model_config: Optional[dict] = None,
    timeout: Optional[int] = None,
) -> Generator[StreamChunk, None, None]:
    """
    Stream a completion using the appropriate adapter for the model.

    Currently only DeepSeek supports streaming. Other providers will fall back
    to non-streaming and yield a single chunk with the complete response.

    Args:
        model: Model ID (e.g., "deepseek:deepseek-reasoner")
        messages: List of message dicts with 'role' and 'content'
        temperature: Sampling temperature
        max_tokens: Maximum tokens to generate
        model_config: Optional provider-specific configuration from database
        timeout: HTTP request timeout in seconds

    Yields:
        StreamChunk objects with incremental content and token counts
    """
    # Strip provider prefix if present
    clean_model = model.split(":", 1)[-1] if ":" in model else model
    provider = infer_provider(model)

    # Only DeepSeek currently supports streaming
    if provider == "deepseek":
        adapter = get_registry().get("deepseek")
        if isinstance(adapter, DeepSeekAdapter):
            yield from adapter.generate_stream(
                clean_model,
                messages,
                temperature=temperature,
                max_tokens=max_tokens,
                model_config=model_config,
                timeout=timeout,
            )
            return

    # Fallback: use non-streaming and yield single chunk
    response = generate(
        model,
        messages,
        temperature=temperature,
        max_tokens=max_tokens,
        model_config=model_config,
        timeout=timeout,
    )
    # Extract finish_reason from provider_metadata if available
    finish_reason = None
    if response.provider_metadata:
        finish_reason = response.provider_metadata.get("finishReason")
    yield StreamChunk(
        content=response.content,
        output_tokens=response.output_tokens or 0,
        done=True,
        input_tokens=response.input_tokens,
        model_version=response.model_version,
        finish_reason=finish_reason,
    )
