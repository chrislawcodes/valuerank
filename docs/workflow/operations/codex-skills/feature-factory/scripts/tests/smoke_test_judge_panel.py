#!/usr/bin/env python3
"""End-to-end smoke test for the judge panel CLI."""
from __future__ import annotations

import json
import importlib.util
import os
import subprocess
import sys
import tempfile
import time
import shutil
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPT_DIR.parents[5]
RUN_FACTORY = SCRIPT_DIR / "run_factory.py"

STATE_SPEC = importlib.util.spec_from_file_location("factory_state", SCRIPT_DIR / "factory_state.py")
assert STATE_SPEC and STATE_SPEC.loader
FACTORY_STATE = importlib.util.module_from_spec(STATE_SPEC)
sys.modules[STATE_SPEC.name] = FACTORY_STATE
STATE_SPEC.loader.exec_module(FACTORY_STATE)


def _slug() -> str:
    return f"smoke-test-{os.getpid()}-{int(time.time())}"


def _write_stub(stub_dir: Path, model: str, verdict: dict[str, object]) -> None:
    path = stub_dir / model
    if model.startswith("gpt-"):
        token_line = '{"totalTokens": {"prompt": 41, "candidates": 17}}'
    else:
        token_line = '"input_tokens": 33, "output_tokens": 19'
    verdict_source = repr(json.dumps(verdict))
    body = f"""#!/usr/bin/env python3
import json
import sys

print({token_line!r}, file=sys.stderr)
sys.stdout.write({verdict_source})
"""
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


def _write_review(slug: str, path: Path, artifact_sha: str, findings: list[str]) -> None:
    body = "\n".join(
        [
            "# Review: plan adversarial",
            "",
            "## Findings",
            "",
            *findings,
            "",
            "## Residual Risks",
            "",
            "- none",
            "",
        ]
    )
    metadata = {
        "reviewer": "codex",
        "lens": "adversarial",
        "stage": "plan",
        "artifact_path": f"docs/workflow/feature-runs/{slug}/plan.md",
        "artifact_sha256": artifact_sha,
        "repo_root": ".",
        "git_head_sha": "head",
        "git_base_ref": "origin/main",
        "git_base_sha": "base",
        "generation_method": "smoke-test",
        "resolution_status": "open",
        "resolution_note": "",
        "raw_output_path": "",
        "narrowed_artifact_path": "",
        "narrowed_artifact_sha256": "",
        "coverage_status": "full",
        "coverage_note": "",
    }
    frontmatter = "\n".join(["---", *[f'{k}: "{v}"' for k, v in metadata.items()], "---", ""])
    path.write_text(frontmatter + "\n" + body, encoding="utf-8")


def main() -> int:
    slug = _slug()
    workflow_root = FACTORY_STATE.workflow_dir(slug)
    reviews_root = FACTORY_STATE.reviews_dir(slug)
    stub_dir = Path(tempfile.mkdtemp(prefix="judge-stubs-"))
    try:
        workflow_root.mkdir(parents=True, exist_ok=True)
        reviews_root.mkdir(parents=True, exist_ok=True)
        (workflow_root / "spec.md").write_text("# Spec\n\nSmoke test spec.\n", encoding="utf-8")
        (workflow_root / "plan.md").write_text("# Plan\n\nSmoke test plan.\n", encoding="utf-8")
        (workflow_root / "tasks.md").write_text("# Tasks\n\nSmoke test tasks.\n", encoding="utf-8")
        artifact_sha = "smoke-plan-sha"
        _write_review(slug, reviews_root / "plan.codex.feasibility-adversarial.review.md", artifact_sha, ["- HIGH: completeness gap."])
        _write_review(slug, reviews_root / "plan.codex.edge-cases-adversarial.review.md", artifact_sha, ["- HIGH: edge case gap."])
        _write_review(slug, reviews_root / "plan.gemini.testability-adversarial.review.md", artifact_sha, ["- HIGH: implementation risk gap."])

        state = FACTORY_STATE._default_workflow_state()
        state["schema_version"] = 2
        state["stages"] = {
            "plan": {
                "adversarial_rounds": 3,
                "judge_rounds": 0,
                "judge_verdicts": [],
                "annotations": [],
                "unresolved_concerns": [],
                "adversarial_sha_history": [artifact_sha],
                "initial_sha": artifact_sha,
            }
        }
        FACTORY_STATE.atomic_json_write(FACTORY_STATE.factory_state_path(slug), state)

        completeness = {
            "judge": "completeness",
            "model": "gpt-5.4-mini",
            "verdict": "proceed",
            "confidence": 4,
            "reasoning": "completeness looks good",
            "evidence": [{"artifact": "plan.md", "section": "Findings", "quote": "complete"}],
            "timestamp": "2026-04-19T12:00:00Z",
        }
        restatement = {
            "judge": "restatement",
            "model": "gpt-5.4",
            "verdict": "proceed-with-annotation",
            "confidence": 4,
            "reasoning": "restatement looks good",
            "evidence": [{"artifact": "plan.md", "section": "Findings", "quote": "restated"}],
            "timestamp": "2026-04-19T12:00:00Z",
        }
        implementation = {
            "judge": "implementation-risk",
            "model": "claude-sonnet-4-6",
            "verdict": "block",
            "confidence": 4,
            "reasoning": "implementation risk remains",
            "evidence": [{"artifact": "plan.md", "section": "Findings", "quote": "risk"}],
            "timestamp": "2026-04-19T12:00:00Z",
        }
        _write_stub(stub_dir, "gpt-5.4-mini", completeness)
        _write_stub(stub_dir, "gpt-5.4", restatement)
        _write_stub(stub_dir, "claude-sonnet-4-6", implementation)

        env = os.environ.copy()
        env["JUDGE_STUB_DIR"] = str(stub_dir)
        cmd = [
            sys.executable,
            str(RUN_FACTORY),
            "judge",
            "--slug",
            slug,
            "--stage",
            "plan",
            "--json",
        ]
        result = subprocess.run(cmd, cwd=REPO_ROOT, env=env, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise SystemExit(result.stdout + result.stderr)

        payload = json.loads(result.stdout.strip())
        if payload.get("proceed_count") != 2 or payload.get("block_count") != 1:
            raise SystemExit(f"unexpected tally: {payload}")

        reviews = sorted(reviews_root.glob("judge.*.review.md"))
        verdicts = sorted(reviews_root.glob("judge.*.verdict.json"))
        if len(reviews) != 3 or len(verdicts) != 3:
            raise SystemExit(f"expected 3 judge review artifacts, saw {len(reviews)} reviews and {len(verdicts)} verdicts")

        persisted = json.loads(FACTORY_STATE.factory_state_path(slug).read_text(encoding="utf-8"))
        plan_state = persisted["stages"]["plan"]
        if plan_state["judge_rounds"] != 1:
            raise SystemExit(f"unexpected judge_rounds: {plan_state['judge_rounds']}")
        if len(plan_state["judge_verdicts"]) != 1:
            raise SystemExit(f"unexpected judge_verdicts length: {len(plan_state['judge_verdicts'])}")
        if persisted["last_action_result"]["proceed_count"] != 2 or persisted["last_action_result"]["block_count"] != 1:
            raise SystemExit(f"unexpected last_action_result: {persisted['last_action_result']}")

        return 0
    finally:
        if workflow_root.exists():
            shutil.rmtree(workflow_root, ignore_errors=True)
        if stub_dir.exists():
            shutil.rmtree(stub_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
