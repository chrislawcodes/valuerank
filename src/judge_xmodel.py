"""
Compatibility shim for the cross-model Judge (Judge 2) module.

Loads the legacy compiled implementation (generated from the former
src/judge_cross_model.py) while exposing the new judge_xmodel entry point.
"""

from __future__ import annotations

import sys
import argparse
from concurrent.futures import ThreadPoolExecutor
from importlib.machinery import SourcelessFileLoader
from importlib.util import module_from_spec, spec_from_loader
from pathlib import Path
from types import ModuleType
from typing import Any, Dict, List

from .config_loader import load_runtime_config


def _load_legacy_module() -> ModuleType:
    cache_dir = Path(__file__).with_name("__pycache__")
    candidates = sorted(cache_dir.glob("judge_cross_model.cpython-*.pyc"))
    if not candidates:
        raise RuntimeError(
            "Legacy cross-model judge bytecode not found. Restore src/judge_cross_model.py or rebuild first."
        )
    pyc_path = candidates[0]
    loader = SourcelessFileLoader("src.judge_cross_model", str(pyc_path))
    spec = spec_from_loader(loader.name, loader)
    if spec is None:
        raise RuntimeError(f"Unable to create module spec for {pyc_path}")
    module = module_from_spec(spec)
    sys.modules[spec.name] = module
    loader.exec_module(module)  # type: ignore[arg-type]
    return module


_legacy = _load_legacy_module()

_LEGACY_PARSE_ARGS = _legacy.parse_args
_LEGACY_RUN_CROSS_MODEL_JUDGE = _legacy.run_cross_model_judge

__doc__ = getattr(_legacy, "__doc__", __doc__)


def _export_public_members(module: ModuleType) -> Dict[str, object]:
    exports: Dict[str, object] = {}
    for name in dir(module):
        if name.startswith("_"):
            continue
        exports[name] = getattr(module, name)
    return exports


globals().update(_export_public_members(_legacy))

DEFAULT_THREAD_WORKERS = 6
RUNTIME_CONFIG_PATH = Path("config/runtime.yaml")


def _coerce_positive_int(value: Any, fallback: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(1, number)


def _resolve_thread_count(args: argparse.Namespace) -> int:
    runtime_cfg = load_runtime_config(RUNTIME_CONFIG_PATH)
    if getattr(args, "threads", None) is not None:
        return _coerce_positive_int(args.threads, DEFAULT_THREAD_WORKERS)
    return _coerce_positive_int(runtime_cfg.judge_thread_workers, DEFAULT_THREAD_WORKERS)


def parse_args(argv: List[str] | None = None) -> argparse.Namespace:  # type: ignore[override]
    parser = argparse.ArgumentParser("ValueRank Cross-Model Judge")
    parser.add_argument("--run-dir", required=True, help="Run directory containing summary.aggregated.yaml.")
    parser.add_argument("--judge-model", default="judge2-interpretive-v1", help="Identifier for Judge 2 model.")
    parser.add_argument(
        "--source-summary",
        default="summary.aggregated.yaml",
        help="Aggregated summary filename.",
    )
    parser.add_argument(
        "--threads",
        type=int,
        default=None,
        help=f"Worker threads for cross-model synthesis (default {DEFAULT_THREAD_WORKERS}, configurable via runtime.yaml).",
    )
    return parser.parse_args(argv)


def render_markdown_report(
    run_id: str,
    judge_model: str,
    source_summary: str,
    summary: Dict,
    *,
    key_insights: List[str] | None = None,
    model_highlights: List[Dict[str, str]] | None = None,
) -> str:  # type: ignore[override]
    aggregated_values = summary.get("aggregated_values", [])
    if key_insights is None:
        key_insights = build_key_insights(aggregated_values)
    if model_highlights is None:
        model_highlights = build_model_highlights(aggregated_values)

    frontmatter = dict_to_frontmatter(
        {"run_id": run_id, "judge_model": judge_model, "source_summary": source_summary}
    )
    lines = [frontmatter, "# Cross-Model Interpretation", ""]
    lines.append("## Key Insights")
    lines.append("")
    for insight in key_insights:
        lines.append(f"- {insight}")
    lines.append("")
    if model_highlights:
        lines.append("## Model Highlights")
        lines.append("")
        for highlight in model_highlights:
            lines.append(f"### {highlight['model_name']}")
            lines.append(highlight["observation"])
            lines.append("")
    lines.append("## Methodology Notes")
    lines.append("")
    lines.append(
        "Judge 2 reviewed aggregated win-rate statistics without accessing original transcripts. "
        "Observations are derived exclusively from summary-level metrics provided by the Aggregator."
    )
    lines.append("")
    return "\n".join(lines)


def run_cross_model_judge(argv: List[str] | None = None) -> None:  # type: ignore[override]
    args = parse_args(argv)
    run_dir = Path(args.run_dir)
    if not run_dir.exists():
        raise FileNotFoundError(f"Run directory does not exist: {run_dir}")

    summary_path = run_dir / args.source_summary
    if not summary_path.exists():
        raise FileNotFoundError(f"Aggregated summary not found: {summary_path}")

    thread_count = _resolve_thread_count(args)

    print(f"[Judge-2] Starting cross-model interpretation for run directory {run_dir}")
    print(f"[Judge-2] Source summary file: {args.source_summary}")
    print(f"[Judge-2] Judge model: {args.judge_model}")
    print(f"[Judge-2] Worker threads: {thread_count}")

    summary = load_yaml(summary_path)
    run_id = summary.get("run_timestamp", run_dir.name)
    aggregated_values = summary.get("aggregated_values", [])

    if thread_count > 1:
        with ThreadPoolExecutor(max_workers=thread_count) as executor:
            future_key_insights = executor.submit(build_key_insights, aggregated_values)
            future_model_highlights = executor.submit(build_model_highlights, aggregated_values)
            key_insights = future_key_insights.result()
            model_highlights = future_model_highlights.result()
    else:
        key_insights = build_key_insights(aggregated_values)
        model_highlights = build_model_highlights(aggregated_values)

    print(f"[Judge-2] Run timestamp inferred as {run_id}")

    markdown = render_markdown_report(
        run_id=run_id,
        judge_model=args.judge_model,
        source_summary=args.source_summary,
        summary=summary,
        key_insights=key_insights,
        model_highlights=model_highlights,
    )
    output_path = run_dir / "summary.cross_model_interpretation.md"
    save_text(output_path, markdown)
    print(f"[Judge-2] Wrote cross-model interpretation to {output_path}")
    print("[Judge-2] Completed cross-model interpretation")

if __name__ == "__main__":
    run_cross_model_judge()  # type: ignore[name-defined]
