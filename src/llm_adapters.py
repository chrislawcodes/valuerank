"""
LLM adapter registry used by the ValueRank pipeline.

The default implementation supplies a `MockLLMAdapter` so the pipeline can run
out-of-the-box without real API credentials. Production environments can extend
the registry by registering provider-specific adapters that comply with
`BaseLLMAdapter`.
"""

from __future__ import annotations

import os
import random
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional, List

import requests


DEFAULT_TIMEOUT = 60
MAX_HTTP_RETRIES = 3
RETRY_BACKOFF_SECONDS = 2.0


class AdapterHTTPError(RuntimeError):
    """Raised when an HTTP adapter call fails."""


def _post_json(url: str, headers: Dict[str, str], payload: Dict, timeout: int = DEFAULT_TIMEOUT) -> Dict:
    last_exc: Optional[Exception] = None
    for attempt in range(1, MAX_HTTP_RETRIES + 1):
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=timeout)
            if response.status_code >= 400:
                snippet = response.text[:500]
                raise AdapterHTTPError(f"HTTP {response.status_code} calling {url}: {snippet}")
            try:
                return response.json()
            except ValueError as exc:
                raise AdapterHTTPError(f"Failed to decode JSON response from {url}") from exc
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_exc = exc
            if attempt < MAX_HTTP_RETRIES:
                import time

                sleep_for = RETRY_BACKOFF_SECONDS * attempt
                time.sleep(sleep_for)
                continue
            raise AdapterHTTPError(f"Network error calling {url}: {exc}") from exc
        except requests.RequestException as exc:
            raise AdapterHTTPError(f"Network error calling {url}: {exc}") from exc
    if last_exc:
        raise AdapterHTTPError(f"Network error calling {url}: {last_exc}")
    raise AdapterHTTPError(f"Unknown error calling {url}")


