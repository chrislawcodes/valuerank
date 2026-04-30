"""Unit tests for factory_size_estimate.estimate_size()."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SCRIPT_DIR = Path(__file__).resolve().parents[1]


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPT_DIR / f"{name}.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


FACTORY_STATE = _load("factory_state")
SIZE_EST = _load("factory_size_estimate")


class SizeEstimateTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self.repo_root = Path(self._tmpdir.name)
        self.runs_root = self.repo_root / "docs" / "workflow" / "feature-runs"
        self.runs_root.mkdir(parents=True, exist_ok=True)

        self._repo_patch = mock.patch.object(FACTORY_STATE, "REPO_ROOT", self.repo_root)
        self._runs_patch = mock.patch.object(FACTORY_STATE, "FACTORY_RUNS_ROOT", self.runs_root)
        self._size_repo_patch = mock.patch.object(SIZE_EST.factory_state, "REPO_ROOT", self.repo_root)
        self._size_runs_patch = mock.patch.object(SIZE_EST.factory_state, "FACTORY_RUNS_ROOT", self.runs_root)
        self._repo_patch.start()
        self._runs_patch.start()
        self._size_repo_patch.start()
        self._size_runs_patch.start()
        self.addCleanup(self._repo_patch.stop)
        self.addCleanup(self._runs_patch.stop)
        self.addCleanup(self._size_repo_patch.stop)
        self.addCleanup(self._size_runs_patch.stop)

    def _write_scope(self, slug: str, paths: list[str]) -> None:
        slug_dir = self.runs_root / slug
        slug_dir.mkdir(parents=True, exist_ok=True)
        (slug_dir / "scope.json").write_text(
            json.dumps({"paths": paths}), encoding="utf-8"
        )

    def _write_state(self, slug: str, *, summary: str = "") -> None:
        slug_dir = self.runs_root / slug
        slug_dir.mkdir(parents=True, exist_ok=True)
        state = {
            "discovery": {"summary": summary},
        }
        (slug_dir / "state.json").write_text(json.dumps(state), encoding="utf-8")

    def _no_diff(self) -> mock.MagicMock:
        """Patch _git_diff_stats to return (None, None) — no diff yet."""
        return mock.patch.object(SIZE_EST, "_git_diff_stats", return_value=(None, None))

    def _with_diff(self, diff_lines: int, changed_files: int) -> mock.MagicMock:
        return mock.patch.object(SIZE_EST, "_git_diff_stats", return_value=(diff_lines, changed_files))

    def test_small_classification(self) -> None:
        self._write_scope("alpha", ["cloud/apps/api/src/foo.ts", "cloud/apps/web/src/bar.tsx"])
        self._write_state("alpha", summary="A" * 200)
        with self._no_diff():
            result = SIZE_EST.estimate_size("alpha")
        self.assertEqual(result["size"], "small")
        self.assertEqual(result["recommended_path"], "quick")
        self.assertEqual(result["signals"]["scope_path_count"], 2)
        self.assertEqual(result["signals"]["summary_chars"], 200)
        self.assertIsNone(result["signals"]["diff_lines"])
        self.assertIn("2 scope paths", result["reasoning"])
        self.assertIn("200-char summary", result["reasoning"])

    def test_medium_classification_many_scope_paths(self) -> None:
        self._write_scope("beta", [f"cloud/path{i}.ts" for i in range(5)])
        self._write_state("beta", summary="B" * 300)
        with self._no_diff():
            result = SIZE_EST.estimate_size("beta")
        self.assertEqual(result["size"], "medium")
        self.assertEqual(result["recommended_path"], "full")
        self.assertIn("medium", result["reasoning"])

    def test_large_classification_many_scope_paths(self) -> None:
        self._write_scope("gamma", [f"cloud/path{i}.ts" for i in range(12)])
        self._write_state("gamma", summary="G" * 100)
        with self._no_diff():
            result = SIZE_EST.estimate_size("gamma")
        self.assertEqual(result["size"], "large")
        self.assertEqual(result["recommended_path"], "full")
        self.assertIn("large", result["reasoning"])

    def test_large_classification_from_diff(self) -> None:
        self._write_scope("delta", ["cloud/one.ts"])
        self._write_state("delta", summary="D" * 100)
        with self._with_diff(diff_lines=900, changed_files=8):
            result = SIZE_EST.estimate_size("delta")
        self.assertEqual(result["size"], "large")
        self.assertEqual(result["signals"]["diff_lines"], 900)
        self.assertEqual(result["signals"]["changed_files"], 8)

    def test_missing_scope_json_returns_medium(self) -> None:
        # Only write state, no scope.json
        self._write_state("epsilon", summary="E" * 100)
        with self._no_diff():
            result = SIZE_EST.estimate_size("epsilon")
        self.assertEqual(result["size"], "medium")
        self.assertEqual(result["recommended_path"], "full")
        self.assertIn("scope.json missing", result["reasoning"])
        self.assertIsNone(result["signals"]["diff_lines"])


if __name__ == "__main__":
    unittest.main()
