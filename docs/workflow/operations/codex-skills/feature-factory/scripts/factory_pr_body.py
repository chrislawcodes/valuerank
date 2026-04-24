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


def _concern_is_resolved(concern: dict) -> bool:
    """FR-005a — a concern is resolved once addressed, deferred, or dismissed.

    Resolution requires the STATE-BEARING field to be set (``addressed_at``,
    ``deferred_reason``, or ``dismissed_reason``). ``addressed_by`` alone is
    evidence, not resolution — a concern with only evidence would still
    block checkpoint per FR-004, so it must render as open in the PR body.

    Missing fields are treated as None (unresolved). Older concerns written
    before FR-003 simply never populate these fields and keep rendering as
    open, which matches prior behavior.
    """
    return any(
        concern.get(field) is not None
        for field in ("addressed_at", "deferred_reason", "dismissed_reason")
    )


def collect_judge_panel_entries(
    state: dict,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any] | None, list[dict[str, Any]]]:
    """Return (open_concerns, annotations, override, resolved_concerns).

    Open concerns render in the ``## ⚠ Unresolved Judge Concerns`` block.
    Resolved concerns render in a separate ``## Resolved Concerns`` block so
    the audit trail is preserved without confusing the operator about open
    items (FR-005a).
    """
    concerns: list[dict[str, Any]] = []
    resolved_concerns: list[dict[str, Any]] = []
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
                if _concern_is_resolved(merged):
                    resolved_concerns.append(merged)
                else:
                    concerns.append(merged)
            for annotation in _coerce_list(stage_blob.get("annotations")):
                annotation_blob = _coerce_mapping(annotation)
                if not annotation_blob:
                    continue
                merged = dict(annotation_blob)
                merged.setdefault("stage", stage_name)
                annotations.append(merged)

    override = _coerce_mapping(state.get("override"))
    return concerns, annotations, override, resolved_concerns


def render_judge_panel_block(state: dict) -> str:
    concerns, annotations, override, resolved_concerns = collect_judge_panel_entries(state)
    if not concerns and not annotations and not override and not resolved_concerns:
        return ""

    lines: list[str] = [SENTINEL_BEGIN]
    # Diff round-1 LOW finding: skip the unresolved heading when every concern
    # is resolved — otherwise operators see an empty section and mis-read it.
    if concerns:
        lines.append("## ⚠ Unresolved Judge Concerns")

    for concern in concerns:
        stage = str(concern.get("stage", "") or "")
        judge = str(concern.get("judge", "") or "")
        confidence = concern.get("confidence", "")
        reasoning = str(concern.get("reasoning", "") or "").strip()
        round_raised = concern.get("round_raised", concern.get("round", ""))
        concern_id = str(concern.get("id", "") or "")
        also_raised = concern.get("also_raised_in_round", concern.get("persisted_across_rounds", []))
        if not isinstance(also_raised, list):
            also_raised = [also_raised] if also_raised not in ("", None) else []
        heading_parts = [part for part in (stage, judge) if part]
        heading = " / ".join(heading_parts) if heading_parts else "Concern"
        concern_lines = [f"### {heading}"]
        if concern_id:
            # FR-005a — print id in the open block so operators can use it
            # with `checkpoint --address/--defer/--dismiss <id>` without
            # having to read state.json to recover it.
            concern_lines.append(f"- id: `{concern_id}`")
        concern_lines.extend(
            [
                f"- stage: `{stage}`",
                f"- judge: `{judge}`",
                f"- confidence: `{confidence}`",
                f"- reasoning: {reasoning or '(none)'}",
                f"- also_raised_in_round: `{', '.join(str(item) for item in also_raised) if also_raised else ''}`",
                f"- round_raised: `{round_raised}`",
                "",
            ]
        )
        lines.extend(concern_lines)

    if resolved_concerns:
        lines.append("## Resolved Concerns")
        for concern in resolved_concerns:
            stage = str(concern.get("stage", "") or "")
            judge = str(concern.get("judge", "") or "")
            concern_id = str(concern.get("id", "") or "")
            if concern.get("addressed_at") is not None:
                # addressed_at is the state-bearing field; addressed_by is evidence.
                # Keep the two aligned with _concern_is_resolved so the PR body
                # and the checkpoint gate (FR-004) never disagree.
                status = "addressed"
                detail = str(concern.get("addressed_by", "") or "").strip() or "(no evidence)"
            elif concern.get("deferred_reason"):
                status = "deferred"
                detail = str(concern.get("deferred_reason", "") or "").strip()
            elif concern.get("dismissed_reason"):
                status = "dismissed"
                detail = str(concern.get("dismissed_reason", "") or "").strip()
            else:
                status = "resolved"
                detail = ""
            id_label = f"`{concern_id}`" if concern_id else ""
            lines.append(
                f"- {stage} / {judge} {id_label} — **{status}**: {detail}".rstrip()
            )
        lines.append("")

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
