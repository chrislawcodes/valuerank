# Aggregate Service Split Plan

## Scope

Implement the structural split described in [spec.md](/Users/chrislaw/valuerank/docs/workflows/aggregate-service-split/spec.md) without changing aggregate behavior.

This plan is intentionally narrow. It covers the aggregate service extraction only.

## Implementation Steps

1. Confirm the live export surface of `services/analysis/aggregate.ts` with repo search and capture the current consumers that must keep working through the shim.
2. Confirm the current test baseline before refactor:
   - aggregate orchestration behavior
   - compatibility-shim callers such as `zAnalysisOutput`
   - normalized aggregate artifact coverage
3. Create `cloud/apps/api/src/services/analysis/aggregate/`.
4. Move constants, schemas, types, config helpers, and variance helpers into leaf modules.
5. Move `aggregateAnalysesLogic` into `aggregate-logic.ts`, keeping `normalizeAnalysisArtifacts` in its current module and importing it directly.
6. Move `updateAggregateRun` into `update-aggregate-run.ts`, keeping `buildValueOutcomes` with orchestration.
7. Replace `services/analysis/aggregate.ts` with a compatibility shim that preserves the current export surface.
8. Add or extend tests to pin:
   - worker payload construction
   - normalized aggregate output
   - compatibility-shim imports still resolving from the old path
9. Run the required verification suite.
10. Prepare the canonical diff artifact and run the mandatory diff review before merge.

## Constraints

- No aggregate behavior redesign in this PR.
- No barrel file in the aggregate folder.
- No export-surface cleanup in the old module path.
- No import churn outside what is needed for safe compilation and tests.
- No new logic should live in the shim beyond re-exports.

## Verification Suite

Required verification for this plan:

```bash
cd /Users/chrislaw/valuerank/cloud
npm test --workspace=@valuerank/api -- --run tests/services/analysis/aggregate.test.ts
npm test --workspace=@valuerank/api -- --run tests/services/analysis/normalize-analysis-output.test.ts
npm test --workspace=@valuerank/api -- --run tests/services/run/plan-final-trial.test.ts
npm test --workspace=@valuerank/api -- --run src/cli/recompute-aggregates.test.ts
npm test --workspace=@valuerank/api -- --run tests/graphql/queries/analysis.test.ts
npm test --workspace=@valuerank/api -- --run tests/graphql/queries/analysis-cost.test.ts
npm run typecheck --workspace=@valuerank/api
```

If those tests do not directly pin worker payload construction or normalized aggregate output after the extraction, add one focused aggregate-service test in the same PR.

## Review Reconciliation

- spec.codex.architecture.review.md — accepted — no architecture changes needed; preserve shim exports and leaf-to-leaf imports during implementation
- spec.gemini.requirements.review.md — accepted — spec now explicitly keeps `normalizeAnalysisArtifacts` in its current module, makes the fallback focused test mandatory, and marks future `buildValueOutcomes` movement as out of scope
- plan.codex.architecture.review.md — accepted — no architecture changes needed; keep the shim passive and keep the PR structural so rollback stays simple
- plan.gemini.testability.review.md — accepted — plan now captures the pre-refactor baseline, names the required verification suite, and makes shim / worker-payload / normalized-output coverage explicit
- diff.codex.correctness.review.md — accepted — no correctness changes needed after verification; keep the MCP consumer risk as residual follow-up only if a later change touches that path
- diff.gemini.regression.review.md — rejected — findings were generic restatements of “large refactor” rather than concrete regressions; existing targeted tests and typecheck already cover the claimed risk surface
- diff.gemini.quality.review.md — accepted — treat the portability/completeness warning as residual risk only; no additional code change required for this PR

## Ready-To-Implement Gate

Implementation should start only after:

1. The spec dual review is saved under `reviews/` and reconciled here.
2. The plan dual review is saved under `reviews/` and reconciled here.

## Notes

- The pre-work spec that led to this workflow lives at [aggregate-service-split-spec.md](/Users/chrislaw/valuerank/docs/plans/aggregate-service-split-spec.md).
- This workflow folder is now the canonical place for this refactor.
