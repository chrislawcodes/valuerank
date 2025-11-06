"""
Aggregator module: merges anonymized Judge outputs with run manifest data.
"""

from __future__ import annotations

import argparse
import statistics
from pathlib import Path
from typing import Dict, List

import yaml

from .utils import dict_to_frontmatter, save_text, save_yaml


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ValueRank Aggregator")
    parser.add_argument("--run-dir", required=True, help="Run directory containing Judge outputs and run_manifest.yaml.")
    parser.add_argument("--run-id", default=None, help="Optional override for run identifier.")
    return parser.parse_args()


def load_yaml(path: Path) -> Dict:
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def build_aggregated_summary(run_id: str, manifest: Dict, summaries: Dict[str, Dict]) -> Dict:
    manifest_models = manifest.get("models", {})
    model_order = [anon_id for anon_id in manifest_models.keys() if anon_id in summaries]
    # Include any additional summaries not present in manifest (edge case)
    for anon_id in summaries.keys():
        if anon_id not in model_order:
            model_order.append(anon_id)
    target_models: List[str] = []
    for anon_id in model_order:
        model_meta = manifest_models.get(anon_id, {})
        target_models.append(model_meta.get("true_model", anon_id))

    # Collect per-value win rates across models
    value_index: Dict[str, Dict[str, float]] = {}
    value_observations: Dict[str, List[str]] = {}

    for anon_id, summary in summaries.items():
        model_name = manifest["models"][anon_id]["true_model"]
        for value in summary.get("values", []):
            value_name = value["name"]
            value_index.setdefault(value_name, {})[model_name] = value.get("win_rate", 0.0)
            value_observations.setdefault(value_name, []).append(value.get("rationale", ""))

    aggregated_values = []
    for value_name, model_winrates in sorted(value_index.items()):
        rates = list(model_winrates.values())
        avg = statistics.mean(rates) if rates else 0.0
        rate_range = (max(rates) - min(rates)) if len(rates) > 1 else 0.0
        aggregated_values.append(
            {
                "name": value_name,
                "model_winrates": {model: round(rate, 2) for model, rate in model_winrates.items()},
                "average_winrate": round(avg, 2),
                "range": round(rate_range, 2),
                "observations": " ".join(obs for obs in value_observations[value_name] if obs).strip()
                or "No additional observations recorded.",
            }
        )

    model_pairwise_matrices = {}
    for anon_id, summary in summaries.items():
        model_name = manifest["models"][anon_id]["true_model"]
        model_pairwise_matrices[model_name] = summary.get("pairwise_matrix", {})

    highlight_section = build_highlight_section(aggregated_values)

    return {
        "run_timestamp": run_id,
        "judge_model": manifest.get("judge_model"),
        "target_models": target_models,
        "scenario_count": len(manifest.get("scenario_list", [])),
        "aggregated_values": aggregated_values,
        "model_pairwise_matrices": model_pairwise_matrices,
        "highlight_section": highlight_section,
    }


def build_highlight_section(aggregated_values: List[Dict]) -> str:
    if not aggregated_values:
        return "No cross-model comparisons available."
    top_value = max(aggregated_values, key=lambda item: item["average_winrate"])
    return (
        f"{top_value['name']} achieves the highest average win rate across models "
        f"({top_value['average_winrate']}). This value is a consistent priority in the Target AIs' reasoning."
    )


def render_markdown(summary: Dict, run_id: str) -> str:
    frontmatter = dict_to_frontmatter({"run_id": run_id, "source": "aggregated_summary"})
    lines = [
        frontmatter,
        "# Aggregated ValueRank Summary",
        "",
        f"**Run Timestamp:** {summary['run_timestamp']}",
        f"**Judge Model:** {summary.get('judge_model', 'unknown')}",
        "",
        "## Target Models",
        "",
    ]
    for model in summary.get("target_models", []):
        lines.append(f"- {model}")
    lines.append("")
    lines.append("## Aggregated Value Win Rates")
    lines.append("")
    lines.append("| Value | Average Win Rate | Range |")
    lines.append("| --- | --- | --- |")
    for value in summary.get("aggregated_values", []):
        lines.append(f"| {value['name']} | {value['average_winrate']} | {value['range']} |")
    lines.append("")
    lines.append("## Highlight Section")
    lines.append("")
    lines.append(summary.get("highlight_section", ""))
    lines.append("")
    return "\n".join(lines)


def run_aggregator() -> None:
    args = parse_args()
    run_dir = Path(args.run_dir)
    manifest_path = run_dir / "run_manifest.yaml"
    if not manifest_path.exists():
        raise FileNotFoundError("run_manifest.yaml is required for aggregation.")

    manifest = load_yaml(manifest_path)
    run_id = args.run_id or manifest.get("run_id") or run_dir.name
    summary_paths = sorted(run_dir.glob("summary.anon_model_*.yaml"))
    if not summary_paths:
        raise FileNotFoundError("No per-model Judge summaries found in run directory.")

    print(f"[Aggregator] Starting aggregation for run {run_id}")
    print(f"[Aggregator] Per-model summaries: {len(summary_paths)}")

    summaries = {}
    for summary_path in summary_paths:
        print(f"[Aggregator] -> Reading {summary_path.name}")
        data = load_yaml(summary_path)
        anon_id = data.get("anon_model_id")
        if not anon_id:
            anon_id = summary_path.stem.split(".")[1]
        summaries[anon_id] = data

    aggregated_summary = build_aggregated_summary(run_id, manifest, summaries)
    yaml_path = run_dir / "summary.aggregated.yaml"
    md_path = run_dir / "summary.aggregated.md"
    save_yaml(yaml_path, aggregated_summary)
    save_text(md_path, render_markdown(aggregated_summary, run_id))
    print(f"[Aggregator] Wrote aggregated summaries to {yaml_path} and {md_path}")
    print(f"[Aggregator] Completed aggregation for run {run_id}")


if __name__ == "__main__":
    run_aggregator()
