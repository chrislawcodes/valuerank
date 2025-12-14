"""
LLM Provider Adapters for Cloud Workers.

Adapted from src/llm_adapters.py for cloud worker use case.
Key differences from CLI version:
- Returns structured dict instead of string (includes tokens, timing)
- No print statements (uses structured logging)
- Includes model version when available
- Returns retryable classification on errors

Usage:
    from common.llm_adapters import generate, LLMResponse

    response = generate(
        model="gpt-4",
        messages=[{"role": "user", "content": "Hello!"}],
        temperature=0.7,
        max_tokens=1024,
    )
    print(response.content)
"""

# Types
from .types import LLMResponse, StreamChunk

# Base class and HTTP utilities
from .base import BaseLLMAdapter, is_rate_limit_response, post_json

# Backward compatibility aliases for internal functions (used in tests)
_is_rate_limit_response = is_rate_limit_response
_post_json = post_json

# Provider adapters (for direct use if needed)
from .providers import (
    AnthropicAdapter,
    DeepSeekAdapter,
    GeminiAdapter,
    MistralAdapter,
    OpenAIAdapter,
    XAIAdapter,
)

# Registry and main API
from .registry import (
    AdapterRegistry,
    generate,
    generate_stream,
    get_registry,
    infer_provider,
)

# Constants (for backward compatibility)
from .constants import (
    DEFAULT_TIMEOUT,
    FINISH_REASON_MAP,
    MAX_HTTP_RETRIES,
    MAX_RATE_LIMIT_RETRIES,
    PROVIDER_PATTERNS,
    RATE_LIMIT_BACKOFF_SECONDS,
    RETRY_BACKOFF_SECONDS,
    normalize_finish_reason,
)

# Config utilities (for backward compatibility)
from .config_utils import (
    get_config_value,
    resolve_max_tokens,
    resolve_temperature,
)

__all__ = [
    # Types
    "LLMResponse",
    "StreamChunk",
    # Base and HTTP utilities
    "BaseLLMAdapter",
    "is_rate_limit_response",
    "post_json",
    # Backward compatibility aliases (used in tests)
    "_is_rate_limit_response",
    "_post_json",
    # Providers
    "OpenAIAdapter",
    "AnthropicAdapter",
    "GeminiAdapter",
    "XAIAdapter",
    "DeepSeekAdapter",
    "MistralAdapter",
    # Registry
    "AdapterRegistry",
    "get_registry",
    "infer_provider",
    # Main API
    "generate",
    "generate_stream",
    # Constants
    "DEFAULT_TIMEOUT",
    "MAX_HTTP_RETRIES",
    "RETRY_BACKOFF_SECONDS",
    "MAX_RATE_LIMIT_RETRIES",
    "RATE_LIMIT_BACKOFF_SECONDS",
    "PROVIDER_PATTERNS",
    "FINISH_REASON_MAP",
    "normalize_finish_reason",
    # Config utilities
    "resolve_max_tokens",
    "resolve_temperature",
    "get_config_value",
]
