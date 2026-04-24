"""Slice 4 — end-to-end smoke test for `checkpoint --validation-only`.

Drives the CLI via subprocess so argparse + command_checkpoint + the inner
helper are all exercised. Catches argparse-level regressions that unit
tests on the helper would miss.
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[6]
RUN_FACTORY = SCRIPTS_DIR / "run_factory.py"


_REVIEW_TEMPLATE = """---
reviewer: "codex"
lens: "{lens}"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/{slug}/spec.md"
artifact_sha256: "oldsha1234567890"
repo_root: "."
git_head_sha: "deadbeef"
git_base_ref: "origin/main"
git_base_sha: "1234"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "ok"
raw_output_path: ""
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec {lens}

## Findings

placeholder.

## Residual Risks

placeholder.

## Resolution
- status: accepted
- note: ok
"""


class ValidationOnlySmokeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.mkdtemp()
        self.runs_root = Path(self.tmpdir) / "feature-runs"
        self.slug = "smoke"
        workflow_dir = self.runs_root / self.slug
        reviews_dir = workflow_dir / "reviews"
        reviews_dir.mkdir(parents=True, exist_ok=True)

        # Artifact with predictable content.
        self.artifact = workflow_dir / "spec.md"
        self.artifact.write_text("# Spec\n\nbody\n", encoding="utf-8")

        # 3 review files, all with the same drifted SHA.
        self.review_paths = []
        for lens in ("feasibility-adversarial", "edge-cases-adversarial", "requirements-adversarial"):
            reviewer = "gemini" if lens == "requirements-adversarial" else "codex"
            p = reviews_dir / f"spec.{reviewer}.{lens}.review.md"
            p.write_text(_REVIEW_TEMPLATE.format(lens=lens, slug=self.slug), encoding="utf-8")
            self.review_paths.append(p)

        # Manifest pointing to the 3 reviews. Use absolute paths so
        # resolve_stored_path doesn't try to resolve relative to REPO_ROOT.
        manifest = {
            "feature_slug": self.slug,
            "stage": "spec",
            "artifact_path": str(self.artifact),
            "required_reviews": [
                {"reviewer": "codex", "lens": "feasibility-adversarial", "path": str(self.review_paths[0])},
                {"reviewer": "codex", "lens": "edge-cases-adversarial", "path": str(self.review_paths[1])},
                {"reviewer": "gemini", "lens": "requirements-adversarial", "path": str(self.review_paths[2])},
            ],
        }
        (reviews_dir / "spec.checkpoint.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        # Minimal state.json.
        (workflow_dir / "state.json").write_text(
            json.dumps({"stages": {}}, indent=2),
            encoding="utf-8",
        )

    def _env(self) -> dict:
        env = dict(os.environ)
        env["FF_FACTORY_RUNS_ROOT"] = str(self.runs_root)
        return env

    def test_validation_only_reseals_drifted_reviews(self) -> None:
        result = subprocess.run(
            [
                sys.executable,
                str(RUN_FACTORY),
                "checkpoint",
                "--slug",
                self.slug,
                "--stage",
                "spec",
                "--validation-only",
            ],
            cwd=str(REPO_ROOT),
            env=self._env(),
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout={result.stdout!r}\nstderr={result.stderr!r}",
        )
        # All 3 reviews should now have the artifact's current SHA.
        # We don't compute it directly here — just assert it's NOT the old one.
        for p in self.review_paths:
            content = p.read_text(encoding="utf-8")
            self.assertNotIn('artifact_sha256: "oldsha1234567890"', content)

    def test_validation_only_with_fast_is_mutually_exclusive(self) -> None:
        result = subprocess.run(
            [
                sys.executable,
                str(RUN_FACTORY),
                "checkpoint",
                "--slug",
                self.slug,
                "--stage",
                "diff",  # --fast requires --stage diff
                "--validation-only",
                "--fast",
            ],
            cwd=str(REPO_ROOT),
            env=self._env(),
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
