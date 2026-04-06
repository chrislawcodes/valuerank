# Testing Quality Checklist

**Purpose**: Validate test coverage and quality
**Feature**: [pivot-canonical-fix](../tasks.md)

## Pre-Commit Requirements (per cloud/CLAUDE.md)

- [ ] `npm run lint --workspace @valuerank/web` passes
- [ ] `npm run test --workspace @valuerank/web` passes
- [ ] `npm run build --workspace @valuerank/web` passes (TypeScript must compile)

## Functional Correctness

- [ ] **SC-001**: No pivot cell ever displays a score > 2.0
- [ ] **SC-002**: A cell with all `favor_first + strong` transcripts displays exactly 2.0
- [ ] **SC-003**: Clicking a paired-mode pivot cell navigates with `companionRunId` in the URL
- [ ] **SC-004**: `AnalysisConditionDetail` loaded via a URL with `companionRunId` shows Pooled row with transcripts from both runs
- [ ] **SC-005**: TypeScript build passes with no errors
- [ ] **SC-006**: Web lint passes

## Regression Tests

- [ ] Single-mode vignette: pivot table still renders, scores visible, no crash
- [ ] Single-mode: clicking a cell navigates to condition detail without `companionRunId` (URL should NOT have it)
- [ ] Old URLs without `companionRunId` param: `AnalysisConditionDetail` still discovers companion via `findCompanionPairedRun`
- [ ] Vignettes without `decisionModelV2.canonical` data: cells show `—` (no crash, no NaN)

## Manual Verification (from quickstart.md)

- [ ] Open paired vignette → Scenarios → Pivot table: no score > 2.0
- [ ] Click pivot cell in paired mode → URL has `companionRunId`
- [ ] Detail page Pooled row shows combined count from both orientations
