#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from workflow_utils import normalized_artifact_text, repo_relative_path


BASE_REF_CANDIDATES = ["origin/main", "origin/master", "main", "master"]
GEMINI_LOCK_DIR = ".codex-workflow"
GEMINI_LOCK_NAME = "gemini-review.lock"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


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


def pid_is_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def acquire_gemini_lock(workspace_root: Path, timeout_seconds: int) -> tuple[Path, int]:
    lock_dir = workspace_root / GEMINI_LOCK_DIR
    lock_dir.mkdir(parents=True, exist_ok=True)
    lock_path = lock_dir / GEMINI_LOCK_NAME
    deadline = time.time() + max(timeout_seconds, 30)
    payload = {
        "pid": os.getpid(),
        "started_at": int(time.time()),
        "workspace_root": str(workspace_root),
    }
    while True:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2)
            return lock_path, os.getpid()
        except FileExistsError:
            stale = False
            try:
                existing = json.loads(lock_path.read_text(encoding="utf-8"))
                existing_pid = int(existing.get("pid", 0))
                started_at = int(existing.get("started_at", 0))
                stale = not pid_is_alive(existing_pid) or (started_at and time.time() - started_at > timeout_seconds + 120)
            except Exception:
                stale = True
            if stale:
                lock_path.unlink(missing_ok=True)
                continue
            if time.time() >= deadline:
                raise TimeoutError(f"Timed out waiting for Gemini review lock: {lock_path}")
            time.sleep(1)


def release_gemini_lock(lock_path: Path, owner_pid: int) -> None:
    try:
        existing = json.loads(lock_path.read_text(encoding="utf-8"))
        if int(existing.get("pid", -1)) == owner_pid:
            lock_path.unlink(missing_ok=True)
    except Exception:
        lock_path.unlink(missing_ok=True)


def resolve_workspace_root(raw: str | None) -> Path:
    base = Path(raw).resolve() if raw else Path.cwd().resolve()
    if not base.exists() or not base.is_dir():
        raise ValueError(f"Workspace directory does not exist: {base}")
    return base


def allowed_roots(workspace_root: Path) -> list[Path]:
    return [
        workspace_root.resolve(),
        (Path.home() / ".gemini" / "tmp" / workspace_root.name).resolve(),
    ]


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


