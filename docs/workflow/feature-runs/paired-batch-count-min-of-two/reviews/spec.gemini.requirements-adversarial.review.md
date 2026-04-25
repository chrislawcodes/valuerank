---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/spec.md"
artifact_sha256: "8f52757dc3aa429f52e376eec42ab8818aceb9d6539785ce3133e10fff15c5fc"
repo_root: "."
git_head_sha: "2cd6635c7bf0a0007e9f2c340a95e21779560a8b"
git_base_ref: "origin/main"
git_base_sha: "2cd6635c7bf0a0007e9f2c340a95e21779560a8b"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (inconsistent paired-batch vs trial-count) — already explicitly chosen as accepted divergence in §5.7. Glossary now adds 'Note on metric divergence within a cell' that explains the within-cell asymmetry. MED (paired-batch guard) and MED (glossary disambiguation) — addressed via that new glossary note. LOW (getCoverageBatchIncrement dead code) — out of scope, flagged for closeout."
raw_output_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### HIGH

1.  **Inconsistent Data Aggregation Between Paired Batch and Trial Counts.** The core logic for `pairedBatchCount` and `minTrialCount` will operate on different underlying datasets. The new algorithm for `pairedBatchCount` uses "loose pairing" to count all complete A-first and B-first runs, taking the minimum. However, the `minTrialCount` calculation still uses `deduplicateRunsByGroupId`, which selects a single "survivor" run from each launch group (e.g., from a complete pair, it uses either the A-first or B-first run, but not both). As a result, an operator looking at a cell will see a `pairedBatchCount` derived from one set of runs and a `minTrialCount` derived from a subset of those runs. This fundamental inconsistency could lead to significant confusion, as it is not intuitive that half the data from every healthy pair is excluded from the trial count. [CODE-CONFIRMED]
    *   **Evidence:** The spec confirms in §5.7 that `computePerModelTrialCounts` is unchanged and is called with data from `deduplicateRunsByGroupId` (`domain-coverage.ts:399`). `domain-coverage-utils.ts:167` shows that `deduplicateRunsByGroupId` discards one of two companion runs. The new `pairedBatchCount` algorithm in §5.4 does not do this, instead counting runs from both directions.

### MEDIUM

1.  **Algorithm Assumes Any Run with `jobChoiceValueFirst` is a Paired Run.** The proposed direction-extraction logic (`getCoverageDirection` in §5.2) checks only for the existence of the `jobChoiceValueFirst` field in a run's config. It does not validate that the run was part of a `PAIRED_BATCH` launch. This makes it possible for a standard or ad-hoc run, if launched with a `jobChoiceValueFirst` field in its `configExtras`, to be incorrectly counted towards `pairedBatchCount`. While existing launch paths in `lifecycle.ts` only add this field for paired batches, relying on this convention without explicit validation in the read path is a weak assumption. [CODE-CONFIRMED]
    *   **Evidence:** The launch logic in `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts:125-146` shows `jobChoiceValueFirst` and `jobChoiceBatchGroupId` are added for `PAIRED_BATCH` mode. However, the `startRun` service it calls accepts arbitrary `configExtras`. The proposed algorithm in spec §5.2 does not include a check on `jobChoiceLaunchMode`.
2.  **Glossary Update Obscures Trial Count Inconsistency.** The proposed glossary update in §5.8 correctly distinguishes between the "launch-time" and "display-time" concepts of a "Paired Batch." However, it fails to mention that `minTrialCount` is still based on the launch-time concept (a single survivor per group), while `pairedBatchCount` uses the new display-time concept (all pairable runs). By omitting this detail, the glossary creates a new ambiguity where the relationship between metrics in the same UI component is unclear. [CODE-CONFIRMED]
    *   **Evidence:** The spec's description of the trial count path (§5.7) and the existing implementation of `deduplicateRunsByGroupId` in `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts` confirm `trialCount` is based on a surviving run. The proposed glossary text in §5.8 does not reflect this nuance.

### LOW

1.  **Unused Function Creates Maintenance Overhead.** The function `getCoverageBatchIncrement` and its corresponding tests in `domain-coverage.test.ts` are not used anywhere in the `domain-coverage.ts` logic, yet the function appears directly relevant. The spec (§11, R3 #3) acknowledges this as pre-existing debt and defers removal. However, modifying files that contain apparently-relevant but-unused code and tests increases the risk of developer confusion and adds to test maintenance burden. [CODE-CONFIRMED]
    *   **Evidence:** The file `cloud/apps/api/src/graphql/queries/domain-coverage.ts` does not contain any calls to `getCoverageBatchIncrement`. The tests for it exist in `cloud/apps/api/tests/graphql/queries/domain-coverage.test.ts`, suggesting it is live code.

## Residual Risks

1.  **Loose Pairing May Compare Dissimilar Runs.** The spec explicitly chooses a "loose pairing" model (§2a), which allows pairing runs from different launch events. The justification is that operator-driven configurations are "generally consistent." This is an untested assumption. If parameters like `temperature` or `models` differ between an A-first run from one launch and a B-first run from another, any subsequent order-bias analysis would be invalid, comparing apples to oranges.
2.  **UI Fallback Logic Will Create a Confusing Display.** The spec notes in §2b that the UI has a fallback: if `pairedBatchCount` is 0, it displays `batchCount`. Under the new logic, a launch with only one of two pairs completing will have `pairedBatchCount = 0` but `batchCount = 1`. The operator will see "1 batch" in the cell but "0 paired batches" in the popover, which is a confusing and unintuitive state for what was intended as a paired launch. Deferring this UI change misses an opportunity to improve clarity and creates a potentially misleading display.

## Token Stats

- total_input=53326
- total_output=1224
- total_tokens=58629
- `gemini-2.5-pro`: input=53326, output=1224, total=58629

## Resolution
- status: accepted
- note: HIGH (inconsistent paired-batch vs trial-count) — already explicitly chosen as accepted divergence in §5.7. Glossary now adds 'Note on metric divergence within a cell' that explains the within-cell asymmetry. MED (paired-batch guard) and MED (glossary disambiguation) — addressed via that new glossary note. LOW (getCoverageBatchIncrement dead code) — out of scope, flagged for closeout.
