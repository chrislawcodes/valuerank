---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/full-pvq-survey/plan.md"
artifact_sha256: "883c6c75b23949e2ce6151d1d29a3aabd3a9f5e226e6962c01d056260e4a4a8f"
repo_root: "."
git_head_sha: "597508be0050a106dddfaa1bc4d6b1a4443993af"
git_base_ref: "origin/main"
git_base_sha: "597508be0050a106dddfaa1bc4d6b1a4443993af"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (aggregation logic untestable in resolver): FIXED — AD-2 updated, all aggregation extracted to pure computeSchwartzAverages() in pvq-aggregator.ts; pvq-aggregator.test.ts added to file map. MEDIUM 1 (ambiguous deletion strategy): FIXED — deleteFullPvq now mandates single strategy: analysisPlan.deletedAt only; all fullPvq* queries filter on this. MEDIUM 2 (buildFullPvqPrompt not tested): FIXED — pvq-prompt.test.ts snapshot tests added to file map and Wave 5. MEDIUM 3 (createFullPvq not transactional): FIXED — Wave 1 createFullPvq now wraps all DB writes in $transaction. LOW (incomplete parser tests): FIXED — Wave 5 expanded with case-insensitivity, whitespace, preamble, float, zero, and negative cases."
raw_output_path: "docs/workflow/feature-runs/full-pvq-survey/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

### HIGH: Core Aggregation Logic is Untestable

The plan places the most complex and critical calculation logic—computing Schwartz category averages from parsed scores—inside the `fullPvqResults` GraphQL resolver (AD-2). Resolvers are integration points, making them extremely difficult to unit-test in isolation.

-   **Problem:** There is no planned unit testing for the aggregation, grouping, and averaging logic itself, only for the upstream parser. A bug in how scores are grouped by category, how refused trials are excluded from averages, or how means are calculated would not be caught by any test outlined in Wave 5.
-   **Impact:** This creates a high risk of silently corrupted analytics. An incorrect average (e.g., due to an off-by-one error or miscalculating the denominator after refusals) would be displayed to users as a valid result.
-   **Recommendation:** Extract all calculation and aggregation logic from the resolver into a new, pure utility function: `calculateSchwartzAverages(trials: ParsedTrial[]): AggregatedResults`. This function can then be exhaustively unit-tested with various combinations of clean and refused trials.

### MEDIUM: Ambiguous Deletion Strategy Creates Risk of Data Leakage

The plan for `deleteFullPvq` is dangerously ambiguous: "use `analysisPlan.deletedAt` timestamp field or hide via query filter." A test plan cannot be built on an "or". If two different deletion strategies are implemented, or if a single strategy is not applied universally, "deleted" data can leak into other results.

-   **Problem:** The test plan (Wave 5) includes no cases for verifying that deleted surveys and their associated trials are excluded from `fullPvqSurveys` and `fullPvqResults`.
-   **Impact:** If a developer later adds a new query and forgets to apply the "query filter" method, deleted surveys will reappear. If the `deletedAt` field is used, every single query must be tested to ensure it includes `WHERE deletedAt IS NULL`. Failure to do so could lead to deleted data being included in aggregate results, corrupting metrics.
-   **Recommendation:** Mandate a single soft-delete strategy (e.g., `analysisPlan.deletedAt`). Add explicit integration test cases to verify that a deleted survey and all its associated data are excluded from every single new `fullPvq*` query.

### MEDIUM: Critical Prompt Generation is Not Covered by Tests

The `buildFullPvqPrompt` function is arguably the most sensitive part of the entire feature. It constructs the exact text sent to the model. The parser's strictness (AD-3) means a tiny, accidental change to this prompt (e.g., changing `Q1:` to `Q1.`) would cause 100% of trials to be marked as refused.

-   **Problem:** The plan includes no unit or snapshot tests for the output of `buildFullPvqPrompt`.
-   **Impact:** A developer "improving" the prompt's wording could unknowingly break all data collection for this feature. Since there are no tests, this would not be caught by CI and would only be discovered in production when all trials fail.
-   **Recommendation:** Add snapshot tests for `buildFullPvqPrompt`. The test should generate the prompt for each framing and compare it against a stored "known good" version, failing the build if the output changes unexpectedly.

