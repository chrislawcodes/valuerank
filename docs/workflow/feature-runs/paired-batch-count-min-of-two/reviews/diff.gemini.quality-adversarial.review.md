---
reviewer: "gemini"
lens: "quality-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/implementation.diff.patch"
artifact_sha256: "f3b88c5ba6d8daf716de6db78e9a0572a81f6005e661118ead203807daa3999d"
repo_root: "."
git_head_sha: "5bf1f43159d498f3f315d9fd7e11ee01afa41624"
git_base_ref: "HEAD~1"
git_base_sha: "127161edbdf3433b548fa27cd52d742bea0d58d6"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (metric divergence) — already explicitly chosen as accepted divergence in spec §5.7 and documented in glossary 'Note on metric divergence within a cell'. Reviewer disagrees with chosen position; this is directional, not implementation. Trial-count fix is deferred per spec §5.7. MED (legacy regression) — addressed in spec §6.4/§7.E1; post-deploy verification plan §9 picks a legacy-only pair to confirm. LOW (corruption heuristic obscures) — chosen position per spec §7.E3 (warn-not-fail to keep operator-visible numbers); follow-up could harden if prod logs show triggers."
raw_output_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/diff.gemini.quality-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff quality-adversarial

## Findings

| Severity | Finding |
| --- | --- |
| **HIGH** | **Semantic Divergence Between Metrics Creates Misleading Data** |
| **MEDIUM** | **[UNVERIFIED] Potential Regression for Legacy Paired Batches** |
| **LOW** | **Data Corruption Heuristic May Obscure Problems** |

---

### **HIGH: Semantic Divergence Between Metrics Creates Misleading Data**

The refactor introduces a significant and potentially misleading divergence between two key cell metrics: `pairedBatchCount` and the trial counts derived for that cell.

1.  The new `pairedBatchCount` is calculated as `min(count_A_first_runs, count_B_first_runs)`. This correctly reflects the number of complete pairs available for analysis.
2.  However, the `computePerModelTrialCounts` path was intentionally left unchanged. It uses `deduplicateRunsByGroupId`, which selects only **one** surviving run per launch group.

The result is that for a perfectly healthy paired batch (one `A-first` and one `B-first` run in the same group `g1`), the API will report:
*   `pairedBatchCount: 1` (Correct)
*   `minTrialCount`: The trial count from *only one* of those two runs.

This is a data integrity issue from the consumer's perspective. If a consumer sees `pairedBatchCount: 1` and `minTrialCount: 5`, they will reasonably assume that the pair of runs generated 5 trials. In reality, the pair generated 10 trials, and the API is silently showing only half the data. This violates the principle of least surprise and could lead to incorrect analysis by users who are not aware of this hidden implementation detail.

While this behavior is explicitly tested in `I2 — Metric divergence`, testing that the divergence exists does not make it correct. The explicit comment `// healthy paired batches do not double their displayed trial counts` frames this as a feature, but from an adversarial perspective, it's a bug: the trial count for a pair *should* reflect the work of both runs in the pair.

### **MEDIUM: [UNVERIFIED] Potential Regression for Legacy Paired Batches**

The previous implementation for calculating `pairedBatchCount` contained fallback logic for runs that did not have a modern `jobChoiceBatchGroupId`. The old code in `domain-coverage.ts` included this block:

```typescript
if (pairedBatchGroupId === null) {
  pairedBatchCountByDefinitionId.set(
    run.definitionId,
    (pairedBatchCountByDefinitionId.get(run.definitionId) ?? 0) + 1,
  );
  continue;
}
```

The new implementation has been completely rewritten to depend on `getCoverageDirection(run.config)`, which requires the `jobChoiceValueFirst` property. Runs without this property will return `null` and be completely excluded from the new `pairedBatchCount` calculation.

This constitutes a potential regression. If there are legacy runs that were previously considered "paired" (perhaps by virtue of being companions in the same launch) but lack the `jobChoiceValueFirst` config property, their contribution to `pairedBatchCount` will now be zeroed out. This could cause historical data on the coverage grid to change unexpectedly.

### **LOW: Data Corruption Heuristic May Obscure Problems**

In the event that a single cell contains runs claiming more than two distinct `jobChoiceValueFirst` directions (e.g., `A-first`, `B-first`, and `C-first`), the new logic logs a server-side warning and then calculates `pairedBatchCount` based on the `min` of the two largest direction counts.

While logging is good, this heuristic hides the data integrity problem from the end-user. The user will see a non-zero `pairedBatchCount` and be unaware that the underlying data for the cell is corrupted or misconfigured. A safer, less ambiguous approach would be to return `pairedBatchCount: 0` for any cell with >2 directions. This would make the data problem visible to the user in the UI (as a missing value) and force an investigation, rather than presenting a potentially invalid number.

## Residual Risks

*   **Incorrect User Analysis:** The primary residual risk is that users of the UI or API will draw incorrect conclusions based on the trial counts shown for paired-batch cells. Because the API knowingly and intentionally underreports trial counts for healthy pairs, any analysis that relies on this number is flawed.
*   **Silent Data Invalidation:** If legacy data exists that relied on the old `pairedBatchCount` logic (as described in the MEDIUM severity finding), this change will silently invalidate that historical metric without any warning to the user or operator. The numbers on the grid will simply change.

## Token Stats

- total_input=21357
- total_output=1028
- total_tokens=24657
- `gemini-2.5-pro`: input=21357, output=1028, total=24657

## Resolution
- status: accepted
- note: HIGH (metric divergence) — already explicitly chosen as accepted divergence in spec §5.7 and documented in glossary 'Note on metric divergence within a cell'. Reviewer disagrees with chosen position; this is directional, not implementation. Trial-count fix is deferred per spec §5.7. MED (legacy regression) — addressed in spec §6.4/§7.E1; post-deploy verification plan §9 picks a legacy-only pair to confirm. LOW (corruption heuristic obscures) — chosen position per spec §7.E3 (warn-not-fail to keep operator-visible numbers); follow-up could harden if prod logs show triggers.
