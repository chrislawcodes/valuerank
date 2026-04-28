import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
REVIEW_SCRIPTS_DIR = Path(__file__).resolve().parents[3] / "review-lens" / "scripts"
for path in (SCRIPTS_DIR, REVIEW_SCRIPTS_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS_DIR / f"{name}.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


FACTORY_STATE = _load("factory_state")
FACTORY_REVIEW = _load("factory_review")


class PersistedCheckpointFlagTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.root = Path(self.tmpdir.name)
        self.slug = "persisted-flags"
        self.workflow_dir = self.root / self.slug
        self.workflow_dir.mkdir(parents=True)
        self.artifact = self.workflow_dir / "spec.md"
        self.artifact.write_text("# Spec\n\nBody.\n", encoding="utf-8")
        self.patches = [
            patch.object(FACTORY_STATE, "FACTORY_RUNS_ROOT", self.root),
            patch.object(FACTORY_REVIEW, "REPO_ROOT", self.root),
        ]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def _state(self, saved: dict) -> dict:
        return {
            "last_successful_checkpoint_flags": {
                "spec": {
                    "schema_version": 1,
                    "stage": "spec",
                    "artifact_path": str(self.artifact),
                    "artifact_sha256": FACTORY_REVIEW.normalized_artifact_hash("spec", self.artifact),
                    **saved,
                }
            }
        }

    def test_persisted_flags_reuse_safe_values(self) -> None:
        values = {"max_artifact_chars": 50000, "gemini_retries": 1}
        FACTORY_REVIEW._apply_persisted_checkpoint_flags(
            self._state({"max_artifact_chars": 12000, "gemini_retries": 0, "no_auto_context": True}),
            "spec",
            str(self.artifact),
            values,
        )
        self.assertEqual(values["max_artifact_chars"], 12000)
        self.assertEqual(values["gemini_retries"], 0)
        self.assertIs(values["no_auto_context"], True)

    def test_persisted_flags_ignore_bad_types_and_ranges(self) -> None:
        values = {
            "max_artifact_chars": 50000,
            "gemini_retries": 1,
            "repair_timeout_seconds": 300,
            "allow_large_diff_rerun": False,
        }
        FACTORY_REVIEW._apply_persisted_checkpoint_flags(
            self._state({
                "max_artifact_chars": "999999",
                "gemini_retries": -1,
                "repair_timeout_seconds": 0,
                "allow_large_diff_rerun": "true",
                "keep_intermediates": ["yes"],
            }),
            "spec",
            str(self.artifact),
            values,
        )
        self.assertEqual(values["max_artifact_chars"], 50000)
        self.assertEqual(values["gemini_retries"], 1)
        self.assertEqual(values["repair_timeout_seconds"], 300)
        self.assertIs(values["allow_large_diff_rerun"], False)
        self.assertNotIn("keep_intermediates", values)

    def test_persisted_flags_ignore_stale_artifact_hash(self) -> None:
        values = {"max_artifact_chars": 50000}
        state = self._state({"max_artifact_chars": 12000})
        state["last_successful_checkpoint_flags"]["spec"]["artifact_sha256"] = "0" * 64
        FACTORY_REVIEW._apply_persisted_checkpoint_flags(state, "spec", str(self.artifact), values)
        self.assertEqual(values["max_artifact_chars"], 50000)


if __name__ == "__main__":
    unittest.main()
