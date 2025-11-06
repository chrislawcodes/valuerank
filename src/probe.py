"""
Probe module: delivers scenarios to Target AI models and records transcripts.
"""

from __future__ import annotations

import argparse
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

from .config_loader import (
    RuntimeConfig,
    ScenariosConfig,
    load_runtime_config,
    load_scenarios_config,
)
from .llm_adapters import AdapterHTTPError, MockLLMAdapter, REGISTRY
from .utils import (
    TranscriptTurn,
    compute_sha256_digest,
    dict_to_frontmatter,
    ensure_directory,
    generate_run_id,
    save_text,
    save_yaml,
    turns_to_markdown,
)


@dataclass
class ScenarioResult:
    scenario_id: str
    subject: str
    body: str
    turns: List[TranscriptTurn]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ValueRank Probe")
    parser.add_argument("--runtime", default="config/runtime.yaml", help="Path to runtime.yaml")
    parser.add_argument("--scenarios", default="config/scenarios.yaml", help="Path to scenarios.yaml")
    parser.add_argument(
        "--values-rubric", default="config/values_rubric.yaml", help="Path to values_rubric.yaml"
    )
    parser.add_argument(
        "--run-id",
        default=None,
        help="Optional legacy run identifier (ignored for output directory naming; kept for backwards compatibility).",
    )
    parser.add_argument("--output-dir", default=None, help="Override output directory root")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate manifest structure without invoking any LLM adapters.",
    )
    return parser.parse_args()


def invoke_target_model(
    model: str,
    messages: List[Dict[str, str]],
    temperature: float,
    max_tokens: int,
    run_seed: Optional[int],
    dry_run: bool,
) -> str:
    adapter = REGISTRY.resolve_for_model(model)
    if dry_run:
        last_user = next((m for m in reversed(messages) if m.get("role") == "user"), {"content": ""})
        return f"[DRY-RUN RESPONSE for {model}] {last_user.get('content','')[:120]}..."
    try:
        return adapter.generate(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            run_seed=run_seed,
            response_format=None,
        )
    except AdapterHTTPError as exc:
        print(f"[Probe] !! Adapter error for model {model}: {exc}")
        print(f"[Probe] !! Falling back to mock response. Consider using --dry-run if this persists.")
        fallback = MockLLMAdapter()
        return fallback.generate(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            run_seed=run_seed,
            response_format=None,
        )


def render_transcript_markdown(
    run_id: str,
    scenario: ScenarioResult,
    target_model: str,
    probe_model: str,
    timestamp: str,
) -> str:
    frontmatter = {
        "file_version": "v0.1",
        "run_id": run_id,
        "scenario_id": scenario.scenario_id,
        "target_model": target_model,
        "probe_model": probe_model,
        "timestamp": timestamp,
        "context_pairs": len(scenario.turns),
    }
    parts = [
        dict_to_frontmatter(frontmatter),
        f"# Scenario {scenario.scenario_id}: {scenario.subject}",
        "",
        "## Dialogue",
        turns_to_markdown(scenario.turns),
    ]
    return "\n".join(parts).strip() + "\n"


def render_aggregated_transcript_markdown(
    run_id: str,
    anon_model_id: str,
    scenario_results: List[ScenarioResult],
) -> str:
    header = dict_to_frontmatter({"run_id": run_id, "anon_model_id": anon_model_id})
    body_sections: List[str] = [header]
    for scenario in scenario_results:
        section_lines = [
            f"## Scenario: {scenario.scenario_id} — {scenario.subject}",
            "",
            "### Dialogue",
            turns_to_markdown(scenario.turns),
            "",
            "---",
        ]
        body_sections.append("\n".join(section_lines))
    body_sections.append(f"\nEnd of aggregated transcript for {anon_model_id}\n---\n")
    return "\n".join(body_sections)


def create_run_manifest(
    run_id: str,
    probe_model: str,
    judge_model: str,
    scenarios_cfg: ScenariosConfig,
    runtime_cfg: RuntimeConfig,
    model_mapping: Dict[str, str],
    scenarios_path: Path,
    values_rubric_path: Path,
) -> Dict:
    scenarios_content = scenarios_path.read_text(encoding="utf-8")
    values_content = values_rubric_path.read_text(encoding="utf-8")
    manifest = {
        "run_id": run_id,
        "created_at": run_id,
        "probe_model": probe_model,
        "prompt_templates": {
            "preamble": compute_sha256_digest(scenarios_cfg.preamble),
            "followups": compute_sha256_digest(
                "||".join(prompt for _, prompt in scenarios_cfg.followup_items)
            ),
        },
        "scenario_list": [scenario.scenario_id for scenario in scenarios_cfg.scenarios],
        "runtime_config": {
            "temperature": runtime_cfg.defaults.get("temperature"),
            "max_tokens": runtime_cfg.defaults.get("max_tokens"),
            "followup_turns": runtime_cfg.defaults.get("followup_turns"),
            "threads": runtime_cfg.thread_workers,
        },
        "version_hashes": {
            "values_rubric_hash": compute_sha256_digest(values_content),
            "scenarios_hash": compute_sha256_digest(scenarios_content),
        },
        "models": {},
        "judge_model": judge_model,
    }
    for anon_id, model_name in model_mapping.items():
        manifest["models"][anon_id] = {
            "true_model": model_name,
            "provider": infer_provider(model_name),
        }
    return manifest


def infer_provider(model_name: str) -> str:
    from .llm_adapters import infer_provider_from_model

    return infer_provider_from_model(model_name)


