"""
Compatibility shim for the value-level Judge module.

Loads the legacy compiled implementation (generated from the former
src/judge.py) so existing behaviour is preserved while the public entry
point is renamed to judge_value.py.
"""

from __future__ import annotations

import sys
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import get_close_matches
from importlib.machinery import SourcelessFileLoader
from importlib.util import module_from_spec, spec_from_loader
from pathlib import Path
from types import ModuleType
from typing import Any, Dict, List, Set, Tuple

import yaml


def _load_legacy_module() -> ModuleType:
    cache_dir = Path(__file__).with_name("__pycache__")
    candidates = sorted(cache_dir.glob("judge.cpython-*.pyc"))
    if not candidates:
        raise RuntimeError(
            "Legacy judge bytecode not found. Restore src/judge.py or rebuild before using judge_value."
        )
    pyc_path = candidates[0]
    loader = SourcelessFileLoader("src.judge", str(pyc_path))
    spec = spec_from_loader(loader.name, loader)
    if spec is None:
        raise RuntimeError(f"Unable to create module spec for {pyc_path}")
    module = module_from_spec(spec)
    sys.modules[spec.name] = module
    loader.exec_module(module)  # type: ignore[arg-type]
    return module


_legacy = _load_legacy_module()

_LEGACY_PARSE_ARGS = _legacy.parse_args
_LEGACY_RUN_JUDGE = _legacy.run_judge

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


def _resolve_run_directory(args: argparse.Namespace) -> Path:
    if args.run_dir:
        run_dir = Path(args.run_dir)
    else:
        output_root = Path(args.output_root)
        if not output_root.exists():
            raise FileNotFoundError(
                f"Output root '{output_root}' does not exist. Provide --run-dir explicitly or create a run."
            )
        candidate_dirs = [p for p in output_root.iterdir() if p.is_dir()]
        if not candidate_dirs:
            raise FileNotFoundError(
                f"No run directories found under '{output_root}'. Provide --run-dir after running the probe."
            )
        run_dir = max(candidate_dirs, key=lambda p: p.stat().st_mtime)
        print(f"[Judge] No --run-dir provided. Using latest run directory: {run_dir}")
    if not run_dir.exists():
        raise FileNotFoundError(f"Run directory does not exist: {run_dir}")
    return run_dir


def _load_manifest(run_dir: Path) -> Dict[str, Any]:
    manifest_path = run_dir / "run_manifest.yaml"
    if not manifest_path.exists():
        return {}
    with manifest_path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def _resolve_thread_count(args: argparse.Namespace, runtime_cfg) -> int:
    if getattr(args, "threads", None) is not None:
        return _coerce_positive_int(args.threads, DEFAULT_THREAD_WORKERS)
    config_workers = getattr(runtime_cfg, "judge_thread_workers", DEFAULT_THREAD_WORKERS)
    return _coerce_positive_int(config_workers, DEFAULT_THREAD_WORKERS)


def _prepare_rubric(values_rubric_path: Path) -> Tuple[str, Dict[str, List[str]], Set[str]]:
    rubric_text = load_rubric_text(values_rubric_path)
    with values_rubric_path.open("r", encoding="utf-8") as handle:
        rubric_dict = yaml.safe_load(handle) or {}
    canonical_values = set((rubric_dict.get("values") or {}).keys())
    fallback_keywords = build_value_keyword_map(values_rubric_path)
    return rubric_text, fallback_keywords, canonical_values


def _score_model(
    run_id: str,
    judge_model: str,
    rubric_text: str,
    fallback_keywords: Dict[str, List[str]],
    canonical_values: Set[str],
    aggregated_path: Path,
) -> Tuple[str, Dict[str, Any], str]:
    print(f"[Judge] -> Scoring {aggregated_path.name}")
    metadata, assessments = parse_aggregated_transcript(aggregated_path)
    anon_model_id = metadata.get("anon_model_id") or aggregated_path.stem.split(".")[1]
    yaml_summary, csv_summary = compute_summaries(
        run_id=run_id,
        anon_model_id=anon_model_id,
        assessments=assessments,
        judge_model=judge_model,
        rubric_text=rubric_text,
        fallback_keywords=fallback_keywords,
        canonical_values=canonical_values.copy(),
    )
    _convert_unknown_to_unmatched(yaml_summary, canonical_values)
    return anon_model_id, yaml_summary, csv_summary


def _guess_canonical_value(phrase: str, canonical_values: Set[str]) -> str:
    canonical_map = getattr(_legacy, "CANONICAL_MAP", {})
    direct = canonical_map.get(phrase)
    if direct and direct in canonical_values:
        return direct

    normalized = phrase.replace(" ", "_")
    if normalized in canonical_values:
        return normalized

    lower_map = {key.lower(): value for key, value in canonical_map.items()}
    maybe = lower_map.get(phrase.lower())
    if maybe and maybe in canonical_values:
        return maybe

    candidates = get_close_matches(normalized, list(canonical_values), n=1, cutoff=0.6)
    if candidates:
        return candidates[0]
    return ""


