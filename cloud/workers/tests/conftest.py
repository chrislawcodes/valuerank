"""
Pytest fixtures for Python worker tests.

Provides mock fixtures for HTTP calls and LLM responses.
"""

import json
from typing import Any
from unittest.mock import MagicMock

import pytest


class MockResponse:
    """Mock HTTP response for testing."""

    def __init__(
        self,
        json_data: dict[str, Any],
        status_code: int = 200,
        text: str = "",
    ):
        self._json_data = json_data
        self.status_code = status_code
        self.text = text or json.dumps(json_data)

    def json(self) -> dict[str, Any]:
        return self._json_data


@pytest.fixture
def mock_openai_response() -> dict[str, Any]:
    """Standard OpenAI API response."""
    return {
        "id": "chatcmpl-123",
        "object": "chat.completion",
        "created": 1677652288,
        "model": "gpt-4-0613",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "This is a mock OpenAI response.",
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": 50,
            "completion_tokens": 100,
            "total_tokens": 150,
        },
    }


@pytest.fixture
def mock_anthropic_response() -> dict[str, Any]:
    """Standard Anthropic API response."""
    return {
        "id": "msg_123",
        "type": "message",
        "role": "assistant",
        "model": "claude-3-sonnet-20240229",
        "content": [
            {
                "type": "text",
                "text": "This is a mock Anthropic response.",
            }
        ],
        "stop_reason": "end_turn",
        "usage": {
            "input_tokens": 50,
            "output_tokens": 100,
        },
    }


@pytest.fixture
def mock_gemini_response() -> dict[str, Any]:
    """Standard Google Gemini API response."""
    return {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"text": "This is a mock Gemini response."}
                    ],
                    "role": "model",
                },
                "finishReason": "STOP",
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 50,
            "candidatesTokenCount": 100,
        },
    }


@pytest.fixture
def mock_openai_compatible_response() -> dict[str, Any]:
    """Standard OpenAI-compatible response (xAI, DeepSeek, Mistral)."""
    return {
        "id": "chatcmpl-123",
        "object": "chat.completion",
        "created": 1677652288,
        "model": "grok-1",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "This is a mock response.",
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": 50,
            "completion_tokens": 100,
            "total_tokens": 150,
        },
    }


@pytest.fixture
def mock_rate_limit_response() -> MockResponse:
    """Rate limit error response."""
    return MockResponse(
        json_data={"error": {"message": "Rate limit exceeded", "type": "rate_limit_error"}},
        status_code=429,
        text="Rate limit exceeded",
    )


@pytest.fixture
def mock_auth_error_response() -> MockResponse:
    """Authentication error response."""
    return MockResponse(
        json_data={"error": {"message": "Invalid API key", "type": "authentication_error"}},
        status_code=401,
        text="Invalid API key",
    )


@pytest.fixture
def mock_server_error_response() -> MockResponse:
    """Server error response."""
    return MockResponse(
        json_data={"error": {"message": "Internal server error"}},
        status_code=500,
        text="Internal server error",
    )


@pytest.fixture
def mock_env_with_all_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set up environment with all API keys."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-anthropic-key")
    monkeypatch.setenv("GOOGLE_API_KEY", "test-google-key")
    monkeypatch.setenv("XAI_API_KEY", "test-xai-key")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-key")
    monkeypatch.setenv("MISTRAL_API_KEY", "test-mistral-key")


@pytest.fixture
def mock_env_no_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    """Clear all API keys from environment."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)


def create_mock_post(response: dict[str, Any], status_code: int = 200) -> MagicMock:
    """Create a mock for requests.post that returns the given response."""
    mock_response = MockResponse(response, status_code)
    mock_post = MagicMock(return_value=mock_response)
    return mock_post
