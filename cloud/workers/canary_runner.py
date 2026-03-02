"""Standalone canary runner for temperature=0 determinism checks.

Must be run from the cloud/workers/ directory so that common.* imports resolve:

    cd cloud/workers
    python canary_runner.py --models gpt-4o,claude-sonnet-4-6 --runs 20
    python canary_runner.py --models gpt-4o --runs 5 --output results.json

Running from any other directory will fail with a ModuleNotFoundError.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from common.errors import LLMError
from common.llm_adapters import generate
from common.llm_adapters.types import LLMResponse


TEMPERATURE = 0.0
SEED = 42
MAX_TOKENS = 16


CANARY_PROMPTS = [
    {
        "id": "control",
        "label": "Prompt 1 (control)",
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a helpful assistant. Respond with exactly the content "
                    "requested and nothing else."
                ),
            },
            {
                "role": "user",
                "content": "Respond with exactly the single character A and nothing else.",
            },
        ],
    },
    {
        "id": "decision",
        "label": "Prompt 2 (decision)",
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are evaluating a moral dilemma. Respond with a single number "
                    "from 1 to 5, where 1 means strongly prioritize option A, 5 means "
                    "strongly prioritize option B, and 3 means neutral."
                ),
            },
            {
                "role": "user",
                "content": (
                    "A hospital has one donor heart. Option A: give it to a 30-year-old "
                    "with three children. Option B: give it to a 60-year-old renowned "
                    "scientist. Which do you prioritize? Respond with only a single digit 1-5."
                ),
            },
        ],
    },
]


@dataclass
class RunRecord:
    response_text: str
    prompt_hash: str | None
    adapter_mode: str | None
    error: dict[str, Any] | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run fixed canary prompts repeatedly against one or more models."
    )
    parser.add_argument(
        "--models",
        required=True,
        help="Comma-separated list of model IDs to test.",
    )
    parser.add_argument(
        "--runs",
        type=int,
        default=5,
        help="Number of runs per prompt for each model (default: 5).",
    )
    parser.add_argument(
        "--output",
        help="Optional path to write JSON results. Defaults to stdout if omitted.",
    )
    args = parser.parse_args()

    if args.runs < 1:
        parser.error("--runs must be at least 1")

    models = [model.strip() for model in args.models.split(",") if model.strip()]
    if not models:
        parser.error("--models must include at least one non-empty model ID")

    args.models = models
    return args


def run_one(model_id: str, messages: list[dict[str, str]]) -> RunRecord:
    try:
        response: LLMResponse = generate(
            model_id,
            messages,
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS,
            seed=SEED,
        )
        return RunRecord(
            response_text=response.content,
            prompt_hash=response.prompt_hash,
            adapter_mode=response.adapter_mode,
        )
    except LLMError as exc:
        return RunRecord(
            response_text=f"<ERROR: {exc.message}>",
            prompt_hash=None,
            adapter_mode=None,
            error=exc.to_dict(),
        )
    except Exception as exc:  # noqa: BLE001
        return RunRecord(
            response_text=f"<ERROR: {exc}>",
            prompt_hash=None,
            adapter_mode=None,
            error={
                "message": str(exc),
                "code": "UNKNOWN",
                "retryable": False,
                "details": type(exc).__name__,
            },
        )


def exact_match_fraction(values: list[str]) -> tuple[int, int, float]:
    if not values:
        return 0, 0, 0.0
    counts = Counter(values)
    matches = counts.most_common(1)[0][1]
    total = len(values)
    return matches, total, matches / total


def all_identical_non_null(values: list[str | None]) -> bool:
    if not values or any(value is None for value in values):
        return False
    first = values[0]
    return all(value == first for value in values)


def format_percent(ratio: float) -> str:
    return f"{ratio * 100:.0f}%"


def build_result(model_id: str, prompt: dict[str, Any], records: list[RunRecord]) -> dict[str, Any]:
    responses = [record.response_text for record in records]
    prompt_hashes = [record.prompt_hash for record in records]
    adapter_modes = [record.adapter_mode for record in records]
    errors = [record.error for record in records]
    exact_matches, total, exact_match_rate = exact_match_fraction(responses)
    result: dict[str, Any] = {
        "model": model_id,
        "prompt_id": prompt["id"],
        "responses": responses,
        "prompt_hashes": prompt_hashes,
        "adapter_modes": adapter_modes,
        "exact_match_rate": exact_match_rate,
        "all_prompt_hashes_identical": all_identical_non_null(prompt_hashes),
    }
    if any(error is not None for error in errors):
        result["errors"] = errors
    result["_summary"] = {
        "exact_matches": exact_matches,
        "total": total,
    }
    return result


def format_set(values: list[str]) -> str:
    return "{" + ", ".join(repr(value) for value in values) + "}"


def print_summary(
    results: list[dict[str, Any]],
    models: list[str],
    runs: int,
    *,
    stream: Any,
) -> None:
    print("=== Canary Results ===", file=stream)
    print(file=stream)

    results_by_model: dict[str, list[dict[str, Any]]] = {model: [] for model in models}
    for result in results:
        results_by_model.setdefault(result["model"], []).append(result)

    for index, model in enumerate(models):
        if index:
            print(file=stream)
        print(f"Model: {model}  |  Runs: {runs}  |  Temp: 0  |  Seed: {SEED}", file=stream)
        print(file=stream)

        for prompt in CANARY_PROMPTS:
            result = next(
                item for item in results_by_model.get(model, []) if item["prompt_id"] == prompt["id"]
            )
            exact_matches = result["_summary"]["exact_matches"]
            total = result["_summary"]["total"]
            print(f"{prompt['label']}:", file=stream)
            print(f"  Responses: {result['responses']}", file=stream)
            print(
                "  Exact match rate: "
                f"{exact_matches}/{total} ({format_percent(result['exact_match_rate'])})",
                file=stream,
            )
            if prompt["id"] == "decision":
                unique_values = sorted({value for value in result["responses"]})
                print(f"  Unique decisions: {format_set(unique_values)}", file=stream)
            if result["all_prompt_hashes_identical"]:
                print("  Prompt hashes: all identical [OK]", file=stream)
            else:
                print(f"  Prompt hashes: {result['prompt_hashes']}", file=stream)
            if any(mode is not None for mode in result["adapter_modes"]):
                print(f"  Adapter modes: {result['adapter_modes']}", file=stream)
            if "errors" in result:
                error_count = sum(1 for error in result["errors"] if error is not None)
                print(f"  Errors: {error_count}/{total}", file=stream)
            print(file=stream)


def sanitize_for_json(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sanitized: list[dict[str, Any]] = []
    for result in results:
        item = dict(result)
        item.pop("_summary", None)
        sanitized.append(item)
    return sanitized


def main() -> int:
    args = parse_args()
    results: list[dict[str, Any]] = []

    for model_id in args.models:
        for prompt in CANARY_PROMPTS:
            records = [run_one(model_id, prompt["messages"]) for _ in range(args.runs)]
            results.append(build_result(model_id, prompt, records))

    summary_stream = sys.stdout if args.output else sys.stderr
    print_summary(results, args.models, args.runs, stream=summary_stream)

    payload = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "settings": {
            "temperature": 0,
            "seed": SEED,
            "runs_per_prompt": args.runs,
        },
        "results": sanitize_for_json(results),
    }

    payload_json = json.dumps(payload, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(payload_json)
            handle.write("\n")
    else:
        print(payload_json)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
