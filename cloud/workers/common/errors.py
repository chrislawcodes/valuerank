"""
Error types for Python workers.

Provides a hierarchy of errors with retry classification for the orchestrator.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class ErrorCode(Enum):
    """Standard error codes for worker failures."""

    # Retryable errors
    RATE_LIMIT = "RATE_LIMIT"
    TIMEOUT = "TIMEOUT"
    NETWORK_ERROR = "NETWORK_ERROR"
    SERVER_ERROR = "SERVER_ERROR"

    # Non-retryable errors
    AUTH_ERROR = "AUTH_ERROR"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    UNSUPPORTED_PROVIDER = "UNSUPPORTED_PROVIDER"
    MISSING_API_KEY = "MISSING_API_KEY"
    INVALID_RESPONSE = "INVALID_RESPONSE"

    # Unknown
    UNKNOWN = "UNKNOWN"


# Codes that should trigger retry
RETRYABLE_CODES = {
    ErrorCode.RATE_LIMIT,
    ErrorCode.TIMEOUT,
    ErrorCode.NETWORK_ERROR,
    ErrorCode.SERVER_ERROR,
}


@dataclass
class WorkerError(Exception):
    """Base error class for all worker errors."""

    message: str
    code: ErrorCode = ErrorCode.UNKNOWN
    details: Optional[str] = None

    def __post_init__(self) -> None:
        super().__init__(self.message)

    @property
    def retryable(self) -> bool:
        """Whether this error should trigger a job retry."""
        return self.code in RETRYABLE_CODES

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON output."""
        return {
            "message": self.message,
            "code": self.code.value,
            "retryable": self.retryable,
            "details": self.details,
        }


@dataclass
class LLMError(WorkerError):
    """Error from LLM API call."""

    status_code: Optional[int] = None

    def __post_init__(self) -> None:
        super().__post_init__()
        # Auto-classify based on HTTP status code if not already set
        if self.status_code is not None and self.code == ErrorCode.UNKNOWN:
            self.code = self._classify_status_code(self.status_code)

    @staticmethod
    def _classify_status_code(status_code: int) -> ErrorCode:
        """Classify error based on HTTP status code."""
        if status_code == 429:
            return ErrorCode.RATE_LIMIT
        if status_code == 401 or status_code == 403:
            return ErrorCode.AUTH_ERROR
        if status_code == 404:
            return ErrorCode.NOT_FOUND
        if status_code == 400:
            return ErrorCode.VALIDATION_ERROR
        if 500 <= status_code < 600:
            return ErrorCode.SERVER_ERROR
        return ErrorCode.UNKNOWN

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON output."""
        result = super().to_dict()
        if self.status_code is not None:
            result["statusCode"] = self.status_code
        return result


@dataclass
class RetryableError(WorkerError):
    """Explicitly retryable error (e.g., network issues, timeouts)."""

    def __post_init__(self) -> None:
        # Ensure code is in retryable set
        if self.code not in RETRYABLE_CODES:
            self.code = ErrorCode.NETWORK_ERROR
        super().__post_init__()

    @property
    def retryable(self) -> bool:
        return True


@dataclass
class ValidationError(WorkerError):
    """Input validation error (non-retryable)."""

    def __post_init__(self) -> None:
        self.code = ErrorCode.VALIDATION_ERROR
        super().__post_init__()

    @property
    def retryable(self) -> bool:
        return False


def classify_http_error(status_code: int, message: str, details: Optional[str] = None) -> LLMError:
    """Create an LLMError with proper classification from HTTP status code."""
    return LLMError(
        message=message,
        status_code=status_code,
        details=details,
    )


def classify_exception(exc: Exception) -> WorkerError:
    """Convert a generic exception to a WorkerError with classification."""
    message = str(exc)
    message_lower = message.lower()

    # Check for timeout patterns
    if "timeout" in message_lower or "timed out" in message_lower:
        return RetryableError(
            message=message,
            code=ErrorCode.TIMEOUT,
            details=type(exc).__name__,
        )

    # Check for connection errors
    if any(pattern in message_lower for pattern in [
        "connection", "network", "socket", "econnrefused", "enotfound"
    ]):
        return RetryableError(
            message=message,
            code=ErrorCode.NETWORK_ERROR,
            details=type(exc).__name__,
        )

    # Check for rate limit patterns
    if "rate limit" in message_lower or "429" in message_lower:
        return LLMError(
            message=message,
            code=ErrorCode.RATE_LIMIT,
            status_code=429,
        )

    # Default to unknown (retryable by default in orchestrator)
    return WorkerError(
        message=message,
        code=ErrorCode.UNKNOWN,
        details=type(exc).__name__,
    )
