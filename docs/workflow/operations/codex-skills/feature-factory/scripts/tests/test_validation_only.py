"""Slice 3 tests — checkpoint --validation-only.

All tests are integration-level via argparse CLI invocation per Gemini MEDIUM F-04.
"""
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS_DIR / f"{name}.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


FACTORY_STATE = _load("factory_state")
CHECKPOINT = _load("factory_cmd_checkpoint")
RUN_FACTORY = _load("run_factory")


_FM_TEMPLATE = """---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/{slug}/spec.md"
artifact_sha256: "{sha}"
resolution_status: "accepted"
resolution_note: "ok"
---

# Review body placeholder.
"""


class ValidationOnlyBase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.mkdtemp()
        self.tmp_root = Path(self.tmpdir)
        self.slug = "val-test"
        self._patches = [
            patch.object(FACTORY_STATE, "FACTORY_RUNS_ROOT", self.tmp_root),
            patch.object(CHECKPOINT, "REPO_ROOT", self.tmp_root),
        ]
        for p in self._patches:
            p.start()

        # Seed workflow dir + reviews dir + artifact + manifest + 3 review files.
        workflow_dir = FACTORY_STATE.workflow_dir(self.slug)
        reviews_dir = workflow_dir / "reviews"
        reviews_dir.mkdir(parents=True, exist_ok=True)
        self.artifact = workflow_dir / "spec.md"
        self.artifact.write_text("# Spec\n\nBody content.\n", encoding="utf-8")
        from workflow_utils import normalized_artifact_hash
        self.current_sha = normalized_artifact_hash("spec", self.artifact)

        self.review_paths = []
        for lens in ("feasibility-adversarial", "edge-cases-adversarial", "requirements-adversarial"):
            reviewer = "gemini" if lens == "requirements-adversarial" else "codex"
            p = reviews_dir / f"spec.{reviewer}.{lens}.review.md"
            p.write_text(
                _FM_TEMPLATE.format(slug=self.slug, sha="old_sha_placeholder" * 4)[:200],
                encoding="utf-8",
            )
            # Rewrite properly
            p.write_text(
                f'---\nreviewer: "{reviewer}"\nlens: "{lens}"\nstage: "spec"\n'
                f'artifact_path: "docs/workflow/feature-runs/{self.slug}/spec.md"\n'
                f'artifact_sha256: "oldsha1234567890"\nresolution_status: "accepted"\n'
                f'resolution_note: "ok"\n---\n\nbody\n',
                encoding="utf-8",
            )
            self.review_paths.append(p)

        manifest = {
            "feature_slug": self.slug,
            "stage": "spec",
            "artifact_path": f"docs/workflow/feature-runs/{self.slug}/spec.md",
            "required_reviews": [
                {"reviewer": "codex", "lens": "feasibility-adversarial",
                 "path": str(self.review_paths[0].relative_to(self.tmp_root))},
                {"reviewer": "codex", "lens": "edge-cases-adversarial",
                 "path": str(self.review_paths[1].relative_to(self.tmp_root))},
                {"reviewer": "gemini", "lens": "requirements-adversarial",
                 "path": str(self.review_paths[2].relative_to(self.tmp_root))},
            ],
        }
        (reviews_dir / "spec.checkpoint.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        state = FACTORY_STATE._default_workflow_state()
        FACTORY_STATE.atomic_json_write(FACTORY_STATE.factory_state_path(self.slug), state)

        self._sync_patch = patch.object(RUN_FACTORY, "ensure_sync", lambda: None)
        self._sync_patch.start()

    def tearDown(self) -> None:
        for p in self._patches:
            p.stop()
        self._sync_patch.stop()

    def _run(self, argv: list[str]) -> int:
        parser = RUN_FACTORY.build_parser()
        args = parser.parse_args(argv)
        try:
            return args.func(args) or 0
        except SystemExit as exc:
            return int(exc.code) if isinstance(exc.code, int) else 1


class ValidationOnlyHappyPaths(ValidationOnlyBase):
    def test_drift_triggers_reseal(self) -> None:
        """US2.1 — drifted artifact → reseal all review SHAs, annotation appended, exit 0."""
        rc = self._run([
            "checkpoint", "--slug", self.slug, "--stage", "spec",
            "--validation-only",
        ])
        self.assertEqual(rc, 0)
        # Every review file now has the current SHA.
        for p in self.review_paths:
            content = p.read_text(encoding="utf-8")
            self.assertIn(f'artifact_sha256: "{self.current_sha}"', content)
        # Annotation was appended.
        state = json.loads(
            FACTORY_STATE.factory_state_path(self.slug).read_text(encoding="utf-8")
        )
        annotations = state["stages"]["spec"]["annotations"]
        self.assertEqual(len(annotations), 1)
        self.assertEqual(annotations[0]["type"], "validation-only-reseal")
        self.assertEqual(annotations[0]["new_sha"], self.current_sha)
        self.assertEqual(annotations[0]["files_updated"], 3)

    def test_already_matches_no_op(self) -> None:
        """US2.3 — artifact SHA already matches manifest → no-op, no writes, exit 0."""
        # First reseal so everything matches.
        self._run(["checkpoint", "--slug", self.slug, "--stage", "spec", "--validation-only"])
        # Now invoke again; nothing should change.
        state_before = FACTORY_STATE.factory_state_path(self.slug).read_text(encoding="utf-8")
        rc = self._run([
            "checkpoint", "--slug", self.slug, "--stage", "spec",
            "--validation-only",
        ])
        self.assertEqual(rc, 0)
        state_after = FACTORY_STATE.factory_state_path(self.slug).read_text(encoding="utf-8")
        # Annotation count doesn't grow on no-op.
        before = json.loads(state_before)
        after = json.loads(state_after)
        self.assertEqual(
            len(before["stages"]["spec"]["annotations"]),
            len(after["stages"]["spec"]["annotations"]),
        )

    def test_missing_manifest_exits_2(self) -> None:
        """US2.4 — no manifest → exit 2 with clear error."""
        manifest_path = FACTORY_STATE.reviews_dir(self.slug) / "spec.checkpoint.json"
        manifest_path.unlink()
        rc = self._run([
            "checkpoint", "--slug", self.slug, "--stage", "spec",
            "--validation-only",
        ])
        self.assertEqual(rc, 2)


class ValidationOnlyGuards(ValidationOnlyBase):
    def test_pre_check_read_only_blocks_all_writes(self) -> None:
        """One read-only review file → exit 2, other files not modified."""
        # Make the middle review file read-only.
        target = self.review_paths[1]
        target.chmod(0o444)
        original_mids = [p.read_text(encoding="utf-8") for p in self.review_paths]
        try:
            rc = self._run([
                "checkpoint", "--slug", self.slug, "--stage", "spec",
                "--validation-only",
            ])
            self.assertEqual(rc, 2)
            # None of the files should have changed (pre-check blocked ALL writes).
            for p, original in zip(self.review_paths, original_mids):
                self.assertEqual(p.read_text(encoding="utf-8"), original)
        finally:
            target.chmod(0o644)

    def test_mid_run_failure_leaves_partial_state(self) -> None:
        """Gemini CRITICAL F-01 + LOW F-06 — mid-run os.replace failure: first
        file updated, second + third retain old SHA. Annotation NOT appended."""
        call_count = {"n": 0}
        real_replace = os.replace

        def flaky_replace(src, dst):
            call_count["n"] += 1
            if call_count["n"] == 2:
                raise OSError("simulated replace failure on 2nd file")
            return real_replace(src, dst)

        with patch.object(CHECKPOINT.os, "replace", side_effect=flaky_replace):
            rc = self._run([
                "checkpoint", "--slug", self.slug, "--stage", "spec",
                "--validation-only",
            ])

        self.assertEqual(rc, 2)
        # File 0 was resealed (call 1 succeeded).
        self.assertIn(
            f'artifact_sha256: "{self.current_sha}"',
            self.review_paths[0].read_text(encoding="utf-8"),
        )
        # File 1 retained old SHA (call 2 failed).
        self.assertIn(
            'artifact_sha256: "oldsha1234567890"',
            self.review_paths[1].read_text(encoding="utf-8"),
        )
        # Annotation NOT appended.
        state = json.loads(
            FACTORY_STATE.factory_state_path(self.slug).read_text(encoding="utf-8")
        )
        annotations = state.get("stages", {}).get("spec", {}).get("annotations", [])
        for ann in annotations:
            self.assertNotEqual(ann.get("type"), "validation-only-reseal")


class ValidationOnlyMutex(ValidationOnlyBase):
    """FR-004: --validation-only mutex with --fallback, --address, --defer, --dismiss."""

    def test_mutex_fallback(self) -> None:
        rc = self._run([
            "checkpoint", "--slug", self.slug, "--stage", "spec",
            "--validation-only", "--fallback",
        ])
        self.assertNotEqual(rc, 0)

    def test_mutex_address(self) -> None:
        rc = self._run([
            "checkpoint", "--slug", self.slug, "--stage", "spec",
            "--validation-only", "--address", "abc123def456", "--evidence", "x",
        ])
        self.assertNotEqual(rc, 0)

    def test_mutex_defer(self) -> None:
        rc = self._run([
            "checkpoint", "--slug", self.slug, "--stage", "spec",
            "--validation-only", "--defer", "abc123def456", "--reason", "x",
        ])
        self.assertNotEqual(rc, 0)

    def test_mutex_dismiss(self) -> None:
        rc = self._run([
            "checkpoint", "--slug", self.slug, "--stage", "spec",
            "--validation-only", "--dismiss", "abc123def456", "--reason", "x",
        ])
        self.assertNotEqual(rc, 0)


if __name__ == "__main__":
    unittest.main()
