#!/usr/bin/env python3
"""command_judge implementation."""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import logging
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from factory_state import (  # noqa: E402
    REPO_ROOT,
    atomic_json_write,
    default_artifact_path,
    load_workflow_state,
    parse_review_frontmatter,
    reviews_dir,
    with_locked_state,
    workflow_dir,
)
from factory_heartbeat import HeartbeatEmitter, set_activity as heartbeat_set_activity  # noqa: E402
import factory_embeddings  # noqa: E402
from factory_telemetry import record_ai_call  # noqa: E402

REVIEW_SCRIPTS = REPO_ROOT / "docs" / "workflow" / "operations" / "codex-skills" / "review-lens" / "scripts"
if str(REVIEW_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(REVIEW_SCRIPTS))

from workflow_utils import normalized_artifact_hash, repo_relative_path  # noqa: E402

from factory_git import _git_head_sha  # noqa: E402
from factory_next_action import recommended_next_action  # noqa: E402
from factory_stages import CHECKPOINT_STAGES, stage_manifest_state  # noqa: E402
from judge_prompts import VALID_LENSES, load_prompt, substitute  # noqa: E402


JUDGE_MODEL_BY_LENS: dict[str, str] = {
    "completeness": "gpt-5.4-mini",
    "restatement": "gpt-5.4",
    "implementation-risk": "claude-sonnet-4-6",
}

JUDGE_COMMAND_BY_LENS: dict[str, list[str]] = {
    "completeness": ["codex", "exec", "-m", "gpt-5.4-mini"],
    "restatement": ["codex", "exec", "-m", "gpt-5.4"],
    "implementation-risk": ["claude", "-p", "--model", "claude-sonnet-4-6", "--output-format", "text"],
}

JUDGE_LENS_ORDER = ["completeness", "restatement", "implementation-risk"]
JUDGE_BASE_REF = "origin/main"
JUDGE_TIMEOUT_SECONDS = 180
_LOGGER = logging.getLogger(__name__)


def _now_iso8601_utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _escape_frontmatter(value: object) -> str:
    return str(value).replace("\\", "\\\\").replace('"', '\\"')


def _default_stage_state() -> dict[str, object]:
    return {
        "adversarial_rounds": 0,
        "judge_rounds": 0,
        "judge_verdicts": [],
        "annotations": [],
        "unresolved_concerns": [],
        "adversarial_sha_history": [],
        "initial_sha": "",
    }


def _ensure_stage_state(state: dict, stage: str) -> dict:
    stages = state.setdefault("stages", {})
    stage_state = stages.get(stage)
    if not isinstance(stage_state, dict):
        stage_state = {}
    for key, default in _default_stage_state().items():
        if key not in stage_state:
            stage_state[key] = list(default) if isinstance(default, list) else default
    stages[stage] = stage_state
    try:
        schema_version = int(state.get("schema_version", 1))
    except (TypeError, ValueError):
        schema_version = 1
    if schema_version < 2:
        state["schema_version"] = 2
    return stage_state


def _stage_int(stage_state: dict, key: str) -> int:
    try:
        return int(stage_state.get(key, 0) or 0)
    except (TypeError, ValueError):
        return 0


def _record_migration_bypass_use(slug: str, stage: str) -> None:
    with with_locked_state(slug) as state:
        uses = state.get("migration_bypass_uses", [])
        if not isinstance(uses, list):
            uses = []
        uses = list(uses)
        uses.append(
            {
                "timestamp": _now_iso8601_utc(),
                "stage": stage,
                "operator_id": os.environ.get("USER", "unknown") or "unknown",
            }
        )
        state["migration_bypass_uses"] = uses


def _block_verdicts(verdicts: list[dict]) -> list[dict]:
    return [verdict for verdict in verdicts if isinstance(verdict, dict) and verdict.get("verdict") == "block"]


def _block_reasonings(verdicts: list[dict]) -> list[str]:
    reasonings: list[str] = []
    for verdict in _block_verdicts(verdicts):
        reasoning = str(verdict.get("reasoning", "")).strip()
        if reasoning:
            reasonings.append(reasoning)
    return reasonings


