#!/usr/bin/env python3
"""command_dispatch_codex implementation.

Artifacts are written before workflow state is updated. That order is
intentional: an orphan dispatch directory is harmless and easy to clean up,
but a state record that points at missing stdout/stderr artifacts would leave
later checks with a false picture of what actually ran.
"""
import argparse
import hashlib
import os
import shutil
import signal
import subprocess
import sys
from datetime import datetime
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import factory_deliver  # noqa: E402
import factory_state  # noqa: E402
from factory_mutating import mutates_state  # noqa: E402

_REVIEW_LENS_DIR = factory_state.REPO_ROOT / "docs/workflow/operations/codex-skills/review-lens/scripts"
if str(_REVIEW_LENS_DIR) not in sys.path:
    sys.path.insert(0, str(_REVIEW_LENS_DIR))

from run_gemini_review import is_codex_quota_exhaustion  # noqa: E402


_PROMPT_BYTES_LIMIT = 100_000
_CODEX_TIMEOUT_SECONDS = 600
_CODEX_USAGE_URL = "https://chatgpt.com/codex/settings/usage"
_DEFAULT_MODEL = "gpt-5.4-mini"


def _text_from_timeout_output(value: str | bytes | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def _write_artifacts(dispatch_dir: Path, stdout: str, stderr: str) -> tuple[Path, Path]:
    stdout_path = dispatch_dir / "stdout.txt"
    stderr_path = dispatch_dir / "stderr.txt"
    stdout_path.write_text(stdout, encoding="utf-8")
    stderr_path.write_text(stderr, encoding="utf-8")
    return stdout_path, stderr_path


def _allocate_dispatch_dir(slug: str, base_id: str) -> Path:
    dispatch_root = factory_state.REPO_ROOT / "docs/workflow/feature-runs" / slug / "codex-dispatches"
    candidate = base_id
    for retry in range(1000):
        dir_path = dispatch_root / candidate
        try:
            dir_path.mkdir(parents=True, exist_ok=False)
            return dir_path
        except FileExistsError:
            if retry == 999:
                break
            candidate = f"{base_id}_{retry:03d}"
    raise RuntimeError(f"could not allocate unique dispatch directory for {base_id}")


def _kill_process_group(proc: subprocess.Popen[str], sig: signal.Signals) -> None:
    try:
        pgid = os.getpgid(proc.pid)
    except ProcessLookupError:
        return
    try:
        os.killpg(pgid, sig)
    except ProcessLookupError:
        return


@mutates_state("dispatch-codex")
def command_dispatch_codex(args: argparse.Namespace) -> int:
    codex_path = shutil.which("codex")
    if codex_path is None:
        print(
            "codex CLI not found on PATH; install or activate before dispatching",
            file=sys.stderr,
        )
        raise SystemExit(2)

    prompt_text = Path(args.prompt_path).read_text(encoding="utf-8")
    prompt_bytes = prompt_text.encode("utf-8")
    if len(prompt_bytes) > _PROMPT_BYTES_LIMIT:
        print(
            f"prompt at {args.prompt_path} is {len(prompt_bytes)} bytes, exceeds "
            f"{_PROMPT_BYTES_LIMIT}-byte hard limit; split into multiple dispatches "
            "or use a follow-up feature to add stdin-based prompts",
            file=sys.stderr,
        )
        raise SystemExit(2)
    prompt_sha256 = hashlib.sha256(prompt_bytes).hexdigest()

    base_id = datetime.utcnow().strftime("%Y%m%dT%H%M%S_%fZ")
    dispatch_dir = _allocate_dispatch_dir(args.slug, base_id)
    dispatch_id = dispatch_dir.name

    proc = subprocess.Popen(
        [codex_path, "exec", "-m", args.model, "-s", "workspace-write", prompt_text],
        cwd=factory_state.REPO_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )

    try:
        stdout, stderr = proc.communicate(timeout=_CODEX_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired as exc:
        stdout = _text_from_timeout_output(exc.stdout)
        stderr = _text_from_timeout_output(exc.stderr)
        _write_artifacts(dispatch_dir, stdout, stderr)
        _kill_process_group(proc, signal.SIGTERM)
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            _kill_process_group(proc, signal.SIGKILL)
        print(
            f"codex exec exceeded {_CODEX_TIMEOUT_SECONDS}s timeout — process group killed",
            file=sys.stderr,
        )
        raise SystemExit(5)

    stdout_path, stderr_path = _write_artifacts(dispatch_dir, stdout, stderr)

    if is_codex_quota_exhaustion(stderr, stdout):
        print(
            f"Codex quota exhausted — see {_CODEX_USAGE_URL}",
            file=sys.stderr,
        )
        raise SystemExit(4)

    try:
        head_result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=factory_state.REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=10,
        )
        head_sha = head_result.stdout.strip() if head_result.returncode == 0 else None
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired,
            FileNotFoundError, OSError):
        head_sha = None

    branch_base = factory_deliver._resolve_branch_base()
    if branch_base is not None:
        lines_added = factory_deliver._added_code_lines(branch_base)
    else:
        lines_added = None

    record = {
        "head_sha": head_sha,
        "ts": dispatch_id,
        "prompt_path": str(args.prompt_path),
        "prompt_sha256": prompt_sha256,
        "model": args.model,
        "exit_code": proc.returncode,
        "stdout_path": str(stdout_path.relative_to(factory_state.REPO_ROOT)),
        "stderr_path": str(stderr_path.relative_to(factory_state.REPO_ROOT)),
        "branch_base_sha": branch_base,
        "lines_added_at_dispatch_time": lines_added,
    }

    def mutate(state: dict) -> None:
        state.setdefault("codex_dispatches", []).append(record)

    factory_state.update_state(args.slug, mutate)
    print(f"[workflow] ✓ dispatch-codex ({dispatch_id}) → exit {proc.returncode}")
    return 0 if proc.returncode == 0 else 1
