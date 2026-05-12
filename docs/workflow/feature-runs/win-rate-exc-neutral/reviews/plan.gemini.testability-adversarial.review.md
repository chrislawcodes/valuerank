---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/win-rate-exc-neutral/plan.md"
artifact_sha256: "6a2adeaa26b715c0c361a64a92f38ca1d20b14e02fb81f305f082c46c23aea3c"
repo_root: "."
git_head_sha: "8c8e3ecb4692e3642b26b8b571017d0d04c6983b"
git_base_ref: "origin/main"
git_base_sha: "8c8e3ecb4692e3642b26b8b571017d0d04c6983b"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (missing fallback tests): Accepted. tasks.md adds unit tests for ValuePrioritiesTable, DominanceSection, and DomainShiftsReportSection fallback behavior. MEDIUM (race condition test): Accepted. Integration test will simulate supersede by updating snapshot status before Phase 2. MEDIUM (indicator test): Accepted. Component test added for null pooledWinRateExcNeutral chip. MEDIUM UNVERIFIED (call site check): Accepted. computeCellWeightedDomainRates has one call site (buildSnapshotOutput) which will be updated in Slice 1. LOW (null-denominator test): Accepted. Added to Slice 2 tests. LOW (toggle callback test): Accepted. Added to Slice 3 tests."
raw_output_path: "docs/workflow/feature-runs/win-rate-exc-neutral/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Slice | Recommendation |
| :--- | :--- | :--- | :--- |
| **HIGH** | The test plan for wiring frontend reports is incomplete and misses critical fallback logic. | Slice 4 | For each affected component (`ValuePrioritiesTable`, `DominanceSection`, `DomainShiftsReportSection`), add a unit test to verify that it correctly uses the `winRateExcNeutral` field when `winRateMode` is `exc-neutral` but falls back to the standard `winRate` if the `winRateExcNeutral` field is null or absent. The current plan only specifies this for `PairwiseWinRateMatrix`. |
| **MEDIUM** | The test for optimistic concurrency control is insufficient to prevent race conditions. | Slice 1 | The proposed test only verifies that the `updateMany` call includes `status: 'CURRENT'`. A more robust integration test is needed to simulate the race condition: 1. Start the `refreshDomainAnalysisSnapshot` process. 2. Before Phase 2 executes, programmatically set the snapshot's status to `STALE` or another non-`CURRENT` value. 3. Assert that the `updateMany` call results in 0 rows updated and that the function logs the "superseded" message as designed. |
| **MEDIUM** | The test plan omits verification for the "cache not built yet" indicator logic. | Slice 4 | The plan for `ValuePrioritiesTable` mentions showing an indicator chip when `pooledWinRateExcNeutral` is null, which is complex derived state. Add an integration or component test that provides a mock API response where this condition is met and asserts that the indicator chip is rendered correctly. |
| **MEDIUM** | [UNVERIFIED] The plan does not account for testing the impact of a core function's signature change. | Slice 1 | The plan states `computeCellWeightedDomainRates` will return a new object shape. This is a breaking change to its public contract. The test plan should be expanded to include a verification step (e.g., a codebase search or reviewing call sites) to ensure no other system components that call this function will break. Add tests for any newly identified call sites to ensure they are compatible with the new return type. |
| **LOW** | The test plan for the GraphQL resolver does not explicitly cover the specified null-handling logic. | Slice 2 | Per AD-4, the `winRateExcNeutral` resolver must return `null` if `prioritized + deprioritized` is zero. The Slice 2 test plan does not mention this case. Add an explicit integration test case that queries for a value where the decisive response count is zero and asserts that the `winRateExcNeutral` field is `null`. |
| **LOW** | The frontend component test for the new toggle is incomplete. | Slice 3 | The unit test for `AnalysisContextBar` only verifies rendering and the disabled state. It should also be tested to assert that the `onWinRateModeChange` callback prop is invoked with the correct mode (`'all'` or `'exc-neutral'`) when the user interacts with the toggle. |

## Residual Risks

| Risk ID | Finding | Recommendation |
| :--- | :--- | :--- |
| 1 | Performance verification is manual and not repeatable, creating a risk of future regressions going unnoticed. | Instead of a one-time manual wall-clock comparison, create an automated performance benchmark test. This test should run `refreshDomainAnalysisSnapshot` against a large, version-controlled test dataset and fail if the execution time exceeds a predefined threshold (e.g., 110% of the current baseline). This makes performance testing a repeatable part of the CI/CD process. |
| 2 | Verification for mixed-snapshot pooling logic is manual, leaving it vulnerable to regressions. | The manual verification for `modelsAnalysis` should be converted into an automated integration test. The test should programmatically create a set of domain snapshots in a test database—some with the `valueWinRatesExcNeutral` field and some without. It should then call the resolver and assert that `pooledWinRateExcNeutral` is calculated correctly using only the subset of snapshots that contain the new field. |
| 4 | Verification for backward compatibility with old snapshots is a manual UI check. | This manual check can be automated. Add an integration test that creates a snapshot record using the old schema (lacking `pairwiseNeutrals`). The test should then query the GraphQL endpoint with `excNeutral: true` and assert that the returned `winRateExcNeutralMatrix` is identical to the `winRateMatrix`, confirming the documented fallback behavior. |

## Token Stats

- total_input=14752
- total_output=987
- total_tokens=17695
- `gemini-2.5-pro`: input=14752, output=987, total=17695

## Resolution
- status: accepted
- note: HIGH (missing fallback tests): Accepted. tasks.md adds unit tests for ValuePrioritiesTable, DominanceSection, and DomainShiftsReportSection fallback behavior. MEDIUM (race condition test): Accepted. Integration test will simulate supersede by updating snapshot status before Phase 2. MEDIUM (indicator test): Accepted. Component test added for null pooledWinRateExcNeutral chip. MEDIUM UNVERIFIED (call site check): Accepted. computeCellWeightedDomainRates has one call site (buildSnapshotOutput) which will be updated in Slice 1. LOW (null-denominator test): Accepted. Added to Slice 2 tests. LOW (toggle callback test): Accepted. Added to Slice 3 tests.
