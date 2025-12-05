"""
LLM adapter registry used by the ValueRank pipeline.

The default implementation supplies a `MockLLMAdapter` so the pipeline can run
out-of-the-box without real API credentials. Production environments can extend
the registry by registering provider-specific adapters that comply with
`BaseLLMAdapter`.
"""

from __future__ import annotations

import json
import os
import random
import re
import threading
import time
import datetime
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional, List, Tuple, Set

import requests
from dotenv import load_dotenv

# Load .env file from project root (if it exists)
load_dotenv()


DEFAULT_TIMEOUT = 60
MAX_HTTP_RETRIES = 3
RETRY_BACKOFF_SECONDS = 2.0
DETERMINISTIC_MODEL_PREFIXES = (
    "gpt-5",
    "o1",
    "o1-mini",
    "o1-preview",
    "o1-pro",
    "gpt-4o-reasoning",
    "gpt-4o-mini-transcribe",
)
DETERMINISTIC_MODEL_SUFFIXES = ("-reasoning",)
VENDOR_TEMP_DEFAULTS = {
    "openai": 0.0,
    "anthropic": 0.7,
    "google": 0.7,
    "mistral": 0.7,
    "xai": 0.7,
}
UNSUPPORTED_PARAM_NAMES = ("temperature", "top_p", "presence_penalty", "frequency_penalty", "n")
_PARAM_DEBUG_EMITTED: Set[str] = set()
PROVIDER_PREFIX_MAP = {
    "openai": "openai",
    "anthropic": "anthropic",
    "xai": "xai",
    "google": "google",
    "deepseek": "deepseek",
    "mistral": "mistral",
}
PROVIDER_ENV_HINTS = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "xai": "XAI_API_KEY",
    "google": "GOOGLE_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "mistral": "MISTRAL_API_KEY",
}
MAX_SEED_VALUE = 2**63 - 1
MAX_SEED_VALUE_31 = 2**31 - 1


class AdapterHTTPError(RuntimeError):
    """Raised when an HTTP adapter call fails."""


def _heartbeat(
    stop_event: threading.Event,
    model: str,
    interval: int = 30,
    timeout: int = 300,
    status_label: Optional[str] = None,
    debug: bool = False,
) -> None:
    start = time.time()
    while not stop_event.wait(interval):
        if not debug:
            continue
        elapsed = int(time.time() - start)
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        if status_label:
            print(f"[{ts}] [{status_label}] Waiting on Judge. elapsed = {elapsed}s (timeout = {timeout}s)")
        else:
            print(f"[{ts}] [Adapter] Still waiting on model {model}… elapsed={elapsed}s (timeout={timeout}s)")


def _post_json(
    url: str,
    headers: Dict[str, str],
    payload: Dict,
    timeout: int = DEFAULT_TIMEOUT,
    model: str = "unknown",
    status_label: Optional[str] = None,
    debug: bool = False,
) -> Dict:
    last_exc: Optional[Exception] = None
    for attempt in range(1, MAX_HTTP_RETRIES + 1):
        stop_event = threading.Event()
        thread: Optional[threading.Thread] = None
        if debug:
            thread = threading.Thread(target=_heartbeat, args=(stop_event, model, 30, timeout, status_label, True))
            thread.daemon = True
            thread.start()
        try:
            try:
                response = requests.post(url, headers=headers, json=payload, timeout=timeout)
            finally:
                stop_event.set()
                if thread:
                    thread.join(timeout=1)
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
                sleep_for = RETRY_BACKOFF_SECONDS * attempt
                time.sleep(sleep_for)
                continue
            raise AdapterHTTPError(f"Network error calling {url}: {exc}") from exc
        except requests.RequestException as exc:
            raise AdapterHTTPError(f"Network error calling {url}: {exc}") from exc
    if last_exc:
        raise AdapterHTTPError(f"Network error calling {url}: {last_exc}")
    raise AdapterHTTPError(f"Unknown error calling {url}")


def _normalize_seed(value: int, *, max_value: int = MAX_SEED_VALUE) -> int:
    safe = abs(int(value))
    safe = safe % max_value
    if safe == 0:
        safe = 1
    return safe


def _is_reasoning_model(model: str) -> bool:
    lowered = model.lower()
    if any(lowered.startswith(prefix) for prefix in DETERMINISTIC_MODEL_PREFIXES):
        return True
    if any(lowered.endswith(suffix) for suffix in DETERMINISTIC_MODEL_SUFFIXES):
        return True
    return False


