"""
Configuration utilities for LLM adapters.
"""

from typing import Any, Optional

from ..logging import get_logger

log = get_logger("llm_adapters.config")


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
