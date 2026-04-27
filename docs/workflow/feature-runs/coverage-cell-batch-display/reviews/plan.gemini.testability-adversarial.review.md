---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/coverage-cell-batch-display/plan.md"
artifact_sha256: "fe8cece0f5f003224ec65cb46794adce0820f07d76b3a1d1240a51db0bcf0469"
repo_root: "."
git_head_sha: "0842af56c8b34162a05e3b010f28873378ec6bb2"
git_base_ref: "origin/main"
git_base_sha: "eab6ffbb2ad3a2f01ce5cd3ffa2dfd3c317349e9"
generation_method: "gemini-cli"
resolution_status: "rejected"
resolution_note: "All findings are false positives or intentional design — no code changes required; see Resolution section"
raw_output_path: "docs/workflow/feature-runs/coverage-cell-batch-display/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

### 1. Inconsistent Trial Counts Due to Incorrect Filter Order
**Severity:** HIGH
**Evidence:** `[CODE-CONFIRMED]`

The plan correctly states that the new model-set filter must gate all per-run counters symmetrically, including `nonAggregateRunsByDefinitionId`, to ensure consistency between the main `batchCount` and the per-model trial counts shown in the UI popover.

However, the provided code in `domain-coverage.ts` does not follow this critical instruction. `nonAggregateRunsByDefinitionId` is populated for every non-aggregate run *before* the `matchesEffectiveModelSet` filter is applied. Runs that fail the model-set filter check are correctly excluded from `batchCount`, but they are incorrectly included in the `nonAggregateRunsByDefinitionId` map.

As a result, `computePerModelTrialCounts` is called with a set of runs that is larger than and inconsistent with the set used for the primary `batchCount`. This will cause the UI to display a `batchCount` based on the filtered set, but a `modelBreakdown` in the popover that includes trials from runs that were filtered out, creating a confusing and misleading user experience.

- **Location:** In `cloud/apps/api/src/graphql/queries/domain-coverage.ts`, the population of `nonAggregateRunsByDefinitionId` (lines 251-253) occurs before the `matchesEffectiveModelSet` filter check (lines 262-265). The `continue` statement on line 265 does not prevent the map from having already been populated.

### 2. Silent Data Loss from Case-Sensitive Direction Matching
**Severity:** MEDIUM
**Evidence:** `[CODE-CONFIRMED]`

The plan identifies a risk that `jobChoiceValueFirst` tokens from run configs may not exactly match the canonical value names, leading to lost directional data. The proposed verification is a manual database query.

This risk is not fully mitigated by the code. The `getCoverageDirection` utility function only trims whitespace from the token and does not normalize its case. The subsequent lookup in `selectPrimaryDefinitionCounts` (`merged.get(valueA)`) is case-sensitive. If a run's config has `jobChoiceValueFirst: "benevolence"` but the code is checking for `"Benevolence"`, the match will fail and this directional run will not be counted in `aFirstBatchCount` or `bFirstBatchCount`.

This leads to a fragile implementation that can silently under-report directional coverage if there are even minor casing inconsistencies in the data. While the plan's manual verification is a good backstop, the code should be more resilient. A test case with mismatched casing would fail against the current implementation.

- **Location:** In `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`, `getCoverageDirection` (lines 258-265) lacks case normalization.

## Residual Risks

The plan's "Residual Risks" section is well-considered. From a testability and verification perspective:

1.  **Batch counts will visibly drop:** The proposed manual verification of querying production before and after is appropriate for a one-time change. It correctly identifies the impact on the user. For ongoing testability, a snapshot test on the GQL query's output against a seeded test database would be a more robust, automated way to ensure future changes don't unexpectedly alter these counts.

2.  **`jobChoiceValueFirst` token mismatch:** As detailed in Finding #2 above, this risk is high, and the code does not fully mitigate it. The proposed manual verification via a `SELECT DISTINCT` query is a critical and necessary step before deployment, as it will reveal the extent of the potential data loss with the current case-sensitive implementation.

3.  **Legacy query compatibility:** The plan's reasoning here is sound. Relying on the TypeScript compiler to fail if the GraphQL fragment for `DomainValueCoverageCell` is not updated for both the modern and legacy queries is a reliable, automated verification strategy. The shared result type `DomainValueCoverageQueryResult` enforces this at compile time.

## Token Stats

- total_input=17524
- total_output=889
- total_tokens=37382
- `gemini-2.5-pro`: input=17524, output=889, total=37382

## Resolution
- status: rejected
- note: All findings are false positives or intentional design — no code changes required; see Resolution section
Finding 1 (HIGH) — FALSE POSITIVE. Gemini cited lines 251-253 / 262-265 from the plan-stage diff,
    but the actual implementation places nonAggregateRunsByDefinitionId population at lines 247-249,
    which is after all three filter gates: aggregate-run skip (line 222), matchesEffectiveModelSet
    (line 230), and matchesModelFilter (line 240). Code-confirmed correct in final implementation.

    Finding 2 (MEDIUM, case sensitivity) — captured as Residual Risk 2 in the plan. Pre-merge
    verification V2 (SELECT DISTINCT jobChoiceValueFirst from prod DB) will surface any real
    casing divergence before deploy. No code change warranted without evidence of actual mismatch.