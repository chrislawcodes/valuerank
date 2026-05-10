# Plan — Feature 037: Paired-Batch Wave 6

The full task plan lives in [`docs/tech-debt/wave6-spec.md`](../../../tech-debt/wave6-spec.md) sections "Implementation tasks" and "Order of changes". This file restates the implementation sequencing and the reasoning behind it for FF.

## Sequencing rationale

1. **Methodology guard test first (Task 1.5).** This is the load-bearing test that locks in the user's research-integrity rule. Writing it first means the test passes against current resolver state and fails on a future regression. If it failed against current state, that would be a Wave 6 blocker — but the resolver math is correct, so it will pass.

2. **New card next (Task 1, in two phases).**
   - Phase A: build `PooledVignetteMetricsCard.tsx` + its test file in isolation. Tests run against urql mocks, no integration yet.
   - Phase B: wire the card into `OverviewSummaryTable.tsx` via `OverviewTab.tsx` ← `AnalysisPanel.tsx`. Visibility rule combines three checks (mirrored tokens AND not aggregate AND API returns data).

3. **Deletions (Tasks 2–3).** Independent; can run before, during, or after the card work.

4. **Glossary + PRD (Task 4).** Doc-only; bundle for the same PR.

5. **Verify (Task 5).** Full preflight before opening PR.

## Risk register

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | New card breaks the Overview tab | Page errors out | Wrap card render in defensive try/catch; visibility-rule check happens first so unknown-state runs simply hide the card |
| 2 | `useRuns({ definitionId })` returns more results than expected (e.g., includes deleted runs) | N count looks wrong in dev | Filter client-side by `status: 'COMPLETED'` and matching signature |
| 3 | Methodology test fails to detect a count-additive regression | Test passes when it shouldn't | Use deliberately lopsided fixture (100 vs 10 trials); assert exact equal-weighted result |
| 4 | Pre-Wave-4 runs without `mirroredRuns` show wrong header counts | Header shows M=0 even when companion runs exist | Acceptable — the empty-mirror message is correct copy for that case. Pre-Wave-4 runs are increasingly rare. |
| 5 | Aggregate-run page accidentally renders the card | Card visible on aggregate analysis | Visibility check #2 (`!isAggregate`) prevents this; covered by component test #6 |

## DO NOT MODIFY (per spec)

`CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `GEMINI.md`, `.gitignore`, `STATUS.md`, `experiments.md`, `docs/tech-debt/wave*.md`, `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts` math, `cloud/apps/web/src/utils/legacyCompanionPairedRun.ts` (deferred to Wave 7).

## DO NOT use

`@ts-ignore`, `eslint-disable`, `as any`.
