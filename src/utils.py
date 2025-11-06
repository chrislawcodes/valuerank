"\"\"\"Utility helpers shared across ValueRank modules.\"\"\""

from __future__ import annotations

import hashlib
import json
import random
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List

from zoneinfo import ZoneInfo


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def compute_sha256_digest(content: str, prefix: int = 12) -> str:
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
    return digest[:prefix]


def load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def save_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def save_yaml(path: Path, data: Dict) -> None:
    import yaml

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)


def generate_run_id(timestamp_format: str, timezone: str = "PDT") -> str:
    tz_name = "UTC"
    if timezone.upper() == "PDT":
        tz_name = "America/Los_Angeles"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = None
    now = datetime.now(tz=tz)
    if timestamp_format == "YYYY-MM-DDTHH-mm":
        return now.strftime("%Y-%m-%dT%H-%M")
    if timestamp_format == "YYYY-MM-DD-HH-mm":
        return now.strftime("%Y-%m-%d-%H-%M")
    if timestamp_format == "YYYYMMDD-HHmmss-xxxx":
        suffix = f"{now.microsecond:06d}"[:4]
        return f"{now.strftime('%Y%m%d-%H%M%S')}-{suffix}"
    if timestamp_format == "YYYYMMDD-HHmm":
        return now.strftime("%Y%m%d-%H%M")
    # Fallback ISO minute precision
    return now.strftime("%Y-%m-%dT%H-%M")


def stable_choice(seed_data: Iterable[str], candidates: List[str]) -> str:
    rng = random.Random()
    merged = "|".join(seed_data)
    rng.seed(hashlib.sha256(merged.encode("utf-8")).hexdigest())
    return rng.choice(candidates)


@dataclass
class TranscriptTurn:
    turn_number: int
    prompt_label: str
    probe_prompt: str
    target_response: str


def turns_to_markdown(turns: List[TranscriptTurn]) -> str:
    blocks: List[str] = []
    for turn in turns:
        title = f"#### Turn {turn.turn_number}"
        if turn.prompt_label:
            title += f" ({turn.prompt_label})"
        blocks.append(title)
        blocks.append(f"**Probe:** {turn.probe_prompt.strip()}")
        blocks.append("")
        blocks.append(f"**Target:** {turn.target_response.strip()}")
        blocks.append("")
    return "\n".join(blocks).strip()


def dict_to_frontmatter(data: Dict) -> str:
    return "---\n" + yaml_dump(data) + "---\n"


def yaml_dump(data: Dict) -> str:
    import yaml

    return yaml.safe_dump(data, sort_keys=False, allow_unicode=True)


def save_json(path: Path, data: Dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, sort_keys=False)
