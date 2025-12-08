"""
Configuration and environment variable loading for Python workers.

Reads API keys and settings from environment variables.
"""

import os
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv


@dataclass(frozen=True)
class Config:
    """Configuration loaded from environment variables."""

    # LLM API Keys
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    xai_api_key: Optional[str] = None
    deepseek_api_key: Optional[str] = None
    mistral_api_key: Optional[str] = None

    # Worker settings
    debug: bool = False
    timeout: int = 300  # seconds

    @classmethod
    def from_env(cls) -> "Config":
        """Load configuration from environment variables."""
        # Load .env file if present
        load_dotenv()

        return cls(
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
            google_api_key=os.getenv("GOOGLE_API_KEY"),
            xai_api_key=os.getenv("XAI_API_KEY"),
            deepseek_api_key=os.getenv("DEEPSEEK_API_KEY"),
            mistral_api_key=os.getenv("MISTRAL_API_KEY"),
            debug=os.getenv("PYTHON_WORKER_DEBUG", "").lower() in ("true", "1", "yes"),
            timeout=int(os.getenv("PYTHON_WORKER_TIMEOUT", "300")),
        )

    def get_api_key(self, provider: str) -> Optional[str]:
        """Get API key for a specific provider."""
        key_map = {
            "openai": self.openai_api_key,
            "anthropic": self.anthropic_api_key,
            "google": self.google_api_key,
            "xai": self.xai_api_key,
            "deepseek": self.deepseek_api_key,
            "mistral": self.mistral_api_key,
        }
        return key_map.get(provider.lower())

    def has_api_key(self, provider: str) -> bool:
        """Check if an API key is configured for a provider."""
        return self.get_api_key(provider) is not None

    def get_configured_providers(self) -> list[str]:
        """Get list of providers that have API keys configured."""
        providers = []
        if self.openai_api_key:
            providers.append("openai")
        if self.anthropic_api_key:
            providers.append("anthropic")
        if self.google_api_key:
            providers.append("google")
        if self.xai_api_key:
            providers.append("xai")
        if self.deepseek_api_key:
            providers.append("deepseek")
        if self.mistral_api_key:
            providers.append("mistral")
        return providers


# Global config instance (lazy loaded)
_config: Optional[Config] = None


def get_config() -> Config:
    """Get the global config instance, loading from environment if needed."""
    global _config
    if _config is None:
        _config = Config.from_env()
    return _config


def reload_config() -> Config:
    """Force reload of configuration from environment."""
    global _config
    _config = Config.from_env()
    return _config
