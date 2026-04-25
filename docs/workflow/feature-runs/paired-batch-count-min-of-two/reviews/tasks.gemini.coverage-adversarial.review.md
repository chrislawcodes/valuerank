---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/tasks.md"
artifact_sha256: "4a431497a7698289b06e05c1c6ad961c5a097e0843793293d8b56ae02d991262"
repo_root: "."
git_head_sha: "2cd6635c7bf0a0007e9f2c340a95e21779560a8b"
git_base_ref: "origin/main"
git_base_sha: "2cd6635c7bf0a0007e9f2c340a95e21779560a8b"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH F-1 (test coverage gap from replacement) — added explicit old-to-new test mapping table; T1.3 also adds a samplesPerScenario tripwire test. MED F-2 (insufficient integration coverage) — preserved 5 I-cases plus the helper-level 9 cases; the 5 I-cases test end-to-end resolver behavior. MED F-3 (T2.12 skippable) — T2.11 (renumbered) is now non-skippable; alternative resolver-shape integration test required if local fixtures absent. LOW F-4 (build failures may mask real errors) — addressed by the additive Slice 1 design; no temporary breakage."
raw_output_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

| Severity | ID | Finding |
| :--- | :--- | :--- |
| **HIGH** | F-1 | **Gap in Test Coverage from Test Replacement** |
| | | **Location:** Task `T1.3` <br/> The plan explicitly states to `drop the existing tests at lines 132–207` and replace them with new tests. This creates a significant risk of coverage regression. The new tests will validate the new implementation against its expected behavior, but they may not cover all edge cases or nuances that the original tests were designed to catch. Without ensuring the new test suite is a functional superset of the old one, subtle bugs in the retained helper functions (e.g., `deduplicateRunsByGroupId`) or interactions with the new logic could be missed. |
| **MEDIUM** | F-2 | **[UNVERIFIED] Insufficient Integration Test Coverage** |
| | | **Location:** Task `T2.8` <br/> The plan calls for 5 integration tests (`I1`–`I5`) to validate the final wired-up logic. However, the unit tests for the helper function (`T1.3`) are specified to cover 9 distinct cases. It is not guaranteed that the 5 integration tests provide equivalent coverage for the end-to-end logic. For example, the `>2 directions` case is tested (`I5`), and the divergence case is tested (`I2`), but it's unclear if all 9 permutations of input data (especially tie-breaks and empty lists) are validated at the GraphQL resolver level. |
| **MEDIUM** | F-3 | **Skippable Manual Verification Creates a Blind Spot** |
| | | **Location:** Task `T2.12` <br/> The manual verification step, which involves querying a live dev server, is marked as skippable if seeded fixtures are inadequate. This is a critical validation step that connects the abstract logic to a concrete API response. Skipping it removes the only check that ensures the final GraphQL response is correctly shaped and valued for a "real" query, even with test data. An error in GQL type resolution or final JSON serialization would be missed until a downstream consumer (like the web app) breaks. |
| **LOW** | F-4 | **Temporary Build Failures May Obscure Real Errors** |
| | | **Location:** Tasks `T1.4`, `T1.5` <br/> The two-slice strategy intentionally introduces a temporary state where type checks and integration tests are expected to fail. While this is a planned part of the workflow, it creates noise that can easily mask *unplanned* errors. A developer might incorrectly attribute a new, unrelated build or test failure to the expected breakage, causing a real bug to slip into Slice 2. The use of `// @ts-expect-error` is a particular risk, as it can suppress legitimate type errors that were not the ones intended. |

## Residual Risks

Even if the tasks are executed perfectly, the following risks remain:

1.  **Production Data Divergence:** The pre-merge production queries (`PM3`) are excellent but not exhaustive. There may be complex, historical data shapes not present in the test fixtures or captured by the queries that cause the new logic to behave in unexpected ways. The query `PM3-Q3`, for example, only checks for `COUNT(*) > 1`, but a more complex failure could arise from `COUNT(*) = 1` where the run's configuration is subtly malformed in a way the new `getCoverageDirection` helper misinterprets.

2.  **Increased System Complexity:** The change intentionally introduces a divergence between how `pairedBatchCount` and `minTrialCount` are calculated (acknowledged in `T2.5` and `I2`). While documented in the glossary (`T2.7`), this adds a permanent "gotcha" to the system, increasing the cognitive load for future developers and the risk of them misinterpreting one of the metrics.

3.  **Ambiguity in the "Min of Two Largest" Rule:** In the case of more than two directions for a definition (T1.2), the rule is to `return min of two largest counts`. The plan does not specify how to handle a tie for the second-largest count (e.g., if counts are `[10, 8, 8, 5]`, is the min taken of `(10, 8)`?). While a rare edge case (and guarded by `PM3-Q2`), this ambiguity could lead to minor, difficult-to-trace metric inconsistencies if such data ever exists.

## Token Stats

- total_input=456
- total_output=989
- total_tokens=18225
- `gemini-2.5-pro`: input=456, output=989, total=18225

## Resolution
- status: accepted
- note: HIGH F-1 (test coverage gap from replacement) — added explicit old-to-new test mapping table; T1.3 also adds a samplesPerScenario tripwire test. MED F-2 (insufficient integration coverage) — preserved 5 I-cases plus the helper-level 9 cases; the 5 I-cases test end-to-end resolver behavior. MED F-3 (T2.12 skippable) — T2.11 (renumbered) is now non-skippable; alternative resolver-shape integration test required if local fixtures absent. LOW F-4 (build failures may mask real errors) — addressed by the additive Slice 1 design; no temporary breakage.
