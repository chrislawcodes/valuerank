"""
Base adapter class and HTTP utilities for LLM providers.
"""

from abc import ABC, abstractmethod
from contextvars import ContextVar
import hashlib
import json
import time
from typing import Any, Optional

import requests

from ..errors import ErrorCode, LLMError
from ..logging import get_logger
from .constants import (
    DEFAULT_TIMEOUT,
    MAX_HTTP_RETRIES,
    MAX_RATE_LIMIT_RETRIES,
    RATE_LIMIT_BACKOFF_SECONDS,
    RETRY_BACKOFF_SECONDS,
)
from .types import LLMResponse

log = get_logger("llm_adapters.base")

RATE_LIMIT_PATTERNS = [
    "rate limit",
    "rate_limit",
    "ratelimit",
    "too many requests",
    "requests per minute",
    "rpm limit",
    "tpm limit",
    "tokens per minute",
]

# Provider-specific examples observed in common LLM APIs. Kept centralized so
# classification behavior is explicit and easy to evolve as providers change.
BILLING_EXHAUSTION_PATTERNS_BY_PROVIDER = {
    "openai_like": [
        "insufficient_quota",
        "insufficient quota",
        "exceeded your current quota",
        "hard limit",
    ],
    "anthropic_like": [
        "credit balance is too low",
        "insufficient credits",
        "insufficient credit",
        "out of credits",
    ],
    "google_like": [
        "resource_exhausted",
        "quota exceeded",
    ],
    "generic": [
        "out of funds",
        "out of money",
        "low balance",
        "payment required",
        "billing",
    ],
}

BILLING_EXHAUSTION_PATTERNS = [
    pattern
    for patterns in BILLING_EXHAUSTION_PATTERNS_BY_PROVIDER.values()
    for pattern in patterns
]

UNSUPPORTED_TEMPERATURE_PATTERNS = [
    "temperature",
    "unsupported parameter",
    "unknown parameter",
    "unknown field",
    "not supported",
    "unrecognized",
    "invalid parameter",
    "extra inputs are not permitted",
]

_REQUEST_METADATA: ContextVar[Optional[dict[str, Any]]] = ContextVar(
    "llm_request_metadata",
    default=None,
)


