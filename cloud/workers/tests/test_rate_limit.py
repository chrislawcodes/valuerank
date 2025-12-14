"""Tests for rate limit retry logic with exponential backoff."""

from typing import Any
from unittest.mock import MagicMock, patch, call

import pytest

from common.errors import ErrorCode, LLMError
from common.llm_adapters import (
    OpenAIAdapter,
    _is_rate_limit_response,
    _post_json,
    MAX_RATE_LIMIT_RETRIES,
    RATE_LIMIT_BACKOFF_SECONDS,
)

from .conftest import MockResponse


class TestIsRateLimitResponse:
    """Tests for _is_rate_limit_response helper."""

    def test_detects_429_status(self) -> None:
        """Test that 429 status is detected as rate limit."""
        assert _is_rate_limit_response(429, "any text") is True

    def test_detects_rate_limit_in_text(self) -> None:
        """Test rate limit detection from response text."""
        patterns = [
            "Rate limit exceeded",
            "rate_limit_error",
            "ratelimit reached",
            "too many requests",
            "quota exceeded",
            "requests per minute limit",
            "rpm limit exceeded",
            "tpm limit reached",
            "tokens per minute exceeded",
        ]
        for pattern in patterns:
            assert _is_rate_limit_response(400, pattern) is True, f"Failed for: {pattern}"

    def test_case_insensitive(self) -> None:
        """Test that detection is case insensitive."""
        assert _is_rate_limit_response(400, "RATE LIMIT EXCEEDED") is True
        assert _is_rate_limit_response(400, "Rate Limit Error") is True

    def test_non_rate_limit_errors(self) -> None:
        """Test that non-rate limit errors are not detected."""
        assert _is_rate_limit_response(400, "Invalid request") is False
        assert _is_rate_limit_response(401, "Unauthorized") is False
        assert _is_rate_limit_response(500, "Internal server error") is False


class TestRateLimitRetry:
    """Tests for rate limit retry with exponential backoff."""

    def test_retries_on_429_with_exponential_backoff(self) -> None:
        """Test that 429 responses trigger retries with correct backoff."""
        success_response = MockResponse({"data": "success"}, 200)
        rate_limit_response = MockResponse(
            {"error": "Rate limit"},
            status_code=429,
            text="Rate limit exceeded",
        )

        # First 3 calls return 429, 4th returns success
        call_count = 0
        def mock_post(*args: Any, **kwargs: Any) -> MockResponse:
            nonlocal call_count
            call_count += 1
            if call_count < 4:
                return rate_limit_response
            return success_response

        with patch("requests.post", side_effect=mock_post) as mock:
            with patch("time.sleep") as mock_sleep:
                result = _post_json("http://test", {}, {})

                assert result == {"data": "success"}
                assert call_count == 4

                # Verify backoff delays: 30s, 60s, 90s
                sleep_calls = mock_sleep.call_args_list
                assert len(sleep_calls) == 3
                assert sleep_calls[0] == call(30)
                assert sleep_calls[1] == call(60)
                assert sleep_calls[2] == call(90)

    def test_fails_after_max_retries(self) -> None:
        """Test that error is raised after max retries."""
        rate_limit_response = MockResponse(
            {"error": "Rate limit"},
            status_code=429,
            text="Rate limit exceeded",
        )

        with patch("requests.post", return_value=rate_limit_response):
            with patch("time.sleep"):
                with pytest.raises(LLMError) as exc_info:
                    _post_json("http://test", {}, {})

                assert exc_info.value.code == ErrorCode.RATE_LIMIT
                assert "after 4 retries" in exc_info.value.message

    def test_retries_on_rate_limit_message_in_400(self) -> None:
        """Test that rate limit messages in 400 responses trigger retries."""
        success_response = MockResponse({"data": "success"}, 200)
        rate_limit_400 = MockResponse(
            {"error": "Too many requests"},
            status_code=400,
            text="too many requests - please try again later",
        )

        call_count = 0
        def mock_post(*args: Any, **kwargs: Any) -> MockResponse:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return rate_limit_400
            return success_response

        with patch("requests.post", side_effect=mock_post):
            with patch("time.sleep") as mock_sleep:
                result = _post_json("http://test", {}, {})

                assert result == {"data": "success"}
                mock_sleep.assert_called_once_with(30)

    def test_logs_rate_limit_retry(self) -> None:
        """Test that rate limit retries are logged."""
        success_response = MockResponse({"data": "success"}, 200)
        rate_limit_response = MockResponse(
            {"error": "Rate limit"},
            status_code=429,
            text="Rate limit exceeded",
        )

        call_count = 0
        def mock_post(*args: Any, **kwargs: Any) -> MockResponse:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return rate_limit_response
            return success_response

        with patch("requests.post", side_effect=mock_post):
            with patch("time.sleep"):
                with patch("common.llm_adapters.base.log") as mock_log:
                    _post_json("http://test", {}, {})

                    # Verify warning was logged
                    mock_log.warn.assert_called_once()
                    call_kwargs = mock_log.warn.call_args
                    assert "Rate limited" in str(call_kwargs)


