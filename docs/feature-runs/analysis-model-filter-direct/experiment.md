# Experiment: Analysis Model Filter — Direct Path

| Stage | Artifact | stage_started_at | stage_finished_at | artifact_before_sha256 | artifact_after_sha256 | review_rounds | issues_raised | issues_accepted | artifact_revised | token_usage | cost_usage |
|-------|----------|------------------|-------------------|------------------------|-----------------------|---------------|---------------|-----------------|------------------|-------------|------------|
| Spec | spec.md | 2026-04-04T04:37:48Z | 2026-04-04T04:45:00Z | 8b8fbaef5aea6f8ebab6d87362b0e9aa940066ed2f9368a5a42747b6d4f944df | 411c8cd240e80bf3a4c66c198cd71c13ad6a885443de2223a8d4469a1183aa38 | 1 | 3 | 3 | yes | — | — |
| Plan | plan.md | 2026-04-04T04:45:00Z | 2026-04-04T04:50:00Z | e8f0af3638311e831ee28fb2df1bfb366829134aa7b61a1d062441f7cf90f74f | e8f0af3638311e831ee28fb2df1bfb366829134aa7b61a1d062441f7cf90f74f | 1 | 0 | 0 | no | — | — |
| Tasks | tasks.md | 2026-04-04T04:50:00Z | 2026-04-04T04:52:00Z | 44bd2a3850de0e7597a8d2be1bfd43d757459f958174cd40a036c74afb58a657 | 44bd2a3850de0e7597a8d2be1bfd43d757459f958174cd40a036c74afb58a657 | 1 | 0 | 0 | no | — | — |
| Implement | code | 2026-04-04T04:52:00Z | 2026-04-04T05:20:00Z | be5383ec (base SHA before changes) | 010c119a38bc9c92490c4bfa293d845d42db45f1baf7c6f3ed68fd34e46f9a5d (diff SHA) | 1 | 0 | 0 | no | — | — |

## Implementation Review Notes

No issues found. Implementation matched the plan. The OOM error in the full test run is a pre-existing infrastructure issue (worker memory limit). All 12 ModelFilter tests pass in isolation; all 1482 pre-existing tests also pass.

---

## Spec Review Notes

Issues raised and accepted:
1. **ConditionDecisionsTable sync bug** — Local `selectedModels` state does not sync when `externalSelectedModels` prop changes. Fixed: spec now specifies a controlled/uncontrolled split; when `externalSelectedModels` is provided, local state is bypassed and the "AI Columns" dropdown is hidden.
2. **Missing ModelFilter unit test file** — Added `ModelFilter.test.tsx` to scope with 7 test cases.
3. **Spurious OverviewTab prop** — Original spec added `selectedModels` prop to `OverviewTab` redundantly. Removed: `AnalysisPanel` already passes `filteredPerModel` as the `perModel` prop, so no change needed in `OverviewTab`.
