import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "factory_review_specs.py"
SPEC = importlib.util.spec_from_file_location("factory_review_specs", SCRIPT_PATH)
assert SPEC and SPEC.loader
FRS = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = FRS
SPEC.loader.exec_module(FRS)


def _review(body: str) -> Path:
    """Write a tiny review-shaped file and return the path."""
    tmp = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        delete=False,
        suffix=".review.md",
    )
    tmp.write(body)
    tmp.flush()
    tmp.close()
    return Path(tmp.name)


class ActionableFindingRegexPositiveTests(unittest.TestCase):
    """Every supported finding shape must be detected."""

    def test_bullet_colon_high(self) -> None:
        self.assertTrue(FRS.detect_actionable_findings(_review("- high: missing index\n")))

    def test_bullet_colon_medium(self) -> None:
        self.assertTrue(FRS.detect_actionable_findings(_review("- medium: stale cache\n")))

    def test_bullet_bracket_tag_colon(self) -> None:
        self.assertTrue(
            FRS.detect_actionable_findings(_review("- [code-confirmed] high: stale cache\n"))
        )

    def test_bullet_bare_plus_bracket_tag_upper(self) -> None:
        self.assertTrue(
            FRS.detect_actionable_findings(
                _review("- HIGH [CODE-CONFIRMED]: bug in path handling\n")
            )
        )

    def test_bullet_bold_severity(self) -> None:
        self.assertTrue(
            FRS.detect_actionable_findings(_review("- **HIGH**: path handler missing\n"))
        )

    def test_bullet_bold_severity_with_tag(self) -> None:
        self.assertTrue(
            FRS.detect_actionable_findings(
                _review("- **HIGH [CODE-CONFIRMED]**: path handler missing\n")
            )
        )

    def test_table_cell_high(self) -> None:
        self.assertTrue(FRS.detect_actionable_findings(_review("| **HIGH** | some text |\n")))

    def test_table_cell_critical(self) -> None:
        self.assertTrue(
            FRS.detect_actionable_findings(_review("| **CRITICAL** | some text |\n"))
        )

    def test_numbered_list_bold_severity(self) -> None:
        self.assertTrue(
            FRS.detect_actionable_findings(_review("1. **HIGH**: missing index on foo\n"))
        )

    def test_heading_severity(self) -> None:
        self.assertTrue(FRS.detect_actionable_findings(_review("### HIGH: missing index\n")))

    def test_heading_with_rank_prefix(self) -> None:
        self.assertTrue(FRS.detect_actionable_findings(_review("### 1. HIGH concern\n")))

    def test_paragraph_bold_prefix(self) -> None:
        self.assertTrue(FRS.detect_actionable_findings(_review("**HIGH**: broken join\n")))

    def test_paragraph_bold_prefix_with_tag(self) -> None:
        self.assertTrue(
            FRS.detect_actionable_findings(
                _review("**HIGH [CODE-CONFIRMED]**: duplicate handler\n")
            )
        )

    def test_inline_severity_field_bold(self) -> None:
        self.assertTrue(
            FRS.detect_actionable_findings(_review("**Severity**: HIGH\nmore text\n"))
        )

    def test_inline_severity_field_bold_alternate(self) -> None:
        self.assertTrue(FRS.detect_actionable_findings(_review("**Severity:** HIGH\n")))

    def test_inline_severity_field_plain(self) -> None:
        self.assertTrue(FRS.detect_actionable_findings(_review("Severity: HIGH\n")))

    def test_gemini_style_nested_finding(self) -> None:
        """Real shape produced by the Gemini requirements-adversarial reviewer."""
        body = (
            "### 1. Mandatory tracking introduces scope creep\n"
            "\n"
            "**Severity**: MEDIUM\n"
            "**Finding**: The new step...\n"
        )
        self.assertTrue(FRS.detect_actionable_findings(_review(body)))


class ActionableFindingRegexNegativeTests(unittest.TestCase):
    """Prose mentions of severity words must NOT match."""

    def test_prose_mid_sentence(self) -> None:
        self.assertFalse(
            FRS.detect_actionable_findings(
                _review("This would be a HIGH severity issue in production.\n")
            )
        )

    def test_prose_with_severity_word_only(self) -> None:
        self.assertFalse(
            FRS.detect_actionable_findings(
                _review("We consider severity carefully in this review.\n")
            )
        )

    def test_empty_review(self) -> None:
        self.assertFalse(FRS.detect_actionable_findings(_review("")))

    def test_low_severity_not_actionable(self) -> None:
        """LOW findings are not actionable — auto-accept is fine."""
        self.assertFalse(FRS.detect_actionable_findings(_review("- low: minor typo\n")))
        self.assertFalse(FRS.detect_actionable_findings(_review("### LOW: minor typo\n")))
        self.assertFalse(FRS.detect_actionable_findings(_review("**LOW**: typo\n")))

    def test_word_higher_not_match(self) -> None:
        self.assertFalse(
            FRS.detect_actionable_findings(_review("higher-priority item is this\n"))
        )

    def test_severity_word_in_code_block_prose(self) -> None:
        self.assertFalse(
            FRS.detect_actionable_findings(
                _review("For example, the pattern **HIGH severity findings** in docs...\n")
            )
        )


class ActionableFindingRegexRealReviewTests(unittest.TestCase):
    """The regex must detect findings in THIS feature's own spec reviews."""

    FEATURE_REVIEWS = (
        Path(__file__).resolve().parents[3].parents[1]
        / "feature-runs"
        / "ff-runner-fixes"
        / "reviews"
    )

    def _review_path(self, name: str) -> Path:
        return self.FEATURE_REVIEWS / name

    def test_codex_feasibility_review_is_actionable(self) -> None:
        path = self._review_path("spec.codex.feasibility-adversarial.review.md")
        if not path.exists():
            self.skipTest(f"fixture review missing: {path}")
        self.assertTrue(FRS.detect_actionable_findings(path))

    def test_codex_edge_cases_review_is_actionable(self) -> None:
        path = self._review_path("spec.codex.edge-cases-adversarial.review.md")
        if not path.exists():
            self.skipTest(f"fixture review missing: {path}")
        self.assertTrue(FRS.detect_actionable_findings(path))

    def test_gemini_requirements_review_is_actionable(self) -> None:
        path = self._review_path("spec.gemini.requirements-adversarial.review.md")
        if not path.exists():
            self.skipTest(f"fixture review missing: {path}")
        self.assertTrue(FRS.detect_actionable_findings(path))


class ActionableFindingShapesManifestTests(unittest.TestCase):
    def test_shapes_manifest_present(self) -> None:
        """ACTIONABLE_FINDING_SHAPES documents every pattern the regex covers."""
        self.assertIsInstance(FRS.ACTIONABLE_FINDING_SHAPES, tuple)
        self.assertGreaterEqual(len(FRS.ACTIONABLE_FINDING_SHAPES), 10)


if __name__ == "__main__":
    unittest.main()
