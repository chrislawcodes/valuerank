---
reviewer: "gemini"
lens: "operational-risk-adversarial"
stage: "diff"
artifact_path: "docs/feature-runs/analysis-reports-decision-score-phase1/reviews/implementation.diff.patch"
artifact_sha256: "7275845689913c8da68d25a3907093b23a80a61f85a35c681c519d9acf9ae008"
repo_root: "."
git_head_sha: "b3e2d63328dccb036ae789ac1f04a3ce39404f32"
git_base_ref: "origin/codex/domain-analysis-ordering-fix"
git_base_sha: "b3e2d63328dccb036ae789ac1f04a3ce39404f32"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Resolved by switching the shared helper to structured canonical strength bucketing, preserving canonical bucket order, renaming the count column to Unknown Count, and exposing bucket breakdowns in the survey matrix titles/labels instead of parsing the formatted headline string."
raw_output_path: "docs/feature-runs/analysis-reports-decision-score-phase1/reviews/diff.gemini.operational-risk-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff operational-risk-adversarial

## Findings

### 1. **High Risk**: Brittle String-Based Logic for Decision Bucketing

The new `reportDecisionDisplay.ts` utility determines a decision's category by parsing a human-readable string.

```typescript
// cloud/apps/web/src/utils/reportDecisionDisplay.ts
function getBucketKind(headline: string, renderable: boolean): ReportDecisionBucketKind {
  // ...
  return headline.startsWith('Strongly favors ') ? 'strong' : 'lean';
}
```

This creates a high-risk, implicit dependency on the output format of `formatCanonicalDecisionHeadline`. If the wording, spacing, or capitalization of that function's output changes in the future (e.g., "Strongly Favors" or "Favors (Strongly)"), this bucketing logic will fail silently, misclassifying `strong` decisions as `lean`.

**Recommendation**: The bucketing logic should be based on the raw `strength` property (`'strong'`, `'lean'`) from the `transcript.decisionModelV2.canonical` object, not on the formatted display string.

### 2. **Medium Risk**: Ambiguous UI in Condition Detail Table

On the `AnalysisConditionDetail` page, the "Mean" column was removed and replaced with a count of unresolved transcripts. However, the new column header is simply "Unknown".

```diff
- <th ...>Mean</th>
+ <th ...>Unknown</th>
...
- {formatMean(row.summary.mean)}
+ {row.summary.unresolvedCount}
```

This is ambiguous. A user is likely to interpret "Unknown" as the *value* in the column being unknown, not as the column representing a *count of unknown items*. This could easily lead to misinterpretation of the data quality summary.

**Recommendation**: Change the column header to be explicit, such as "Unresolved" or "Unknown Count", to accurately describe its content.

### 3. **Medium Risk**: Oversimplification in Summary Headline Risks Misinterpretation

The new "Decision summary" headline shown on the `AnalysisTranscripts` page is calculated using a strict majority rule (`> 50%`). If a single decision type has more than 50% of the renderable transcripts, it becomes the headline.

This creates two risks:
*   **Hiding Significant Dissent**: A dataset with a 51% / 49% split will be presented with a headline representing only the 51% portion, completely hiding the nearly-equal dissent. A user may incorrectly assume a strong consensus where there is none.
*   **Vague "Mixed" Category**: If no strict majority exists, the headline becomes "Mixed". This term is vague and applies equally to a 50/50 tie and a more complex 40/30/30 split, obscuring the underlying distribution.

**Recommendation**: Consider making the headline more descriptive of the distribution, such as "Majority for X (51%)" or "Plurality for X (40%)", or supplementing the headline with a visible distribution chart.

### 4. **Low Risk**: Unsafe Assumption in Default Case Logic

The `getBucketKind` function assumes that any renderable decision that isn't `strong` or `neutral` must be `lean`.

```typescript
// cloud/apps/web/src/utils/reportDecisionDisplay.ts
function getBucketKind(headline: string, renderable: boolean): ReportDecisionBucketKind {
  // ...
  if (headline === 'Neutral') {
    return 'neutral';
  }

  return headline.startsWith('Strongly favors ') ? 'strong' : 'lean';
}
```

This logic is not future-proof. If a new `strength` category were added to the system (e.g., "Slightly Favors"), it would be incorrectly bucketed as `lean`.

**Recommendation**: The logic should be more explicit, either by checking for "Somewhat favors" or by using a `switch` statement on the underlying `strength` property (as recommended in Finding #1) that includes a `default` case to throw an error for unexpected values.

## Residual Risks

1.  **Incomplete Test Coverage**: The new test suite for `reportDecisionDisplay.test.ts` does not explicitly test the case where all renderable transcripts are `Neutral`. While the logic would likely work, this represents a gap in test coverage for a primary decision category.

2.  **Potential Performance Bottleneck**: The `summarizeReportTranscriptDecisions` function performs multiple iterations over the transcript list within a `useMemo` hook. For pages displaying a very large number of transcripts (e.g., thousands), the computation time for this summary could become noticeable and impact UI responsiveness. The current implementation is not optimized for single-pass processing.

## Token Stats

- total_input=5712
- total_output=1035
- total_tokens=21986
- `gemini-2.5-pro`: input=5712, output=1035, total=21986

## Resolution
- status: accepted
- note: Resolved by switching the shared helper to structured canonical strength bucketing, preserving canonical bucket order, renaming the count column to Unknown Count, and exposing bucket breakdowns in the survey matrix titles/labels instead of parsing the formatted headline string.