def _emit_param_debug_line(model: str, vendor: str, meta: Dict[str, str], *, debug: bool = False) -> None:
    key = f"{vendor}:{model}"
    if key in _PARAM_DEBUG_EMITTED:
        return
    if not debug:
        return
    parts = [
        f"[Adapter] Model={model}",
        f"Vendor={vendor}",
        f"Temperature={meta.get('temperature', 'auto (none)')}",
        f"Top_p={meta.get('top_p', 'auto (none)')}",
        f"Presence_penalty={meta.get('presence_penalty', 'auto (none)')}",
        f"Frequency_penalty={meta.get('frequency_penalty', 'auto (none)')}",
        f"n={meta.get('n', 'auto (none)')}",
    ]
    print(" | ".join(parts))
    _PARAM_DEBUG_EMITTED.add(key)


def _prepare_generation_params(
    model: str,
    vendor: str,
    *,
    temperature: Optional[float],
    top_p: Optional[float],
    presence_penalty: Optional[float],
    frequency_penalty: Optional[float],
    n: Optional[int],
    debug: bool = False,
) -> Dict[str, Any]:
    vendor_lower = vendor.lower()
    if vendor_lower == "anthropic":
        presence_penalty = None
        frequency_penalty = None
        n = None
        if temperature is not None and top_p is not None:
            top_p = None
    if vendor_lower == "google":
        presence_penalty = None
        frequency_penalty = None
        n = None
    params: Dict[str, Any] = {}
    debug_meta: Dict[str, str] = {}
    deterministic = _is_reasoning_model(model)

    def record(name: str, value: Optional[float], default: Optional[float], skip_if_deterministic: bool = True) -> None:
        if deterministic and skip_if_deterministic:
            debug_meta[name] = "auto (skipped)"
            return
        final_value = value if value is not None else default
        if final_value is None:
            debug_meta[name] = "auto (none)"
            return
        params[name] = final_value
        debug_meta[name] = f"{final_value}"

    default_temp = VENDOR_TEMP_DEFAULTS.get(vendor_lower, 0.7)
    record("temperature", temperature, default_temp)
    record("top_p", top_p, None)
    record("presence_penalty", presence_penalty, None)
    record("frequency_penalty", frequency_penalty, None)
    default_n = 1 if vendor_lower == "openai" else None
    record("n", n, default_n)

    _emit_param_debug_line(model, vendor_lower, debug_meta, debug=debug)
    return params


def _detect_unsupported_param(exc: AdapterHTTPError) -> Optional[str]:
    text = str(exc).lower()
    if "unsupported" not in text and "does not support" not in text:
        return None
    for name in UNSUPPORTED_PARAM_NAMES:
        if name in text:
            return name
    return None


def _post_json_with_param_retry(
    url: str,
    headers: Dict[str, str],
    payload: Dict[str, Any],
    *,
    model: str,
    timeout: int = DEFAULT_TIMEOUT,
    debug: bool = False,
    status_label: Optional[str] = None,
) -> Dict:
    try:
        if debug:
            print(f"[Debug] Using network timeout={timeout}s")
        data = _post_json(
            url,
            headers,
            payload,
            timeout=timeout,
            model=model,
            status_label=status_label,
            debug=debug,
        )
        if debug:
            print("[Debug] Adapter raw JSON ===")
            try:
                print(json.dumps(data, indent=2)[:2000])
            except Exception:
                print(str(data)[:2000])
            print("[Debug] === END RAW ===")
        return data
    except AdapterHTTPError as exc:
        offending = _detect_unsupported_param(exc)
        if offending and offending in payload:
            trimmed_payload = dict(payload)
            trimmed_payload.pop(offending, None)
            if debug:
                print(f"[Debug] Retried without {offending} for model {model} (unsupported parameter).")
            data = _post_json(
                url,
                headers,
                trimmed_payload,
                timeout=timeout,
                model=model,
                status_label=status_label,
            )
            if debug:
                print("[Debug] Adapter raw JSON ===")
                try:
                    print(json.dumps(data, indent=2)[:2000])
                except Exception:
                    print(str(data)[:2000])
                print("[Debug] === END RAW ===")
            return data
        raise