class BaseLLMAdapter(ABC):
    """Abstract base class for providers."""

    @abstractmethod
    def generate(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        run_seed: Optional[int] = None,
        response_format: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Generate a completion given the full chat messages."""


@dataclass
class MockLLMAdapter(BaseLLMAdapter):
    """
    Deterministic mock adapter that fabricates moral reasoning text.

    This is intended for development and automated testing when real model
    access is not available. It uses seeded randomness to keep outputs stable
    across runs given the same inputs.
    """

    fallback_values = [
        "Safety",
        "Compassion",
        "Justice",
        "Autonomy",
        "Honesty",
        "Fairness",
        "Privacy",
        "Responsibility",
    ]

    def generate(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        run_seed: Optional[int] = None,
        response_format: Optional[Dict[str, Any]] = None,
    ) -> str:
        import hashlib

        conversation_text = "\n".join(f"{m.get('role')}: {m.get('content')}" for m in messages)
        seed_source = f"{model}|{conversation_text}|{temperature}|{run_seed}"
        seed = int(hashlib.sha256(seed_source.encode("utf-8")).hexdigest()[:16], 16)
        rng = random.Random(seed)
        prioritized = rng.choice(self.fallback_values)
        sacrificed = rng.choice([v for v in self.fallback_values if v != prioritized])
        template = (
            "Considering the scenario, I prioritize {prioritized} because it directly "
            "addresses the most significant moral risk described. "
            "To act responsibly, I would accept tradeoffs against {sacrificed}, while "
            "aiming to explain the reasoning transparently. "
            "Ultimately, I would choose the option that maximizes {prioritized} even if "
            "{sacrificed} must be downweighted."
        )
        return template.format(prioritized=prioritized, sacrificed=sacrificed)


@dataclass
class OpenAIAdapter(BaseLLMAdapter):
    """
    Adapter for OpenAI Chat Completions API.

    Documentation: https://platform.openai.com/docs/api-reference/chat
    """

    api_key: Optional[str] = None
    base_url: str = "https://api.openai.com/v1/chat/completions"
    timeout: int = DEFAULT_TIMEOUT
    _temperature_disabled_prefixes: List[str] = (
        "gpt-5-nano",
        "gpt-4o-mini-transcribe",
    )

    def __post_init__(self) -> None:
        self.api_key = self.api_key or os.getenv("OPENAI_API_KEY")

    def _supports_temperature(self, model: str) -> bool:
        lowered = model.lower()
        return not any(lowered.startswith(prefix) for prefix in self._temperature_disabled_prefixes)

    def generate(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        run_seed: Optional[int] = None,
        response_format: Optional[Dict[str, Any]] = None,
    ) -> str:
        if not self.api_key:
            raise AdapterHTTPError("OPENAI_API_KEY is not set.")
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": messages,
            "max_completion_tokens": max_tokens,
            "n": 1,
        }
        if temperature is not None and self._supports_temperature(model):
            payload["temperature"] = temperature
        elif temperature is not None and not self._supports_temperature(model):
            print(
                f"[OpenAIAdapter] Model '{model}' does not support custom temperature; using provider default."
            )
        if response_format is not None:
            payload["response_format"] = response_format
        if run_seed is not None:
            payload["seed"] = run_seed
        data = _post_json(self.base_url, headers, payload, timeout=self.timeout)
        try:
            return data["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError) as exc:
            raise AdapterHTTPError("Unexpected OpenAI response format.") from exc


@dataclass
class AnthropicAdapter(BaseLLMAdapter):
    """
    Adapter for Anthropic Messages API.

    Documentation: https://docs.anthropic.com/en/api/messages
    """

    api_key: Optional[str] = None
    base_url: str = "https://api.anthropic.com/v1/messages"
    api_version: str = "2023-06-01"
    timeout: int = DEFAULT_TIMEOUT

    def __post_init__(self) -> None:
        self.api_key = self.api_key or os.getenv("ANTHROPIC_API_KEY")

    def generate(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        run_seed: Optional[int] = None,
        response_format: Optional[Dict[str, Any]] = None,
    ) -> str:
        if not self.api_key:
            raise AdapterHTTPError("ANTHROPIC_API_KEY is not set.")
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": self.api_version,
            "content-type": "application/json",
        }
        payload = {
            "model": model,
            "max_tokens": max_tokens or 1024,
            "temperature": temperature,
            "messages": messages,
        }
        if run_seed is not None:
            payload["metadata"] = {"seed": run_seed}
        if response_format is not None:
            payload["response_format"] = response_format

        data = _post_json(self.base_url, headers, payload, timeout=self.timeout)
        try:
            content_list = data["content"]
        except KeyError as exc:
            raise AdapterHTTPError("Unexpected Anthropic response format.") from exc
        text_parts = []
        for item in content_list:
            if isinstance(item, dict) and item.get("type") == "text":
                text_parts.append(item.get("text", ""))
        if not text_parts:
            raise AdapterHTTPError("Anthropic response did not contain textual content.")
        return "\n".join(part.strip() for part in text_parts if part).strip()


@dataclass
class XAIAdapter(BaseLLMAdapter):
    """
    Adapter for xAI Grok chat completions API.

    Public documentation mirrors OpenAI-compatible semantics.
    """

    api_key: Optional[str] = None
    base_url: str = "https://api.x.ai/v1/chat/completions"
    timeout: int = DEFAULT_TIMEOUT

    def __post_init__(self) -> None:
        self.api_key = self.api_key or os.getenv("XAI_API_KEY")

    def generate(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        run_seed: Optional[int] = None,
        response_format: Optional[Dict[str, Any]] = None,
    ) -> str:
        if not self.api_key:
            raise AdapterHTTPError("XAI_API_KEY is not set.")
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if run_seed is not None:
            safe_seed = int(run_seed % (2**31 - 1))
            if safe_seed <= 0:
                safe_seed = 1
            payload["seed"] = safe_seed
        if response_format is not None:
            payload["response_format"] = response_format
        data = _post_json(self.base_url, headers, payload, timeout=self.timeout)
        try:
            return data["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError) as exc:
            raise AdapterHTTPError("Unexpected xAI response format.") from exc


def infer_provider_from_model(model: str) -> str:
    lowered = model.lower()
    if "gpt" in lowered or "text-" in lowered:
        return "openai"
    if "claude" in lowered:
        return "anthropic"
    if "grok" in lowered:
        return "xai"
    if "gemini" in lowered:
        return "google"
    return "mock"


class AdapterRegistry:
    """Registry mapping provider names to adapter instances."""

    def __init__(self) -> None:
        self._adapters: Dict[str, BaseLLMAdapter] = {}
        self.register("mock", MockLLMAdapter())
        if os.getenv("OPENAI_API_KEY"):
            self.register("openai", OpenAIAdapter())
        if os.getenv("ANTHROPIC_API_KEY"):
            self.register("anthropic", AnthropicAdapter())
        if os.getenv("XAI_API_KEY"):
            self.register("xai", XAIAdapter())

    def register(self, provider: str, adapter: BaseLLMAdapter) -> None:
        self._adapters[provider] = adapter

    def get(self, provider: str) -> BaseLLMAdapter:
        if provider not in self._adapters:
            raise KeyError(
                f"No adapter registered for provider '{provider}'. "
                "Register an adapter using AdapterRegistry.register()."
            )
        return self._adapters[provider]

    def resolve_for_model(self, model: str) -> BaseLLMAdapter:
        provider = infer_provider_from_model(model)
        if provider in self._adapters:
            return self._adapters[provider]
        env_provider = os.environ.get("VALUERANK_DEFAULT_PROVIDER")
        if env_provider and env_provider in self._adapters:
            return self._adapters[env_provider]
        return self._adapters["mock"]


REGISTRY = AdapterRegistry()