def _convert_unknown_to_unmatched(summary: Dict[str, Any], canonical_values: Set[str]) -> None:
    unknown_entries = summary.pop("unknown_values", None)
    if not unknown_entries:
        return

    unmatched: List[Dict[str, str]] = summary.setdefault("unmatched_values", [])
    for entry in unknown_entries:
        phrase = str(entry.get("value_name") or entry.get("phrase") or "").strip()
        if not phrase:
            continue
        count = entry.get("occurrence_count")
        context = str(entry.get("example_context") or "").strip()
        reason_parts = ["Returned value not in rubric"]
        if isinstance(count, int) and count > 0:
            reason_parts.append(f"observed {count} time{'s' if count != 1 else ''}")
        reason = "; ".join(reason_parts)
        if context:
            reason = f"{reason}. Example: {context}"
        best_guess = _guess_canonical_value(phrase, canonical_values)
        unmatched.append({"phrase": phrase, "reason": reason, "best_guess": best_guess})


def parse_args(argv: List[str] | None = None) -> argparse.Namespace:  # type: ignore[override]
    parser = argparse.ArgumentParser("ValueRank Judge")
    parser.add_argument(
        "--run-dir",
        default=None,
        help="Path to the run output directory from the Probe step. Defaults to newest timestamped run.",
    )
    parser.add_argument(
        "--output-root",
        default="output",
        help="Root directory containing run timestamp folders (used when --run-dir is omitted).",
    )
    parser.add_argument(
        "--judge-model",
        default=None,
        help="Judge model identifier (overrides runtime default).",
    )
    parser.add_argument(
        "--run-id",
        default=None,
        help="Optional run identifier override.",
    )
    parser.add_argument(
        "--values-rubric",
        default="config/values_rubric.yaml",
        help="Path to values_rubric.yaml used for heuristic value detection.",
    )
    parser.add_argument(
        "--threads",
        type=int,
        default=None,
        help=f"Worker threads for scenario scoring (default {DEFAULT_THREAD_WORKERS}, configurable via runtime.yaml).",
    )
    return parser.parse_args(argv)


def run_judge(argv: List[str] | None = None) -> None:  # type: ignore[override]
    args = parse_args(argv)
    run_dir = _resolve_run_directory(args)
    aggregated_paths = sorted(run_dir.glob("aggregated_transcript.anon_model_*.md"))
    if not aggregated_paths:
        raise FileNotFoundError("No aggregated transcripts found. Run the probe step before the judge.")

    runtime_cfg = load_runtime_config(RUNTIME_CONFIG_PATH)
    manifest = _load_manifest(run_dir)

    run_id = args.run_id or manifest.get("run_id") or run_dir.name
    judge_model = args.judge_model or manifest.get("judge_model") or runtime_cfg.judge_model

    values_rubric_path = Path(args.values_rubric)
    rubric_text, fallback_keywords, canonical_values = _prepare_rubric(values_rubric_path)

    thread_count = _resolve_thread_count(args, runtime_cfg)

    print(f"[Judge] Starting evaluation for run {run_id}")
    print(f"[Judge] Using judge model: {judge_model}")
    print(f"[Judge] Worker threads: {thread_count}")
    print(f"[Judge] Aggregated transcripts: {len(aggregated_paths)}")

    results: Dict[Path, Tuple[str, Dict[str, Any], str]] = {}
    errors: List[Tuple[Path, BaseException]] = []

    with ThreadPoolExecutor(max_workers=thread_count) as executor:
        future_map = {
            executor.submit(
                _score_model,
                run_id,
                judge_model,
                rubric_text,
                fallback_keywords,
                canonical_values,
                path,
            ): path
            for path in aggregated_paths
        }
        for future in as_completed(future_map):
            path = future_map[future]
            try:
                results[path] = future.result()
            except BaseException as exc:  # noqa: BLE001
                errors.append((path, exc))

    if errors:
        for path, exc in errors:
            print(f"[Judge] Error while scoring {path.name}: {exc}")
        raise errors[0][1]

    for path in aggregated_paths:
        anon_model_id, yaml_summary, csv_summary = results[path]
        yaml_path = run_dir / f"summary.{anon_model_id}.{run_id}.yaml"
        csv_path = run_dir / f"summary.{anon_model_id}.{run_id}.csv"
        save_yaml(yaml_path, yaml_summary)
        save_text(csv_path, csv_summary)
        print(f"[Judge] Wrote summaries for {anon_model_id}")

    print(f"[Judge] Completed evaluation for run {run_id}")

if __name__ == "__main__":
    run_judge()  # type: ignore[name-defined]