def extract_json(stdout: str) -> dict:
    decoder = json.JSONDecoder()
    best: dict | None = None
    for idx, ch in enumerate(stdout):
        if ch != "{":
            continue
        try:
            payload, _ = decoder.raw_decode(stdout[idx:])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict) and "response" in payload:
            best = payload
    if best is None:
        raise ValueError("Gemini output did not contain a valid JSON response payload")
    return best


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
        raise ValueError("Gemini response did not include both required sections")
    findings = match.group("findings").strip() or "No findings returned."
    residual = match.group("residual").strip() or "- No residual risks reported."
    return findings, residual


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

    parts = [
        f"Review this {stage} artifact using a {lens} lens.",
        "Stay scoped to that lens.",
        "Approach the artifact adversarially: look for hidden flaws, omitted cases, and weak assumptions before giving credit.",
        "The full review artifact text is included below in this prompt.",
        "Do not ask to open files or fetch more file contents unless the prompt explicitly says something is missing.",
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--lens", required=True)
    parser.add_argument("--stage", required=True, choices=["spec", "plan", "tasks", "diff", "closeout"])
    parser.add_argument("--output", required=True)
    parser.add_argument("--artifact-label")
    parser.add_argument("--context", action="append", default=[])
    parser.add_argument("--model", default=os.environ.get("GEMINI_REVIEW_MODEL") or "gemini-2.5-pro")
    parser.add_argument("--workspace-dir")
    parser.add_argument("--git-base-ref", default=os.environ.get("REVIEW_BASE_REF"))
    parser.add_argument("--timeout-seconds", type=int, default=90)
    parser.add_argument("--max-artifact-chars", type=int, default=50000)
    parser.add_argument("--max-context-chars", type=int, default=10000)
    parser.add_argument("--max-total-chars", type=int, default=70000)
    parser.add_argument("--retries", type=int, default=1)
    args = parser.parse_args()

    try:
        workspace_root = resolve_workspace_root(args.workspace_dir)
        roots = allowed_roots(workspace_root)
        artifact_path = ensure_allowed_path(args.artifact, "artifact", roots, must_exist=True)
        output_path = ensure_allowed_path(args.output, "output", roots, must_exist=False)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    output_path.parent.mkdir(parents=True, exist_ok=True)

    source_artifact_text = normalized_artifact_text(args.stage, artifact_path)
    source_artifact_hash = sha256_text(source_artifact_text)
    artifact_label = args.artifact_label or artifact_path.name
    repo_info = resolve_repo_info(artifact_path, args.git_base_ref)
    repo_root = Path(repo_info["repo_root"]).resolve() if repo_info["repo_root"] else artifact_path.parents[0]

    metadata = {
        "reviewer": "gemini",
        "lens": args.lens,
        "stage": args.stage,
        "artifact_path": repo_relative_path(artifact_path, repo_root),
        "artifact_sha256": source_artifact_hash,
        "repo_root": ".",
        "git_head_sha": repo_info["git_head_sha"],
        "git_base_ref": repo_info["git_base_ref"],
        "git_base_sha": repo_info["git_base_sha"],
        "generation_method": "gemini-cli",
        "resolution_status": "open",
        "resolution_note": "",
        "raw_output_path": "",
        "narrowed_artifact_path": "",
        "narrowed_artifact_sha256": "",
        "coverage_status": "full",
        "coverage_note": "",
    }

    artifact_text = source_artifact_text
    if len(artifact_text) > args.max_artifact_chars:
        narrowed_path, narrowed_hash = write_narrowed_artifact(
            output_path,
            artifact_path,
            source_artifact_hash,
            args.stage,
            artifact_text,
            args.max_artifact_chars,
            repo_root,
        )
        metadata["narrowed_artifact_path"] = repo_relative_path(narrowed_path, repo_root)
        metadata["narrowed_artifact_sha256"] = narrowed_hash
        metadata["coverage_status"] = "partial"
        metadata["coverage_note"] = "artifact exceeded max_artifact_chars and was narrowed"
        artifact_text = read_text(narrowed_path)
        artifact_label = narrowed_path.name

    extra_context: list[tuple[str, str]] = []
    total_context_chars = 0
    for idx, raw in enumerate(args.context):
        try:
            ctx_path = ensure_allowed_path(raw, "context", roots, must_exist=True)
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc
        text = read_text(ctx_path)
        if len(text) > args.max_context_chars:
            narrowed_path, _ = write_narrowed_artifact(
                output_path.with_name(output_path.stem + f".context{idx}"),
                ctx_path,
                sha256_text(text),
                args.stage,
                text,
                args.max_context_chars,
                repo_root,
            )
            text = read_text(narrowed_path)
            metadata["coverage_status"] = "partial"
            metadata["coverage_note"] = "context exceeded max_context_chars and was narrowed"
        total_context_chars += len(text)
        extra_context.append((ctx_path.name, text))

    if len(artifact_text) + total_context_chars > args.max_total_chars:
        write_failure(
            output_path,
            metadata,
            f"Combined prompt content still exceeds max_total_chars ({len(artifact_text) + total_context_chars} > {args.max_total_chars}) after narrowing.",
        )
        return 2

    prompt = prompt_for(args.stage, args.lens, artifact_label, artifact_text, extra_context)

    cmd = ["gemini", "-p", prompt, "--output-format", "json", "--sandbox"]
    if args.model:
        cmd.extend(["-m", args.model])

    run_cwd = workspace_root
    stdout_path = output_path.with_suffix(output_path.suffix + ".stdout.txt")
    stderr_path = output_path.with_suffix(output_path.suffix + ".stderr.txt")
    raw_path = output_path.with_suffix(output_path.suffix + ".json")

    last_failure: tuple[str, str] | None = None
    result = None
    lock_path = None
    owner_pid = None
    try:
        lock_path, owner_pid = acquire_gemini_lock(workspace_root, args.timeout_seconds)
        for _ in range(args.retries + 1):
            try:
                if run_cwd is None:
                    with tempfile.TemporaryDirectory() as tmpdir:
                        result = subprocess.run(
                            cmd,
                            check=True,
                            capture_output=True,
                            text=True,
                            cwd=tmpdir,
                            timeout=args.timeout_seconds,
                        )
                else:
                    result = subprocess.run(
                        cmd,
                        check=True,
                        capture_output=True,
                        text=True,
                        cwd=run_cwd,
                        timeout=args.timeout_seconds,
                    )
                break
            except subprocess.TimeoutExpired as exc:
                last_failure = (exc.stdout or "", exc.stderr or "")
                continue
            except subprocess.CalledProcessError as exc:
                last_failure = (exc.stdout or "", exc.stderr or "")
                continue
    except TimeoutError as exc:
        write_failure(
            output_path,
            metadata,
            str(exc),
        )
        return 3
    finally:
        if lock_path and owner_pid is not None:
            release_gemini_lock(lock_path, owner_pid)

    if result is None:
        stdout_path.write_text(text_or_empty(last_failure[0]) if last_failure else "", encoding="utf-8")
        stderr_path.write_text(text_or_empty(last_failure[1]) if last_failure else "", encoding="utf-8")
        write_failure(
            output_path,
            metadata,
            f"Gemini review failed after {args.retries + 1} attempt(s).",
            stdout_path,
            stderr_path,
        )
        return 3

    stdout_path.write_text(result.stdout, encoding="utf-8")
    stderr_path.write_text(result.stderr, encoding="utf-8")

    try:
        payload = extract_json(result.stdout)
    except Exception as exc:
        write_failure(
            output_path,
            metadata,
            f"Gemini output could not be parsed as JSON: {exc}",
            stdout_path,
            stderr_path,
        )
        return 4

    response = payload.get("response", "").strip()
    try:
        findings, residual = ensure_sections(response)
    except Exception as exc:
        write_failure(
            output_path,
            metadata,
            f"Gemini output did not match the required review format: {exc}",
            stdout_path,
            stderr_path,
        )
        return 5
    stats = payload.get("stats", {})
    raw_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    metadata["raw_output_path"] = repo_relative_path(raw_path, repo_root)

    body = "\n".join(
        [
            f"# Review: {args.stage} {args.lens}",
            "",
            "## Findings",
            "",
            findings or "No findings returned.",
            "",
            "## Residual Risks",
            "",
            residual,
            "",
            "## Token Stats",
            "",
            format_stats(stats),
            "",
            "## Resolution",
            "- status: open",
            "- note:",
        ]
    )
    write_report(output_path, metadata, body)
    print(str(output_path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
