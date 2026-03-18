#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[5]
REVIEW_SCRIPTS = REPO_ROOT / "docs" / "operations" / "codex-skills" / "review-lens" / "scripts"
if str(REVIEW_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(REVIEW_SCRIPTS))

from workflow_utils import repo_relative_path, resolve_stored_path

SYNC_SCRIPT = REPO_ROOT / "scripts" / "sync-codex-skills.py"
WRITE_DIFF = REVIEW_SCRIPTS / "write_canonical_diff.py"
REPAIR = REVIEW_SCRIPTS / "repair_review_checkpoint.py"
UPDATE_REVIEW = REVIEW_SCRIPTS / "update_review_resolution.py"
APPEND_RECONCILIATION = REVIEW_SCRIPTS / "append_reconciliation_entry.py"
VERIFY_RECONCILIATION = REVIEW_SCRIPTS / "verify_reconciliation.py"
VERIFY_CHECKPOINT = REVIEW_SCRIPTS / "verify_review_checkpoint.py"
WORKFLOWS_ROOT = REPO_ROOT / "docs" / "workflows"
WORKFLOW_STATE = "workflow.json"
HARD_DIFF_ARTIFACT_MAX_CHARS = 150000
DEFAULT_GEMINI_MODEL = "gemini-2.5-pro"
CHECKPOINT_STAGES = ["spec", "plan", "tasks", "diff", "closeout"]
VERIFY_ON_CLOSEOUT_STAGES = ["spec", "plan", "tasks", "diff"]


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, text=True)


def _git_head_sha(repo: Path) -> str | None:
    """Return the current HEAD SHA for repo, or None if unavailable."""
    try:
        result = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.stdout.strip()
    except Exception:
        return None


