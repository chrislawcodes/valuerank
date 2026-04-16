---
reviewer: "gemini"
lens: "quality-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/implementation.diff.patch"
artifact_sha256: "2d6060221efcda0b8a7368f6f62a6d13716e21b91cf01ec000c4cf9a56f5784e"
repo_root: "."
git_head_sha: "0e5ab74009fbc16c351d77668f79cddfc91500d0"
git_base_ref: "adee0cd3"
git_base_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/diff.gemini.quality-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff quality-adversarial

## Findings

The findings are ordered by severity, from highest to lowest.

### 1. **HIGH: Silent Data Loss in Critical Analytics**

-   **`cloud/workers/stats/decision_model.py`:** The function `resolve_transcript_signed_distance` has been stripped of its fallback logic for `legacy.canonicalScore` and `summary.score`. The previous implementation had comments indicating these fallbacks were crucial for compatibility with older transcripts. Removing them means any transcript that has not been perfectly migrated to the new `decisionModelV2.canonical` format will now return `None` for its signed distance. This will silently corrupt downstream statistical analysis by treating scored data as unscored, potentially skewing results or causing failures.
-   **`cloud/apps/web/src/lib/statistics/ks-test.ts`:** The `countsToSample` function no longer handles numeric keys (e.g., `'1'`, `'2'`). The previous implementation explicitly mapped these to scores. If any part of the system still generates distribution counts using numeric keys instead of descriptive ones (`somewhat`, `strongly`, etc.), those data points will be silently dropped from the sample, leading to incorrect Kolmogorov-Smirnov test results.

### 2. **HIGH: High Risk of Incorrect Data Display**

-   **`cloud/apps/web/src/utils/transcriptDecisionModel.ts`**: The function `normalizeLegacyDecisionCode` has been completely removed. Its implementation (`6 - Number(decision)`) suggests it was responsible for inverting a 1-5 score, likely to correct for an inconsistency in how data was stored versus how it should be displayed (e.g., flipping a "favor opponent" score to a "favor self" scale). Removing this client-side correction without 100% certainty that all underlying data has been fixed at the source will cause affected transcripts to display with the wrong meaning (e.g., showing strong agreement instead of strong disagreement).

### 3. **HIGH: Bug in UI Logic Enables Invalid Actions**

-   **`cloud/apps/web/src/components/runs/TranscriptRow.tsx`**: The condition `isAnalyzableDecision` was changed from a specific check `['1', '2', '3', '4', '5'].includes(String(rawDecision))` to a loose check `Boolean(rawDecision)`. The `rawDecision` value can be `'-'` if no decision is found. `Boolean('-')` evaluates to `true`. As a result, a transcript with no valid decision will be considered "analyzable", which in turn makes the decision override UI available (`isDecisionOverrideAllowed`). This could allow users to attempt to modify unscored or un-analyzable transcripts, which may lead to errors or invalid data states.

### 4. **MEDIUM: [UNVERIFIED] UI Components Depend on New, Unverified Data Contracts**

-   **`cloud/apps/web/src/components/domains/ConditionMatrix.tsx`**: The rendering logic was rewritten to depend on new `MatrixCondition` properties: `strongly`, `somewhat`, `opponentSomewhat`, and `opponentStrongly`.
-   **`cloud/apps/web/src/utils/decisionDistributionDisplay.ts`**: The `formatBucketLabel` utility now assumes its `dimensionLabels` input uses descriptive keys (e.g., `somewhat`) instead of the previous numeric keys (e.g., `4`).

If the backend APIs that supply the data for these components have not been updated to provide these new fields and key structures, these UI components will likely fail at runtime or display incorrect/empty data. This is marked as unverified as the data source is not visible in the diff.

### 5. **LOW: Expanded Error Handling Adds Complexity**

-   **`cloud/apps/api/src/server.ts`**: The global error handler was changed to use duck-typing to identify `AppError`-like objects, in addition to the standard `instanceof AppError` check. While this makes the handler more resilient to scenarios where `instanceof` might fail (e.g., across different package versions in a monorepo), it adds complexity. The need for this change may hint at an underlying architectural issue with dependency management that is being papered over, rather than fixed at the root.

### 6. **LOW: [UNVERIFIED] Breaking GraphQL Schema Change**

-   **`cloud/apps/web/schema.graphql`**: The field `rawScore` was removed from the `OrderInvarianceRow` type. This is a breaking API change. While the diff shows updates to some consumers within the web application, it cannot be verified that all consumers (including potentially external ones, or other parts of the frontend) have been updated. Any client still querying for this field will receive a GraphQL error.

## Residual Risks

-   **Incomplete Data Migration:** The entire change set is predicated on the assumption that a data migration from the legacy 1-5 score to the new `direction`/`strength` model has been performed flawlessly. Any transcripts missed by this migration will now either be lost to analysis (per Finding #1) or displayed incorrectly (per Finding #2).
-   **Brittleness to Historical Data:** The removal of multiple fallback paths and data normalization routines makes the system more brittle. If any process ever surfaces historical data that does not conform to the new, strict format, it will be silently ignored or misinterpreted, whereas the previous implementation could handle it gracefully.
-   **Integration Blind Spots:** The changes are wide-ranging, affecting the data worker, API, and frontend. While many related files were updated, there is a risk that some consuming component or client was missed, which would lead to runtime failures that may not be covered by automated testing.

## Token Stats

- total_input=20394
- total_output=1254
- total_tokens=25780
- `gemini-2.5-pro`: input=20394, output=1254, total=25780

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
