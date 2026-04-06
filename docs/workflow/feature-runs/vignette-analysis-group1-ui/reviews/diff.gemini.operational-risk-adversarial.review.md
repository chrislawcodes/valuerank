---
reviewer: "gemini"
lens: "operational-risk-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/vignette-analysis-group1-ui/reviews/implementation.diff.patch"
artifact_sha256: "904a39e825ea49535a5ff9a80ed493f45ecb9077e957e7da988c6eb2384df5ce"
repo_root: "."
git_head_sha: "a1c887eb123d02287d5f3f4e7ac2e95a1fa42056"
git_base_ref: "9cf5b60dc2f1274c190de0f6d382366a86555257"
git_base_sha: "9cf5b60dc2f1274c190de0f6d382366a86555257"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted: the condition detail headers now stay keyed by stable decision codes while showing plain-language labels, and the mixed-data fallback and token-count removal remain intentional per plan."
raw_output_path: "docs/workflow/feature-runs/vignette-analysis-group1-ui/reviews/diff.gemini.operational-risk-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff operational-risk-adversarial

## Findings

### 1. (High) Increased Operational Blindness to Cost and Performance Regressions

The patch removes the `tokenCount` field from two key analysis surfaces: `TranscriptViewer` and the transcript list in `DomainAnalysisValueDetail`.

*   **Risk:** Token count is a primary driver of LLM cost and a key indicator of model performance and verbosity. Removing this data from summary views makes it significantly harder for operators and analysts to spot costly anomalies or performance regressions at a glance. For example, a model update that inadvertently doubles verbosity would now be much harder to detect, as the cost implications would be hidden until an invoice arrives.
*   **Adversarial Case:** A subtle bug in a prompt causes a model to output 10x the normal number of tokens for a specific, rare scenario. This would previously have been obvious as an outlier in the "Tokens" column of a transcript list. Now, an operator would need to manually click into and inspect every transcript, making detection of such costly edge cases unlikely.
*   **Recommendation:** Reinstate the `tokenCount` field in summary list views. If UI clutter is a concern, make it a configurable column. For single-item views like `TranscriptViewer`, the information is low-cost to display and high-value for operational context.

### 2. (Medium) Brittle Sorting Logic with Hidden Data Format Assumptions

The patch introduces a new sorting tie-breaker in `TranscriptList.tsx` that relies on a specific format for transcript IDs. The implementation is `a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' })`.

*   **Risk:** The `numeric: true` option is effective for IDs like `t1`, `t2`, `t10`, but it makes a strong, hidden assumption that all transcript IDs will follow this alphanumeric pattern. If the ID-generation scheme changes in the future (e.g., to UUIDs or a different prefixed format), this sorting logic could fail silently, leading to unpredictable or unstable row ordering. This creates a maintenance risk, as a change in one part of the system (ID generation) could break a seemingly unrelated part (UI sorting) in non-obvious ways.
*   **Adversarial Case:** The backend team changes the ID format from sequential integers (`transcript-123`) to a format with non-numeric components (`transcript-a1b2`, `transcript-c3d4`) or UUIDs. The `numeric: true` flag may lead to inconsistent sorting behavior across different browsers and JavaScript runtimes, breaking the stability the patch intended to add.
*   **Recommendation:** Use a universally stable, format-agnostic tie-breaker. A standard lexicographical comparison (`a.id.localeCompare(b.id)`) is more robust and carries no assumptions about the data's format.

### 3. (Low) Inconsistent Handling of Partial V2 Data Payloads

The new utility function `hasRenderableTranscriptDecisionModelV2` correctly guards against rendering crashes from incomplete `decisionModelV2` data. However, in `TranscriptList.tsx`, this guard is only applied within the 'audit' display mode.

```typescript
// cloud/apps/web/src/components/runs/TranscriptList.tsx

function getTranscriptDecisionValue(
  //...
): string | number {
  if (displayMode === 'audit') {
    if (!hasRenderableTranscriptDecisionModelV2(transcript)) {
      // This correctly falls back for a non-renderable transcript in 'audit' mode.
      return getTranscriptDecisionSortValue(transcript, 'legacy');
    }
    return getTranscriptDecisionSortValue(transcript, displayMode);
  }

  // RISK: Not in 'audit' mode. What if a non-renderable V2 transcript
  // is present? `getTranscriptDecisionSortValue` might be called with
  // a mode of 'legacy' but a transcript that has a partial V2 object.
  return getTranscriptDecisionSortValue(
    transcript,
    displayMode === 'normalized' ? 'normalized' : 'legacy',
  );
}
```

*   **Risk:** The logic does not explicitly handle the case of a non-renderable V2 transcript when `displayMode` is *not* `'audit'`. The `getTranscriptDecisionSortValue` function might receive a transcript with a partial `decisionModelV2` object, which could lead to `TypeError` exceptions if downstream code assumes the object is complete. While the new unit tests for `hasRenderableTranscriptDecisionModelV2` are good, they don't cover its integration and usage paths in all display modes.
*   **Recommendation:** The `hasRenderableTranscriptDecisionModelV2` check should be applied universally at the entry point of the function before any mode-specific logic, ensuring that any transcript with a partial V2 payload is always treated as a 'legacy' transcript for sorting purposes, regardless of the table's overall display mode.

## Residual Risks

*   **Reliance on Developer Discipline:** The system's stability now depends on developers consistently using the `hasRenderableTranscriptDecisionModelV2` guard function instead of a simple truthy check (`if (transcript.decisionModelV2)`). An omission in a future component could re-introduce rendering errors for transcripts with partial V2 data payloads.
*   **Inconsistent String Management:** The patch introduces constants for some UI text (e.g., `CONDITION_COPY`) but renames "Canonical decision" to "Decision summary" via hardcoded strings in multiple components and tests. This creates a risk of future inconsistency if the label needs to be changed again, as a developer might miss one of the locations. A centralized string constant file would mitigate this.

## Token Stats

- total_input=6460
- total_output=1244
- total_tokens=22308
- `gemini-2.5-pro`: input=6460, output=1244, total=22308

## Resolution
- status: accepted
- note: Accepted: the condition detail headers now stay keyed by stable decision codes while showing plain-language labels, and the mixed-data fallback and token-count removal remain intentional per plan.
