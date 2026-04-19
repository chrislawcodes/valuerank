#!/usr/bin/env python3
"""Run the judge panel against blocked legacy workflows and summarize the result."""
from __future__ import annotations

import argparse
import contextlib
import io
import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
import sys

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from factory_cmd_judge import run_judge  # noqa: E402
from factory_state import REPO_ROOT, factory_state_path, load_workflow_state, reviews_dir  # noqa: E402
from factory_stages import CHECKPOINT_STAGES, stage_manifest_state  # noqa: E402


DEFAULT_TARGET_SLUGS = [
    "split-queue-orchestrator",
    "finding-2-graphql-tightening",
]


@dataclass
class MigrationResult:
    slug: str
    state_path: str
    stage: str | None = None
    stage_reason: str = ""
    status: str = "skipped"
    verdict_payload: dict[str, object] | None = None
    verdicts: list[dict[str, object]] = field(default_factory=list)
    dispatch_errors: list[str] = field(default_factory=list)

    def proceed_count(self) -> int:
        return sum(1 for verdict in self.verdicts if verdict.get("verdict") in {"proceed", "proceed-with-annotation"})

    def block_count(self) -> int:
        return sum(1 for verdict in self.verdicts if verdict.get("verdict") == "block")

    def final_action(self) -> str:
        if self.dispatch_errors:
            return "skipped"
        if not self.verdict_payload:
            proceed_count, block_count = _tally_from_verdicts(self.verdicts)
            if proceed_count >= 2:
                return "advanced"
            if block_count >= 2:
                return "remained blocked with concerns"
            return "skipped"
        if self.verdict_payload.get("outcome") == "advance":
            return "advanced"
        if self.verdict_payload.get("outcome") == "rejudge":
            return "remained blocked with concerns"
        return str(self.verdict_payload.get("next", "unknown"))


def _now_date() -> str:
    return datetime.now().date().isoformat()


def _stage_int(stage_state: dict, key: str) -> int:
    try:
        return int(stage_state.get(key, 0) or 0)
    except (TypeError, ValueError):
        return 0


def _stage_state(state: dict, stage: str) -> dict:
    stages = state.get("stages", {})
    stage_state = stages.get(stage, {}) if isinstance(stages, dict) else {}
    if not isinstance(stage_state, dict):
        stage_state = {}
    merged = dict(stage_state)
    if "adversarial_rounds" not in merged:
        try:
            merged["adversarial_rounds"] = int(state.get(f"{stage}_adversarial_rounds", 0) or 0)
        except (TypeError, ValueError):
            merged["adversarial_rounds"] = 0
    if "judge_rounds" not in merged:
        try:
            merged["judge_rounds"] = int(state.get(f"{stage}_judge_rounds", 0) or 0)
        except (TypeError, ValueError):
            merged["judge_rounds"] = 0
    if "judge_verdicts" not in merged or not isinstance(merged.get("judge_verdicts"), list):
        merged["judge_verdicts"] = []
    return merged


def _latest_round_block_count(stage_state: dict) -> int:
    verdicts = stage_state.get("judge_verdicts", [])
    if not isinstance(verdicts, list) or not verdicts:
        return 0
    latest_round = verdicts[-1]
    if not isinstance(latest_round, list):
        return 0
    return sum(1 for verdict in latest_round if isinstance(verdict, dict) and verdict.get("verdict") == "block")