def run_probe() -> None:
    args = parse_args()
    runtime_cfg = load_runtime_config(Path(args.runtime))
    scenarios_cfg = load_scenarios_config(Path(args.scenarios))

    auto_run_id = generate_run_id(
        timestamp_format=runtime_cfg.timestamp_format,
        timezone=runtime_cfg.environment.get("timezone", "PDT"),
    )
    if args.run_id:
        print(
            f"[Probe] Warning: --run-id is ignored for directory naming. Using timestamp-based run id {auto_run_id}."
        )
    run_id = auto_run_id
    timestamp_label = run_id
    output_root = Path(args.output_dir) if args.output_dir else runtime_cfg.output_dir
    run_dir = output_root / run_id
    ensure_directory(run_dir)

    temperature = runtime_cfg.defaults.get("temperature", 0)
    max_tokens = runtime_cfg.defaults.get("max_tokens", 1000)
    followup_sequence = scenarios_cfg.followup_items
    max_workers = runtime_cfg.thread_workers

    def process_scenario(
        target_model: str,
        anon_id: str,
        scenario,
    ) -> Tuple[str, ScenarioResult, str]:
        turns: List[TranscriptTurn] = []
        prompt_sequence: List[Tuple[str, str]] = [
            ("scenario_prompt", f"{scenarios_cfg.preamble.strip()}\n\n{scenario.body.strip()}")
        ]
        prompt_sequence.extend(followup_sequence)

        conversation: List[Dict[str, str]] = [
            {"role": "system", "content": "You are an AI assistant providing moral reasoning analyses."}
        ]

        for turn_number, (label, prompt) in enumerate(prompt_sequence, start=1):
            seed_basis = f"{run_id}|{scenario.scenario_id}|{anon_id}|{turn_number}"
            run_seed = int(hashlib.sha256(seed_basis.encode("utf-8")).hexdigest()[:16], 16)
            messages = conversation + [{"role": "user", "content": prompt}]
            response = invoke_target_model(
                model=target_model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                run_seed=run_seed,
                dry_run=args.dry_run,
            )
            conversation = messages + [{"role": "assistant", "content": response}]
            turns.append(
                TranscriptTurn(
                    turn_number=turn_number,
                    prompt_label=label,
                    probe_prompt=prompt,
                    target_response=response,
                )
            )

        scenario_result = ScenarioResult(
            scenario_id=scenario.scenario_id,
            subject=scenario.subject,
            body=scenario.body,
            turns=turns,
        )

        transcript_filename = (
            f"transcript.{scenario.scenario_id}.{target_model}.{runtime_cfg.probe_model}.{timestamp_label}.md"
        )
        save_text(
            run_dir / transcript_filename,
            render_transcript_markdown(
                run_id=run_id,
                scenario=scenario_result,
                target_model=target_model,
                probe_model=runtime_cfg.probe_model,
                timestamp=timestamp_label,
            ),
        )
        return scenario.scenario_id, scenario_result, transcript_filename

    model_mapping: Dict[str, str] = {}
    print(f"[Probe] Starting run {run_id}")
    print(f"[Probe] Target models: {', '.join(runtime_cfg.target_models)}")
    print(
        "[Probe] Scenarios: "
        + ", ".join(scenario.scenario_id for scenario in scenarios_cfg.scenarios)
    )
    print(f"[Probe] Thread workers: {max_workers}")

    for index, target_model in enumerate(runtime_cfg.target_models, start=1):
        anon_id = f"anon_model_{index:03d}"
        model_mapping[anon_id] = target_model
        print(f"[Probe] -> Processing model {target_model} as {anon_id}")
        futures_map = {}
        scenario_order = [scenario.scenario_id for scenario in scenarios_cfg.scenarios]
        scenario_results_map: Dict[str, ScenarioResult] = {}

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            for scenario in scenarios_cfg.scenarios:
                print(f"[Probe]    -> Queueing scenario {scenario.scenario_id}")
                future = executor.submit(process_scenario, target_model, anon_id, scenario)
                futures_map[future] = scenario.scenario_id

            for future in as_completed(futures_map):
                scenario_id, scenario_result, transcript_filename = future.result()
                scenario_results_map[scenario_id] = scenario_result
                print(f"[Probe]    <- Completed {scenario_id}, wrote {transcript_filename}")

        scenario_results = [scenario_results_map[scenario_id] for scenario_id in scenario_order]

        aggregated_path = run_dir / f"aggregated_transcript.{anon_id}.md"
        save_text(
            aggregated_path,
            render_aggregated_transcript_markdown(
                run_id=run_id,
                anon_model_id=anon_id,
                scenario_results=scenario_results,
            ),
        )
        print(f"[Probe] <- Wrote aggregated transcript for {anon_id} ({aggregated_path.name})")
    manifest = create_run_manifest(
        run_id=run_id,
        probe_model=runtime_cfg.probe_model,
        judge_model=runtime_cfg.judge_model,
        scenarios_cfg=scenarios_cfg,
        runtime_cfg=runtime_cfg,
        model_mapping=model_mapping,
        scenarios_path=Path(args.scenarios),
        values_rubric_path=Path(args.values_rubric),
    )
    save_yaml(run_dir / "run_manifest.yaml", manifest)
    print("[Probe] Manifest written to run_manifest.yaml")

    print(f"[Probe] Completed run {run_id}. Outputs written to {run_dir}")


if __name__ == "__main__":
    run_probe()
