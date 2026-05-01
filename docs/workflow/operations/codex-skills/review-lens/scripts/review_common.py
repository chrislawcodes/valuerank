#!/usr/bin/env python3
"""Shared helpers for review runner scripts."""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

FEATURE_FACTORY_SCRIPTS = Path(__file__).resolve().parents[2] / "feature-factory" / "scripts"
if str(FEATURE_FACTORY_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(FEATURE_FACTORY_SCRIPTS))

from factory_state import load_workflow_state  # noqa: E402
from workflow_utils import repo_relative_path  # noqa: E402

BASE_REF_CANDIDATES = ["origin/main", "origin/master", "main", "master"]
_CODEX_USAGE_URL = "https://chatgpt.com/codex/settings/usage"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def git(path: Path, *args: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(path), *args],
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except Exception:
        return None
    return result.stdout.strip()


def resolve_workspace_root(raw: str | None) -> Path:
    base = Path(raw).resolve() if raw else Path.cwd().resolve()
    if not base.exists() or not base.is_dir():
        raise ValueError(f"Workspace directory does not exist: {base}")
    return base


def allowed_roots(workspace_root: Path) -> list[Path]:
    return [workspace_root.resolve()]


def ensure_allowed_path(raw: str, field_name: str, roots: list[Path], must_exist: bool) -> Path:
    candidate = Path(raw).resolve()
    if must_exist and not candidate.exists():
        raise ValueError(f"{field_name} does not exist: {candidate}")
    for root in roots:
        try:
            candidate.relative_to(root)
            return candidate
        except ValueError:
            continue
    joined = ", ".join(str(root) for root in roots)
    raise ValueError(f"{field_name} must stay inside allowed roots: {joined}")


def resolve_repo_info(path: Path, requested_base_ref: str | None) -> dict[str, str]:
    repo_root = git(path.parent if path.is_file() else path, "rev-parse", "--show-toplevel")
    if not repo_root:
        return {
            "repo_root": "",
            "git_head_sha": "",
            "git_base_ref": "",
            "git_base_sha": "",
        }

    repo_path = Path(repo_root)
    head_sha = git(repo_path, "rev-parse", "HEAD") or ""

    candidates: list[str] = []
    if requested_base_ref:
        candidates.append(requested_base_ref)
    upstream = git(repo_path, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}")
    if upstream:
        candidates.append(upstream)
    candidates.extend(BASE_REF_CANDIDATES)

    git_base_ref = ""
    git_base_sha = ""
    for candidate in candidates:
        base_sha = git(repo_path, "merge-base", candidate, "HEAD")
        if base_sha:
            git_base_ref = candidate
            git_base_sha = base_sha
            break

    return {
        "repo_root": str(repo_path),
        "git_head_sha": head_sha,
        "git_base_ref": git_base_ref,
        "git_base_sha": git_base_sha,
    }


def workflow_slug_from_path(path: Path) -> str | None:
    resolved = path.resolve()
    parts = resolved.parts
    if "feature-runs" not in parts:
        return None
    index = parts.index("feature-runs")
    if index + 1 >= len(parts):
        return None
    return parts[index + 1]


def workflow_slug_from_paths(*paths: Path) -> str | None:
    for path in paths:
        slug = workflow_slug_from_path(path)
        if slug:
            return slug
    return None


def workflow_round_from_paths(stage: str, *paths: Path) -> int:
    slug = workflow_slug_from_paths(*paths)
    if not slug:
        return 0
    state = load_workflow_state(slug)
    stages = state.get("stages", {})
    if not isinstance(stages, dict):
        return 0
    stage_state = stages.get(stage, {})
    if not isinstance(stage_state, dict):
        return 0
    try:
        return int(stage_state.get("adversarial_rounds", 0) or 0)
    except (TypeError, ValueError):
        return 0


def format_stats(stats: dict) -> str:
    models = stats.get("models", {})
    lines = []
    total_input = 0
    total_output = 0
    total_tokens = 0

    for model_name, model_stats in models.items():
        tokens = model_stats.get("tokens", {})
        input_tokens = tokens.get("input", 0)
        output_tokens = tokens.get("candidates", 0)
        total = tokens.get("total", 0)
        total_input += input_tokens
        total_output += output_tokens
        total_tokens += total
        lines.append(f"- `{model_name}`: input={input_tokens}, output={output_tokens}, total={total}")

    summary = [
        f"- total_input={total_input}",
        f"- total_output={total_output}",
        f"- total_tokens={total_tokens}",
    ]
    return "\n".join(summary + lines)


def frontmatter(metadata: dict[str, str]) -> str:
    lines = ["---"]
    for key, value in metadata.items():
        safe = value.replace('"', '\\"')
        lines.append(f'{key}: "{safe}"')
    lines.append("---")
    return "\n".join(lines)


def write_report(output_path: Path, metadata: dict[str, str], body: str) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(frontmatter(metadata) + "\n\n" + body, encoding="utf-8")


