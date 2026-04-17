---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/unified-net-weighted-condition-score/tasks.md"
artifact_sha256: "b63e0140e5a360e79dd91deb41d39c2b5d6f4be7d9567a76e6d7f994bacb45dd"
repo_root: "."
git_head_sha: "6bb16c97a0d101ee6d86aabaa5765d61fa877208"
git_base_ref: "origin/main"
git_base_sha: "6bb16c97a0d101ee6d86aabaa5765d61fa877208"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "MEDIUM (non-finite value coverage) fixed via S1-T6 null/NaN defense test. MEDIUM (tolerance boundary coverage) fixed via S2-T5 four boundary tests. LOW (static test-file list vs grep-derived) accepted — list was derived from the grep at plan authoring time; additional files added inline if Slice 3 dispatch surfaces them."
raw_output_path: "docs/workflow/feature-runs/unified-net-weighted-condition-score/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| 1 | MEDIUM | Incomplete test coverage for non-finite inputs. | `[UNVERIFIED]` |
| 2 | MEDIUM | Insufficient test coverage for floating-point tolerance boundaries. | `[UNVERIFIED]` |
| 3 | LOW | Discrepancy between planned test discovery and task definition. | `[UNVERIFIED]` |

### 1. Incomplete test coverage for non-finite inputs
**Severity:** MEDIUM

The test plan for Slice 1 is not as robust as the defensive posture described in the plan. The plan's "Subset-input defense" section states that the summarizer should treat "missing/non-finite as `0`". However, the corresponding test task (`S1-T6`) only specifies testing for a missing key ("missing `neutral` key does not crash"). It omits explicit test cases for other non-finite values like `null`, `undefined`, or `NaN` being passed as values for the count fields (e.g., `{ strongly: 5, somewhat: null, ... }`). This is a coverage gap that could allow crashes if the implementation only handles missing keys but not other invalid numeric values.

### 2. Insufficient test coverage for floating-point tolerance boundaries
**Severity:** MEDIUM

The test plan for Slice 2 (`S2-T5`) requires asserting that the "red callout fires" for an inconsistent `MatrixCondition`. However, it does not require a test that specifically validates the *tolerance boundary* (`1e-6`) for the floating-point comparisons in `validateMatrixCondition` (per FR-012). An implementation could incorrectly use strict equality/inequality, which might pass the described test if the test input has a large inconsistency, but would fail in production on data with minor floating-point residue. The test should cover a case just inside the tolerance (which passes) and just outside (which fails).

### 3. Discrepancy between planned test discovery and task definition
**Severity:** LOW

The plan's "Risks and mitigations" section proposes a mitigation for missing a downstream test update: "`tasks.md` enumerates every test touched by slice 3 by running `grep -rn "winnerScore" cloud/apps/web/tests` before Codex dispatch." However, the `tasks.md` file for Slice 3 does not appear to be the result of this `grep`. It lists the most probable test files statically. This creates a risk that a less obvious test file asserting the old score values could be missed if the `grep` is not performed correctly during the implementation phase, defeating the purpose of the planned mitigation. The task list itself should be the *output* of that discovery process.

## Residual Risks

- **Runtime Errors from Unhandled Inputs:** Due to the test coverage gap identified in Finding #1, the `summarizeCanonicalConditionCounts` function may not be robust against all non-finite inputs, potentially leading to runtime `NaN` calculations or crashes if a data source provides `null` or `undefined` values instead of omitting a key.
- **Incorrect Validation Logic:** Without explicit tests for the tolerance boundaries in `validateMatrixCondition` (Finding #2), an implementation could ship with fragile validation logic that fails on legitimate floating-point data, incorrectly showing users a red-callout error for data that is actually valid within the specified tolerance.
- **Test-Induced Regression:** The risk of a downstream test that asserts old score labels being missed (Finding #3) remains. If such a test is not updated, it could either fail CI or, if it's not a blocking test, allow a regression to be shipped if a future change relies on its outdated assertions.

## Token Stats

- total_input=20710
- total_output=800
- total_tokens=36452
- `gemini-2.5-pro`: input=20710, output=800, total=36452

## Resolution
- status: accepted
- note: MEDIUM (non-finite value coverage) fixed via S1-T6 null/NaN defense test. MEDIUM (tolerance boundary coverage) fixed via S2-T5 four boundary tests. LOW (static test-file list vs grep-derived) accepted — list was derived from the grep at plan authoring time; additional files added inline if Slice 3 dispatch surfaces them.