class BaseLLMAdapter(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    def generate(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        temperature: Optional[float] = None,
        max_tokens: int = 1024,
        model_config: Optional[dict] = None,
        seed: Optional[int] = None,
        timeout: Optional[int] = None,
    ) -> LLMResponse:
        """Generate a completion from the LLM.

        Args:
            model: Model identifier
            messages: List of message dicts with 'role' and 'content'
            temperature: Sampling temperature (None omits provider parameter)
            max_tokens: Maximum tokens to generate
            model_config: Optional provider-specific configuration (e.g., API parameter names)
            seed: Optional deterministic seed for providers that support it
            timeout: HTTP request timeout in seconds (defaults to adapter's timeout)
        """
        pass


def _build_payload_for_hash(payload: dict[str, Any]) -> dict[str, Any]:
    """Remove obvious secret-bearing keys before hashing/logging."""
    return {
        key: value
        for key, value in payload.items()
        if key.lower() not in ("api_key", "authorization", "x-api-key")
    }


def _classify_adapter_mode(
    payload: dict[str, Any],
    *,
    request_succeeded: bool,
    retried_without_temperature: bool = False,
) -> str:
    """Classify how temperature was handled for this request."""
    if retried_without_temperature:
        return "unsupported_param_retry"

    if "temperature" not in payload:
        return "temp_omitted_by_adapter" if request_succeeded else "unknown"

    value = payload.get("temperature")
    if value in (0, 0.0):
        return "explicit_temp_zero" if request_succeeded else "unknown"
    if isinstance(value, (int, float)):
        return "explicit_nonzero"
    return "unknown"


def _set_request_metadata(
    payload: dict[str, Any],
    *,
    adapter_mode: str,
) -> None:
    """Store request metadata for the next LLMResponse construction."""
    payload_for_hash = _build_payload_for_hash(payload)
    payload_json = json.dumps(payload_for_hash, sort_keys=True)
    temperature_sent = "temperature" in payload
    seed_sent = "seed" in payload
    seed_value_raw = payload.get("seed") if seed_sent else None
    seed_value = seed_value_raw if isinstance(seed_value_raw, int) else None

    _REQUEST_METADATA.set(
        {
            "prompt_hash": hashlib.sha256(payload_json.encode()).hexdigest(),
            "temperature_sent": temperature_sent,
            "temperature_value": payload.get("temperature") if temperature_sent else None,
            "seed_sent": seed_sent,
            "seed_value": seed_value,
            "adapter_mode": adapter_mode,
        }
    )


def get_current_request_metadata() -> Optional[dict[str, Any]]:
    """Return the latest request metadata captured by post_json."""
    metadata = _REQUEST_METADATA.get()
    if metadata is None:
        return None
    return dict(metadata)


def _is_unsupported_temperature_response(
    status_code: int,
    response_text: str,
    payload: dict[str, Any],
) -> bool:
    """Detect providers rejecting the temperature parameter."""
    if "temperature" not in payload or status_code < 400:
        return False

    text_lower = response_text.lower()
    if "temperature" not in text_lower:
        return False

    return any(pattern in text_lower for pattern in UNSUPPORTED_TEMPERATURE_PATTERNS)


def is_rate_limit_response(status_code: int, response_text: str) -> bool:
    """Check if a response indicates rate limiting."""
    if status_code == 429:
        return True
    # Some providers return 400/503 with rate limit messages
    text_lower = response_text.lower()
    return any(pattern in text_lower for pattern in RATE_LIMIT_PATTERNS)


def is_billing_exhaustion_response(status_code: int, response_text: str) -> bool:
    """Check if a response indicates provider credits/budget exhaustion.

    Decision rule:
    - Never treat non-errors (<400) as billing exhaustion.
    - If explicit rate-limit markers are present, classify as rate limit.
    - Otherwise match known billing/quota patterns.
    """
    if status_code < 400:
        return False

    text_lower = response_text.lower()

    # If explicit rate-limit markers are present, treat as rate limiting instead.
    if any(pattern in text_lower for pattern in RATE_LIMIT_PATTERNS):
        return False

    return any(pattern in text_lower for pattern in BILLING_EXHAUSTION_PATTERNS)


def post_json(
    url: str,
    headers: dict[str, str],
    payload: dict,
    *,
    timeout: int = DEFAULT_TIMEOUT,
) -> dict:
    """Make a POST request with JSON body and retry logic.

    Classification order for HTTP errors:
    1. Billing/quota exhaustion (non-retryable, mapped to AUTH_ERROR)
    2. Rate limit (retryable with exponential backoff)
    3. Other HTTP errors (non-retryable unless caller classifies otherwise)

    For ambiguous 429s without billing markers, we default to retryable
    rate-limit handling to avoid failing prematurely on transient throttling.
    """
    last_exc: Optional[Exception] = None
    rate_limit_attempts = 0
    network_attempts = 0
    retried_without_temperature = False

    # Total max attempts: MAX_HTTP_RETRIES for network issues + MAX_RATE_LIMIT_RETRIES for rate limits
    max_total_attempts = MAX_HTTP_RETRIES + MAX_RATE_LIMIT_RETRIES

    while network_attempts < MAX_HTTP_RETRIES and rate_limit_attempts <= MAX_RATE_LIMIT_RETRIES:
        try:
            payload_for_hash = _build_payload_for_hash(payload)
            log.debug("Raw API Request", url=url, payload=json.dumps(payload_for_hash, sort_keys=True))

            _set_request_metadata(
                payload,
                adapter_mode=_classify_adapter_mode(
                    payload,
                    request_succeeded=False,
                    retried_without_temperature=retried_without_temperature,
                ),
            )
            response = requests.post(url, headers=headers, json=payload, timeout=timeout)

            if response.status_code >= 400:
                snippet = response.text[:500]

                if (
                    not retried_without_temperature
                    and _is_unsupported_temperature_response(response.status_code, snippet, payload)
                ):
                    retried_without_temperature = True
                    payload = {key: value for key, value in payload.items() if key != "temperature"}
                    log.warn(
                        "Provider rejected temperature, retrying without it",
                        status_code=response.status_code,
                        url=url,
                    )
                    _set_request_metadata(payload, adapter_mode="unsupported_param_retry")
                    continue

                # Billing/quota exhaustion should fail fast (non-retryable).
                if is_billing_exhaustion_response(response.status_code, snippet):
                    # Reuse AUTH_ERROR because it is already modeled as
                    # non-retryable and indicates user action is required.
                    raise LLMError(
                        message=f"Billing or quota exhausted: {snippet}",
                        code=ErrorCode.AUTH_ERROR,
                        status_code=response.status_code,
                        details=snippet,
                    )

                # Check if this is a rate limit response
                if is_rate_limit_response(response.status_code, snippet):
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
                _set_request_metadata(
                    payload,
                    adapter_mode=_classify_adapter_mode(
                        payload,
                        request_succeeded=True,
                        retried_without_temperature=retried_without_temperature,
                    ),
                )
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
