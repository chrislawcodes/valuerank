"""
Helpers for loading and validating ValueRank configuration files.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Tuple

import yaml


def _load_yaml(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


@dataclass
class RuntimeConfig:
    defaults: Dict[str, Any]
    environment: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def probe_model(self) -> str:
        return self.defaults.get("probe_model", "mock-probe")

    @property
    def target_models(self) -> List[str]:
        models = self.defaults.get("target_models") or []
        if isinstance(models, list):
            return models
        if isinstance(models, str):
            return [models]
        raise ValueError("runtime.defaults.target_models must be a list or string")

    @property
    def judge_model(self) -> str:
        return self.defaults.get("judge_model", "mock-judge")

    @property
    def output_dir(self) -> Path:
        output = self.defaults.get("output_dir", "output")
        return Path(output)

    @property
    def timestamp_format(self) -> str:
        env = self.environment or {}
        return env.get("timestamp_format", "YYYY-MM-DDTHH-mm")

    @property
    def thread_workers(self) -> int:
        value = self.defaults.get("threads", 1)
        try:
            workers = int(value)
        except (TypeError, ValueError):
            raise ValueError("runtime.defaults.threads must be an integer.")
        return max(1, workers)

    @property
    def judge_thread_workers(self) -> int:
        raw_value = self.defaults.get("judge_threads", self.defaults.get("threads", 6))
        try:
            workers = int(raw_value)
        except (TypeError, ValueError):
            raise ValueError("runtime.defaults.judge_threads must be an integer.")
        return max(1, workers)


def load_runtime_config(path: Path) -> RuntimeConfig:
    data = _load_yaml(path)
    if "defaults" not in data:
        raise ValueError("runtime.yaml must contain a 'defaults' section.")
    return RuntimeConfig(
        defaults=data["defaults"],
        environment=data.get("environment", {}),
        metadata=data.get("metadata", {}),
    )


@dataclass
class Scenario:
    scenario_id: str
    subject: str
    body: str


@dataclass
class ScenariosConfig:
    version: Any
    preamble: str
    followups: Dict[str, str]
    scenarios: List[Scenario]

    @property
    def followup_items(self) -> List[Tuple[str, str]]:
        return list(self.followups.items())


def load_scenarios_config(path: Path) -> ScenariosConfig:
    data = _load_yaml(path)
    preamble = data.get("preamble")
    followups = data.get("followups") or {}
    scenarios: List[Scenario] = []

    for key, value in data.items():
        if isinstance(key, str) and key.startswith("scenario_") and isinstance(value, dict):
            scenarios.append(
                Scenario(
                    scenario_id=key,
                    subject=value.get("subject", "").strip(),
                    body=value.get("body", "").strip(),
                )
            )

    if not preamble or not scenarios:
        raise ValueError("scenarios.yaml must include a preamble and at least one scenario.")

    scenarios.sort(key=lambda s: s.scenario_id)
    return ScenariosConfig(
        version=data.get("version"),
        preamble=preamble.strip(),
        followups={k: v.strip() for k, v in followups.items()},
        scenarios=scenarios,
    )


def load_values_rubric(path: Path) -> Dict[str, Any]:
    return _load_yaml(path)