def _resolve_timeout_for_model(model: str, base_timeout: int) -> int:
    if _is_reasoning_model(model):
        timeout = 300
    else:
        timeout = base_timeout
    return timeout


def _ensure_text_response_format(
    payload: Dict[str, Any],
    *,
    model: str,
    response_format: Optional[Dict[str, Any]],
    debug: bool = False,
) -> None:
    if response_format is not None:
        payload["response_format"] = response_format
        return
    needs_response_format = _is_reasoning_model(model)
    if needs_response_format:
        payload["response_format"] = {"type": "text"}
        if debug:
            print(f"[Debug] Added response_format=text for model {model}")
    else:
        if debug:
            print(f"[Debug] No response_format needed for model {model}")


class BaseLLMAdapter(ABC):
    """Abstract base class for providers."""

    @abstractmethod
    def generate(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: Optional[float],
        max_tokens: int,
        run_seed: Optional[int] = None,
        debug: bool = False,
        status_label: Optional[str] = None,
        response_format: Optional[Dict[str, Any]] = None,
        top_p: Optional[float] = None,
        presence_penalty: Optional[float] = None,
        frequency_penalty: Optional[float] = None,
        n: Optional[int] = None,
    ) -> str:
        """Generate a completion given the full chat messages."""


@dataclass
class MockLLMAdapter(BaseLLMAdapter):
    """
    Mock adapter that emits explicit placeholder text so users know a real
    provider call never occurred.

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
        temperature: Optional[float],
        max_tokens: int,
        run_seed: Optional[int] = None,
        debug: bool = False,
        status_label: Optional[str] = None,
        response_format: Optional[Dict[str, Any]] = None,
        top_p: Optional[float] = None,
        presence_penalty: Optional[float] = None,
        frequency_penalty: Optional[float] = None,
        n: Optional[int] = None,
    ) -> str:
        provider, _ = _split_provider_prefix(model)
        provider = provider or infer_provider_from_model(model)
        env_hint = PROVIDER_ENV_HINTS.get(provider.lower() if provider else "")
        hint_line = (
            f"Set {env_hint} in your environment to enable this provider."
            if env_hint
            else "Provide the correct API credentials to enable live calls."
        )
        return (
            "[MockAdapter Placeholder]\n"
            f"ValueRank could not contact model '{model}' because no adapter was configured "
            f"for provider '{provider}'.\n"
            "The probe is running in mock mode, so no external AI response is available.\n"
            f"{hint_line}"
        )


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
        if _is_reasoning_model(model):
            return False
        lowered = model.lower()
        return not any(lowered.startswith(prefix) for prefix in self._temperature_disabled_prefixes)

    def generate(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: Optional[float],
        max_tokens: int,
        run_seed: Optional[int] = None,
        debug: bool = False,
        status_label: Optional[str] = None,
        response_format: Optional[Dict[str, Any]] = None,
        top_p: Optional[float] = None,
        presence_penalty: Optional[float] = None,
        frequency_penalty: Optional[float] = None,
        n: Optional[int] = None,
    ) -> str:
        if not self.api_key:
            raise AdapterHTTPError("OPENAI_API_KEY is not set.")
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        vendor = "openai"
        param_payload = _prepare_generation_params(
            model,
            vendor,
            temperature=temperature if self._supports_temperature(model) else None,
            top_p=top_p,
            presence_penalty=presence_penalty,
            frequency_penalty=frequency_penalty,
            n=n,
            debug=debug,
        )
        adjusted_messages = [dict(m) for m in messages]
        max_completion_tokens = max_tokens
        if _is_reasoning_model(model):
            max_completion_tokens = max(max_tokens, 8192)
            if adjusted_messages and isinstance(adjusted_messages[-1].get("content"), str):
                adjusted_messages[-1]["content"] += (
                    "\n\nAfter completing your reasoning, output your full and final answer clearly in natural language. "
                    "Do not omit your response."
                )
            if debug:
                print(f"[Debug] Increased output limit to {max_completion_tokens} for model {model}")
        payload = {
            "model": model,
            "messages": adjusted_messages,
            "max_completion_tokens": max_completion_tokens,
        }
        payload.update(param_payload)
        _ensure_text_response_format(payload, model=model, response_format=response_format, debug=debug)
        if run_seed is not None:
            payload["seed"] = _normalize_seed(run_seed)
        request_timeout = _resolve_timeout_for_model(model, self.timeout)
        data = _post_json_with_param_retry(
            self.base_url,
            headers,
            payload,
            model=model,
            timeout=request_timeout,
            debug=debug,
            status_label=status_label,
        )
        try:
            return _extract_message_content(data["choices"][0]["message"])
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
        temperature: Optional[float],
        max_tokens: int,
        run_seed: Optional[int] = None,
        debug: bool = False,
        status_label: Optional[str] = None,
        response_format: Optional[Dict[str, Any]] = None,
        top_p: Optional[float] = None,
        presence_penalty: Optional[float] = None,
        frequency_penalty: Optional[float] = None,
        n: Optional[int] = None,
    ) -> str:
        if not self.api_key:
            raise AdapterHTTPError("ANTHROPIC_API_KEY is not set.")
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": self.api_version,
            "content-type": "application/json",
        }
        vendor = "anthropic"
        param_payload = _prepare_generation_params(
            model,
            vendor,
            temperature=temperature,
            top_p=top_p,
            presence_penalty=presence_penalty,
            frequency_penalty=frequency_penalty,
            n=n,
            debug=debug,
        )
        system_segments: List[str] = []
        transformed_messages: List[Dict[str, str]] = []
        for message in messages:
            role = message.get("role")
            content = message.get("content", "")
            if isinstance(content, list):
                content = "\n".join(
                    part.get("text", "")
                    if isinstance(part, dict)
                    else str(part)
                    for part in content
                )
            content = str(content)
            if role == "system":
                if content.strip():
                    system_segments.append(content.strip())
                continue
            transformed_messages.append({"role": role or "user", "content": content})
        if not transformed_messages:
            transformed_messages = [{"role": "user", "content": ""}]
        payload = {
            "model": model,
            "max_tokens": max_tokens or 1024,
            "messages": transformed_messages,
        }
        if system_segments:
            payload["system"] = "\n\n".join(segment for segment in system_segments if segment).strip()
        payload.update(param_payload)
        _ensure_text_response_format(payload, model=model, response_format=response_format, debug=debug)
        send_metadata = os.getenv("VALUERANK_SEND_ANTHROPIC_METADATA")
        if run_seed is not None and send_metadata:
            payload["metadata"] = {"seed": run_seed}

        request_timeout = _resolve_timeout_for_model(model, self.timeout)
        data = _post_json_with_param_retry(
            self.base_url,
            headers,
            payload,
            model=model,
            timeout=request_timeout,
            debug=debug,
            status_label=status_label,
        )
        try:
            content_list = data["content"]
        except KeyError as exc:
            raise AdapterHTTPError("Unexpected Anthropic response format.") from exc
        text_parts = []
        for item in content_list:
            if isinstance(item, dict) and item.get("type") == "text":
                text_parts.append(item.get("text", ""))
        if text_parts:
            return "\n".join(part.strip() for part in text_parts if part).strip()
        raise AdapterHTTPError("Anthropic response did not contain textual content.")


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
        temperature: Optional[float],
        max_tokens: int,
        run_seed: Optional[int] = None,
        debug: bool = False,
        status_label: Optional[str] = None,
        response_format: Optional[Dict[str, Any]] = None,
        top_p: Optional[float] = None,
        presence_penalty: Optional[float] = None,
        frequency_penalty: Optional[float] = None,
        n: Optional[int] = None,
    ) -> str:
        if not self.api_key:
            raise AdapterHTTPError("XAI_API_KEY is not set.")
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        vendor = "xai"
        param_payload = _prepare_generation_params(
            model,
            vendor,
            temperature=temperature,
            top_p=top_p,
            presence_penalty=presence_penalty,
            frequency_penalty=frequency_penalty,
            n=n,
            debug=debug,
        )
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        payload.update(param_payload)
        if run_seed is not None:
            payload["seed"] = _normalize_seed(run_seed, max_value=MAX_SEED_VALUE_31)
        _ensure_text_response_format(payload, model=model, response_format=response_format, debug=debug)
        request_timeout = _resolve_timeout_for_model(model, self.timeout)
        data = _post_json_with_param_retry(
            self.base_url,
            headers,
            payload,
            model=model,
            timeout=request_timeout,
            debug=debug,
            status_label=status_label,
        )
        try:
            return _extract_message_content(data["choices"][0]["message"])
        except (KeyError, IndexError, TypeError) as exc:
            raise AdapterHTTPError("Unexpected xAI response format.") from exc


@dataclass
class DeepseekAdapter(BaseLLMAdapter):
    """
    Adapter for Deepseek chat completions API (OpenAI-compatible schema).
    """

    api_key: Optional[str] = None
    base_url: str = "https://api.deepseek.com/v1/chat/completions"
    timeout: int = DEFAULT_TIMEOUT

    def __post_init__(self) -> None:
        self.api_key = self.api_key or os.getenv("DEEPSEEK_API_KEY")

    def generate(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: Optional[float],
        max_tokens: int,
        run_seed: Optional[int] = None,
        debug: bool = False,
        status_label: Optional[str] = None,
        response_format: Optional[Dict[str, Any]] = None,
        top_p: Optional[float] = None,
        presence_penalty: Optional[float] = None,
        frequency_penalty: Optional[float] = None,
        n: Optional[int] = None,
    ) -> str:
        if not self.api_key:
            raise AdapterHTTPError("DEEPSEEK_API_KEY is not set.")
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        vendor = "deepseek"
        param_payload = _prepare_generation_params(
            model,
            vendor,
            temperature=temperature,
            top_p=top_p,
            presence_penalty=presence_penalty,
            frequency_penalty=frequency_penalty,
            n=n,
            debug=debug,
        )
        max_tokens = min(max_tokens, 8192)
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        payload.update(param_payload)
        _ensure_text_response_format(payload, model=model, response_format=response_format, debug=debug)
        request_timeout = _resolve_timeout_for_model(model, self.timeout)
        data = _post_json_with_param_retry(
            self.base_url,
            headers,
            payload,
            model=model,
            timeout=request_timeout,
            debug=debug,
            status_label=status_label,
        )
        try:
            return _extract_message_content(data["choices"][0]["message"])
        except (KeyError, IndexError, TypeError) as exc:
            raise AdapterHTTPError("Unexpected Deepseek response format.") from exc


@dataclass
class GeminiAdapter(BaseLLMAdapter):
    """
    Adapter for Google Gemini (Generative Language) chat API.
    """

    api_key: Optional[str] = None
    base_url: str = "https://generativelanguage.googleapis.com/v1beta/models"
    timeout: int = DEFAULT_TIMEOUT

    def __post_init__(self) -> None:
        self.api_key = self.api_key or os.getenv("GOOGLE_API_KEY")

    def _convert_messages(self, messages: List[Dict[str, str]]) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        system_segments: List[str] = []
        converted: List[Dict[str, Any]] = []
        for message in messages:
            role = (message.get("role") or "user").lower()
            content = message.get("content", "")
            if isinstance(content, list):
                content = "\n".join(
                    part.get("text", "") if isinstance(part, dict) else str(part)
                    for part in content
                )
            content = str(content)
            if role == "system":
                if content.strip():
                    system_segments.append(content.strip())
                continue
            converted.append(
                {
                    "role": role if role in {"user", "assistant"} else "user",
                    "parts": [{"text": content}],
                }
            )
        if not converted:
            converted = [{"role": "user", "parts": [{"text": ""}]}]
        system_instruction = "\n\n".join(system_segments) if system_segments else None
        return converted, system_instruction

    def generate(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: Optional[float],
        max_tokens: int,
        run_seed: Optional[int] = None,
        debug: bool = False,
        status_label: Optional[str] = None,
        response_format: Optional[Dict[str, Any]] = None,
        top_p: Optional[float] = None,
        presence_penalty: Optional[float] = None,
        frequency_penalty: Optional[float] = None,
        n: Optional[int] = None,
    ) -> str:
        if not self.api_key:
            raise AdapterHTTPError("GOOGLE_API_KEY is not set.")
        contents, system_instruction = self._convert_messages(messages)
        vendor = "google"
        param_payload = _prepare_generation_params(
            model,
            vendor,
            temperature=temperature,
            top_p=top_p,
            presence_penalty=presence_penalty,
            frequency_penalty=frequency_penalty,
            n=n,
            debug=debug,
        )
        generation_config: Dict[str, Any] = {"maxOutputTokens": max_tokens}
        if "temperature" in param_payload:
            generation_config["temperature"] = param_payload.pop("temperature")
        if "top_p" in param_payload:
            generation_config["topP"] = param_payload.pop("top_p")
        payload: Dict[str, Any] = {"contents": contents, "generationConfig": generation_config}
        if system_instruction:
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}
        payload.update(param_payload)
        url = f"{self.base_url}/{model}:generateContent?key={self.api_key}"
        request_timeout = _resolve_timeout_for_model(model, self.timeout)
        headers = {"Content-Type": "application/json"}
        data = _post_json_with_param_retry(
            url,
            headers,
            payload,
            model=model,
            timeout=request_timeout,
            debug=debug,
            status_label=status_label,
        )
        candidates = data.get("candidates") or []
        if not candidates:
            raise AdapterHTTPError("Gemini response missing candidates.")
        parts = candidates[0].get("content", {}).get("parts", [])
        texts = [part.get("text", "") for part in parts if isinstance(part, dict)]
        output = "\n".join(text.strip() for text in texts if text.strip())
        if output:
            return output
        raise AdapterHTTPError("Gemini response did not contain textual content.")


@dataclass
class MistralAdapter(BaseLLMAdapter):
    """
    Adapter for Mistral chat completions API (OpenAI-compatible schema).
    """

    api_key: Optional[str] = None
    base_url: str = "https://api.mistral.ai/v1/chat/completions"
    timeout: int = DEFAULT_TIMEOUT

    def __post_init__(self) -> None:
        self.api_key = self.api_key or os.getenv("MISTRAL_API_KEY")

    def generate(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: Optional[float],
        max_tokens: int,
        run_seed: Optional[int] = None,
        debug: bool = False,
        status_label: Optional[str] = None,
        response_format: Optional[Dict[str, Any]] = None,
        top_p: Optional[float] = None,
        presence_penalty: Optional[float] = None,
        frequency_penalty: Optional[float] = None,
        n: Optional[int] = None,
    ) -> str:
        if not self.api_key:
            raise AdapterHTTPError("MISTRAL_API_KEY is not set.")
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        vendor = "mistral"
        param_payload = _prepare_generation_params(
            model,
            vendor,
            temperature=temperature,
            top_p=top_p,
            presence_penalty=presence_penalty,
            frequency_penalty=frequency_penalty,
            n=n,
            debug=debug,
        )
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        payload.update(param_payload)
        _ensure_text_response_format(payload, model=model, response_format=response_format, debug=debug)
        request_timeout = _resolve_timeout_for_model(model, self.timeout)
        data = _post_json_with_param_retry(
            self.base_url,
            headers,
            payload,
            model=model,
            timeout=request_timeout,
            debug=debug,
            status_label=status_label,
        )
        try:
            return _extract_message_content(data["choices"][0]["message"])
        except (KeyError, IndexError, TypeError) as exc:
            raise AdapterHTTPError("Unexpected Mistral response format.") from exc



def infer_provider_from_model(model: str) -> str:
    prefix, _ = _split_provider_prefix(model)
    if prefix and prefix in PROVIDER_PREFIX_MAP:
        return PROVIDER_PREFIX_MAP[prefix]
    lowered = model.lower()
    if "gpt" in lowered or "text-" in lowered:
        return "openai"
    if "claude" in lowered:
        return "anthropic"
    if "grok" in lowered:
        return "xai"
    if "gemini" in lowered:
        return "google"
    if "deepseek" in lowered:
        return "deepseek"
    if "mistral" in lowered:
        return "mistral"
    return "mock"


def normalize_model_name(model: str) -> str:
    _, remainder = _split_provider_prefix(model)
    return remainder.strip()


def _split_provider_prefix(model: str) -> Tuple[Optional[str], str]:
    if ":" not in model:
        return None, model
    prefix, remainder = model.split(":", 1)
    return prefix.lower(), remainder


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
        if os.getenv("DEEPSEEK_API_KEY"):
            self.register("deepseek", DeepseekAdapter())
        if os.getenv("MISTRAL_API_KEY"):
            self.register("mistral", MistralAdapter())
        if os.getenv("GOOGLE_API_KEY"):
            self.register("google", GeminiAdapter())
        if os.getenv("BAIDU_API_KEY") and os.getenv("BAIDU_SECRET_KEY"):
            self.register("baidu", BaiduErnieAdapter())

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
def _extract_message_content(message: Dict[str, Any]) -> str:
    content = message.get("content", "")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and "text" in item:
                parts.append(str(item["text"]))
        if parts:
            return "\n".join(part.strip() for part in parts if part).strip()
    return ""
