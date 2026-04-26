---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/coverage-cell-batch-display/plan.md"
artifact_sha256: "7116531f6ac1d6d549d6a53484a1ac68d98afab9b3bf70d9fdf151a698b41f5a"
repo_root: "."
git_head_sha: "eab6ffbb2ad3a2f01ce5cd3ffa2dfd3c317349e9"
git_base_ref: "origin/main"
git_base_sha: "eab6ffbb2ad3a2f01ce5cd3ffa2dfd3c317349e9"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/coverage-cell-batch-display/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Evidence |
| --- | --- | --- |
| HIGH | **Inconsistent Data Source for Counts:** The plan will result in `batchCount` and `pairedBatchCount` being calculated from a different set of runs than `minTrialCount` and the `modelBreakdown`. `batchCount` will be filtered by runs containing *all* default models, while the `modelBreakdown` will continue to be calculated from all non-aggregate runs. This will cause confusing UI, where a cell might show a `batchCount` of 0, but the popover `modelBreakdown` will show non-zero trial counts. | `[CODE-CONFIRMED]` |
| MEDIUM | **Brittle Direction-Token Matching:** The plan to calculate `aFirstBatchCount` and `bFirstBatchCount` relies on `run.config.jobChoiceValueFirst` being an exact, case-sensitive string match for the canonical value name. The code in `getCoverageDirection` only trims whitespace and does no normalization. Any variation in the data (e.g., different casing) will cause direction data to be silently ignored, leading to incorrect `pairedBatchCount` and `orphanedBatchCount` values. Relying on a manual database check for verification, as the plan suggests, indicates a design that is not robustly testable. | `[CODE-CONFIRMED]` |
| LOW | **Ambiguous Future for `modelIds` Query Argument:** The plan proposes replacing the filter logic based on the `modelIds` GraphQL argument with a new filter based on the domain's `effectiveModelIds`. This makes the `modelIds` argument obsolete for calculating `batchCount`, but the plan is silent on whether the argument should be deprecated or how it should affect other counts (like `incompleteBatchCount`). This ambiguity creates a maintenance and testing burden, as the argument remains in the API signature with unclear effects. | `[UNVERIFIED]` |
| LOW | **Misleading Plan for Frontend Changes:** The plan states it will "remove `minTrialCount` and `maxTrialCount` from display logic", which is an oversimplification. The primary cell label is changed, but the popover retains a "per-model trial breakdown". This description both undersells the UI change and, more importantly, masks the data inconsistency issue identified in the HIGH severity finding, where the retained breakdown will not align with the new primary count. | `[CODE-CONFIRMED]` |

## Residual Risks

1.  **Risk of Confusing Users with Inconsistent Counts:** The most significant risk is deploying with the data inconsistency flaw described in the HIGH finding. Users will see conflicting numbers in the same interface (`batchCount` vs. `modelBreakdown`), which will erode trust in the data presented and likely lead to support requests and bug reports. The fix requires ensuring that the set of runs used to calculate `batchCount`/`pairedBatchCount` is the *exact same set* used to calculate `modelBreakdown` and its associated `min/maxTrialCount`.

2.  **Risk of Silent Data-Quality Failures:** If the brittle direction-token matching is not addressed with a more robust implementation (e.g., case-insensitive or normalized matching), future data quality issues in `run.config.jobChoiceValueFirst` will lead to silent failures. The UI will appear to work correctly but will display inaccurate `pairedBatchCount` and `orphanedBatchCount` values, potentially misleading users about the status of their paired-batch coverage.

3.  **Risk of Incomplete Test Coverage:** The new backend logic is highly dependent on specific combinations of data in `Domain.defaultModelIds`, `Run.config.models`, and `Run.config.jobChoiceValueFirst`. Automated tests will need to be carefully constructed to cover all cases: domains with/without default models, runs with an exact match of models, a subset, a superset, and runs with valid/invalid/mismatched direction tokens. Without this, tests could pass vacuously, leaving the new logic untested in practice.

## Token Stats

- total_input=16765
- total_output=857
- total_tokens=35345
- `gemini-2.5-pro`: input=16765, output=857, total=35345

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
