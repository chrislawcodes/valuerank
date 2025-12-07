"""
Helpers for loading and validating ValueRank configuration files.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Tuple, Optional

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
    def summary_model(self) -> str:
        return self.defaults.get("summary_model", "gpt-5")

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

    @property
    def summary_thread_workers(self) -> int:
        raw_value = self.defaults.get("summary_threads", self.defaults.get("threads", 6))
        try:
            workers = int(raw_value)
        except (TypeError, ValueError):
            raise ValueError("runtime.defaults.summary_threads must be an integer.")
        return max(1, workers)

    @property
    def target_response_char_limit(self) -> Optional[int]:
        value = self.defaults.get("target_response_char_limit")
        if value is None:
            return None
        try:
            limit = int(value)
        except (TypeError, ValueError):
            raise ValueError("runtime.defaults.target_response_char_limit must be an integer if set.")
        return max(0, limit)


@dataclass
class ModelCost:
    input_per_million: float = 0.0
    output_per_million: float = 0.0


def load_model_costs(path: Path = Path("config/model_costs.yaml")) -> Tuple[Dict[str, ModelCost], ModelCost]:
    if not path.exists():
        return {}, ModelCost()
    data = _load_yaml(path) or {}
    defaults = data.get("defaults", {}) or {}
    default_cost = ModelCost(
        input_per_million=float(defaults.get("input_per_million", 0.0)),
        output_per_million=float(defaults.get("output_per_million", 0.0)),
    )
    models: Dict[str, ModelCost] = {}
    for name, entry in (data.get("models") or {}).items():
        input_cost = float(entry.get("input_per_million", default_cost.input_per_million))
        output_cost = float(entry.get("output_per_million", default_cost.output_per_million))
        models[str(name).strip()] = ModelCost(input_per_million=input_cost, output_per_million=output_cost)
    return models, default_cost


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
class ScenarioConfig:
    id: str
    subject: str
    body: str
    status: str = "in_progress"
    runs: Optional[Dict[str, str]] = None

    @property
    def scenario_id(self) -> str:
        # Backward-compatible alias for callers expecting `scenario_id`.
        return self.id


class ScenarioDict(dict):
    """Dictionary of ScenarioConfig keyed by scenario id, iterating over values for backward compatibility."""

    def __iter__(self):
        return iter(self.values())


@dataclass
class ScenariosConfig:
    version: Any
    preamble: str
    followups: Dict[str, str]
    golden_runs: Dict[str, str] = field(default_factory=dict)
    scenarios: ScenarioDict = field(default_factory=ScenarioDict)

    @property
    def followup_items(self) -> List[Tuple[str, str]]:
        return list(self.followups.items())

    @property
    def scenario_list(self) -> List[ScenarioConfig]:
        return list(self.scenarios.values())


def _parse_scenarios_block(raw: Dict[str, Any]) -> ScenarioDict:
    scenarios_map: ScenarioDict = ScenarioDict()
    if "scenarios" in raw and isinstance(raw["scenarios"], dict):
        source = raw["scenarios"]
    else:
        source = {k: v for k, v in raw.items() if isinstance(k, str) and k.startswith("scenario_") and isinstance(v, dict)}
    if not source:
        return scenarios_map
    for scenario_id, data in sorted(source.items(), key=lambda item: item[0]):
        subject = str(data.get("subject", "")).strip()
        body = str(data.get("body", "")).strip()
        status = str(data.get("status", "in_progress")).strip() or "in_progress"
        runs = data.get("runs")
        scenarios_map[scenario_id] = ScenarioConfig(
            id=scenario_id,
            subject=subject,
            body=body,
            status=status,
            runs=runs,
        )
    return scenarios_map


def load_scenarios(path: Path) -> ScenariosConfig:
    data = _load_yaml(path)
    preamble = str(data.get("preamble") or "").strip()
    followups = data.get("followups") or {}
    scenarios_map = _parse_scenarios_block(data)
    if not scenarios_map:
        raise ValueError("scenarios.yaml must include at least one scenario.")
    return ScenariosConfig(
        version=data.get("version"),
        preamble=preamble,
        followups={k: str(v).strip() for k, v in followups.items()},
        golden_runs=data.get("golden_runs", {}) or {},
        scenarios=scenarios_map,
    )


def load_scenarios_config(path: Path) -> ScenariosConfig:
    """Backward-compatible alias for existing callers."""
    return load_scenarios(path)


def load_values_rubric(path: Path) -> Dict[str, Any]:
    return _load_yaml(path)


def filter_scenarios_by_status(cfg: ScenariosConfig, statuses: set[str]) -> List[ScenarioConfig]:
    return [scenario for scenario in cfg.scenarios.values() if scenario.status in statuses]