def _collect_verdicts(slug: str) -> list[dict[str, object]]:
    verdicts: list[dict[str, object]] = []
    for path in sorted(reviews_dir(slug).glob("judge.*.verdict.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(payload, dict):
            verdicts.append(payload)
    verdicts.sort(key=lambda item: str(item.get("judge", "")))
    return verdicts


def _infer_blocked_stage(slug: str, state: dict) -> tuple[str | None, str]:
    candidates: list[tuple[int, str, str]] = []
    for index, stage in enumerate(CHECKPOINT_STAGES):
        stage_state = _stage_state(state, stage)
        manifest = stage_manifest_state(slug, stage)
        judge_rounds = _stage_int(stage_state, "judge_rounds")
        adversarial_rounds = _stage_int(stage_state, "adversarial_rounds")
        judge_next_action = str(stage_state.get("judge_next_action", "") or "")
        latest_block_count = _latest_round_block_count(stage_state)

        if judge_next_action in {"edit_and_rerun_judge", "advance"}:
            return stage, f"stage_state.judge_next_action={judge_next_action}"
        if adversarial_rounds >= 3 and judge_rounds == 0:
            return stage, "adversarial_rounds>=3 and judge_rounds==0"
        if judge_rounds > 0 and latest_block_count >= 2:
            return stage, f"latest judge round has {latest_block_count} block votes"
        if manifest.get("manifest_exists") and manifest.get("artifact_exists"):
            candidates.append((0 if stage == "plan" else 1 + index, stage, "checkpoint manifest and artifact exist"))

    if candidates:
        candidates.sort(key=lambda item: (item[0], CHECKPOINT_STAGES.index(item[1])))
        _, stage, reason = candidates[0]
        return stage, reason
    return None, ""


def _capture_run(slug: str, stage: str) -> tuple[int, dict[str, object] | None, str]:
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        rc = run_judge(slug, stage, json_output=True, migration_bypass=True)
    raw_output = buffer.getvalue().strip()
    payload: dict[str, object] | None = None
    if raw_output:
        try:
            payload = json.loads(raw_output)
        except Exception:
            payload = None
    return rc, payload, raw_output


def _tally_from_verdicts(verdicts: list[dict[str, object]]) -> tuple[int, int]:
    proceed = sum(1 for verdict in verdicts if verdict.get("verdict") in {"proceed", "proceed-with-annotation"})
    block = sum(1 for verdict in verdicts if verdict.get("verdict") == "block")
    return proceed, block


def _render_result(result: MigrationResult) -> str:
    lines = [f"## {result.slug}"]
    lines.append(f"- state: `{result.state_path}`")
    if result.stage:
        lines.append(f"- stage judged: `{result.stage}`")
        if result.stage_reason:
            lines.append(f"- stage reason: {result.stage_reason}")
    else:
        lines.append("- stage judged: `none`")
    if result.dispatch_errors:
        lines.append("- dispatch errors:")
        for error in result.dispatch_errors:
            lines.append(f"  - {error}")
    elif result.verdict_payload or result.verdicts:
        proceed_count, block_count = _tally_from_verdicts(result.verdicts)
        lines.append(f"- vote tally: proceed={proceed_count} block={block_count}")
        lines.append(f"- final action: {result.final_action()}")
        lines.append("- per-judge verdicts:")
        for verdict in result.verdicts:
            lines.append(
                "  - {judge}: {verdict} (confidence {confidence})".format(
                    judge=verdict.get("judge", "unknown"),
                    verdict=verdict.get("verdict", "unknown"),
                    confidence=verdict.get("confidence", "unknown"),
                )
            )
            reasoning = str(verdict.get("reasoning", "")).strip()
            if reasoning:
                lines.append(f"    - {reasoning}")
    else:
        lines.append(f"- final action: {result.final_action()}")
    if result.verdict_payload:
        lines.append("- raw payload:")
        lines.append("```json")
        lines.append(json.dumps(result.verdict_payload, indent=2, sort_keys=True))
        lines.append("```")
    lines.append("")
    return "\n".join(lines)


def _write_summary(results: list[MigrationResult], summary_path: Path) -> None:
    lines = [
        "# ff-judge-panel migration summary",
        "",
        f"- generated: `{_now_date()}`",
        f"- repo root: `{REPO_ROOT}`",
        "",
    ]
    for result in results:
        lines.append(_render_result(result))
    summary_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def _resolve_targets(slug: str | None) -> list[str]:
    if slug:
        return [slug]
    return list(DEFAULT_TARGET_SLUGS)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    targets = _resolve_targets(args.slug)
    results: list[MigrationResult] = []

    for target in targets:
        state_path = factory_state_path(target)
        result = MigrationResult(slug=target, state_path=str(state_path))
        if not state_path.exists():
            result.dispatch_errors.append("state.json missing")
            results.append(result)
            continue

        try:
            state = load_workflow_state(target)
        except Exception as exc:
            result.dispatch_errors.append(f"failed to read state.json: {exc}")
            results.append(result)
            continue

        stage, reason = _infer_blocked_stage(target, state)
        result.stage = stage
        result.stage_reason = reason

        if not stage:
            result.dispatch_errors.append("no blocked stage could be inferred")
            results.append(result)
            continue

        if args.dry_run:
            result.status = "dry-run"
            print(f"[dry-run] {target}: would run judge --slug {target} --stage {stage} --json --migration-bypass")
            results.append(result)
            continue

        try:
            rc, payload, raw_output = _capture_run(target, stage)
        except Exception as exc:
            result.dispatch_errors.append(f"judge dispatch failed: {exc}")
            results.append(result)
            continue

        if rc != 0:
            result.dispatch_errors.append(f"judge exited with status {rc}")
        if payload is None:
            result.dispatch_errors.append("judge did not emit structured JSON")
        else:
            result.verdict_payload = payload
            verdicts = _collect_verdicts(target)
            if verdicts:
                result.verdicts = verdicts
            result.status = "completed"
        if raw_output:
            print(f"{target}: {raw_output}")
        results.append(result)

    summary_path = REPO_ROOT / "docs" / "workflow" / "feature-runs" / f"migration-ff-judge-panel-{_now_date()}.md"
    if args.dry_run:
        for result in results:
            if result.dispatch_errors:
                print(f"[dry-run] {result.slug}: {'; '.join(result.dispatch_errors)}")
        return 0

    _write_summary(results, summary_path)
    print(str(summary_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
