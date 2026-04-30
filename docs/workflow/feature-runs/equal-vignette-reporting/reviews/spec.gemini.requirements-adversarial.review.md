---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/equal-vignette-reporting/spec.md"
artifact_sha256: "54501ca48c34fb89e2ffeb3685f907d34d7209dd7d0900fba1f9e901656b2648"
repo_root: "."
git_head_sha: "4e2917d11223331dee9f3598a990a883e20e4e04"
git_base_ref: "origin/main"
git_base_sha: "4e2917d11223331dee9f3598a990a883e20e4e04"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/equal-vignette-reporting/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. HIGH: Aggregator Perpetuates Methodological Conflict by Producing Competing Metrics

The core aggregator (`domain-analysis-snapshot-aggregator.ts`) computes and exports metrics using two different methodologies. While it correctly produces `valueWinRates` using the "equal-vignette" weighting defined as canonical in the spec, it also produces a `counts` record using a different logic (sum of per-run-averaged raw counts).

The spec explicitly states the goal is to eliminate disagreement between reporting surfaces caused by different weighting rules, and identifies that UI components currently recompute win rates from pooled counts. By continuing to produce the `counts` data in a format that enables the old, non-canonical calculation, the aggregator itself perpetuates the very problem the feature aims to solve. This makes it highly likely that the old methodology will persist in fallbacks or be accidentally used in future development.

**Evidence:** `[CODE-CONFIRMED]`

-   **Canonical Metric (`valueWinRates`):** The code first calculates a per-vignette mean rate (`meanA`, `meanB`) and then calculates a final mean of those per-vignette rates, correctly implementing the spec's definition.
    ```typescript
    // cloud/apps/api/src/services/analysis/domain-analysis-snapshot-aggregator.ts:251
    const mean = rates.reduce((sum, r) => sum + r, 0) / rates.length;
    winRateMap.set(valueKey, mean * 100);
    ```
-   **Non-Canonical Metric (`counts`):** The code calculates total `counts` by summing per-vignette figures that have been normalized by the run count (`n`). This is a different calculation that does not produce a rate and is the source for the count-based metric the spec intends to deprecate.
    ```typescript
    // cloud/apps/api/src/services/analysis/domain-analysis-snapshot-aggregator.ts:223
    existingFirst.prioritized += acc.first.prioritized / n;
    ```

### 2. MEDIUM: Legacy Fallback Policy Is Ambiguous and Risks Mixing Metrics

The spec fails to commit to a strict policy for handling legacy data that lacks the new `valueWinRates` metric. It describes the preferred outcome as returning `null` to avoid mixing methodologies but allows an "acceptable transitional option" for a fallback.

This ambiguity defers a critical decision and creates a significant risk that the project will adopt the weaker "transitional" path, which directly contradicts the acceptance criteria for user story US-2: "the product does not silently mix methodologies within the same report". By leaving this door open, the spec undermines its primary goal of ensuring a user can trust that a metric means the same thing everywhere.

**Evidence:** `[UNVERIFIED]`

-   The resolver and UI code are not provided, but the spec itself documents the ambiguity and indecision.
-   From `spec.md`, section `modelsAnalysis API resolver`:
    > "decide and implement the correct legacy policy for this feature:
    > - preferred: do not silently mix methodologies within one row...
    > - acceptable transitional option: retain a temporary compatibility fallback..."

### 3. LOW: Silent Data Dropping Masks Potential Upstream Errors

The aggregation logic in `aggregateAnalysisRows` silently skips any analysis rows for which it cannot find corresponding metadata. If a `definitionId` is missing from the `valuePairByDefinition` map or a `runId` is missing from the `filteredSourceRunDefinitionById` map, the loop simply `continue`s without logging or error.

This behavior can hide upstream data integrity problems. Incomplete aggregation would occur without any warning, potentially leading to reports that are subtly incorrect because they are missing data, which would be difficult to debug.

**Evidence:** `[CODE-CONFIRMED]`

-   The code contains multiple `continue` statements that cause silent skipping of rows.
    ```typescript
    // cloud/apps/api/src/services/analysis/domain-analysis-snapshot-aggregator.ts:153
    const definitionId = filteredSourceRunDefinitionById.get(analysisRow.runId);
    if (definitionId == null || definitionId === '') continue;
    const pair = valuePairByDefinition.get(definitionId);
    if (!pair) continue;
    ```

## Residual Risks

1.  **Unverified Data Assumptions:** The spec correctly notes that the implementation should not rely on domains having equal vignette counts. The provided code in `domain-analysis-snapshot-aggregator.ts` appears to follow this principle correctly by implementing equal-vignette weighting. However, the assumption itself ("Domains currently have equal vignette counts") is unverified and, if false, could have implications for other reporting surfaces not covered by this spec.

2.  **Case-Insensitive Key Collision:** The `getValueCountsFromAnalysis` helper uses a case-insensitive lookup to find value data in the analysis output. If a single analysis output record were to contain multiple value keys that differ only in case (e.g., `"power_dominance"` and `"Power_Dominance"`), the `Object.entries().find()` logic would return the first one it encountered, which may lead to non-deterministic data retrieval depending on JavaScript engine implementation. This is a low-probability edge case but represents a minor risk if source data quality is not guaranteed.

## Token Stats

- total_input=17398
- total_output=1168
- total_tokens=21239
- `gemini-2.5-pro`: input=17398, output=1168, total=21239

## Resolution
- status: open
- note: