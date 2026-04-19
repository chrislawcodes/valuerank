#!/usr/bin/env python3
"""Back-test judge-panel outcomes against post-merge signals."""
from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import factory_embeddings  # noqa: E402
import factory_state  # noqa: E402


CSV_COLUMNS = [
    "slug",
    "merged_at",
    "stages_with_concerns",
    "unresolved_concerns_count",
    "annotations_count",
    "override_used",
    "ci_failures_48h",
    "reverts_7d",
    "concerns_matched_to_incidents",
    "outcome",
]

FAILURE_CONCLUSIONS = {
    "failure",
    "timed_out",
    "cancelled",
    "action_required",
    "startup_failure",
    "stale",
}

_DEFAULT_INCIDENTS_PATH = factory_state.REPO_ROOT / "docs" / "incidents"


@dataclass(slots=True)
class ConcernMatch:
    stage: str
    judge: str
    round_raised: str
    reasoning: str
    incident_paths: list[str] = field(default_factory=list)
    best_similarity: float = 0.0
    low_confidence: bool = False


@dataclass(slots=True)
class FeatureResult:
    slug: str
    merged_at: str
    stages_with_concerns: list[str]
    unresolved_concerns_count: int
    annotations_count: int
    override_used: bool
    ci_failures_48h: int
    ci_failure_workflows: list[str]
    ci_data_unavailable: bool
    reverts_7d: int
    revert_messages: list[str]
    concerns_matched_to_incidents: int
    incident_matches: list[ConcernMatch]
    outcome: str

    def csv_row(self) -> dict[str, object]:
        return {
            "slug": self.slug,
            "merged_at": self.merged_at,
            "stages_with_concerns": ";".join(self.stages_with_concerns),
            "unresolved_concerns_count": self.unresolved_concerns_count,
            "annotations_count": self.annotations_count,
            "override_used": str(self.override_used).lower(),
            "ci_failures_48h": self.ci_failures_48h,
            "reverts_7d": self.reverts_7d,
            "concerns_matched_to_incidents": self.concerns_matched_to_incidents,
            "outcome": self.outcome,
        }

    def is_concerning(self) -> bool:
        return self.outcome != "clean" or self.override_used or self.concerns_matched_to_incidents > 0 or self.ci_data_unavailable

    def markdown_note(self) -> str:
        notes: list[str] = []
        if self.ci_data_unavailable:
            notes.append("CI unavailable")
        if any(match.low_confidence for match in self.incident_matches):
            notes.append("low-confidence match")
        return ", ".join(notes)