### MEDIUM: [UNVERIFIED] Lack of Transactional Integrity Testing

The `createFullPvq` mutation performs multiple database writes: creating an `Experiment`, two `Definitions`, and two `Scenarios`. This is a multi-step transaction.

-   **Problem:** The plan does not mention whether these operations are wrapped in a database transaction or how to handle or test for partial failure (e.g., the second `Definition` fails to be created).
-   **Impact:** A partial failure could leave orphaned database records and put the survey into an inconsistent, unrecoverable state that may cause queries to fail later.
-   **Recommendation:** The `createFullPvq` logic should be wrapped in a single database transaction. While testing rollback logic can be difficult, the test plan should at least include a test for the "happy path" where all records are created, and a test verifying that invalid input (e.g., empty name) results in *no* records being created.

### LOW: Incomplete Parser Test Coverage

The test cases listed for `pvq-parser.test.ts` are a good start but fail to cover common, predictable model output variations and edge cases that the strict regex will encounter.

-   **Problem:** The planned tests only cover the ideal format and a few logical failures (missing, non-numeric, out-of-range). They don't test the parser's resilience to formatting quirks.
-   **Impact:** The parser may be more brittle than necessary, leading to an inflated number of "refused" trials if a model uses a slightly different but still valid format.
-   **Recommendation:** Add the following test cases to `pvq-parser.test.ts`:
    -   Case-insensitivity: `q1: 5`
    -   Extra whitespace around the colon: `Q1 : 5`
    -   Floating point numbers: `Q1: 5.0` (should be rejected by `[1-6]`)
    -   Model preamble/postamble: Test a multi-line string with text before the first `Q1:` and after `Q40:`.
    -   Zero or negative numbers: `Q1: 0`, `Q1: -2` (should be rejected).

## Residual Risks

-   **Inconsistent States without E2E Testing:** The plan relies on unit and integration tests, but no end-to-end (E2E) tests are proposed. A risk remains that the components, while correct in isolation, do not function together. For example, the `definitionId` selected by the UI in Wave 2 might not be the `definitionId` the API query in Wave 1 expects, a mismatch that isolated tests would not catch.
-   **Manual Performance Verification is Not Repeatable:** The plan's verification for performance degradation (AD-2) and UI rendering load (Risk #4) relies on manual, one-off checks. This risk is "verified" but not "solved". Any future change could re-introduce performance issues that will not be caught by the automated test suite, as no automated performance or load tests are being added.
-   **[UNVERPIRED] Test Setup Unspecified:** The frontend test plan (Wave 5) assumes a working and low-friction method for mocking GraphQL queries. If the project's current testing infrastructure does not easily support this, the effort required for Wave 5 could be significantly higher than estimated, or tests will be skipped, leaving the UI untested.

## Token Stats

- total_input=338
- total_output=1466
- total_tokens=21487
- `gemini-2.5-pro`: input=338, output=1466, total=21487

## Resolution
- status: accepted
- note: HIGH (aggregation logic untestable in resolver): FIXED — AD-2 updated, all aggregation extracted to pure computeSchwartzAverages() in pvq-aggregator.ts; pvq-aggregator.test.ts added to file map. MEDIUM 1 (ambiguous deletion strategy): FIXED — deleteFullPvq now mandates single strategy: analysisPlan.deletedAt only; all fullPvq* queries filter on this. MEDIUM 2 (buildFullPvqPrompt not tested): FIXED — pvq-prompt.test.ts snapshot tests added to file map and Wave 5. MEDIUM 3 (createFullPvq not transactional): FIXED — Wave 1 createFullPvq now wraps all DB writes in $transaction. LOW (incomplete parser tests): FIXED — Wave 5 expanded with case-insensitivity, whitespace, preamble, float, zero, and negative cases.
