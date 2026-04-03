---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/domain-coverage-completeness-guard/spec.md"
artifact_sha256: "2dbac0043c4f1b079409721f49cc5d9e8e2e63cd4234c8dbdfa34ac556afc808"
repo_root: "."
git_head_sha: "7e06a2a7970de5894586516244030f86b6c3fc3e"
git_base_ref: "origin/030-remove-legacy-decision-code"
git_base_sha: "7e06a2a7970de5894586516244030f86b6c3fc3e"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted: the spec now explicitly defines paired-batch rollup, duplicate transcript handling via distinct keys and duplicate counts, and the visible mixed-state cell treatment; the remaining race-condition and UX concerns are residual risks, not blockers."
raw_output_path: "docs/feature-runs/domain-coverage-completeness-guard/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

| Severity | Finding | Recommendation |
| :--- | :--- | :--- |
| **HIGH** | **Ambiguity in Batch Aggregation Logic** | Clarify the aggregation rule for batch-level counts. State explicitly that a batch is counted in `incompleteBatchCount` if *any* of its constituent runs are coverage-incomplete, and is only counted in `batchCount` if *all* of its constituent runs are coverage-complete. |
| The specification is not perfectly explicit about how run-level completeness aggregates into a batch-level count. Product Decision #6 defines a batch as a grouping unit, and Decision #1 defines completeness at the run level. However, the `DomainValueCoverageCell` fields (`batchCount`, `incompleteBatchCount`) imply a batch-level state. It is implied, but not stated, that if a batch contains 10 runs and just one is incomplete, that entire batch contributes 0 to `batchCount` and 1 to `incompleteBatchCount`. This is a critical assumption about the aggregation logic that should be made explicit. |
| **MEDIUM** | **Unspecified Handling of Duplicate Transcripts** | Specify the desired behavior for handling duplicate transcripts. The service should log a warning or increment a dedicated data-quality metric when duplicates for a given key are found. |
| The spec correctly requires that completeness be based on *distinct* keys, not raw row counts, and adds a `duplicateKeyCount` field to the API. However, it does not specify what, if anything, should happen with this information. The existence of duplicates represents a data integrity problem. While they correctly do not contribute to `presentKeyCount`, their presence should ideally trigger a warning or be flagged for review, which is not mentioned. |
| **MEDIUM** | **[UNVERIFIED] Race Condition Potential in Completeness Check** | Specify that the bulk completeness check must be performed within a database transaction with at least `REPEATABLE READ` isolation to ensure a consistent view of the data. |
| Product Decision #9 states that completeness is computed from the current database state. In a system where transcripts can be written or soft-deleted, there is a potential for race conditions. A bulk check that reads from the transcript table could see an inconsistent state if another process adds or deletes a relevant transcript mid-query. This could lead to a temporarily incorrect `coverageComplete` status. The mitigation depends on database transaction logic, which is not in the spec, so this finding is marked as unverified. |
| **LOW** | **Inconsistent Run States Could Be Misleading** | Acknowledge that a batch can contain runs with different `runScenarioSelection` configurations, and confirm that the current aggregation logic is the desired behavior for this edge case. |
| The batch grouping logic (`jobChoiceBatchGroupId`, `pairedBatchGroupId`) is sound, but it's possible for two runs to be part of the same batch while having different expectations (e.g., different model sets or sample counts). This is an upstream data integrity issue, but the coverage system will still have to report on it. The current logic would correctly evaluate each run against its own expectation set, but the resulting "incomplete" status for the batch could be confusing without this context. |
| **LOW** | **Potential UX Confusion in Mixed-State Cells** | Confirm that suppressing the success indicator for cells that contain *both* complete and incomplete batches is the desired user experience, as it may de-emphasize the valid, complete data. |
| The spec states that for a "mixed cell" (one with both `batchCount > 0` and `incompleteBatchCount > 0`), the `amber warning dot` is shown and "the normal success indicator is suppressed". While this correctly flags the presence of incomplete data, it might cause a user to perceive a cell with 99 complete batches and 1 incomplete batch as being entirely problematic, creating an opposite (though less severe) trust problem. |

## Residual Risks

| Risk | Description |
| :--- | :--- |
| **Performance at Scale** | The decision to compute fresh data on every request without caching (Product Decision #9) is good for accuracy but presents a significant performance risk. While AC #8 mandates a "bulk completeness strategy", a sufficiently large query (e.g., thousands of runs, each expecting hundreds of transcripts) against a large transcript table could lead to API timeouts or excessive database load. This may necessitate caching or pre-computation sooner than anticipated. |
| **"Binary Cliff" User Perception** | The all-or-nothing binary counting (Product Decision #1) is logically pure but can be jarring to users. A run that is 99.9% complete (e.g., 999/1000 transcripts present) will contribute `0` to coverage, causing a sharp and potentially confusing drop in reported metrics. The spec correctly identifies this risk; it remains a significant user-experience challenge that communication alone may not fully mitigate. |
| **Legacy Data Burden** | Excluding legacy runs without frozen expectations (Product Decision #7) is the correct and safe approach. However, it creates a risk that a large and important corpus of historical data will become invisible in the primary coverage interface. The burden of running, verifying, and managing the audit/backfill process may be substantial and could leave this data in an "un-countable" state for an extended period. |

## Token Stats

- total_input=2042
- total_output=1135
- total_tokens=18953
- `gemini-2.5-pro`: input=2042, output=1135, total=18953

## Resolution
- status: accepted
- note: Accepted: the spec now explicitly defines paired-batch rollup, duplicate transcript handling via distinct keys and duplicate counts, and the visible mixed-state cell treatment; the remaining race-condition and UX concerns are residual risks, not blockers.
