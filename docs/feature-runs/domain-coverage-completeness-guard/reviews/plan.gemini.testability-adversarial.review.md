---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/domain-coverage-completeness-guard/plan.md"
artifact_sha256: "444816f3feae02738f662797ee438a7d60e79f40381486fe3e17eff818523f09"
repo_root: "."
git_head_sha: "7e06a2a7970de5894586516244030f86b6c3fc3e"
git_base_ref: "origin/030-remove-legacy-decision-code"
git_base_sha: "7e06a2a7970de5894586516244030f86b6c3fc3e"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/feature-runs/domain-coverage-completeness-guard/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

### HIGH: Ambiguity in Paired-Batch Grouping Logic
The plan states that "if any run in a paired batch group is coverage-incomplete, the whole paired batch group is treated as incomplete". This hierarchical grouping logic (`jobChoiceBatchGroupId` > `pairedBatchGroupId` > run) introduces significant testability challenges due to its complexity.

-   **Omitted Cases:** The test plan does not explicitly call for testing the interactions between different incompleteness states within a group. For example, how does the system behave if a group contains one run that is `INCOMPLETE`, another that is `LEGACY_UNAVAILABLE`, and a third that is `EMPTY_EXPECTATION`?
-   **Untested Hierarchy:** The precedence of `jobChoiceBatchGroupId` over `pairedBatchGroupId` must be explicitly tested. A scenario where a run contains both IDs should be created to verify the correct grouping is applied.
-   **Hidden Flaw:** A failure in this grouping logic would lead to incorrect top-line coverage metrics, undermining a primary goal of the feature. The complexity makes it a high-risk area for implementation bugs that unit tests on individual components might miss. A dedicated integration test suite for this specific grouping and rollup logic is required.

### HIGH: Unspecified Behavior for Key-Generation Edge Cases
The plan relies on a "frozen expected key set" derived from `runScenarioSelection`, `models`, and `samplesPerScenario`. It correctly states that an empty set is not coverage-complete. However, it lacks testability for *why* the set is empty.

-   **Weak Assumption:** The system assumes that the source data for key generation is always valid. The test strategy must include cases where this data is invalid or empty.
-   **Omitted Cases:** Test cases must be created to differentiate between a run that is legitimately empty and one that is misconfigured. Specific tests are needed for:
    -   `runScenarioSelection` is `null` or an empty array.
    -   The `models` list in the run configuration is `null` or empty.
    -   `samplesPerScenario` is `0`, `null`, or negative.
-   **Hidden Flaw:** Without these tests, it's impossible to verify that the `EMPTY_EXPECTATION` state is being assigned correctly, which could mask upstream data-integrity or configuration issues from users.

### MEDIUM: Testability of Historical Data Audit and Backfill
The plan defers the backfill process for historical runs and proposes an audit script to identify them.

-   **Hidden Flaw:** The audit script's correctness is difficult to test without a pre-existing, well-understood set of historical data containing known incompleteness. The test environment will need to be seeded with runs that are processing-complete but have specific, known keys missing, which is a non-trivial data setup task.
-   **Weak Assumption:** The plan assumes a backfill will be possible and correct. This is a significant risk. If the backfill logic is flawed, it could permanently corrupt the interpretation of historical runs. The plan to verify the backfill process is absent, making it untestable.
-   **Untested Surfaces:** It is unclear how legacy runs will appear on all new and modified UI/API surfaces (e.g., batch status pages, analysis exports). The plan only mentions a fallback for one component (`CoverageMatrix.tsx`), creating a risk of inconsistent user experiences, error states, or silent failures on other pages.

### [UNVERIFIED] MEDIUM: Complex UI State Permutations
The plan introduces two new booleans (`hasCoverageCompleteRuns`, `hasCoverageIncompleteRuns`) to drive the state of a "signature" in the UI. This creates a matrix of at least four primary states, plus additional states for warnings and links.

-   **Weak Assumption:** The plan assumes the frontend components can gracefully handle this new state complexity. The web testing strategy is described at a high level ("tests for coverage warnings") but lacks the specificity to ensure all permutations are tested.
-   **Omitted Cases:** A rigorous test plan must include component-level tests (e.g., using Storybook or a similar tool) for every state combination to prevent visual or functional bugs. For example:
    -   The `(incomplete only)` label appearing correctly.
    -   The amber warning banner appearing and its link to a filtered view functioning as expected.
    -   The UI behavior when a signature has no runs at all (`false`, `false`).
    -   The correct default signature being selected when the list contains a mix of complete, incomplete, and mixed-state signatures.

## Residual Risks

### Performance Under Load
The plan correctly identifies and mitigates a potential N+1 query pattern by specifying a bulk-loading mechanism. However, a residual risk remains regarding performance at production scale. The three data sets (runs, conditions, transcript keys) could be very large, leading to high memory consumption and slow query times on the API server. This feature could shift the bottleneck from the database to the API instance's memory and CPU resources, a risk that cannot be fully mitigated without performance testing against production-scale data.

### Data Consistency in a Concurrent System
The plan explicitly defers caching and computes completeness on every request. This creates a risk of inconsistent views in a system where data is being written concurrently. A user loading a page could see a run as `INCOMPLETE` because the completeness service ran between the writes of transcript keys 99 and 100. While not data corruption, this can cause user confusion and reduces trust in the UI. The chosen query shape (three separate queries to build the in-memory state) also opens a small window for race conditions where the underlying data could change between queries, leading to a slightly skewed snapshot.

### User Interpretation of "Incomplete"
The plan makes a good decision to separate "processing status" from "coverage completeness". However, there is a residual risk that users will find the distinction confusing. A run that is marked `COMPLETED` in one part of the UI but contributes to an "Incomplete" warning elsewhere may lead to support requests and require additional user education. The binary "all-or-nothing" nature of coverage contribution, while technically correct, may also be surprising to users who expect partial credit. The rollout notes must be exceptionally clear about this change in metrics.

## Token Stats

- total_input=15347
- total_output=1353
- total_tokens=19414
- `gemini-2.5-pro`: input=15347, output=1353, total=19414

## Resolution
- status: open
- note: