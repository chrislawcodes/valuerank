"""
Constants and configuration for LLM adapters.
"""

from typing import Optional

# HTTP configuration
DEFAULT_TIMEOUT = 60
MAX_HTTP_RETRIES = 3
RETRY_BACKOFF_SECONDS = 2.0

# Rate limit retry configuration
MAX_RATE_LIMIT_RETRIES = 4
RATE_LIMIT_BACKOFF_SECONDS = [30, 60, 90, 120]  # Exponential backoff for 429 responses

# Provider detection patterns
PROVIDER_PATTERNS: dict[str, list[str]] = {
    "openai": ["gpt", "text-", "o1", "davinci", "curie", "babbage", "ada"],
    "anthropic": ["claude"],
    "google": ["gemini"],
    "xai": ["grok"],
    "deepseek": ["deepseek"],
    "mistral": ["mistral"],
}

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
