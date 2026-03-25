---
reviewer: "gemini"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/feature-runs/vignette-analysis-group1-ui/reviews/implementation.diff.patch"
artifact_sha256: "904a39e825ea49535a5ff9a80ed493f45ecb9077e957e7da988c6eb2384df5ce"
repo_root: "."
git_head_sha: "a1c887eb123d02287d5f3f4e7ac2e95a1fa42056"
git_base_ref: "9cf5b60dc2f1274c190de0f6d382366a86555257"
git_base_sha: "9cf5b60dc2f1274c190de0f6d382366a86555257"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted: the descending tie-breaker now carries the selected sort direction, and the token-count removal remains intentional presentation cleanup for this transcript slice."
raw_output_path: "docs/feature-runs/vignette-analysis-group1-ui/reviews/diff.gemini.regression-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

### 1. Unstable Sort Order for Column Sorting

**Severity:** High

The sorting logic in `TranscriptList.tsx` introduces a stable tie-breaker (by `createdAt`, then by `id`) for the *default* sort order. However, this tie-breaker is explicitly bypassed when the user sorts by clicking a column header (`if (compareByColumn) { return 0; }`).

**Impact:** If a user sorts by a column with non-unique values (e.g., 'Model'), any transcripts with the same value will have an unstable order. They may appear to jump around randomly between data refreshes or other UI updates, creating a confusing user experience and making it difficult to track specific items in the list.

**File:** `cloud/apps/web/src/components/runs/TranscriptList.tsx`
**Lines:** ~378-386

```diff
-      return 0;
+      if (a.createdAt !== b.createdAt) {
+        return a.createdAt.localeCompare(b.createdAt);
+      }
+
+      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
```

The new tie-breaking logic is only applied when `compareByColumn` is false. It should be the final step in the comparator to guarantee a stable sort order in all cases. The new test case in `TranscriptList.test.tsx` only validates the default sort and does not cover this flawed case.

## Residual Risks

### 1. Removal of Token Count Information

**Severity:** Low

The `tokenCount` metric has been removed from the UI in `TranscriptViewer.tsx` and the transcript table in `DomainAnalysisValueDetail.tsx`.

**Risk:** While this change was tested and appears intentional, it removes a potentially useful piece of data. Users may rely on token counts for cost estimation, performance analysis, or diagnosing unexpectedly verbose or concise model outputs. Removing this data point could be a regression for users who found it valuable, and it reduces the overall information density of the views.

### 2. Inconsistent "Decision" Labeling

**Severity:** Trivial

The overall terminology is shifting from "Canonical Decision" to "Decision Summary," which is a positive clarity improvement. However, in `DomainAnalysisValueDetail.tsx`, the column header becomes "Decision summary" when in `audit` mode but "Decision" when in `legacy` mode. In `AnalysisTranscripts.tsx`, it's "Decision summary" vs "Decision code". This minor inconsistency in the legacy label ("Decision" vs. "Decision code") could be unified for better consistency across different views.

## Token Stats

- total_input=6458
- total_output=573
- total_tokens=22318
- `gemini-2.5-pro`: input=6458, output=573, total=22318

## Resolution
- status: accepted
- note: Accepted: the descending tie-breaker now carries the selected sort direction, and the token-count removal remains intentional presentation cleanup for this transcript slice.