def _parse_since(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("expected YYYY-MM-DD") from exc


def _parse_iso8601(value: str) -> datetime | None:
    raw = value.strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _normalize_text(value: str) -> str:
    return " ".join(value.lower().split())


def _substring_match(left: str, right: str) -> bool:
    left_norm = _normalize_text(left)
    right_norm = _normalize_text(right)
    return bool(left_norm and right_norm and (left_norm in right_norm or right_norm in left_norm))


def _iter_feature_dirs() -> list[Path]:
    root = factory_state.FACTORY_RUNS_ROOT
    if not root.exists():
        return []
    return sorted(path for path in root.iterdir() if path.is_dir())


def _load_state(slug: str) -> dict[str, Any] | None:
    try:
        return factory_state.load_workflow_state(slug)
    except Exception:
        return None


def _extract_stage_concerns(state: dict[str, Any]) -> tuple[list[str], list[dict[str, Any]], list[dict[str, Any]]]:
    stages = state.get("stages", {})
    stage_names: list[str] = []
    concerns: list[dict[str, Any]] = []
    annotations: list[dict[str, Any]] = []
    if not isinstance(stages, dict):
        return stage_names, concerns, annotations

    for stage_name, stage_state in stages.items():
        stage_blob = stage_state if isinstance(stage_state, dict) else {}
        stage_concerns = stage_blob.get("unresolved_concerns", [])
        if isinstance(stage_concerns, list) and stage_concerns:
            stage_names.append(stage_name)
        for concern in stage_concerns if isinstance(stage_concerns, list) else []:
            if isinstance(concern, dict):
                concerns.append({"stage": stage_name, **concern})
        stage_annotations = stage_blob.get("annotations", [])
        for annotation in stage_annotations if isinstance(stage_annotations, list) else []:
            if isinstance(annotation, dict):
                annotations.append({"stage": stage_name, **annotation})
    return stage_names, concerns, annotations


def _has_prompt_override_marker(value: object) -> bool:
    if isinstance(value, dict):
        for key, nested in value.items():
            if key in {"prompt_override", "prompt_override_path", "override_reason"}:
                return True
            if _has_prompt_override_marker(nested):
                return True
        return False
    if isinstance(value, list):
        return any(_has_prompt_override_marker(item) for item in value)
    if isinstance(value, str):
        lowered = value.lower()
        return "prompt-override" in lowered or "prompt override" in lowered
    return False


def _feature_has_override(state: dict[str, Any]) -> bool:
    if state.get("override"):
        return True
    if _has_prompt_override_marker(state.get("last_action_result")):
        return True
    stages = state.get("stages", {})
    if isinstance(stages, dict):
        for stage_state in stages.values():
            if _has_prompt_override_marker(stage_state):
                return True
    return False


def _load_incidents(incidents_path: Path) -> list[tuple[Path, str]]:
    if not incidents_path.exists():
        return []
    if incidents_path.is_file():
        return [(incidents_path, incidents_path.read_text(encoding="utf-8"))]

    corpus: list[tuple[Path, str]] = []
    for path in sorted(incidents_path.rglob("*")):
        if path.is_file() and path.suffix.lower() in {".md", ".markdown", ".txt"}:
            try:
                corpus.append((path, path.read_text(encoding="utf-8")))
            except Exception:
                continue
    return corpus


def _match_concerns_to_incidents(
    concerns: list[dict[str, Any]],
    incidents: list[tuple[Path, str]],
) -> tuple[list[ConcernMatch], bool]:
    matches: list[ConcernMatch] = []
    low_confidence_used = False

    for concern in concerns:
        reasoning = str(concern.get("reasoning", "") or "").strip()
        if not reasoning:
            continue
        matched_paths: list[str] = []
        best_similarity = 0.0
        concern_low_confidence = False

        for incident_path, incident_text in incidents:
            if not _substring_match(reasoning, incident_text):
                continue
            similarity = factory_embeddings.cosine_similarity(reasoning, incident_text)
            concern_low_confidence = concern_low_confidence or bool(getattr(factory_embeddings, "_FALLBACK_LOGGED", False))
            if similarity < 0.75:
                continue
            matched_paths.append(str(incident_path))
            if similarity >= best_similarity:
                best_similarity = similarity

        if matched_paths:
            low_confidence_used = low_confidence_used or concern_low_confidence
            matches.append(
                ConcernMatch(
                    stage=str(concern.get("stage", "") or ""),
                    judge=str(concern.get("judge", "") or ""),
                    round_raised=str(concern.get("round_raised", concern.get("round", "")) or ""),
                    reasoning=reasoning,
                    incident_paths=matched_paths,
                    best_similarity=best_similarity,
                    low_confidence=concern_low_confidence,
                )
            )

    return matches, low_confidence_used


def _query_ci_runs(merged_sha: str, merged_at: datetime) -> tuple[int, list[str]]:
    jq_filter = f'.workflow_runs[] | select(.head_sha == "{merged_sha}")'
    cmd = [
        "gh",
        "api",
        "repos/chrislawcodes/valuerank/actions/runs",
        "--jq",
        jq_filter,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "gh api failed")

    raw = (result.stdout or "").strip()
    if not raw:
        return 0, []

    runs: list[dict[str, Any]] = []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = None

    if isinstance(parsed, dict):
        runs = [parsed]
    elif isinstance(parsed, list):
        runs = [item for item in parsed if isinstance(item, dict)]
    else:
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(item, dict):
                runs.append(item)

    window_end = merged_at + timedelta(hours=48)
    failures = 0
    workflow_names: list[str] = []
    seen_names: set[str] = set()

    for run in runs:
        created_at = _parse_iso8601(str(run.get("created_at", "") or run.get("run_started_at", "") or ""))
        if created_at is None or created_at < merged_at or created_at > window_end:
            continue
        conclusion = str(run.get("conclusion", "") or "").lower()
        if conclusion not in FAILURE_CONCLUSIONS:
            continue
        failures += 1
        name = str(run.get("name", "") or "").strip()
        if name and name not in seen_names:
            workflow_names.append(name)
            seen_names.add(name)

    return failures, workflow_names


def _query_reverts(merged_sha: str, merged_at: datetime) -> tuple[int, list[str]]:
    since = merged_at.date().isoformat()
    until = (merged_at.date() + timedelta(days=7)).isoformat()
    cmd = [
        "git",
        "-C",
        str(factory_state.REPO_ROOT),
        "log",
        "main",
        "--grep",
        f"revert.*{merged_sha}",
        "--grep",
        "^revert",
        "--grep",
        "^fix:",
        "--since",
        since,
        "--until",
        until,
        "--pretty=format:%H%x1f%s%x1f%b%x1e",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    except FileNotFoundError:
        return 0, []
    if result.returncode != 0:
        return 0, []

    records = [record for record in result.stdout.split("\x1e") if record.strip()]
    messages: list[str] = []
    for record in records:
        parts = record.split("\x1f")
        if len(parts) < 2:
            continue
        subject = parts[1].strip()
        body = parts[2].strip() if len(parts) > 2 else ""
        message = subject if not body else f"{subject}\n{body}"
        messages.append(message)
    return len(messages), messages


def _outcome_for(feature: FeatureResult) -> str:
    if feature.concerns_matched_to_incidents > 0:
        return "incident"
    if feature.reverts_7d > 0:
        return "reverted"
    if feature.ci_failures_48h > 0:
        return "hotfixed"
    if feature.ci_data_unavailable:
        return "indeterminate"
    return "clean"


def collect_feature_rows(args: argparse.Namespace) -> list[FeatureResult]:
    incidents = _load_incidents(args.incidents_path)
    rows: list[FeatureResult] = []
    setattr(args, "_skipped_overrides", 0)

    for run_dir in _iter_feature_dirs():
        slug = run_dir.name
        state = _load_state(slug)
        if state is None:
            continue

        delivery = state.get("delivery", {})
        if not isinstance(delivery, dict):
            continue
        merged_at_text = str(delivery.get("merged_at_iso8601", "") or "").strip()
        merged_at = _parse_iso8601(merged_at_text)
        if merged_at is None or merged_at.date() < args.since:
            continue

        override_used = _feature_has_override(state)
        if override_used and not args.include_overrides:
            setattr(args, "_skipped_overrides", getattr(args, "_skipped_overrides", 0) + 1)
            continue

        stage_names, concerns, annotations = _extract_stage_concerns(state)
        matched_incidents, _ = _match_concerns_to_incidents(concerns, incidents)
        concern_match_count = len(matched_incidents)

        merged_sha = str(delivery.get("merged_sha", "") or delivery.get("head_sha", "") or "").strip()
        ci_data_unavailable = False
        ci_failures_48h = 0
        ci_failure_workflows: list[str] = []
        if args.no_gh:
            ci_data_unavailable = True
        elif merged_sha:
            try:
                ci_failures_48h, ci_failure_workflows = _query_ci_runs(merged_sha, merged_at)
            except Exception:
                ci_data_unavailable = True
        else:
            ci_data_unavailable = True

        reverts_7d, revert_messages = _query_reverts(merged_sha, merged_at) if merged_sha else (0, [])

        row = FeatureResult(
            slug=slug,
            merged_at=merged_at_text,
            stages_with_concerns=stage_names,
            unresolved_concerns_count=len(concerns),
            annotations_count=len(annotations),
            override_used=override_used,
            ci_failures_48h=ci_failures_48h,
            ci_failure_workflows=ci_failure_workflows,
            ci_data_unavailable=ci_data_unavailable,
            reverts_7d=reverts_7d,
            revert_messages=revert_messages,
            concerns_matched_to_incidents=concern_match_count,
            incident_matches=matched_incidents,
            outcome="",
        )
        row.outcome = _outcome_for(row)
        rows.append(row)

    rows.sort(key=lambda item: (item.merged_at, item.slug))
    return rows


def _markdown_table_header() -> str:
    return (
        "| slug | merged_at | outcome | stages_with_concerns | unresolved | annotations | ci_failures_48h | reverts_7d | matched_incidents | override | note |\n"
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
    )


def _markdown_row(feature: FeatureResult) -> str:
    note = feature.markdown_note()
    return (
        f"| {feature.slug} | {feature.merged_at} | {feature.outcome} | "
        f"{', '.join(feature.stages_with_concerns) if feature.stages_with_concerns else ''} | "
        f"{feature.unresolved_concerns_count} | {feature.annotations_count} | {feature.ci_failures_48h} | "
        f"{feature.reverts_7d} | {feature.concerns_matched_to_incidents} | {str(feature.override_used).lower()} | {note} |"
    )


def _write_csv(path: Path, rows: list[FeatureResult]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow(row.csv_row())


def _write_markdown(path: Path, rows: list[FeatureResult], args: argparse.Namespace) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    counts = {
        "clean": sum(1 for row in rows if row.outcome == "clean"),
        "hotfixed": sum(1 for row in rows if row.outcome == "hotfixed"),
        "reverted": sum(1 for row in rows if row.outcome == "reverted"),
        "incident": sum(1 for row in rows if row.outcome == "incident"),
        "indeterminate": sum(1 for row in rows if row.outcome == "indeterminate"),
    }
    skipped_overrides = int(getattr(args, "_skipped_overrides", 0) or 0)
    concerning_rows = [row for row in rows if row.is_concerning()]
    calibration_candidates = [
        row
        for row in rows
        if row.override_used or row.concerns_matched_to_incidents > 0
    ]

    lines = [
        "# FF Judge Panel Back-Test",
        "",
        f"- since: `{args.since.isoformat()}`",
        f"- incidents path: `{args.incidents_path}`",
        f"- gh enabled: `{str(not args.no_gh).lower()}`",
        f"- include overrides: `{str(args.include_overrides).lower()}`",
        "",
        "## Aggregate Stats",
        "",
        f"- features in range: `{len(rows)}`",
        f"- clean: `{counts['clean']}`",
        f"- hotfixed: `{counts['hotfixed']}`",
        f"- reverted: `{counts['reverted']}`",
        f"- incident: `{counts['incident']}`",
        f"- indeterminate: `{counts['indeterminate']}`",
        f"- skipped overrides: `{skipped_overrides}`",
        "",
        "## Concerning Features",
        "",
    ]

    if concerning_rows:
        lines.append(_markdown_table_header())
        for row in concerning_rows:
            lines.append(_markdown_row(row))
    else:
        lines.append("- none")

    lines.extend(
        [
            "",
            "## Flagged Calibration Candidates",
            "",
        ]
    )

    if calibration_candidates:
        for row in calibration_candidates:
            note = row.markdown_note()
            suffix = f" ({note})" if note else ""
            lines.append(
                f"- {row.slug}: `{row.outcome}` with `{row.concerns_matched_to_incidents}` matched concern"
                f"{'s' if row.concerns_matched_to_incidents != 1 else ''}{suffix}"
            )
    else:
        lines.append("- none")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _default_output_path(prefix: str, suffix: str) -> Path:
    return Path.cwd() / f"{prefix}-{suffix}"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Back-test judge-panel decisions against post-merge outcomes.")
    parser.add_argument("--since", required=True, type=_parse_since, help="YYYY-MM-DD lower bound for merged features")
    parser.add_argument(
        "--incidents-path",
        type=Path,
        default=_DEFAULT_INCIDENTS_PATH,
        help="Incident post-mortem directory or STATUS.md file to scan",
    )
    parser.add_argument("--output-csv", type=Path, help="Write CSV to this path")
    parser.add_argument("--output-md", type=Path, help="Write markdown summary to this path")
    parser.add_argument("--include-overrides", action="store_true", help="Include override-calibrated features")
    parser.add_argument("--no-gh", action="store_true", help="Skip gh entirely and mark CI data unavailable")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    rows = collect_feature_rows(args)
    if not rows:
        print("no features in range")
        return 0

    today = date.today().isoformat()
    csv_path = args.output_csv or _default_output_path("backtest", f"{today}.csv")
    md_path = args.output_md or _default_output_path("backtest", f"{today}.md")
    _write_csv(csv_path, rows)
    _write_markdown(md_path, rows, args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
