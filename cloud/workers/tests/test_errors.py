"""Tests for error handling and classification."""

import pytest

from common.errors import (
    ErrorCode,
    LLMError,
    RetryableError,
    ValidationError,
    WorkerError,
    classify_exception,
    classify_http_error,
)


class TestErrorCode:
    """Tests for ErrorCode enum."""

    def test_retryable_codes(self) -> None:
        """Verify retryable error codes."""
        from common.errors import RETRYABLE_CODES

        assert ErrorCode.RATE_LIMIT in RETRYABLE_CODES
        assert ErrorCode.TIMEOUT in RETRYABLE_CODES
        assert ErrorCode.NETWORK_ERROR in RETRYABLE_CODES
        assert ErrorCode.SERVER_ERROR in RETRYABLE_CODES

    def test_non_retryable_codes(self) -> None:
        """Verify non-retryable error codes."""
        from common.errors import RETRYABLE_CODES

        assert ErrorCode.AUTH_ERROR not in RETRYABLE_CODES
        assert ErrorCode.VALIDATION_ERROR not in RETRYABLE_CODES
        assert ErrorCode.NOT_FOUND not in RETRYABLE_CODES
        assert ErrorCode.UNSUPPORTED_PROVIDER not in RETRYABLE_CODES
        assert ErrorCode.MISSING_API_KEY not in RETRYABLE_CODES


class TestWorkerError:
    """Tests for WorkerError base class."""

    def test_basic_error(self) -> None:
        """Test basic error creation."""
        err = WorkerError(message="Test error")
        assert err.message == "Test error"
        assert err.code == ErrorCode.UNKNOWN
        assert err.details is None
        assert str(err) == "Test error"

    def test_error_with_code(self) -> None:
        """Test error with explicit code."""
        err = WorkerError(message="Auth failed", code=ErrorCode.AUTH_ERROR)
        assert err.code == ErrorCode.AUTH_ERROR
        assert not err.retryable

    def test_error_with_details(self) -> None:
        """Test error with details."""
        err = WorkerError(
            message="Request failed",
            code=ErrorCode.NETWORK_ERROR,
            details="Connection refused",
        )
        assert err.details == "Connection refused"
        assert err.retryable

    def test_to_dict(self) -> None:
        """Test error serialization."""
        err = WorkerError(
            message="Test",
            code=ErrorCode.TIMEOUT,
            details="Extra info",
        )
        d = err.to_dict()
        assert d["message"] == "Test"
        assert d["code"] == "TIMEOUT"
        assert d["retryable"] is True
        assert d["details"] == "Extra info"


class TestLLMError:
    """Tests for LLMError class."""

    def test_auto_classify_rate_limit(self) -> None:
        """Test auto-classification of 429 status."""
        err = LLMError(message="Rate limited", status_code=429)
        assert err.code == ErrorCode.RATE_LIMIT
        assert err.retryable

    def test_auto_classify_auth_error(self) -> None:
        """Test auto-classification of 401 status."""
        err = LLMError(message="Unauthorized", status_code=401)
        assert err.code == ErrorCode.AUTH_ERROR
        assert not err.retryable

    def test_auto_classify_forbidden(self) -> None:
        """Test auto-classification of 403 status."""
        err = LLMError(message="Forbidden", status_code=403)
        assert err.code == ErrorCode.AUTH_ERROR
        assert not err.retryable

    def test_auto_classify_not_found(self) -> None:
        """Test auto-classification of 404 status."""
        err = LLMError(message="Not found", status_code=404)
        assert err.code == ErrorCode.NOT_FOUND
        assert not err.retryable

    def test_auto_classify_bad_request(self) -> None:
        """Test auto-classification of 400 status."""
        err = LLMError(message="Bad request", status_code=400)
        assert err.code == ErrorCode.VALIDATION_ERROR
        assert not err.retryable

    def test_auto_classify_server_error(self) -> None:
        """Test auto-classification of 5xx status."""
        for status in [500, 502, 503, 504]:
            err = LLMError(message=f"Server error {status}", status_code=status)
            assert err.code == ErrorCode.SERVER_ERROR
            assert err.retryable

    def test_explicit_code_overrides(self) -> None:
        """Test that explicit code takes precedence."""
        err = LLMError(
            message="Test",
            code=ErrorCode.INVALID_RESPONSE,
            status_code=200,
        )
        assert err.code == ErrorCode.INVALID_RESPONSE

    def test_to_dict_includes_status(self) -> None:
        """Test that to_dict includes status code."""
        err = LLMError(message="Error", status_code=429)
        d = err.to_dict()
        assert d["statusCode"] == 429


class TestRetryableError:
    """Tests for RetryableError class."""

    def test_always_retryable(self) -> None:
        """Test that RetryableError is always retryable."""
        err = RetryableError(message="Network issue")
        assert err.retryable

    def test_defaults_to_network_error(self) -> None:
        """Test default code for RetryableError."""
        err = RetryableError(message="Test")
        assert err.code == ErrorCode.NETWORK_ERROR


class TestValidationError:
    """Tests for ValidationError class."""

    def test_never_retryable(self) -> None:
        """Test that ValidationError is never retryable."""
        err = ValidationError(message="Invalid input")
        assert not err.retryable
        assert err.code == ErrorCode.VALIDATION_ERROR


class TestClassifyHttpError:
    """Tests for classify_http_error function."""

    def test_classify_429(self) -> None:
        """Test classifying rate limit error."""
        err = classify_http_error(429, "Rate limited")
        assert err.code == ErrorCode.RATE_LIMIT
        assert err.retryable

    def test_classify_500(self) -> None:
        """Test classifying server error."""
        err = classify_http_error(500, "Internal error")
        assert err.code == ErrorCode.SERVER_ERROR
        assert err.retryable


class TestClassifyException:
    """Tests for classify_exception function."""

    def test_timeout_error(self) -> None:
        """Test classifying timeout exceptions."""
        err = classify_exception(TimeoutError("Connection timed out"))
        assert err.code == ErrorCode.TIMEOUT
        assert err.retryable

    def test_connection_error(self) -> None:
        """Test classifying connection exceptions."""
        err = classify_exception(ConnectionError("Connection refused"))
        assert err.code == ErrorCode.NETWORK_ERROR
        assert err.retryable

    def test_rate_limit_in_message(self) -> None:
        """Test classifying exceptions with rate limit in message."""
        err = classify_exception(Exception("429 Rate limit exceeded"))
        assert err.code == ErrorCode.RATE_LIMIT

    def test_unknown_error(self) -> None:
        """Test classifying unknown exceptions."""
        err = classify_exception(Exception("Something went wrong"))
        assert err.code == ErrorCode.UNKNOWN
