from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "codebase-inventory.py"
FIXTURES = Path(__file__).resolve().parent / "fixtures"

SPEC = importlib.util.spec_from_file_location("codebase_inventory", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load module from {MODULE_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class CodebaseInventoryTest(unittest.TestCase):
    def test_ts_export_extraction(self) -> None:
        text = (FIXTURES / "ts_exports.ts").read_text(encoding="utf-8")
        self.assertEqual(
            MODULE.extract_ts_exports(text),
            ["runAlpha", "cacheWarm", "CacheManager"],
        )
        self.assertEqual(
            MODULE.extract_ts_types(text),
            ["CacheEntry", "CacheTier"],
        )

    def test_ts_jsdoc_extraction(self) -> None:
        text = (FIXTURES / "ts_jsdoc.ts").read_text(encoding="utf-8")
        self.assertEqual(
            MODULE.extract_ts_description(text),
            "Multi-tier cache for transcript summaries.",
        )

    def test_python_def_class_extraction(self) -> None:
        text = (FIXTURES / "py_def_class.py").read_text(encoding="utf-8")
        self.assertEqual(
            MODULE.extract_py_exports(text),
            ["build_item", "Worker", "UPPER_CONSTANT"],
        )

    def test_python_module_docstring(self) -> None:
        text = (FIXTURES / "py_docstring.py").read_text(encoding="utf-8")
        self.assertEqual(MODULE.extract_py_description(text), "Module docs.")

    def test_no_docstring_fallback(self) -> None:
        text = (FIXTURES / "no_docstring.py").read_text(encoding="utf-8")
        self.assertEqual(MODULE._format_description(MODULE.extract_py_description(text)), "(no docstring)")

    def test_truncation(self) -> None:
        text = (FIXTURES / "many_exports.ts").read_text(encoding="utf-8")
        exports = MODULE.extract_ts_exports(text)
        self.assertEqual(
            MODULE._format_symbol_list(exports),
            "item1, item2, item3, item4, item5, item6, (+4 more)",
        )

    def test_report_structure_and_test_files_are_skipped(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target_dir = root / "cloud/apps/api/src/services"
            target_dir.mkdir(parents=True)
            (target_dir / "foo.ts").write_text((FIXTURES / "foo.ts").read_text(encoding="utf-8"), encoding="utf-8")
            (target_dir / "foo.test.ts").write_text(
                (FIXTURES / "foo.test.ts").read_text(encoding="utf-8"), encoding="utf-8"
            )

            sections = MODULE.build_inventory(root)
            report = MODULE.render_report(sections)

            self.assertIn("## cloud/apps/api/src/services/", report)
            self.assertIn("| path | exports | types | description |", report)
            self.assertIn("foo.ts", report)
            self.assertNotIn("foo.test.ts", report)


if __name__ == "__main__":
    unittest.main()