def atomic_json_write(path: Path, data: dict) -> None:
    """Write JSON atomically via a temp file in the same directory, then os.replace()."""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, indent=2)
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=".tmp.", suffix=".json")
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        tmp_path.replace(path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def validated_slug(slug: str) -> str:
    candidate = Path(slug)
    if not slug or candidate.is_absolute() or len(candidate.parts) != 1:
        raise SystemExit(f"Invalid workflow slug: {slug!r}")
    part = candidate.parts[0]
    if part in {".", ".."}:
        raise SystemExit(f"Invalid workflow slug: {slug!r}")
    resolved = (WORKFLOWS_ROOT / part).resolve()
    try:
        resolved.relative_to(WORKFLOWS_ROOT.resolve())
    except ValueError as exc:
        raise SystemExit(f"Invalid workflow slug: {slug!r}") from exc
    return part


def normalized_repo_path(raw: str, field_name: str) -> str:
    stripped = raw.strip()
    if not stripped or stripped.strip("/") == "":
        raise SystemExit(f"Invalid {field_name}: {raw!r}")
    candidate = Path(stripped)
    resolved = candidate.resolve() if candidate.is_absolute() else (REPO_ROOT / candidate).resolve()
    try:
        relative = resolved.relative_to(REPO_ROOT.resolve())
    except ValueError as exc:
        raise SystemExit(f"Invalid {field_name}: {raw!r}") from exc
    return str(relative)


def workflow_dir(slug: str) -> Path:
    return WORKFLOWS_ROOT / validated_slug(slug)


def reviews_dir(slug: str) -> Path:
    return workflow_dir(slug) / "reviews"


def scope_manifest_path(slug: str) -> Path:
    return workflow_dir(slug) / "scope.json"


def workflow_state_path(slug: str) -> Path:
    return workflow_dir(slug) / WORKFLOW_STATE


def checkpoint_manifest_path(slug: str, stage: str) -> Path:
    return reviews_dir(slug) / f"{stage}.checkpoint.json"


def default_artifact_path(slug: str, stage: str) -> Path:
    if stage == "diff":
        return reviews_dir(slug) / "implementation.diff.patch"
    return workflow_dir(slug) / f"{stage}.md"


def ensure_sync() -> None:
    run([sys.executable, str(SYNC_SCRIPT), "--sync-if-needed"])


def ensure_file(path: Path, heading: str) -> None:
    if not path.exists():
        path.write_text(f"# {heading}\n", encoding="utf-8")


def load_scope_manifest(slug: str) -> dict:
    path = scope_manifest_path(slug)
    if not path.exists():
        return {"paths": [], "allowed_dirty_paths": []}
    return json.loads(path.read_text(encoding="utf-8"))


def load_workflow_state(slug: str) -> dict:
    path = workflow_state_path(slug)
    if not path.exists():
        return {
            "review_policy": {
                "sensitive": False,
                "large_structural": False,
                "performance_sensitive": False,
                "extra_gemini_lenses": [],
            }
        }
    return json.loads(path.read_text(encoding="utf-8"))


def save_workflow_state(slug: str, state: dict) -> Path:
    path = workflow_state_path(slug)
    atomic_json_write(path, state)
    return path


def save_scope_manifest(slug: str, paths: list[str]) -> Path:
    safe_slug = validated_slug(slug)
    normalized_paths = {normalized_repo_path(path, "scope path").rstrip("/") for path in paths if path.strip()}
    manifest = {
        "paths": sorted(normalized_paths),
        "allowed_dirty_paths": sorted(
            {
                *normalized_paths,
                f"docs/workflows/{safe_slug}",
            }
        ),
    }
    path = scope_manifest_path(slug)
    atomic_json_write(path, manifest)
    return path


def pick_secondary_lens(primary: str, default: str, candidates: list[str]) -> str:
    ordered = [*candidates, default]
    seen: set[str] = set()
    for lens in ordered:
        if not lens or lens in seen:
            continue
        seen.add(lens)
        if lens != primary:
            return lens
    return default if default != primary else f"{primary}-secondary"


def required_reviews(
    stage: str,
    sensitive: bool,
    large_structural: bool,
    performance_sensitive: bool,
    extra_gemini: list[str],
) -> list[dict[str, str]]:
    primary_gemini = ""
    secondary_default = ""
    codex_lens = ""
    extra_candidates = list(extra_gemini)

    if stage == "spec":
        primary_gemini = "requirements-adversarial"
        secondary_default = "edge-cases-adversarial"
        codex_lens = "feasibility-adversarial"
        if sensitive:
            extra_candidates.insert(0, "risk-adversarial")
    elif stage == "plan":
        primary_gemini = "architecture-adversarial"
        secondary_default = "testability-adversarial"
        codex_lens = "implementation-adversarial"
        if sensitive:
            extra_candidates.insert(0, "risk-adversarial")
    elif stage == "tasks":
        primary_gemini = "dependency-order-adversarial"
        secondary_default = "coverage-adversarial"
        codex_lens = "execution-adversarial"
        if sensitive:
            extra_candidates.insert(0, "risk-adversarial")
    elif stage == "diff":
        primary_gemini = "regression-adversarial"
        secondary_default = "quality-adversarial"
        codex_lens = "correctness-adversarial"
        if sensitive:
            extra_candidates.insert(0, "security-adversarial")
        if performance_sensitive:
            extra_candidates.insert(0, "performance-adversarial")
        if large_structural:
            extra_candidates.append("quality-adversarial")
    elif stage == "closeout":
        primary_gemini = "completeness-adversarial"
        secondary_default = "residual-risk-adversarial"
        codex_lens = "fidelity-adversarial"
        if sensitive:
            extra_candidates.insert(0, "rollout-risk-adversarial")
    else:
        raise ValueError(f"Unsupported stage: {stage}")

    secondary_gemini = pick_secondary_lens(primary_gemini, secondary_default, extra_candidates)
    return [
        {
            "reviewer": "gemini",
            "lens": primary_gemini,
            "model": DEFAULT_GEMINI_MODEL,
        },
        {
            "reviewer": "gemini",
            "lens": secondary_gemini,
            "model": DEFAULT_GEMINI_MODEL,
        },
        {
            "reviewer": "codex",
            "lens": codex_lens,
        },
    ]


def resolved_review_policy(slug: str, args: argparse.Namespace) -> dict:
    state = load_workflow_state(slug)
    policy = state.setdefault(
        "review_policy",
        {
            "sensitive": False,
            "large_structural": False,
            "performance_sensitive": False,
            "extra_gemini_lenses": [],
        },
    )
    if args.sensitive:
        policy["sensitive"] = True
    if args.large_structural:
        policy["large_structural"] = True
    if args.performance_sensitive:
        policy["performance_sensitive"] = True
    if args.extra_gemini_lens:
        policy["extra_gemini_lenses"] = list(args.extra_gemini_lens)
    save_workflow_state(slug, state)
    return policy


def checkpoint_manifest(
    slug: str,
    stage: str,
    artifact_path: Path,
    base_ref: str | None,
    extra_context: list[str],
    reviews: list[dict[str, str]],
    max_artifact_chars: int | None,
    max_context_chars: int | None,
    max_total_chars: int | None,
) -> dict:
    manifest_reviews = []
    for spec in reviews:
        output = reviews_dir(slug) / f"{stage}.{spec['reviewer']}.{spec['lens']}.review.md"
        manifest_reviews.append(
            {
                "reviewer": spec["reviewer"],
                "lens": spec["lens"],
                "stage": stage,
                "path": repo_relative_path(output, REPO_ROOT),
                "context_paths": [repo_relative_path(resolve_stored_path(path, REPO_ROOT), REPO_ROOT) for path in extra_context],
                **({"model": spec["model"]} if spec.get("model") else {}),
            }
        )
    return {
        "feature_slug": slug,
        "stage": stage,
        "artifact_path": repo_relative_path(artifact_path, REPO_ROOT),
        "git_base_ref": base_ref or "",
        "required_reviews": manifest_reviews,
        "max_artifact_chars": max_artifact_chars,
        "max_context_chars": max_context_chars,
        "max_total_chars": max_total_chars,
    }


def gather_all_review_paths(slug: str) -> list[Path]:
    paths: list[Path] = []
    for manifest in sorted(reviews_dir(slug).glob("*.checkpoint.json")):
        payload = json.loads(manifest.read_text(encoding="utf-8"))
        for review in payload.get("required_reviews", []):
            paths.append(resolve_stored_path(review["path"], REPO_ROOT))
    unique: list[Path] = []
    seen: set[Path] = set()
    for path in paths:
        if path in seen:
            continue
        seen.add(path)
        unique.append(path)
    return unique


def command_init(args: argparse.Namespace) -> int:
    if not args.path:
        raise SystemExit(
            "init requires at least one --path argument to define the feature scope. "
            "Example: --path cloud/apps/web/src/components/my-feature"
        )
    ensure_sync()
    root = workflow_dir(args.slug)
    reviews = reviews_dir(args.slug)
    reviews.mkdir(parents=True, exist_ok=True)
    ensure_file(root / "spec.md", "Spec")
    ensure_file(root / "plan.md", "Plan")
    ensure_file(root / "tasks.md", "Tasks")
    save_scope_manifest(args.slug, args.path)
    existing_state = load_workflow_state(args.slug)
    existing_state.setdefault(
        "review_policy",
        {
            "sensitive": False,
            "large_structural": False,
            "performance_sensitive": False,
            "extra_gemini_lenses": [],
        },
    )
    save_workflow_state(args.slug, existing_state)
    print(str(root))
    return 0


def command_checkpoint(args: argparse.Namespace) -> int:
    ensure_sync()
    root = workflow_dir(args.slug)
    reviews = reviews_dir(args.slug)
    root.mkdir(parents=True, exist_ok=True)
    reviews.mkdir(parents=True, exist_ok=True)
    policy = resolved_review_policy(args.slug, args)
    context_paths = [normalized_repo_path(path, "context path") for path in args.context]

    scope_manifest = scope_manifest_path(args.slug)
    if args.stage == "diff" and args.path:
        scope_manifest = save_scope_manifest(args.slug, args.path)

    artifact_path = Path(args.artifact).resolve() if args.artifact else default_artifact_path(args.slug, args.stage)
    if args.stage == "diff" and not args.use_existing_artifact:
        if not scope_manifest.exists():
            raise SystemExit("Diff checkpoint requires a saved scope manifest or explicit --path values")
        run(
            [
                sys.executable,
                str(WRITE_DIFF),
                "--repo",
                str(REPO_ROOT),
                "--output",
                str(artifact_path),
                "--path-manifest",
                str(scope_manifest),
                *([] if not args.base_ref else ["--base-ref", args.base_ref]),
            ]
        )
        diff_meta_path = artifact_path.with_suffix(artifact_path.suffix + ".json")
        if diff_meta_path.exists():
            diff_meta = json.loads(diff_meta_path.read_text(encoding="utf-8"))
            args.base_ref = diff_meta.get("git_base_ref") or args.base_ref
    elif not artifact_path.exists():
        raise SystemExit(f"Artifact does not exist: {artifact_path}")

    if args.stage == "diff":
        diff_meta_path = artifact_path.with_suffix(artifact_path.suffix + ".json")
        if diff_meta_path.exists():
            diff_meta = json.loads(diff_meta_path.read_text(encoding="utf-8"))
            args.base_ref = diff_meta.get("git_base_ref") or args.base_ref
            if args.use_existing_artifact:
                recorded_head = diff_meta.get("git_head_sha", "")
                if recorded_head:
                    current_head = _git_head_sha(REPO_ROOT)
                    if current_head and current_head != recorded_head:
                        raise SystemExit(
                            f"Existing diff artifact is stale: recorded HEAD {recorded_head[:12]} "
                            f"does not match current HEAD {current_head[:12]}. "
                            "Drop --use-existing-artifact to regenerate the diff, "
                            "or pass --base-ref if you intentionally want to review an older slice."
                        )

    if args.stage == "diff" and artifact_path.exists():
        diff_text = artifact_path.read_text(encoding="utf-8")
        if len(diff_text) > HARD_DIFF_ARTIFACT_MAX_CHARS:
            raise SystemExit(
                f"Diff artifact exceeds hard cap ({len(diff_text)} > {HARD_DIFF_ARTIFACT_MAX_CHARS}). "
                "Split the review scope into smaller workflow paths or use a smaller diff artifact."
            )

    manifest = checkpoint_manifest(
        args.slug,
        args.stage,
        artifact_path,
        args.base_ref,
        context_paths,
        required_reviews(
            args.stage,
            policy["sensitive"],
            policy["large_structural"],
            policy["performance_sensitive"],
            policy["extra_gemini_lenses"],
        ),
        args.max_artifact_chars,
        args.max_context_chars,
        args.max_total_chars,
    )
    manifest_path = checkpoint_manifest_path(args.slug, args.stage)
    atomic_json_write(manifest_path, manifest)

    cmd = [
        sys.executable,
        str(REPAIR),
        "--checkpoint-manifest",
        str(manifest_path),
        "--workspace-dir",
        str(REPO_ROOT),
        "--gemini-timeout-seconds",
        str(args.gemini_timeout_seconds),
        "--gemini-retries",
        str(args.gemini_retries),
    ]
    try:
        result = subprocess.run(
            cmd,
            text=True,
            timeout=args.repair_timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        print(
            f"checkpoint blocked: repair exceeded {args.repair_timeout_seconds}s for "
            f"{args.stage} on {args.slug}",
            file=sys.stderr,
        )
        return 1
    return result.returncode


def command_reconcile(args: argparse.Namespace) -> int:
    ensure_sync()
    plan_path = workflow_dir(args.slug) / "plan.md"
    review_args = []
    for review in args.review:
        review_args.extend(["--review", str(Path(review).resolve())])

    run([sys.executable, str(UPDATE_REVIEW), *review_args, "--status", args.status, "--note", args.note])
    run([sys.executable, str(APPEND_RECONCILIATION), "--plan", str(plan_path), *review_args, "--status", args.status, "--note", args.note])
    run([sys.executable, str(VERIFY_RECONCILIATION), "--plan", str(plan_path), *review_args])
    return 0


def command_closeout(args: argparse.Namespace) -> int:
    ensure_sync()
    root = workflow_dir(args.slug)
    reviews = gather_all_review_paths(args.slug)
    plan_path = root / "plan.md"

    missing_stages = []
    for stage in VERIFY_ON_CLOSEOUT_STAGES:
        manifest_path = checkpoint_manifest_path(args.slug, stage)
        if not manifest_path.exists():
            missing_stages.append(stage)
    if missing_stages:
        raise SystemExit(
            "Closeout requires completed checkpoint manifests for: "
            + ", ".join(missing_stages)
        )

    for stage in VERIFY_ON_CLOSEOUT_STAGES:
        manifest_path = checkpoint_manifest_path(args.slug, stage)
        run([sys.executable, str(VERIFY_CHECKPOINT), "--checkpoint-manifest", str(manifest_path)])

    if reviews:
        cmd = [
            sys.executable,
            str(VERIFY_RECONCILIATION),
            "--plan",
            str(plan_path),
            "--require-terminal",
        ]
        for review in reviews:
            cmd.extend(["--review", str(review)])
        run(cmd)

    summary_path = root / "closeout.md"
    closeout_manifest_path = checkpoint_manifest_path(args.slug, "closeout")
    lines = [
        f"# Closeout: {args.slug}",
        "",
        "## Outputs",
        f"- spec: `{root / 'spec.md'}`",
        f"- plan: `{plan_path}`",
        f"- tasks: `{root / 'tasks.md'}`",
        "",
        "## Reviews",
    ]
    for review in reviews:
        lines.append(f"- `{review}`")
    lines.extend(
        [
            "",
            "## Next Action",
            "- Share the closeout summary with the user and call out any deferred or open risks.",
        ]
    )
    backup_text = summary_path.read_text(encoding="utf-8") if summary_path.exists() else None
    backup_manifest = closeout_manifest_path.read_text(encoding="utf-8") if closeout_manifest_path.exists() else None
    summary_text = "\n".join(lines) + "\n"
    summary_path.write_text(summary_text, encoding="utf-8")

    closeout_args = argparse.Namespace(
        slug=args.slug,
        stage="closeout",
        artifact=str(summary_path),
        base_ref=None,
        context=[],
        path=[],
        extra_gemini_lens=[],
        sensitive=False,
        large_structural=False,
        performance_sensitive=False,
        use_existing_artifact=True,
        max_artifact_chars=None,
        max_context_chars=None,
        max_total_chars=None,
        gemini_timeout_seconds=120,
        gemini_retries=1,
        repair_timeout_seconds=300,
    )
    checkpoint_result = command_checkpoint(closeout_args)
    if checkpoint_result != 0:
        if backup_text is None:
            summary_path.unlink(missing_ok=True)
        else:
            summary_path.write_text(backup_text, encoding="utf-8")
        if backup_manifest is None:
            closeout_manifest_path.unlink(missing_ok=True)
        else:
            closeout_manifest_path.write_text(backup_manifest, encoding="utf-8")
        return checkpoint_result

    print(str(summary_path))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init")
    init_parser.add_argument("--slug", required=True)
    init_parser.add_argument("--path", action="append", default=[])
    init_parser.set_defaults(func=command_init)

    checkpoint_parser = subparsers.add_parser("checkpoint")
    checkpoint_parser.add_argument("--slug", required=True)
    checkpoint_parser.add_argument("--stage", required=True, choices=CHECKPOINT_STAGES)
    checkpoint_parser.add_argument("--artifact")
    checkpoint_parser.add_argument("--base-ref")
    checkpoint_parser.add_argument("--context", action="append", default=[])
    checkpoint_parser.add_argument("--path", action="append", default=[])
    checkpoint_parser.add_argument("--extra-gemini-lens", action="append", default=[])
    checkpoint_parser.add_argument("--sensitive", action="store_true")
    checkpoint_parser.add_argument("--large-structural", action="store_true")
    checkpoint_parser.add_argument("--performance-sensitive", action="store_true")
    checkpoint_parser.add_argument("--use-existing-artifact", action="store_true")
    checkpoint_parser.add_argument("--max-artifact-chars", type=int)
    checkpoint_parser.add_argument("--max-context-chars", type=int)
    checkpoint_parser.add_argument("--max-total-chars", type=int)
    checkpoint_parser.add_argument("--gemini-timeout-seconds", type=int, default=120)
    checkpoint_parser.add_argument("--gemini-retries", type=int, default=1)
    checkpoint_parser.add_argument("--repair-timeout-seconds", type=int, default=300)
    checkpoint_parser.set_defaults(func=command_checkpoint)

    reconcile_parser = subparsers.add_parser("reconcile")
    reconcile_parser.add_argument("--slug", required=True)
    reconcile_parser.add_argument("--review", action="append", required=True)
    reconcile_parser.add_argument("--status", required=True)
    reconcile_parser.add_argument("--note", required=True)
    reconcile_parser.set_defaults(func=command_reconcile)

    closeout_parser = subparsers.add_parser("closeout")
    closeout_parser.add_argument("--slug", required=True)
    closeout_parser.set_defaults(func=command_closeout)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