def _also_raised_in_round(current_reasoning: str, prior_rounds: list[list[dict]]) -> list[int]:
    also_raised: set[int] = set()
    current_reasoning = current_reasoning.strip()
    if not current_reasoning:
        return []
    for round_index, round_verdicts in enumerate(prior_rounds, start=1):
        if not isinstance(round_verdicts, list):
            continue
        for prior_verdict in round_verdicts:
            if not isinstance(prior_verdict, dict) or prior_verdict.get("verdict") != "block":
                continue
            prior_reasoning = str(prior_verdict.get("reasoning", "")).strip()
            if not prior_reasoning:
                continue
            similarity = factory_embeddings.cosine_similarity(current_reasoning, prior_reasoning)
            if similarity >= 0.85:
                also_raised.add(round_index)
                break
    return sorted(also_raised)


def _unresolved_concern_from_verdict(
    stage: str,
    verdict: dict,
    round_raised: int,
    prior_rounds: list[list[dict]],
) -> dict[str, object]:
    reasoning = str(verdict.get("reasoning", "")).strip()
    return {
        "stage": stage,
        "judge": verdict.get("judge", ""),
        "model": verdict.get("model", ""),
        "confidence": verdict.get("confidence"),
        "reasoning": reasoning,
        "round_raised": round_raised,
        "also_raised_in_round": _also_raised_in_round(reasoning, prior_rounds),
    }


def _stage_artifact_path(slug: str, stage: str) -> Path:
    return default_artifact_path(slug, stage)


def _artifact_paths(slug: str) -> dict[str, Path]:
    root = workflow_dir(slug)
    return {
        "spec": root / "spec.md",
        "plan": root / "plan.md",
        "tasks": root / "tasks.md",
    }


def _artifact_chain_text(slug: str) -> str:
    parts: list[str] = []
    for label, path in _artifact_paths(slug).items():
        parts.extend([f"--- {label.upper()} ---", path.read_text(encoding="utf-8") if path.exists() else ""])
    return "\n".join(parts)


def _review_files_for_stage(slug: str, stage: str) -> list[Path]:
    return sorted(reviews_dir(slug).glob(f"{stage}.*.review.md"))


def _safe_frontmatter(review_path: Path) -> dict[str, str]:
    try:
        data, _ = parse_review_frontmatter(review_path)
    except Exception:
        return {}
    return data


def _findings_block(review_body: str) -> str:
    if "## Findings" not in review_body:
        return ""
    tail = review_body.split("## Findings", 1)[1]
    if "\n## " in tail:
        tail = tail.split("\n## ", 1)[0]
    return tail.strip()


def _finding_id(review_path: Path, index: int, severity: str) -> str:
    return f"{review_path.stem}#{severity.lower()}-{index}"


def _finding_text_from_line(line: str) -> str:
    text = line.strip()
    text = re.sub(r"^[\-*\d.]+\s*", "", text)
    text = re.sub(r"^\|", "", text)
    text = re.sub(r"\|$", "", text)
    parts = [part.strip() for part in text.split("|") if part.strip()]
    if len(parts) >= 2 and parts[0].upper() in {"HIGH", "MEDIUM", "LOW"}:
        return parts[-1]
    match = re.search(r"\b(HIGH|MEDIUM|LOW)\b[:\-]?\s*(.*)$", text, re.I)
    if match:
        return match.group(2).strip() or text
    return text


def _findings_from_review(review_path: Path) -> list[dict[str, str]]:
    try:
        meta, body = parse_review_frontmatter(review_path)
    except Exception:
        return []
    block = _findings_block(body)
    if not block:
        return []
    findings: list[dict[str, str]] = []
    index = 0
    for raw in block.splitlines():
        line = raw.strip()
        if not line:
            continue
        severity_match = re.search(r"\b(HIGH|MEDIUM|LOW)\b", line, re.I)
        if not severity_match:
            continue
        severity = severity_match.group(1).upper()
        index += 1
        findings.append(
            {
                "severity": severity,
                "id": _finding_id(review_path, index, severity),
                "finding": _finding_text_from_line(line),
                "source": review_path.name,
                "resolution_note": str(meta.get("resolution_note", "")).strip(),
            }
        )
    return findings


def _summarize_review(review_path: Path) -> str:
    try:
        meta, _ = parse_review_frontmatter(review_path)
    except Exception:
        return f"- {review_path.name} [unreadable]"
    status = str(meta.get("resolution_status", "")).strip() or "unknown"
    note = str(meta.get("resolution_note", "")).strip()
    findings = _findings_from_review(review_path)
    lines = [f"- {review_path.name} [{status}]"]
    if note:
        lines.append(f"  - resolution: {note}")
    for finding in findings:
        lines.append(f"  - {finding['severity']} {finding['id']}: {finding['finding']}")
    if len(lines) == 1:
        lines.append("  - findings: none")
    return "\n".join(lines)


