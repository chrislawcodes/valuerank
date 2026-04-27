"""Tests for LLM adapters with mocked HTTP calls."""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
import requests

from common.errors import ErrorCode, LLMError
from common.llm_adapters import (
    AnthropicAdapter,
    DeepSeekAdapter,
    GeminiAdapter,
    LLMResponse,
    MistralAdapter,
    OpenAIAdapter,
    XAIAdapter,
    generate,
    infer_provider,
    resolve_max_tokens,
)

from .conftest import MockResponse


class TestInferProvider:
    """Tests for provider inference from model ID."""

    def test_infer_openai_from_gpt(self) -> None:
        """Test inferring OpenAI from gpt models."""
        assert infer_provider("gpt-4") == "openai"
        assert infer_provider("gpt-3.5-turbo") == "openai"
        assert infer_provider("gpt-4o") == "openai"

    def test_infer_anthropic_from_claude(self) -> None:
        """Test inferring Anthropic from claude models."""
        assert infer_provider("claude-3-sonnet") == "anthropic"
        assert infer_provider("claude-3-opus") == "anthropic"
        assert infer_provider("claude-2") == "anthropic"

    def test_infer_google_from_gemini(self) -> None:
        """Test inferring Google from gemini models."""
        assert infer_provider("gemini-1.5-pro") == "google"
        assert infer_provider("gemini-1.5-flash") == "google"

    def test_infer_xai_from_grok(self) -> None:
        """Test inferring xAI from grok models."""
        assert infer_provider("grok-1") == "xai"
        assert infer_provider("grok-2") == "xai"

    def test_infer_deepseek(self) -> None:
        """Test inferring DeepSeek."""
        assert infer_provider("deepseek-chat") == "deepseek"
        assert infer_provider("deepseek-coder") == "deepseek"

    def test_infer_mistral(self) -> None:
        """Test inferring Mistral."""
        assert infer_provider("mistral-large") == "mistral"
        assert infer_provider("mistral-medium") == "mistral"

    def test_explicit_prefix(self) -> None:
        """Test explicit provider prefix."""
        assert infer_provider("openai:custom-model") == "openai"
        assert infer_provider("anthropic:custom") == "anthropic"

    def test_unknown_model(self) -> None:
        """Test unknown model returns 'unknown'."""
        assert infer_provider("some-random-model") == "unknown"


