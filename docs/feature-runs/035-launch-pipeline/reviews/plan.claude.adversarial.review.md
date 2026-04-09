# Claude Agent Adversarial Review — Plan (Migration Risk)

**Date**: 2026-04-09

## Findings

1. **Import resolution — FAIL (fixed)**: Node ESM does NOT fall back from `./launch.js` to `./launch/index.js`. Import in `evaluation.ts` updated to `'./launch/index.js'`.
2. **Test coverage — FAIL (accepted)**: Zero tests for the two exported functions. Accepted risk — this is pure code motion with lint+build as safety net.
3. **Intermediate state — FAIL (addressed)**: `launch.ts` and `launch/` can't coexist productively during migration. Rename done atomically in one commit.
4. **GraphQL registration — PASS**: `launch.ts` has no direct GraphQL registrations. Registration happens in `evaluation.ts`.
5. **Re-export completeness — PASS**: Only 2 exports (`launchDomainEvaluation`, `backfillDomainEvaluationModels`), only 1 consumer (`evaluation.ts`).