def _latest_artifact_sha(stage_state: dict) -> str:
    history = stage_state.get("adversarial_sha_history", [])
    if isinstance(history, list) and history:
        last = history[-1]
        if isinstance(last, str):
            return last
    initial_sha = stage_state.get("initial_sha", "")
    return str(initial_sha or "")


def _current_artifact_sha(stage: str, artifact_path: Path) -> str:
    if not artifact_path.exists():
        return ""
    return normalized_artifact_hash(stage, artifact_path)


def _git_merge_base_sha() -> str:
    result = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "merge-base", JUDGE_BASE_REF, "HEAD"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0 and result.stdout.strip():
        return result.stdout.strip()
    return _git_head_sha(REPO_ROOT) or ""


def _git_diff(slug: str, base_sha: str) -> str:
    if not base_sha:
        return ""
    paths = _artifact_paths(slug)
    cmd = [
        "git",
        "-C",
        str(REPO_ROOT),
        "diff",
        "--unified=3",
        base_sha,
        "HEAD",
        "--",
        str(paths["spec"]),
        str(paths["plan"]),
        str(paths["tasks"]),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    return result.stdout if result.returncode == 0 else result.stdout or result.stderr or ""


def _build_variables(
    slug: str,
    stage: str,
    lens: str,
    stage_state: dict,
    prompt_override_text: str | None,
    diff_text: str,
) -> tuple[str, str, dict[str, str], str]:
    artifact_paths = _artifact_paths(slug)
    current_artifact_path = _stage_artifact_path(slug, stage)
    current_sha = _current_artifact_sha(stage, current_artifact_path)
    review_files = _review_files_for_stage(slug, stage)
    review_meta = [(path, _safe_frontmatter(path)) for path in review_files]
    latest_sha = _latest_artifact_sha(stage_state)
    all_findings = []
    for path in review_files:
        all_findings.extend(_findings_from_review(path))

    if lens == "completeness":
        variables = {
            "high_findings_with_ids": "\n".join(
                f"- {finding['id']}: {finding['finding']} ({finding['source']})"
                for finding in all_findings
                if finding["severity"] == "HIGH"
            )
            or "- No HIGH findings found.",
            "spec": artifact_paths["spec"].read_text(encoding="utf-8") if artifact_paths["spec"].exists() else "",
            "plan": artifact_paths["plan"].read_text(encoding="utf-8") if artifact_paths["plan"].exists() else "",
            "tasks": artifact_paths["tasks"].read_text(encoding="utf-8") if artifact_paths["tasks"].exists() else "",
        }
    elif lens == "restatement":
        latest_findings = []
        prior_lines = []
        for path, meta in review_meta:
            findings = _findings_from_review(path)
            if str(meta.get("artifact_sha256", "")) == latest_sha:
                latest_findings.extend(findings)
            else:
                prior_lines.append(_summarize_review(path))
        variables = {
            "prior_findings_and_fixes": "\n".join(prior_lines) or "- No prior findings yet.",
            "latest_findings": "\n".join(
                f"- {finding['severity']} {finding['id']}: {finding['finding']} ({finding['source']})"
                for finding in latest_findings
            )
            or "- No latest findings found.",
        }
    elif lens == "implementation-risk":
        base_sha = ""
        history = stage_state.get("adversarial_sha_history", [])
        if isinstance(history, list) and len(history) >= 2 and isinstance(history[-2], str):
            base_sha = history[-2]
        else:
            base_sha = str(stage_state.get("initial_sha", "") or "")
        variables = {
            "spec": artifact_paths["spec"].read_text(encoding="utf-8") if artifact_paths["spec"].exists() else "",
            "plan": artifact_paths["plan"].read_text(encoding="utf-8") if artifact_paths["plan"].exists() else "",
            "tasks": artifact_paths["tasks"].read_text(encoding="utf-8") if artifact_paths["tasks"].exists() else "",
            "diff_since_last_round": diff_text or _git_diff(slug, base_sha),
        }
    else:
        raise ValueError(f"Unknown lens: {lens}")

    system_prompt, user_template = load_prompt(lens)
    if prompt_override_text is not None:
        user_template = prompt_override_text
    prompt = substitute(user_template, variables)
    return system_prompt, prompt, variables, current_sha


def _validate_verdict(verdict: dict) -> str | None:
    required = ["judge", "model", "verdict", "confidence", "reasoning", "evidence", "timestamp"]
    for key in required:
        if key not in verdict:
            return f"missing required field: {key}"
    if verdict["judge"] not in VALID_LENSES:
        return f"invalid judge: {verdict['judge']!r}"
    if not isinstance(verdict["model"], str) or not verdict["model"].strip():
        return "model must be a non-empty string"
    if verdict["verdict"] not in {"proceed", "proceed-with-annotation", "block"}:
        return f"invalid verdict: {verdict['verdict']!r}"
    if not isinstance(verdict["confidence"], int) or not 0 <= verdict["confidence"] <= 5:
        return "confidence must be an integer in the range 0..5"
    if not isinstance(verdict["reasoning"], str) or len(verdict["reasoning"].strip()) < 10:
        return "reasoning must be a string of at least 10 characters"
    if not isinstance(verdict["evidence"], list):
        return "evidence must be a list"
    for item in verdict["evidence"]:
        if not isinstance(item, dict):
            return "evidence items must be objects"
        for key in ("artifact", "section", "quote"):
            if key not in item or not isinstance(item[key], str):
                return f"evidence item missing string field: {key}"
    if not isinstance(verdict["timestamp"], str) or not verdict["timestamp"].strip():
        return "timestamp must be a non-empty string"
    # Tolerate harmless JSON-Schema metadata fields that judges sometimes
    # echo back when the prompt includes the full schema (Claude in particular
    # has been observed emitting `$schema` and `$id` alongside valid verdicts).
    # These have no semantic meaning for the vote, so stripping them silently
    # is correct and avoids false-block schema_violation fallbacks.
    IGNORABLE_METADATA_FIELDS = {"$schema", "$id", "$comment", "title", "description"}
    for meta_field in IGNORABLE_METADATA_FIELDS & set(verdict):
        verdict.pop(meta_field, None)
    extra = set(verdict) - set(required)
    if extra:
        return f"unexpected fields in verdict: {sorted(extra)}"
    return None


def _strip_markdown_json_fences(raw: str) -> str:
    """Strip a leading ```json / ``` code fence + trailing ``` if present.

    Claude and some Codex versions wrap JSON tool-use output in markdown
    code fences by default. The first production run (migration against
    orchestrator-split + finding-2-graphql-tightening) hit 2/6 schema_violation
    fallbacks purely because of fence wrapping; the actual JSON content was
    valid and substantive.
    """
    if not raw:
        return raw
    text = raw.strip()
    if text.startswith("```"):
        newline = text.find("\n")
        if newline != -1:
            text = text[newline + 1 :]
        else:
            text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def _attempt_model_call(
    slug: str,
    stage: str,
    round_number: int,
    lens: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    timeout_seconds: int,
) -> tuple[dict | None, str, str]:
    command = list(JUDGE_COMMAND_BY_LENS[lens])
    stub_dir = os.environ.get("JUDGE_STUB_DIR")
    if stub_dir:
        stub_candidates = [
            Path(stub_dir) / model,
            Path(stub_dir) / lens,
            Path(stub_dir) / f"judge.{model}",
            Path(stub_dir) / f"judge.{lens}",
        ]
        for stub_path in stub_candidates:
            if stub_path.exists():
                command = [str(stub_path)]
                break
    try:
        if command[0] == "codex":
            def _call() -> subprocess.CompletedProcess:
                try:
                    return subprocess.run(
                        command,
                        input=f"{system_prompt}\n\n{user_prompt}",
                        capture_output=True,
                        text=True,
                        check=False,
                        timeout=timeout_seconds,
                    )
                except subprocess.TimeoutExpired as exc:
                    return subprocess.CompletedProcess(
                        command,
                        124,
                        stdout=exc.stdout or "",
                        stderr=exc.stderr or "",
                    )
        else:
            def _call() -> subprocess.CompletedProcess:
                try:
                    return subprocess.run(
                        [*command, "--system-prompt", system_prompt, user_prompt],
                        capture_output=True,
                        text=True,
                        check=False,
                        timeout=timeout_seconds,
                    )
                except subprocess.TimeoutExpired as exc:
                    return subprocess.CompletedProcess(
                        [*command, "--system-prompt", system_prompt, user_prompt],
                        124,
                        stdout=exc.stdout or "",
                        stderr=exc.stderr or "",
                    )
        result = record_ai_call(slug, stage, round_number, "judge_panel", model, _call)
    except Exception as exc:
        return None, "", str(exc)

    stdout = result.stdout or ""
    stderr = result.stderr or ""
    if result.returncode != 0:
        return None, stdout, stderr or f"non-zero exit status {result.returncode}"
    cleaned = _strip_markdown_json_fences(stdout)
    try:
        verdict = json.loads(cleaned)
    except Exception as exc:
        return None, stdout, str(exc)
    if not isinstance(verdict, dict):
        return None, stdout, "response was not a JSON object"
    validation_error = _validate_verdict(verdict)
    if validation_error:
        return None, stdout, validation_error
    return verdict, stdout, ""


def _parse_with_retry(
    slug: str,
    stage: str,
    round_number: int,
    lens: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    timeout_seconds: int,
) -> tuple[dict, str]:
    schema_path = Path(__file__).resolve().parent / "judge_schema.json"
    schema_text = schema_path.read_text(encoding="utf-8")
    appendix = (
        "\n\nYour previous response did not match the required JSON schema.\n"
        "Please emit ONLY a single JSON object matching this schema:\n"
        f"{schema_text}\n"
        "Do not include any prose outside the JSON.\n"
    )

    verdict, stdout, error = _attempt_model_call(
        slug,
        stage,
        round_number,
        lens,
        model,
        system_prompt,
        user_prompt,
        timeout_seconds,
    )
    if verdict is not None:
        return verdict, stdout

    retry_prompt = user_prompt + appendix
    verdict, retry_stdout, retry_error = _attempt_model_call(
        slug,
        stage,
        round_number,
        lens,
        model,
        system_prompt,
        retry_prompt,
        timeout_seconds,
    )
    if verdict is not None:
        return verdict, retry_stdout

    fallback = {
        "judge": lens,
        "model": model,
        "verdict": "block",
        "confidence": 0,
        "reasoning": f"schema_violation: {retry_error or error}",
        "evidence": [],
        "timestamp": _now_iso8601_utc(),
    }
    return fallback, retry_stdout or stdout


def _frontmatter_text(metadata: dict[str, object]) -> str:
    lines = ["---"]
    for key, value in metadata.items():
        lines.append(f'{key}: "{_escape_frontmatter(value)}"')
    lines.append("---")
    return "\n".join(lines)


def _resolution_status(verdict: dict) -> str:
    return "accepted" if verdict["verdict"] in {"proceed", "proceed-with-annotation"} else "open"


def _resolution_note(verdict: dict) -> str:
    note = " ".join(str(verdict.get("reasoning", "")).split())
    return note if len(note) <= 240 else note[:237] + "..."


def _write_review_outputs(
    slug: str,
    stage: str,
    lens: str,
    verdict: dict,
    raw_output: str,
    current_sha: str,
    git_head_sha: str,
    git_base_sha: str,
) -> tuple[Path, Path, Path]:
    output_dir = reviews_dir(slug)
    output_dir.mkdir(parents=True, exist_ok=True)
    verdict_path = output_dir / f"judge.{lens}.verdict.json"
    raw_path = output_dir / f"judge.{lens}.raw.txt"
    review_path = output_dir / f"judge.{lens}.review.md"

    atomic_json_write(verdict_path, verdict)
    raw_path.write_text(raw_output, encoding="utf-8")

    evidence_lines = [
        f"- {item['artifact']} :: {item['section']} - {item['quote']}"
        for item in verdict.get("evidence", [])
    ] or ["- None."]

    body = "\n".join(
        [
            f"# Review: {stage} {lens}-judge",
            "",
            "## Findings",
            "",
            str(verdict.get("reasoning", "")).strip(),
            "",
            "## Residual Risks",
            "",
            "\n".join(evidence_lines),
            "",
            "## Verdict (structured)",
            "",
            "```json",
            json.dumps(verdict, indent=2, sort_keys=True),
            "```",
            "",
            "## Resolution",
            f"- status: {_resolution_status(verdict)}",
            f"- note: {_resolution_note(verdict)}",
        ]
    )

    frontmatter = _frontmatter_text(
        {
            "reviewer": verdict["model"],
            "lens": f"{lens}-judge",
            "stage": stage,
            "artifact_path": repo_relative_path(_stage_artifact_path(slug, stage), REPO_ROOT),
            "artifact_sha256": current_sha,
            "repo_root": ".",
            "git_head_sha": git_head_sha,
            "git_base_ref": JUDGE_BASE_REF,
            "git_base_sha": git_base_sha,
            "generation_method": "judge-panel",
            "resolution_status": _resolution_status(verdict),
            "resolution_note": _resolution_note(verdict),
            "raw_output_path": repo_relative_path(raw_path, REPO_ROOT),
            "narrowed_artifact_path": "",
            "narrowed_artifact_sha256": "",
            "coverage_status": "full",
            "coverage_note": "",
        }
    )
    review_path.write_text(frontmatter + "\n\n" + body + "\n", encoding="utf-8")
    return verdict_path, raw_path, review_path


def _dispatch_panel(
    slug: str,
    stage: str,
    prompt_override_text: str | None,
    override_reason: str | None,
    timeout_seconds: int = JUDGE_TIMEOUT_SECONDS,
) -> tuple[list[dict], str, str]:
    state = load_workflow_state(slug)
    stage_state = _ensure_stage_state(state, stage)
    current_artifact_path = _stage_artifact_path(slug, stage)
    current_sha = _current_artifact_sha(stage, current_artifact_path)
    git_head_sha = _git_head_sha(REPO_ROOT) or ""
    git_base_sha = _git_merge_base_sha()
    history = stage_state.get("adversarial_sha_history", [])
    if isinstance(history, list) and len(history) >= 2 and isinstance(history[-2], str):
        diff_base = history[-2]
    else:
        diff_base = str(stage_state.get("initial_sha", "") or "")
    diff_text = _git_diff(slug, diff_base)

    prepared_prompts: dict[str, tuple[str, str]] = {}
    judge_round = _stage_int(stage_state, "judge_rounds") + 1
    for lens in JUDGE_LENS_ORDER:
        system_prompt, user_prompt, _, _ = _build_variables(
            slug,
            stage,
            lens,
            stage_state,
            prompt_override_text,
            diff_text if lens == "implementation-risk" else "",
        )
        if override_reason:
            user_prompt = f"{user_prompt}\n\nPrompt override reason: {override_reason}"
        prepared_prompts[lens] = (system_prompt, user_prompt)

    verdicts: dict[str, dict] = {}
    raw_outputs: dict[str, str] = {}

    def _worker(lens: str) -> tuple[str, dict, str]:
        model = JUDGE_MODEL_BY_LENS[lens]
        system_prompt, user_prompt = prepared_prompts[lens]
        heartbeat_set_activity(f"judge {lens} running")
        verdict, raw_output = _parse_with_retry(
            slug,
            stage,
            judge_round,
            lens,
            model,
            system_prompt,
            user_prompt,
            timeout_seconds,
        )
        _write_review_outputs(
            slug,
            stage,
            lens,
            verdict,
            raw_output,
            current_sha,
            git_head_sha,
            git_base_sha,
        )
        return lens, verdict, raw_output

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(_worker, lens): lens for lens in JUDGE_LENS_ORDER}
        for future in concurrent.futures.as_completed(futures):
            lens, verdict, raw_output = future.result()
            verdicts[lens] = verdict
            raw_outputs[lens] = raw_output

    ordered_verdicts = [verdicts[lens] for lens in JUDGE_LENS_ORDER]
    combined_raw = "\n\n".join(raw_outputs.get(lens, "") for lens in JUDGE_LENS_ORDER)
    return ordered_verdicts, current_sha, combined_raw, git_head_sha


