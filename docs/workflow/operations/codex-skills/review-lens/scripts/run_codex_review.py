#!/usr/bin/env python3
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

from run_gemini_review import (
    allowed_roots,
    ensure_allowed_path,
    ensure_sections,
    format_stats,
    normalized_artifact_text,
    prompt_for,
    read_text,
    repo_relative_path,
    resolve_repo_info,
    resolve_workspace_root,
    sha256_text,
    text_or_empty,
    write_failure,
    write_narrowed_artifact,
    write_report,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--lens", required=True)
    parser.add_argument("--stage", required=True, choices=["spec", "plan", "tasks", "diff", "closeout"])
    parser.add_argument("--output", required=True)
    parser.add_argument("--artifact-label")
    parser.add_argument("--context", action="append", default=[])
    parser.add_argument("--model", default="gpt-5.4-mini")
    parser.add_argument("--workspace-dir")
    parser.add_argument("--git-base-ref")
    parser.add_argument("--timeout-seconds", type=int, default=180)
    parser.add_argument("--max-artifact-chars", type=int, default=50000)
    parser.add_argument("--max-context-chars", type=int, default=10000)
    parser.add_argument("--max-total-chars", type=int, default=70000)
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
        "reviewer": "codex",
        "lens": args.lens,
        "stage": args.stage,
        "artifact_path": repo_relative_path(artifact_path, repo_root),
        "artifact_sha256": source_artifact_hash,
        "repo_root": ".",
        "git_head_sha": repo_info["git_head_sha"],
        "git_base_ref": repo_info["git_base_ref"],
        "git_base_sha": repo_info["git_base_sha"],
        "generation_method": "codex-runner",
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

    prompt = "\n".join(
        [
            prompt_for(args.stage, args.lens, artifact_label, artifact_text, extra_context),
            "",
            "Return only markdown with exactly these sections:",
            "## Findings",
            "## Residual Risks",
            "Do not include any other sections.",
        ]
    )

    raw_path = output_path.with_suffix(output_path.suffix + ".raw.txt")
    stdout_path = output_path.with_suffix(output_path.suffix + ".stdout.txt")
    stderr_path = output_path.with_suffix(output_path.suffix + ".stderr.txt")

    with tempfile.NamedTemporaryFile(mode="w+", encoding="utf-8", suffix=".md", delete=False) as tmp:
        last_message_path = Path(tmp.name)

    cmd = [
        "codex",
        "exec",
        "-C",
        str(workspace_root),
        "--skip-git-repo-check",
        "--output-last-message",
        str(last_message_path),
        "--model",
        args.model,
        prompt,
    ]
    try:
        result = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=args.timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        stdout_path.write_text(text_or_empty(exc.stdout), encoding="utf-8")
        stderr_path.write_text(text_or_empty(exc.stderr), encoding="utf-8")
        last_message_path.unlink(missing_ok=True)
        write_failure(
            output_path,
            metadata,
            "Codex review timed out.",
            stdout_path,
            stderr_path,
        )
        return 3
    except subprocess.CalledProcessError as exc:
        stdout_path.write_text(text_or_empty(exc.stdout), encoding="utf-8")
        stderr_path.write_text(text_or_empty(exc.stderr), encoding="utf-8")
        last_message_path.unlink(missing_ok=True)
        write_failure(
            output_path,
            metadata,
            "Codex review failed.",
            stdout_path,
            stderr_path,
        )
        return 4

    stdout_path.write_text(result.stdout, encoding="utf-8")
    stderr_path.write_text(result.stderr, encoding="utf-8")

    try:
        response = last_message_path.read_text(encoding="utf-8").strip()
        findings, residual = ensure_sections(response)
    except Exception as exc:
        last_message_path.unlink(missing_ok=True)
        write_failure(
            output_path,
            metadata,
            f"Codex output did not match the required review format: {exc}",
            stdout_path,
            stderr_path,
        )
        return 5

    raw_path.write_text(response, encoding="utf-8")
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
            "## Runner Stats",
            format_stats({}),
            "",
            "## Resolution",
            "- status: open",
            "- note: ",
        ]
    )
    write_report(output_path, metadata, body)
    last_message_path.unlink(missing_ok=True)
    print(str(output_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