def text_or_empty(value: str | bytes | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


SECTION_PATTERN = re.compile(
    r"## Findings\s*(?P<findings>.*?)\s*## Residual Risks\s*(?P<residual>.*)\Z",
    re.DOTALL,
)


def ensure_sections(response: str) -> tuple[str, str]:
    cleaned = response.strip()
    match = SECTION_PATTERN.search(cleaned)
    if not match:
        raise ValueError("review output did not include both required sections")
    findings = match.group("findings").strip() or "No findings returned."
    residual = match.group("residual").strip() or "- No residual risks reported."
    return findings, residual


_QUOTA_PHRASE_PATTERNS = (
    "you've hit your usage limit",
    "usage_limit_exhausted",
    "quota exceeded",
    "monthly quota",
)
_CODEX_CONTEXT_MARKERS = ("openai.com", "chatgpt.com", "codex", "usage")
_CODEX_USAGE_URL = "https://chatgpt.com/codex/settings/usage"


def is_codex_quota_exhaustion(stderr: str, stdout: str) -> bool:
    """Detect Codex quota or usage-limit exhaustion in subprocess output."""
    blob = f"{stderr}\n{stdout}".lower()
    for phrase in _QUOTA_PHRASE_PATTERNS:
        if phrase in blob:
            return True
    if ("402" in blob or "429" in blob) and any(marker in blob for marker in _CODEX_CONTEXT_MARKERS):
        return True
    return False


def write_quota_deferred(
    output_path: Path,
    metadata: dict[str, str],
    stdout_path: Path | None = None,
    stderr_path: Path | None = None,
) -> None:
    metadata = dict(metadata)
    metadata["resolution_status"] = "deferred"
    note = f"Codex quota exhausted — re-run after quota refresh. See {_CODEX_USAGE_URL}"
    metadata["resolution_note"] = note
    body_lines = [
        f"# Review: {metadata['stage']} {metadata['lens']}",
        "",
        "## Findings",
        "",
        "Codex quota exhausted before this review completed. The checkpoint is deferred (not failed) so the workflow can advance; re-run the checkpoint after quota refresh.",
        "",
        "## Residual Risks",
        "",
        "- Review coverage is reduced for this round; re-run to backfill.",
        "",
        "## Quota Evidence",
    ]
    if stdout_path:
        body_lines.append(f"- stdout: `{stdout_path}`")
    if stderr_path:
        body_lines.append(f"- stderr: `{stderr_path}`")
    body_lines.extend(
        [
            "",
            "## Resolution",
            "- status: deferred",
            f"- note: {note}",
        ]
    )
    write_report(output_path, metadata, "\n".join(body_lines))


def write_failure(
    output_path: Path,
    metadata: dict[str, str],
    message: str,
    stdout_path: Path | None = None,
    stderr_path: Path | None = None,
) -> None:
    metadata = dict(metadata)
    metadata["resolution_status"] = "failed"
    body_lines = [
        f"# Review: {metadata['stage']} {metadata['lens']}",
        "",
        "## Findings",
        "",
        message,
        "",
        "## Residual Risks",
        "",
        "- Review did not complete successfully, so this checkpoint is not satisfied.",
        "",
        "## Failure Evidence",
    ]
    if stdout_path:
        body_lines.append(f"- stdout: `{stdout_path}`")
    if stderr_path:
        body_lines.append(f"- stderr: `{stderr_path}`")
    body_lines.extend(
        [
            "",
            "## Resolution",
            "- status: failed",
            "- note: review runner failure",
        ]
    )
    write_report(output_path, metadata, "\n".join(body_lines))


def number_lines(text: str) -> str:
    return "\n".join(f"{idx + 1:05d}: {line}" for idx, line in enumerate(text.splitlines()))


_NEW_FILE_HEADER_RE = re.compile(r"^new file mode \d+", re.MULTILINE)
_DIFF_PLUS_PLUS_RE = re.compile(r"^\+\+\+ b/(.+)$", re.MULTILINE)


def _extract_new_file_path(chunk: str) -> str | None:
    if not _NEW_FILE_HEADER_RE.search(chunk):
        return None
    m = _DIFF_PLUS_PLUS_RE.search(chunk)
    if not m:
        return None
    return m.group(1)


def expand_new_files_in_diff(diff_text: str, repo_root: Path, max_total_chars: int) -> str:
    parts = diff_text.split("\ndiff --git ")
    if not parts:
        return diff_text

    output_parts: list[str] = []
    for idx, chunk in enumerate(parts):
        if idx > 0:
            chunk = "diff --git " + chunk

        new_file_rel = _extract_new_file_path(chunk)
        if new_file_rel is None:
            output_parts.append(chunk)
            continue

        disk_path = repo_root / new_file_rel
        if not disk_path.exists():
            output_parts.append(chunk)
            continue

        try:
            file_content = disk_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            output_parts.append(chunk)
            continue

        replacement = f"## New file: {new_file_rel}\n\n{file_content}"
        output_parts.append(replacement)

    result = "\n".join(output_parts)
    if len(result) > max_total_chars:
        result = result[:max_total_chars]
    return result


def narrow_text(stage: str, text: str, max_chars: int) -> tuple[str, dict]:
    if len(text) <= max_chars:
        return text, {"strategy": "none"}

    if stage == "diff":
        parts = text.split("\ndiff --git ")
        chunks = [part if idx == 0 else "diff --git " + part for idx, part in enumerate(parts)]

        def chunk_label(idx: int, chunk: str) -> str:
            return chunk.splitlines()[0] if chunk.splitlines() else f"chunk-{idx}"

        head_budget = max_chars // 2
        tail_budget = max_chars - head_budget

        head = ""
        head_labels: list[str] = []
        for idx, chunk in enumerate(chunks):
            if len(head) + len(chunk) > head_budget and head:
                break
            next_chunk = chunk if not head else "\n" + chunk
            if len(next_chunk) > head_budget and not head:
                head = next_chunk[:head_budget]
                head_labels.append(chunk_label(idx, chunk))
                break
            head += next_chunk
            head_labels.append(chunk_label(idx, chunk))

        tail = ""
        tail_labels: list[str] = []
        for idx in range(len(chunks) - 1, -1, -1):
            chunk = chunks[idx]
            if chunk_label(idx, chunk) in head_labels:
                break
            next_chunk = chunk if not tail else chunk + "\n" + tail
            if len(next_chunk) > tail_budget and not tail:
                tail = chunk[-tail_budget:]
                tail_labels.append(chunk_label(idx, chunk))
                break
            if len(next_chunk) > tail_budget and tail:
                break
            tail = next_chunk
            tail_labels.append(chunk_label(idx, chunk))

        sections = [head.rstrip()]
        if tail and tail.strip() != head.strip():
            sections.extend(["", "... [narrowed diff slice: middle omitted] ...", "", tail.lstrip()])
        narrowed = "\n".join(section for section in sections if section is not None)
        return narrowed[:max_chars], {
            "strategy": "diff-head-tail-chunks",
            "head_chunks": head_labels,
            "tail_chunks": list(reversed(tail_labels)),
        }

    lines = text.splitlines()
    numbered = number_lines(text)
    if len(numbered) <= max_chars:
        return numbered, {"strategy": "numbered-lines"}

    head_budget = max_chars // 2
    tail_budget = max_chars - head_budget
    head = numbered[:head_budget].rstrip()
    tail = numbered[-tail_budget:].lstrip()
    narrowed = "\n".join(
        [
            head,
            "",
            "... [narrowed review slice: middle omitted] ...",
            "",
            tail,
        ]
    )
    return narrowed[:max_chars], {"strategy": "head-tail-numbered-lines"}


def write_narrowed_artifact(
    output_path: Path,
    source_path: Path,
    source_hash: str,
    stage: str,
    text: str,
    max_chars: int,
    repo_root: Path,
) -> tuple[Path, str]:
    narrowed_text, meta = narrow_text(stage, text, max_chars)
    narrowed_path = output_path.with_suffix(output_path.suffix + ".narrowed.txt")
    narrowed_meta_path = output_path.with_suffix(output_path.suffix + ".narrowed.json")
    narrowed_path.write_text(narrowed_text, encoding="utf-8")
    narrowed_meta = {
        "source_artifact_path": repo_relative_path(source_path, repo_root),
        "source_artifact_sha256": source_hash,
        "narrowed_artifact_path": repo_relative_path(narrowed_path, repo_root),
        "narrowed_artifact_sha256": sha256_text(narrowed_text),
        **meta,
    }
    narrowed_meta_path.write_text(json.dumps(narrowed_meta, indent=2), encoding="utf-8")
    return narrowed_path, narrowed_meta["narrowed_artifact_sha256"]


def prompt_for(stage: str, lens: str, artifact_label: str, artifact_text: str, extra_context: list[tuple[str, str]]) -> str:
    def safe_label(value: str) -> str:
        return value.replace("`", "'").replace("\r", " ").replace("\n", " ")

    has_context = len(extra_context) > 0
    context_instruction = (
        "Code context files are provided above. Before asserting any finding, check whether it is confirmed or refuted by the provided code. Each finding must include an evidence tag:\n"
        "  [CODE-CONFIRMED] — the code directly supports this finding\n"
        "  [CODE-REFUTED] — the code contradicts this finding (do not include as a finding)\n"
        "  [UNVERIFIED] — relevant code was not provided; treat as lower confidence\n"
        "Only assign HIGH severity to CODE-CONFIRMED findings."
        if has_context else
        "No code context files were provided. Flag any finding that depends on an assumption about the existing codebase as [UNVERIFIED] and limit it to MEDIUM severity or lower."
    )

    parts = [
        f"Review this {stage} artifact using a {lens} lens.",
        "Stay scoped to that lens.",
        "Approach the artifact adversarially: look for hidden flaws, omitted cases, and weak assumptions before giving credit.",
        context_instruction,
        "The full review artifact text is included below in this prompt.",
        "Return markdown using exactly these sections:",
        "## Findings",
        "## Residual Risks",
        "Keep the response concrete and ordered by severity.",
        "",
    ]

    for label, text in extra_context:
        parts.append(f"Context: {safe_label(label)}")
        parts.append(text)
        parts.append("")

    parts.append(f"Artifact: {safe_label(artifact_label)}")
    parts.append(artifact_text)
    return "\n".join(parts)
