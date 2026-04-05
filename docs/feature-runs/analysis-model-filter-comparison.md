# Experiment — Analysis Model Filter

## Outputs

- Direct Path: `direct/analysis-model-filter` (local, no PR)
- Feature Factory: `factory/analysis-model-filter` (local, no PR)

## Did Reviews Change The Work?

| Stage | Path | Artifact | artifact_revised | issues_raised | issues_accepted | review_rounds |
|-------|------|----------|-----------------|---------------|-----------------|---------------|
| Spec | Direct Path | spec.md | yes | 3 | 3 | 1 |
| Plan | Direct Path | plan.md | no | 0 | 0 | 1 |
| Tasks | Direct Path | tasks.md | no | 0 | 0 | 1 |
| Implement | Direct Path | code | no | 0 | 0 | 1 |
| Spec | Feature Factory | spec.md | no | 0 | 0 | 0 |
| Plan | Feature Factory | plan.md | no | 0 | 0 | 0 |
| Tasks | Feature Factory | tasks.md | no | 0 | 0 | 0 |
| Implement | Feature Factory | code | yes | 2 | 2 | 1 |

### Direct Path spec issues (all 3 were real):
1. **ConditionDecisionsTable sync bug** — `externalSelectedModels` prop would not sync back to local state. Spec revised to specify a controlled/uncontrolled split; when prop is provided, local state and "AI Columns" dropdown are bypassed.
2. **Missing unit tests** — `ModelFilter.test.tsx` added to scope (12 tests written).
3. **Spurious OverviewTab prop** — `selectedModels` prop on `OverviewTab` was redundant because `AnalysisPanel` already passes `filteredPerModel` as the `perModel` prop. Removed before implementation.

### Feature Factory implement issues (both real):
1. **Lint error** — Raw `<button>` used for "Reset to default". Fixed by using `<Button variant="ghost" size="sm">`.
2. **Stale test assertion** — `AnalysisPanel.test.tsx` checked that "Models" was NOT in the document (leftover from when model summary cards were removed). New filter bar legitimately renders "Models" as a label. Assertion removed.

## Token Efficiency

| Path | Billed Input | Cache Read | Output | Real-Work (billed+output) |
|------|-------------|-----------|--------|--------------------------|
| Direct Path | 236,139 | 13,267,659 | 36,025 | 272,164 |
| Feature Factory | 238,810 | 19,900,116 | 40,400 | 279,210 |

Real-work delta: Factory used ~2.6% more tokens. Cache read delta is larger (Factory read 50% more cache) — likely due to the Factory runner loading additional context files per stage.

## Implementation differences

| Aspect | Direct Path | Feature Factory |
|--------|-------------|-----------------|
| Component name | `ModelFilter.tsx` | `ModelFilterBar.tsx` |
| Unit tests | 12 new (`ModelFilter.test.tsx`) | 0 new (fixed 1 stale assertion) |
| OverviewTab | Not modified (correctly identified as unnecessary) | Modified to accept `selectedModels` prop |
| Tests passing | 1482/1482 | 1497/1497 |

The Direct Path correctly identified that `OverviewTab` didn't need a `selectedModels` prop — `AnalysisPanel` already filters `perModel` before passing it down. The Factory passed the prop anyway.

## Outcome

**Did Feature Factory catch problems the Direct Path missed?** No. Both found real issues, but at different stages. Direct Path caught 3 structural/API issues at spec time. Factory caught 2 implementation-level issues (lint, stale test) that CI would catch anyway.

**Did the extra review steps change the code, scope, or tests?** Direct Path: yes at spec stage (meaningful). Factory: yes at implementation stage (mechanical — lint + test fix).

**Was the extra overhead worth it for this feature?** No. Direct Path added 12 unit tests; Factory added none. Direct Path caught the only non-trivial issue (ConditionDecisionsTable sync behavior) before writing a line of code. Factory's implementation fixes were the kind of issues the build/lint/test gate catches automatically.

**Which path would we choose next time, and why?** Direct Path. This is a pure UI component addition. Direct Path's spec self-review found a real correctness issue (controlled/uncontrolled component pattern) that Factory missed entirely in its doc stages. Factory only caught mechanical issues at implementation time. Consistent with the established pattern: UI work → Direct Path.

**Recommended branch to build on:** `direct/analysis-model-filter` — it has the correct `OverviewTab` behavior and 12 dedicated unit tests.