def _payload_for_state(
    stage: str,
    outcome: str,
    proceed_count: int,
    block_count: int,
    *,
    next_action: str,
    reason: str,
    blockers: list[str],
    judge_round: int,
) -> dict[str, object]:
    return {
        "next": next_action,
        "reason": reason,
        "blockers": blockers,
        "outcome": outcome,
        "proceed_count": proceed_count,
        "block_count": block_count,
        "timestamp": _now_iso8601_utc(),
        "judge_round": judge_round,
    }


def _build_exhausted_payload(slug: str, stage: str, state: dict, stage_state: dict) -> dict[str, object]:
    judge_round = _stage_int(stage_state, "judge_rounds")
    judge_history = stage_state.get("judge_verdicts", [])
    latest_round = judge_history[-1] if isinstance(judge_history, list) and judge_history else []
    latest_round_verdicts = latest_round if isinstance(latest_round, list) else []
    block_verdicts = _block_verdicts(latest_round_verdicts)
    proceed_count = sum(
        1
        for verdict in latest_round_verdicts
        if isinstance(verdict, dict) and verdict.get("verdict") in {"proceed", "proceed-with-annotation"}
    )
    block_count = len(block_verdicts)
    stages = {name: stage_manifest_state(slug, name) for name in CHECKPOINT_STAGES}
    next_action = recommended_next_action(slug, state, stages, True)
    reason = "judge panel exhausted; advancing with unresolved concerns" if block_count >= 2 else f"{stage} judge panel completed: advance"
    return _payload_for_state(
        stage,
        "advance",
        proceed_count,
        block_count,
        next_action=next_action,
        reason=reason,
        blockers=_block_reasonings(block_verdicts),
        judge_round=judge_round,
    )