class TestRateLimitIntegration:
    """Integration tests for rate limit handling with adapters."""

    @pytest.fixture
    def adapter(self, monkeypatch: pytest.MonkeyPatch) -> OpenAIAdapter:
        """Create adapter with test key."""
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        return OpenAIAdapter(api_key="test-key")

    def test_adapter_retries_rate_limit(
        self,
        adapter: OpenAIAdapter,
        mock_openai_response: dict[str, Any],
    ) -> None:
        """Test that adapter retries on rate limit."""
        success_response = MockResponse(mock_openai_response, 200)
        rate_limit_response = MockResponse(
            {"error": "Rate limit"},
            status_code=429,
            text="Rate limit exceeded",
        )

        call_count = 0
        def mock_post(*args: Any, **kwargs: Any) -> MockResponse:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return rate_limit_response
            return success_response

        with patch("requests.post", side_effect=mock_post):
            with patch("time.sleep"):
                result = adapter.generate(
                    "gpt-4",
                    [{"role": "user", "content": "Hello"}],
                )

                assert result.content == "This is a mock OpenAI response."
                assert call_count == 2

    def test_adapter_fails_after_max_rate_limit_retries(
        self,
        adapter: OpenAIAdapter,
    ) -> None:
        """Test that adapter fails after max rate limit retries."""
        rate_limit_response = MockResponse(
            {"error": "Rate limit"},
            status_code=429,
            text="Rate limit exceeded",
        )

        with patch("requests.post", return_value=rate_limit_response):
            with patch("time.sleep"):
                with pytest.raises(LLMError) as exc_info:
                    adapter.generate(
                        "gpt-4",
                        [{"role": "user", "content": "Hello"}],
                    )

                assert exc_info.value.code == ErrorCode.RATE_LIMIT
                assert exc_info.value.retryable


class TestBackoffConfiguration:
    """Tests for backoff configuration."""

    def test_backoff_values(self) -> None:
        """Test that backoff values are as specified."""
        assert MAX_RATE_LIMIT_RETRIES == 4
        assert RATE_LIMIT_BACKOFF_SECONDS == [30, 60, 90, 120]

    def test_all_backoff_values_used(self) -> None:
        """Test that all backoff values are used before giving up."""
        rate_limit_response = MockResponse(
            {"error": "Rate limit"},
            status_code=429,
            text="Rate limit exceeded",
        )

        sleep_times: list[int] = []

        with patch("requests.post", return_value=rate_limit_response):
            with patch("time.sleep") as mock_sleep:
                mock_sleep.side_effect = lambda t: sleep_times.append(t)

                try:
                    _post_json("http://test", {}, {})
                except LLMError:
                    pass

                assert sleep_times == [30, 60, 90, 120]
