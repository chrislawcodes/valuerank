"""Tests for health check worker."""

import json
from unittest.mock import patch

import pytest


class TestCheckPythonVersion:
    """Tests for Python version checking."""

    def test_current_version_passes(self) -> None:
        """Test current Python version passes check."""
        from health_check import check_python_version

        ok, message = check_python_version()
        assert ok is True
        assert "Python" in message


class TestCheckPackages:
    """Tests for package checking."""

    def test_required_packages_found(self) -> None:
        """Test required packages are found."""
        from health_check import check_packages

        packages, warnings = check_packages()

        # requests and pyyaml should be installed
        assert "requests" in packages
        # pyyaml might be "pyyaml" or "PyYAML" depending on install
        assert any("yaml" in p.lower() for p in packages)


class TestCheckApiKeys:
    """Tests for API key checking."""

    def test_no_keys_warns(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test warning when no API keys configured."""
        # Clear all API keys
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("XAI_API_KEY", raising=False)
        monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
        monkeypatch.delenv("MISTRAL_API_KEY", raising=False)

        # Reload config
        from common.config import reload_config

        reload_config()

        from health_check import check_api_keys

        api_keys, warnings = check_api_keys()

        # All should be False
        assert all(v is False for v in api_keys.values())
        # Should warn about no keys
        assert any("No LLM API keys" in w for w in warnings)

    def test_with_openai_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test detection of OpenAI key."""
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        monkeypatch.delenv("XAI_API_KEY", raising=False)
        monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
        monkeypatch.delenv("MISTRAL_API_KEY", raising=False)

        from common.config import reload_config

        reload_config()

        from health_check import check_api_keys

        api_keys, warnings = check_api_keys()

        assert api_keys["openai"] is True
        assert api_keys["anthropic"] is False
        # No warning about missing keys since we have one
        assert not any("No LLM API keys" in w for w in warnings)


class TestRunHealthCheck:
    """Tests for full health check."""

    def test_success(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test successful health check."""
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")

        from common.config import reload_config

        reload_config()

        from health_check import run_health_check

        result = run_health_check()

        assert result["success"] is True
        assert "health" in result
        assert "pythonVersion" in result["health"]
        assert "packages" in result["health"]
        assert "apiKeys" in result["health"]


class TestMainFunction:
    """Tests for main stdin/stdout handling."""

    def test_returns_success(
        self, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Test main function returns success."""
        from io import StringIO
        import sys

        monkeypatch.setenv("OPENAI_API_KEY", "test-key")

        from common.config import reload_config

        reload_config()

        with patch.object(sys, "stdin", StringIO("{}")):
            from health_check import main

            main()

        captured = capsys.readouterr()
        result = json.loads(captured.out)
        assert result["success"] is True