def _fallback_block_verdict(lens: str) -> dict:
    return {
        "judge": lens,
        "model": JUDGE_MODEL_BY_LENS[lens],
        "verdict": "block",
        "confidence": 0,
        "reasoning": "schema_violation: artifact_mutated",
        "evidence": [],
        "timestamp": _now_iso8601_utc(),
    }


def _persist_state(
    slug: str,
    stage: str,
    verdicts: list[dict],
    current_sha: str,
    outcome: str,
    proceed_count: int,
    block_count: int,
) -> dict[str, object]:
    with with_locked_state(slug) as state:
        stage_state = _ensure_stage_state(state, stage)
        judge_round = _stage_int(stage_state, "judge_rounds") + 1
        stage_state["judge_rounds"] = judge_round
        state[f"{stage}_judge_rounds"] = judge_round

        judge_history = stage_state.get("judge_verdicts", [])
        if not isinstance(judge_history, list):
            judge_history = []
        prior_rounds = list(judge_history)
        judge_history = list(judge_history)
        judge_history.append(verdicts)
        stage_state["judge_verdicts"] = judge_history

        annotations = stage_state.get("annotations", [])
        if not isinstance(annotations, list):
            annotations = []
        annotations = list(annotations)
        for verdict in verdicts:
            if verdict.get("verdict") == "proceed-with-annotation":
                annotations.append(
                    {
                        "stage": stage,
                        "round": judge_round,
                        "judge": verdict["judge"],
                        "confidence": verdict["confidence"],
                        "reasoning": verdict["reasoning"],
                        "artifact_sha_at_time": current_sha,
                    }
                )
        stage_state["annotations"] = annotations
        block_verdicts = _block_verdicts(verdicts)
        blockers = _block_reasonings(block_verdicts)

        if block_count >= 2 and judge_round < 3:
            next_action = "edit_and_rerun_judge"
            reason = f"block majority; {block_count} of {len(verdicts)} judges blocked"
            outcome_value = "rejudge"
            stage_state["judge_next_action"] = next_action
        elif block_count >= 2 and judge_round >= 3:
            next_action = recommended_next_action(slug, state, {name: stage_manifest_state(slug, name) for name in CHECKPOINT_STAGES}, True)
            reason = "judge panel exhausted; advancing with unresolved concerns"
            outcome_value = "advance"
            stage_state["judge_next_action"] = "advance"
            unresolved = stage_state.get("unresolved_concerns", [])
            if not isinstance(unresolved, list):
                unresolved = []
            unresolved = list(unresolved)
            unresolved.extend(
                _unresolved_concern_from_verdict(stage, verdict, 3, prior_rounds)
                for verdict in block_verdicts
            )
            stage_state["unresolved_concerns"] = unresolved
            _LOGGER.warning("judge panel exhausted; advancing with unresolved concerns")
        else:
            next_action = recommended_next_action(slug, state, {name: stage_manifest_state(slug, name) for name in CHECKPOINT_STAGES}, True)
            reason = f"{stage} judge panel completed: advance"
            outcome_value = "advance"
            stage_state["judge_next_action"] = "advance"

        state["last_action_result"] = {
            **_payload_for_state(
                stage,
                outcome_value,
                proceed_count,
                block_count,
                next_action=next_action,
                reason=reason,
                blockers=blockers,
                judge_round=judge_round,
            ),
        }
    return load_workflow_state(slug).get("last_action_result", {})


