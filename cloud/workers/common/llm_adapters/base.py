"""
Base adapter class and HTTP utilities for LLM providers.
"""

from abc import ABC, abstractmethod
import time
from typing import Optional

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

BILLING_EXHAUSTION_PATTERNS = [
    "insufficient_quota",
    "insufficient quota",
    "insufficient credits",
    "insufficient credit",
    "out of credits",
    "out of funds",
    "out of money",
    "low balance",
    "payment required",
    "billing",
    "hard limit",
    "exceeded your current quota",
    "quota exceeded",
]


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
        timeout: Optional[int] = None,
    ) -> LLMResponse:
        """Generate a completion from the LLM.

        Args:
            model: Model identifier
            messages: List of message dicts with 'role' and 'content'
            temperature: Sampling temperature (None omits provider parameter)
            max_tokens: Maximum tokens to generate
            model_config: Optional provider-specific configuration (e.g., API parameter names)
            timeout: HTTP request timeout in seconds (defaults to adapter's timeout)
        """
        pass


def is_rate_limit_response(status_code: int, response_text: str) -> bool:
    """Check if a response indicates rate limiting."""
    if status_code == 429:
        return True
    # Some providers return 400/503 with rate limit messages
    text_lower = response_text.lower()
    return any(pattern in text_lower for pattern in RATE_LIMIT_PATTERNS)


def is_billing_exhaustion_response(status_code: int, response_text: str) -> bool:
    """Check if a response indicates provider credits/budget exhaustion."""
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

                # Billing/quota exhaustion should fail fast (non-retryable).
                if is_billing_exhaustion_response(response.status_code, snippet):
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
