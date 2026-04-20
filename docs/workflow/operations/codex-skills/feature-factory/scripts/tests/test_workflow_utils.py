"""Tests for review-lens/scripts/workflow_utils.py."""
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


WORKFLOW_UTILS_PATH = (
    Path(__file__).resolve().parents[3] / "review-lens" / "scripts" / "workflow_utils.py"
)
WORKFLOW_UTILS_SPEC = importlib.util.spec_from_file_location(
    "workflow_utils_for_tests", WORKFLOW_UTILS_PATH
)
assert WORKFLOW_UTILS_SPEC and WORKFLOW_UTILS_SPEC.loader
WORKFLOW_UTILS = importlib.util.module_from_spec(WORKFLOW_UTILS_SPEC)
sys.modules[WORKFLOW_UTILS_SPEC.name] = WORKFLOW_UTILS
WORKFLOW_UTILS_SPEC.loader.exec_module(WORKFLOW_UTILS)


class NormalizedArtifactTextTests(unittest.TestCase):
    """The Review Reconciliation section is orchestrator-added metadata. Its
    content must not participate in artifact hashes — otherwise every
    reconciliation edit invalidates the reviews and creates an infinite loop.
    Regression tests cover every stage that authors can add a reconciliation
    section to.
    """

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)

    def _write(self, name: str, body: str) -> Path:
        path = Path(self._tmpdir.name) / name
        path.write_text(body, encoding="utf-8")
        return path

    def _assert_reconciliation_stripped(self, stage: str) -> None:
        body_without = "# Artifact\n\nSubstantive body.\n\n## Next Steps\n\nMore.\n"
        reconciliation = (
            "## Review Reconciliation\n\n"
            "- review: reviews/a.review.md | status: accepted | note: note one\n"
        )
        # When reconciliation is at the end:
        path_tail = self._write(f"{stage}-tail.md", body_without + "\n" + reconciliation)
        self.assertEqual(
            WORKFLOW_UTILS.normalized_artifact_hash(stage, self._write(f"{stage}-plain.md", body_without)),
            WORKFLOW_UTILS.normalized_artifact_hash(stage, path_tail),
            f"stage={stage}: trailing Review Reconciliation must not affect hash",
        )
        # When another section follows reconciliation:
        path_mid = self._write(
            f"{stage}-mid.md",
            "# Artifact\n\nSubstantive body.\n\n"
            + reconciliation
            + "\n## Next Steps\n\nMore.\n",
        )
        self.assertEqual(
            WORKFLOW_UTILS.normalized_artifact_hash(stage, self._write(f"{stage}-plain.md", body_without)),
            WORKFLOW_UTILS.normalized_artifact_hash(stage, path_mid),
            f"stage={stage}: inlined Review Reconciliation must not affect hash",
        )

    def test_plan_reconciliation_stripped(self) -> None:
        self._assert_reconciliation_stripped("plan")

    def test_spec_reconciliation_stripped(self) -> None:
        """Regression: prior implementation only stripped Reconciliation for
        the plan stage, which caused spec adversarial reviews to be marked
        stale every time the orchestrator recorded a reconciliation."""
        self._assert_reconciliation_stripped("spec")

    def test_tasks_reconciliation_stripped(self) -> None:
        self._assert_reconciliation_stripped("tasks")

    def test_closeout_reconciliation_stripped(self) -> None:
        self._assert_reconciliation_stripped("closeout")

    def test_body_without_reconciliation_unchanged(self) -> None:
        body = "# Artifact\n\nNo reconciliation section here.\n"
        path = self._write("plain.md", body)
        # Hash must be the sha256 of the raw text byte-for-byte
        import hashlib

        expected = hashlib.sha256(body.encode("utf-8")).hexdigest()
        for stage in ("spec", "plan", "tasks", "closeout", "diff"):
            self.assertEqual(
                WORKFLOW_UTILS.normalized_artifact_hash(stage, path),
                expected,
                f"stage={stage}: text without reconciliation must hash to raw sha",
            )

    def test_change_to_substantive_body_changes_hash(self) -> None:
        """Make sure stripping reconciliation doesn't accidentally strip the
        substantive body or collapse different artifacts into the same hash."""
        body_a = "# Artifact\n\nBody A.\n\n## Review Reconciliation\n\n- review: a\n"
        body_b = "# Artifact\n\nBody B.\n\n## Review Reconciliation\n\n- review: a\n"
        path_a = self._write("a.md", body_a)
        path_b = self._write("b.md", body_b)
        for stage in ("spec", "plan", "tasks", "closeout"):
            self.assertNotEqual(
                WORKFLOW_UTILS.normalized_artifact_hash(stage, path_a),
                WORKFLOW_UTILS.normalized_artifact_hash(stage, path_b),
                f"stage={stage}: substantive body differences must change hash",
            )


if __name__ == "__main__":
    unittest.main()