def _validate_json_output(slug: str, stage: str, prompt_override: Path | None, override_reason: str | None) -> tuple[list[dict], str, str]:
    prompt_override_text = prompt_override.read_text(encoding="utf-8") if prompt_override else None
    verdicts: list[dict] = []
    current_sha = ""
    git_head_sha = ""
    for _attempt in range(3):
        verdicts, current_sha, raw_output, git_head_sha = _dispatch_panel(
            slug,
            stage,
            prompt_override_text,
            override_reason,
        )
        if _current_artifact_sha(stage, _stage_artifact_path(slug, stage)) == current_sha:
            return verdicts, current_sha, git_head_sha

    verdicts = [_fallback_block_verdict(lens) for lens in JUDGE_LENS_ORDER]
    git_head_sha = _git_head_sha(REPO_ROOT) or git_head_sha
    git_base_sha = _git_merge_base_sha()
    current_sha = _current_artifact_sha(stage, _stage_artifact_path(slug, stage))
    for lens, verdict in zip(JUDGE_LENS_ORDER, verdicts):
        _write_review_outputs(
            slug,
            stage,
            lens,
            verdict,
            json.dumps(verdict, indent=2, sort_keys=True),
            current_sha,
            git_head_sha,
            git_base_sha,
        )
    return verdicts, current_sha, git_head_sha


