---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/coverage-cell-batch-display/spec.md"
artifact_sha256: "88a9c826b210026d07456169efc8b2a6a0851e5a74553fb0be0b2bcce778a34a"
repo_root: "."
git_head_sha: "eab6ffbb2ad3a2f01ce5cd3ffa2dfd3c317349e9"
git_base_ref: "origin/main"
git_base_sha: "eab6ffbb2ad3a2f01ce5cd3ffa2dfd3c317349e9"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Finding 1 HIGH: Fixed FR-007 (badge uses aFirstBatchCount !== bFirstBatchCount). Finding 2 MEDIUM: orphanedBatchCount used as badge trigger; directional counts in tooltip. Finding 3 MEDIUM: direction token IS the value name — direct lookup via valueA/valueB params. Residuals accepted."
raw_output_path: "docs/workflow/feature-runs/coverage-cell-batch-display/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. Direction Token Validation is Too Permissive, Masking Potential Data Corruption

**Severity:** HIGH
**Evidence:** `[CODE-CONFIRMED]`

The proposed change relies on `jobChoiceValueFirst` in the run config to determine directionality (A-first vs. B-first). The existing `getCoverageDirection` function simply reads and trims this string value without validating it. If a run's config contains a garbage value (e.g., a typo, or a value not part of the pair), it is passed directly into the counting logic in `selectPrimaryDefinitionCounts`.

The code currently handles this by detecting more than two direction tokens for a cell, logging a warning, and using the two largest counts. While this prevents a crash, it is a reactive measure that masks an underlying data quality issue. A more robust approach would be to validate that `getCoverageDirection` only returns a token if it is one of the two canonical values for the value pair being processed. Relying on the fallback makes it harder to diagnose the root cause of the invalid data.

**Relevant Code:**
- `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts` (L231-L236): `getCoverageDirection` performs no validation, only trimming.
- `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts` (L321-L330): The presence of fallback logic for `merged.size > 2` confirms that receiving more than two direction tokens is a known possibility that is handled reactively.

### 2. Spec Contains Contradictory Logic for `⚠` Badge Behavior

**Severity:** MEDIUM
**Evidence:** `[UNVERIFIED]`

The specification contains a contradiction regarding when the `⚠` badge for directional imbalance should appear.

-   **FR-007** states the badge MUST fire when `aFirstBatchCount !== bFirstBatchCount`.
-   The **Edge Cases** section claims: "`pairedBatchCount = 0, batchCount > 0:` Cell shows `batchCount`. ⚠ fires because `batchCount > pairedBatchCount`."

This is a contradiction. If `batchCount > 0` consists entirely of runs without a recognized direction token, then both `aFirstBatchCount` and `bFirstBatchCount` will be 0. According to FR-007, the condition `0 !== 0` is false, so the badge would *not* fire. The reasoning in the "Edge Cases" section is flawed and based on the wrong condition (`batchCount > pairedBatchCount` instead of `aFirstBatchCount !== bFirstBatchCount`). This inconsistency could lead to incorrect implementation or flawed tests.

### 3. Model-Set Filter is Not Applied to `incompleteBatchCount`

**Severity:** LOW
**Evidence:** `[CODE-CONFIRMED]`

The primary goal (FR-001) is to filter `batchCount` to only include runs that contain the domain's effective default model set. However, the spec does not mention applying this same filter to `incompleteBatchCount`.

Currently, in `domain-coverage.ts`, the same `matchesModelFilter` check is applied before a run is sorted into either the complete (`batchCount`) or incomplete (`incompleteBatchCount`) bucket. The spec introduces a new, stricter filtering layer. If this new model-set filter is only applied when calculating `batchCount`, then `incompleteBatchCount` will be inflated with runs that, even if completed, would never be included in the primary `batchCount` metric. This breaks the invariant that a run is in exactly one bucket and creates a confusing user experience where fixing an "incomplete" run has no effect on the displayed `batchCount`.

**Relevant Code:**
- `cloud/apps/api/src/graphql/queries/domain-coverage.ts` (L262-L309): The logical flow shows that a `matchesModelFilter` check currently gates both `batchCount` and `incompleteBatchCount` contributions. The spec proposes modifying the `batchCount` path without a corresponding change to the `incompleteBatchCount` path.

## Residual Risks

1.  **Confusing UI from Multiple Count Representations:** The cell will display a primary number derived from `pairedBatchCount` or `batchCount`, while the popover will display a breakdown of `aFirstBatchCount` and `bFirstBatchCount`. These counts represent different concepts (`min` vs. `per-direction` totals). A user may see a cell display "3" (from `pairedBatchCount`) but the popover breakdown shows "A-first: 5, B-first: 3". This discrepancy, while technically correct by the definitions, is not intuitive and may lead users to believe the data is wrong or to misinterpret the coverage status.

2.  **Increased API Complexity:** The proposal adds `aFirstBatchCount` and `bFirstBatchCount` to the `DomainValueCoverageCell` type (FR-003). This type already contains `batchCount`, `pairedBatchCount`, and `orphanedBatchCount`. Having five separate-but-related batch count fields on a single API object increases surface area and cognitive load for developers of future clients, increasing the risk of misuse or misinterpretation.

## Token Stats

- total_input=2536
- total_output=1137
- total_tokens=36441
- `gemini-2.5-pro`: input=2536, output=1137, total=36441

## Resolution
- status: accepted
- note: Finding 1 HIGH: Fixed FR-007 (badge uses aFirstBatchCount !== bFirstBatchCount). Finding 2 MEDIUM: orphanedBatchCount used as badge trigger; directional counts in tooltip. Finding 3 MEDIUM: direction token IS the value name — direct lookup via valueA/valueB params. Residuals accepted.