class TestOpenAIAdapter:
    """Tests for OpenAI adapter."""

    @pytest.fixture
    def adapter(self, monkeypatch: pytest.MonkeyPatch) -> OpenAIAdapter:
        """Create adapter with test key."""
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        return OpenAIAdapter(api_key="test-key")

    def test_generate_success(
        self,
        adapter: OpenAIAdapter,
        mock_openai_response: dict[str, Any],
    ) -> None:
        """Test successful generation."""
        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(mock_openai_response, 200)

            result = adapter.generate(
                "gpt-4",
                [{"role": "user", "content": "Hello"}],
            )

            assert isinstance(result, LLMResponse)
            assert result.content == "This is a mock OpenAI response."
            assert result.input_tokens == 50
            assert result.output_tokens == 100
            assert result.model_version == "gpt-4-0613"

    def test_missing_api_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test error when API key is missing."""
        # Clear the environment and reload config
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        from common.config import reload_config
        reload_config()

        # Create adapter without key
        adapter = OpenAIAdapter(api_key=None)

        with pytest.raises(LLMError) as exc_info:
            adapter.generate("gpt-4", [{"role": "user", "content": "Hello"}])

        assert exc_info.value.code == ErrorCode.MISSING_API_KEY

    def test_rate_limit_error(self, adapter: OpenAIAdapter) -> None:
        """Test rate limit error handling."""
        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(
                {"error": "Rate limited"},
                status_code=429,
                text="Rate limited",
            )

            with pytest.raises(LLMError) as exc_info:
                adapter.generate("gpt-4", [{"role": "user", "content": "Hello"}])

            assert exc_info.value.code == ErrorCode.RATE_LIMIT
            assert exc_info.value.retryable


class TestAnthropicAdapter:
    """Tests for Anthropic adapter."""

    @pytest.fixture
    def adapter(self) -> AnthropicAdapter:
        """Create adapter with test key."""
        return AnthropicAdapter(api_key="test-key")

    def test_generate_success(
        self,
        adapter: AnthropicAdapter,
        mock_anthropic_response: dict[str, Any],
    ) -> None:
        """Test successful generation."""
        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(mock_anthropic_response, 200)

            result = adapter.generate(
                "claude-3-sonnet-20240229",
                [{"role": "user", "content": "Hello"}],
            )

            assert result.content == "This is a mock Anthropic response."
            assert result.input_tokens == 50
            assert result.output_tokens == 100

    def test_system_message_handling(
        self,
        adapter: AnthropicAdapter,
        mock_anthropic_response: dict[str, Any],
    ) -> None:
        """Test that system messages are properly extracted."""
        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(mock_anthropic_response, 200)

            adapter.generate(
                "claude-3-sonnet",
                [
                    {"role": "system", "content": "You are helpful."},
                    {"role": "user", "content": "Hello"},
                ],
            )

            # Verify the payload structure
            call_args = mock_post.call_args
            payload = call_args.kwargs.get("json") or call_args[1].get("json")
            assert "system" in payload
            assert payload["system"] == "You are helpful."


class TestGeminiAdapter:
    """Tests for Gemini adapter."""

    @pytest.fixture
    def adapter(self) -> GeminiAdapter:
        """Create adapter with test key."""
        return GeminiAdapter(api_key="test-key")

    def test_generate_success(
        self,
        adapter: GeminiAdapter,
        mock_gemini_response: dict[str, Any],
    ) -> None:
        """Test successful generation."""
        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(mock_gemini_response, 200)

            result = adapter.generate(
                "gemini-1.5-pro",
                [{"role": "user", "content": "Hello"}],
            )

            assert result.content == "This is a mock Gemini response."
            assert result.input_tokens == 50
            assert result.output_tokens == 100


class TestXAIAdapter:
    """Tests for xAI adapter."""

    @pytest.fixture
    def adapter(self) -> XAIAdapter:
        """Create adapter with test key."""
        return XAIAdapter(api_key="test-key")

    def test_generate_success(
        self,
        adapter: XAIAdapter,
        mock_openai_compatible_response: dict[str, Any],
    ) -> None:
        """Test successful generation."""
        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(mock_openai_compatible_response, 200)

            result = adapter.generate(
                "grok-1",
                [{"role": "user", "content": "Hello"}],
            )

            assert result.content == "This is a mock response."
            assert result.input_tokens == 50


class TestDeepSeekAdapter:
    """Tests for DeepSeek adapter."""

    @pytest.fixture
    def adapter(self) -> DeepSeekAdapter:
        """Create adapter with test key."""
        return DeepSeekAdapter(api_key="test-key")

    def test_generate_success(
        self,
        adapter: DeepSeekAdapter,
        mock_openai_compatible_response: dict[str, Any],
    ) -> None:
        """Test successful generation."""
        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(mock_openai_compatible_response, 200)

            result = adapter.generate(
                "deepseek-chat",
                [{"role": "user", "content": "Hello"}],
            )

            assert result.content == "This is a mock response."

    def test_max_tokens_capped(
        self,
        adapter: DeepSeekAdapter,
        mock_openai_compatible_response: dict[str, Any],
    ) -> None:
        """Test that max_tokens is capped at 64K (DeepSeek API limit)."""
        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(mock_openai_compatible_response, 200)

            adapter.generate(
                "deepseek-chat",
                [{"role": "user", "content": "Hello"}],
                max_tokens=100000,
            )

            call_args = mock_post.call_args
            payload = call_args.kwargs.get("json") or call_args[1].get("json")
            # deepseek-chat caps at 8192, deepseek-reasoner caps at 65536
            assert payload["max_tokens"] == 8192


class TestMistralAdapter:
    """Tests for Mistral adapter."""

    @pytest.fixture
    def adapter(self) -> MistralAdapter:
        """Create adapter with test key."""
        return MistralAdapter(api_key="test-key")

    def test_generate_success(
        self,
        adapter: MistralAdapter,
        mock_openai_compatible_response: dict[str, Any],
    ) -> None:
        """Test successful generation."""
        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(mock_openai_compatible_response, 200)

            result = adapter.generate(
                "mistral-large",
                [{"role": "user", "content": "Hello"}],
            )

            assert result.content == "This is a mock response."


class TestLLMResponse:
    """Tests for LLMResponse dataclass."""

    def test_to_dict(self) -> None:
        """Test serialization to dict."""
        response = LLMResponse(
            content="Hello",
            input_tokens=10,
            output_tokens=20,
            model_version="gpt-4-0613",
        )
        d = response.to_dict()
        assert d["content"] == "Hello"
        assert d["inputTokens"] == 10
        assert d["outputTokens"] == 20
        assert d["modelVersion"] == "gpt-4-0613"

    def test_to_dict_with_none(self) -> None:
        """Test serialization with None values."""
        response = LLMResponse(content="Hello")
        d = response.to_dict()
        assert d["content"] == "Hello"
        assert d["inputTokens"] is None
        assert d["outputTokens"] is None


class TestErrorHandling:
    """Tests for error handling across adapters."""

    def test_timeout_is_retryable(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that timeout errors are retryable."""
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        adapter = OpenAIAdapter(api_key="test-key")

        with patch("requests.post") as mock_post:
            mock_post.side_effect = requests.Timeout("Connection timed out")

            with pytest.raises(LLMError) as exc_info:
                adapter.generate("gpt-4", [{"role": "user", "content": "Hello"}])

            assert exc_info.value.code == ErrorCode.TIMEOUT
            assert exc_info.value.retryable

    def test_connection_error_is_retryable(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that connection errors are retryable."""
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        adapter = OpenAIAdapter(api_key="test-key")

        with patch("requests.post") as mock_post:
            mock_post.side_effect = requests.ConnectionError("Connection refused")

            with pytest.raises(LLMError) as exc_info:
                adapter.generate("gpt-4", [{"role": "user", "content": "Hello"}])

            assert exc_info.value.code == ErrorCode.NETWORK_ERROR
            assert exc_info.value.retryable

    def test_auth_error_not_retryable(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that auth errors are not retryable."""
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        adapter = OpenAIAdapter(api_key="test-key")

        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(
                {"error": "Invalid key"},
                status_code=401,
                text="Unauthorized",
            )

            with pytest.raises(LLMError) as exc_info:
                adapter.generate("gpt-4", [{"role": "user", "content": "Hello"}])

            assert exc_info.value.code == ErrorCode.AUTH_ERROR
            assert not exc_info.value.retryable


class TestResolveMaxTokens:
    """Tests for resolve_max_tokens helper function."""

    def test_no_config_returns_default(self) -> None:
        """Test that None config returns default value."""
        assert resolve_max_tokens(None, 1024) == 1024

    def test_empty_config_returns_default(self) -> None:
        """Test that empty config returns default value."""
        assert resolve_max_tokens({}, 1024) == 1024

    def test_config_without_max_tokens_returns_default(self) -> None:
        """Test that config without maxTokens key returns default."""
        assert resolve_max_tokens({"maxTokensParam": "max_completion_tokens"}, 1024) == 1024

    def test_explicit_null_returns_none(self) -> None:
        """Test that explicit null value returns None (unlimited)."""
        assert resolve_max_tokens({"maxTokens": None}, 1024) is None

    def test_numeric_value_returns_value(self) -> None:
        """Test that numeric value is returned as-is."""
        assert resolve_max_tokens({"maxTokens": 8192}, 1024) == 8192

    def test_float_value_converted_to_int(self) -> None:
        """Test that float value is converted to int."""
        assert resolve_max_tokens({"maxTokens": 4096.5}, 1024) == 4096

    def test_invalid_value_returns_default(self) -> None:
        """Test that invalid value falls back to default."""
        assert resolve_max_tokens({"maxTokens": "invalid"}, 1024) == 1024


class TestMaxTokensConfig:
    """Tests for max tokens configuration in adapters."""

    @pytest.fixture
    def mock_openai_response(self) -> dict[str, Any]:
        """Mock OpenAI response."""
        return {
            "id": "chatcmpl-123",
            "model": "gpt-4-0613",
            "choices": [{"message": {"content": "Hello"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        }

    def test_openai_uses_config_max_tokens(
        self, mock_openai_response: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Test OpenAI adapter uses maxTokens from config."""
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        adapter = OpenAIAdapter(api_key="test-key")

        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(mock_openai_response, 200)

            adapter.generate(
                "gpt-4",
                [{"role": "user", "content": "Hello"}],
                model_config={"maxTokens": 8192},
            )

            payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get("json")
            assert payload["max_tokens"] == 8192

    def test_openai_unlimited_omits_max_tokens(
        self, mock_openai_response: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Test OpenAI adapter omits max_tokens when None (unlimited)."""
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        adapter = OpenAIAdapter(api_key="test-key")

        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(mock_openai_response, 200)

            adapter.generate(
                "gpt-4",
                [{"role": "user", "content": "Hello"}],
                model_config={"maxTokens": None},
            )

            payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get("json")
            assert "max_tokens" not in payload
            assert "max_completion_tokens" not in payload

    def test_gemini_uses_config_max_tokens(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test Gemini adapter uses maxTokens from config."""
        monkeypatch.setenv("GOOGLE_API_KEY", "test-key")
        adapter = GeminiAdapter(api_key="test-key")

        mock_response = {
            "candidates": [{"content": {"parts": [{"text": "Hello"}]}, "finishReason": "STOP"}],
            "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 5},
        }

        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(mock_response, 200)

            adapter.generate(
                "gemini-1.5-pro",
                [{"role": "user", "content": "Hello"}],
                model_config={"maxTokens": 16000},
            )

            payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get("json")
            assert payload["generationConfig"]["maxOutputTokens"] == 16000

    def test_gemini_unlimited_omits_max_output_tokens(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test Gemini adapter omits maxOutputTokens when None (unlimited)."""
        monkeypatch.setenv("GOOGLE_API_KEY", "test-key")
        adapter = GeminiAdapter(api_key="test-key")

        mock_response = {
            "candidates": [{"content": {"parts": [{"text": "Hello"}]}, "finishReason": "STOP"}],
            "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 5},
        }

        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(mock_response, 200)

            adapter.generate(
                "gemini-2.5-pro",
                [{"role": "user", "content": "Hello"}],
                model_config={"maxTokens": None},
            )

            payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get("json")
            assert "maxOutputTokens" not in payload["generationConfig"]

    def test_anthropic_uses_high_default_for_unlimited(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test Anthropic adapter uses high default when maxTokens is None (since max_tokens is required)."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        adapter = AnthropicAdapter(api_key="test-key")

        mock_response = {
            "id": "msg-123",
            "model": "claude-3-sonnet",
            "content": [{"type": "text", "text": "Hello"}],
            "usage": {"input_tokens": 10, "output_tokens": 5},
        }

        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(mock_response, 200)

            adapter.generate(
                "claude-3-sonnet",
                [{"role": "user", "content": "Hello"}],
                model_config={"maxTokens": None},
            )

            payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1].get("json")
            # Anthropic requires max_tokens, so we use 8192 as the default for "unlimited"
            assert payload["max_tokens"] == 8192


# Mirrors the production failure shape from PR #N (data-quality scan 2026-04-25):
# deepseek-reasoner billed 513 completion tokens but message.content was empty
# because the model emitted everything as reasoning_content. The previous adapter
# silently coerced the empty value to "" and probe_results was marked SUCCESS
# with an unparseable transcript. After the fix the adapter raises INVALID_RESPONSE.
def _openai_compat_response(content, completion_tokens, *, reasoning_tokens=None, finish_reason="stop"):
    """Build a minimal OpenAI-compatible response body for testing empty-content paths."""
    body = {
        "id": "chatcmpl-empty",
        "object": "chat.completion",
        "created": 1,
        "model": "test-model",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": finish_reason,
            }
        ],
        "usage": {
            "prompt_tokens": 100,
            "completion_tokens": completion_tokens,
            "total_tokens": 100 + completion_tokens,
        },
    }
    if reasoning_tokens is not None:
        body["usage"]["completion_tokens_details"] = {"reasoning_tokens": reasoning_tokens}
    return body


class TestEmptyContentRaises:
    """Adapters must raise LLMError(INVALID_RESPONSE) when the visible content is empty."""

    def test_deepseek_reasoner_only_response_raises(self) -> None:
        """Reproduces the production bug: completion_tokens=513, reasoning_tokens=510, content=''."""
        adapter = DeepSeekAdapter(api_key="test-key")

        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(
                _openai_compat_response("", completion_tokens=513, reasoning_tokens=510),
                200,
            )

            with pytest.raises(LLMError) as exc_info:
                adapter.generate("deepseek-reasoner", [{"role": "user", "content": "Hi"}])

        assert exc_info.value.code == ErrorCode.INVALID_RESPONSE
        assert "output_tokens=513" in exc_info.value.message
        assert "deepseek" in exc_info.value.message

    def test_deepseek_null_content_raises(self) -> None:
        """null content (vs empty string) should also raise."""
        adapter = DeepSeekAdapter(api_key="test-key")

        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(
                _openai_compat_response(None, completion_tokens=400),
                200,
            )

            with pytest.raises(LLMError) as exc_info:
                adapter.generate("deepseek-reasoner", [{"role": "user", "content": "Hi"}])

        assert exc_info.value.code == ErrorCode.INVALID_RESPONSE

    def test_deepseek_whitespace_only_content_raises(self) -> None:
        """Whitespace-only content cannot drive a canonical decision; should raise."""
        adapter = DeepSeekAdapter(api_key="test-key")

        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(
                _openai_compat_response("   \n\t  ", completion_tokens=200),
                200,
            )

            with pytest.raises(LLMError) as exc_info:
                adapter.generate("deepseek-chat", [{"role": "user", "content": "Hi"}])

        assert exc_info.value.code == ErrorCode.INVALID_RESPONSE

    def test_xai_zero_token_empty_response_raises(self) -> None:
        """Reproduces the grok-4-0709 failure: completion_tokens=0, finish_reason=''."""
        adapter = XAIAdapter(api_key="test-key")

        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(
                _openai_compat_response("", completion_tokens=0, finish_reason=""),
                200,
            )

            with pytest.raises(LLMError) as exc_info:
                adapter.generate("grok-4-0709", [{"role": "user", "content": "Hi"}])

        assert exc_info.value.code == ErrorCode.INVALID_RESPONSE
        assert "output_tokens=0" in exc_info.value.message
        assert "xai" in exc_info.value.message

    def test_openai_empty_content_raises(self) -> None:
        adapter = OpenAIAdapter(api_key="test-key")

        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(
                _openai_compat_response("", completion_tokens=42),
                200,
            )

            with pytest.raises(LLMError) as exc_info:
                adapter.generate("gpt-4", [{"role": "user", "content": "Hi"}])

        assert exc_info.value.code == ErrorCode.INVALID_RESPONSE

    def test_mistral_empty_content_raises(self) -> None:
        adapter = MistralAdapter(api_key="test-key")

        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(
                _openai_compat_response("", completion_tokens=42),
                200,
            )

            with pytest.raises(LLMError) as exc_info:
                adapter.generate("mistral-large", [{"role": "user", "content": "Hi"}])

        assert exc_info.value.code == ErrorCode.INVALID_RESPONSE

    def test_anthropic_empty_content_raises(self) -> None:
        """Anthropic returns a content array — empty text parts must also raise."""
        adapter = AnthropicAdapter(api_key="test-key")

        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(
                {
                    "id": "msg-empty",
                    "model": "claude-3-sonnet",
                    "content": [{"type": "text", "text": ""}],
                    "stop_reason": "end_turn",
                    "usage": {"input_tokens": 10, "output_tokens": 50},
                },
                200,
            )

            with pytest.raises(LLMError) as exc_info:
                adapter.generate("claude-3-sonnet", [{"role": "user", "content": "Hi"}])

        assert exc_info.value.code == ErrorCode.INVALID_RESPONSE

    def test_anthropic_no_text_parts_raises(self) -> None:
        """Anthropic content array with no text-type parts must raise."""
        adapter = AnthropicAdapter(api_key="test-key")

        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(
                {
                    "id": "msg-empty",
                    "model": "claude-3-sonnet",
                    "content": [],
                    "stop_reason": "end_turn",
                    "usage": {"input_tokens": 10, "output_tokens": 0},
                },
                200,
            )

            with pytest.raises(LLMError) as exc_info:
                adapter.generate("claude-3-sonnet", [{"role": "user", "content": "Hi"}])

        assert exc_info.value.code == ErrorCode.INVALID_RESPONSE

    def test_non_empty_content_does_not_raise(self) -> None:
        """Sanity: a normal response still succeeds."""
        adapter = DeepSeekAdapter(api_key="test-key")

        with patch("requests.post") as mock_post:
            mock_post.return_value = MockResponse(
                _openai_compat_response("Strongly support taking the job", completion_tokens=42),
                200,
            )

            result = adapter.generate("deepseek-chat", [{"role": "user", "content": "Hi"}])

        assert result.content == "Strongly support taking the job"
