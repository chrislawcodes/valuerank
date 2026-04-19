#!/usr/bin/env python3
"""Judge-panel PR body rendering and sentinel replacement helpers."""
from __future__ import annotations

from datetime import datetime, timezone
import textwrap
from typing import Any

SENTINEL_BEGIN = "<!-- ff-judge-panel:begin -->"
SENTINEL_END = "<!-- ff-judge-panel:end -->"


def now_iso8601_utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _coerce_mapping(value: object) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def _coerce_list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _excerpt(text: object, limit: int = 120) -> str:
    if not isinstance(text, str):
        return ""
    normalized = " ".join(text.split())
    return textwrap.shorten(normalized, width=limit, placeholder="...")


def collect_judge_panel_entries(state: dict) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any] | None]:
    concerns: list[dict[str, Any]] = []
    annotations: list[dict[str, Any]] = []
    stages = state.get("stages", {})
    if isinstance(stages, dict):
        for stage_name, stage_state in stages.items():
            stage_blob = _coerce_mapping(stage_state)
            if not stage_blob:
                continue
            for concern in _coerce_list(stage_blob.get("unresolved_concerns")):
                concern_blob = _coerce_mapping(concern)
                if not concern_blob:
                    continue
                merged = dict(concern_blob)
                merged.setdefault("stage", stage_name)
                concerns.append(merged)
            for annotation in _coerce_list(stage_blob.get("annotations")):
                annotation_blob = _coerce_mapping(annotation)
                if not annotation_blob:
                    continue
                merged = dict(annotation_blob)
                merged.setdefault("stage", stage_name)
                annotations.append(merged)

    override = _coerce_mapping(state.get("override"))
    return concerns, annotations, override


def render_judge_panel_block(state: dict) -> str:
    concerns, annotations, override = collect_judge_panel_entries(state)
    if not concerns and not annotations and not override:
        return ""

    lines: list[str] = [SENTINEL_BEGIN, "## ⚠ Unresolved Judge Concerns"]

    for concern in concerns:
        stage = str(concern.get("stage", "") or "")
        judge = str(concern.get("judge", "") or "")
        confidence = concern.get("confidence", "")
        reasoning = str(concern.get("reasoning", "") or "").strip()
        round_raised = concern.get("round_raised", concern.get("round", ""))
        also_raised = concern.get("also_raised_in_round", concern.get("persisted_across_rounds", []))
        if not isinstance(also_raised, list):
            also_raised = [also_raised] if also_raised not in ("", None) else []
        heading_parts = [part for part in (stage, judge) if part]
        heading = " / ".join(heading_parts) if heading_parts else "Concern"
        lines.extend(
            [
                f"### {heading}",
                f"- stage: `{stage}`",
                f"- judge: `{judge}`",
                f"- confidence: `{confidence}`",
                f"- reasoning: {reasoning or '(none)'}",
                f"- also_raised_in_round: `{', '.join(str(item) for item in also_raised) if also_raised else ''}`",
                f"- round_raised: `{round_raised}`",
                "",
            ]
        )

    if annotations:
        lines.append("## Annotations")
        for annotation in annotations:
            stage = str(annotation.get("stage", "") or "")
            judge = str(annotation.get("judge", "") or "")
            confidence = annotation.get("confidence", "")
            round_value = annotation.get("round", "")
            excerpt = _excerpt(annotation.get("reasoning", ""))
            lines.append(
                f"- {stage} / {judge} (round {round_value}, confidence {confidence}): {excerpt or '(no reasoning excerpt)'}"
            )
        lines.append("")

    if override:
        lines.extend(
            [
                "## Override",
                "### ⚠ Shipped over judge objection",
                f"- reason: {str(override.get('reason', '') or '').strip()}",
                f"- operator_id: `{str(override.get('operator_id', '') or '').strip()}`",
                f"- timestamp: `{str(override.get('timestamp_iso8601_utc', '') or '').strip()}`",
                "- affected concerns:",
            ]
        )
        affected = _coerce_list(override.get("affected_concerns"))
        if affected:
            for concern in affected:
                concern_blob = _coerce_mapping(concern)
                if not concern_blob:
                    continue
                stage = str(concern_blob.get("stage", "") or "")
                judge = str(concern_blob.get("judge", "") or "")
                reasoning = str(concern_blob.get("reasoning", "") or "").strip()
                round_raised = concern_blob.get("round_raised", concern_blob.get("round", ""))
                lines.append(
                    f"  - {stage} / {judge} (round {round_raised}): {reasoning or '(none)'}"
                )
        else:
            lines.append("  - (none)")

    lines.append(SENTINEL_END)
    return "\n".join(lines) + "\n"


def upsert_judge_panel_block(existing_body: str, rendered_block: str) -> tuple[str, bool]:
    if not rendered_block:
        begin = existing_body.find(SENTINEL_BEGIN)
        end = existing_body.find(SENTINEL_END, begin + len(SENTINEL_BEGIN)) if begin != -1 else -1
        if begin == -1 or end == -1 or end < begin:
            return existing_body, False
        return existing_body[:begin] + existing_body[end + len(SENTINEL_END):], False

    begin = existing_body.find(SENTINEL_BEGIN)
    end = existing_body.find(SENTINEL_END, begin + len(SENTINEL_BEGIN)) if begin != -1 else -1
    if begin != -1 and end != -1 and end > begin:
        return existing_body[:begin] + rendered_block + existing_body[end + len(SENTINEL_END):], False

    prefix = f"{rendered_block}\n\n"
    if not existing_body:
        return rendered_block, True
    return prefix + existing_body, True