def run_judge(
    slug: str,
    stage: str,
    json_output: bool = False,
    prompt_override: Path | None = None,
    override_reason: str | None = None,
    migration_bypass: bool = False,
) -> int:
    if prompt_override is not None and not override_reason:
        print("judge --prompt-override requires --override-reason", file=sys.stderr)
        return 2

    state = load_workflow_state(slug)
    stage_state = _ensure_stage_state(state, stage)
    if migration_bypass:
        _record_migration_bypass_use(slug, stage)
    adversarial_rounds = _stage_int(stage_state, "adversarial_rounds")
    if adversarial_rounds < 3 and not migration_bypass:
        payload = {
            "next": "checkpoint",
            "reason": f"{stage} requires adversarial_rounds >= 3 before judge",
            "blockers": [f"{stage}.adversarial_rounds < 3"],
            "outcome": "refused",
        }
        with with_locked_state(slug) as locked_state:
            _ensure_stage_state(locked_state, stage)
            locked_state["last_action_result"] = payload
        if json_output:
            print(json.dumps(payload, indent=2))
        else:
            print("→ next: checkpoint")
        return 2

    if _stage_int(stage_state, "judge_rounds") >= 3:
        # Always recompute the exhausted payload when the judge cap is hit.
        # An earlier loop iteration may have stored last_action_result["next"]
        # as "judge_panel" (the call the orchestrator was told to run again
        # after the spec was edited). After the 3-round cap, the correct next
        # action is whatever the workflow recommends for the exhausted state
        # (usually the next stage's authoring), not another judge round.
        payload = _build_exhausted_payload(slug, stage, state, stage_state)
        with with_locked_state(slug) as locked_state:
            _ensure_stage_state(locked_state, stage)
            locked_state["last_action_result"] = payload
        if json_output:
            print(json.dumps(payload, indent=2))
        else:
            print(f"→ next: {payload['next']}")
        return 0

    with HeartbeatEmitter(slug, stage):
        heartbeat_set_activity("dispatching judges")
        verdicts, current_sha, git_head_sha = _validate_json_output(slug, stage, prompt_override, override_reason)
        heartbeat_set_activity("tallying verdicts")
        proceed_count = sum(1 for verdict in verdicts if verdict["verdict"] in {"proceed", "proceed-with-annotation"})
        block_count = sum(1 for verdict in verdicts if verdict["verdict"] == "block")
        outcome = "advance" if proceed_count >= 2 else "rejudge" if block_count >= 2 else "undecided"

        payload = _persist_state(slug, stage, verdicts, current_sha, outcome, proceed_count, block_count)
        heartbeat_set_activity("all reviews complete")
        if json_output:
            print(json.dumps(payload, indent=2))
        else:
            print(f"→ next: {payload['next']}")
        return 0
