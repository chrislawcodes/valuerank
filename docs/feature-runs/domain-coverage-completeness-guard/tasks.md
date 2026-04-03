# Tasks: Domain Coverage Completeness Guard

The shared helper groundwork is already in place. These slices finish wiring it
through the remaining coverage surfaces and add the audit script.

## Slice 1 [CHECKPOINT]

Finish the backend completeness service and make recovery use it consistently.

**Type:** backend plumbing

**Estimated diff size:** 180-240 lines

**Files**

- `cloud/apps/api/src/services/run/coverage-completeness.ts`
- `cloud/apps/api/src/services/run/recovery.ts`
- `cloud/apps/api/tests/services/run/coverage-completeness.test.ts`

**Work**

1. Keep the shared helper pure and focused on expected-vs-present transcript
   keys.
2. Make the recovery path reuse the shared helper instead of any private
   missing-key logic.
3. Cover the important edge cases in tests:
   - distinct keys
   - duplicate transcript rows
   - soft-deleted transcripts
   - empty expected-key sets
   - historical runs without frozen expectations

**Verification**

- `cd cloud && npm run test --workspace @valuerank/api -- tests/services/run/coverage-completeness.test.ts tests/services/run/recovery.test.ts`

---

## Slice 2 [CHECKPOINT]

Update the backend coverage and status queries so they count only
coverage-complete data and expose the new completeness fields.

**Type:** backend query plumbing

**Estimated diff size:** 240-320 lines

**Files**

- `cloud/apps/api/src/graphql/queries/domain-coverage.ts`
- `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`
- `cloud/apps/api/src/graphql/queries/domain/planning.ts`
- `cloud/apps/api/src/graphql/queries/domain/planning-utils.ts`
- `cloud/apps/api/src/graphql/queries/domain/shared.ts`
- `cloud/apps/api/src/services/domain.ts`
- `cloud/apps/api/src/graphql/queries/__tests__/domain-coverage.test.ts`

**Work**

1. Keep the batch-count and paired-batch-count rules aligned with the shared
   completeness service.
2. Expose incomplete-run metadata for coverage cells that need it.
3. Add the new signature availability booleans and batch-status completeness
   fields.
4. Keep the batch-status and coverage-counting rules on the same transcript
   source and soft-delete rule.
5. Add query tests for:
   - complete-only cells
   - mixed complete/incomplete cells
   - incomplete-only signatures
   - batch-status completeness fields

**Verification**

- `cd cloud && npm run test --workspace @valuerank/api -- src/graphql/queries/__tests__/domain-coverage.test.ts`
- `cd cloud && npx eslint apps/api/src/graphql/queries/domain-coverage.ts apps/api/src/graphql/queries/domain-coverage-utils.ts apps/api/src/graphql/queries/domain/planning.ts apps/api/src/graphql/queries/domain/planning-utils.ts apps/api/src/graphql/queries/domain/shared.ts apps/api/src/services/domain.ts`

---

## Slice 3 [CHECKPOINT]

Update the frontend coverage and batch-status surfaces so incomplete data is
visible instead of silent.

**Type:** frontend UI

**Estimated diff size:** 240-320 lines

**Files**

- `cloud/apps/web/src/components/domains/CoverageMatrix.tsx`
- `cloud/apps/web/src/components/domains/CoverageCell.tsx`
- `cloud/apps/web/src/components/domains/coverageMatrixHelpers.ts`
- `cloud/apps/web/src/components/domains/domainTrials/DomainEvaluationStatusPanel.tsx`
- `cloud/apps/web/src/components/domains/domainTrials/DomainEvaluationStatusPanel.helpers.ts`
- `cloud/apps/web/src/api/operations/domainCoverage.ts`
- `cloud/apps/web/src/api/operations/domainAnalysis.ts`
- `cloud/apps/web/tests/pages/DomainTrialsDashboard.test.tsx`
- `cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx`

**Work**

1. Show the amber warning dot and amber popover line for incomplete batches.
2. Label incomplete-only signatures clearly and show the warning banner when a
   user selects one.
3. Keep the aggregate analysis drill-down available for complete cells and
   hide it when incomplete data would make it misleading.
4. Show coverage completeness separately from processing progress in the batch
   status panel.
5. Add or update tests for:
   - incomplete cell warnings
   - incomplete-only signature labeling
   - filtered batch-status link behavior
   - batch-status coverage completeness display

**Verification**

- `cd cloud && npm run typecheck --workspace @valuerank/web`
- `cd cloud && npm run test --workspace @valuerank/web -- tests/pages/DomainTrialsDashboard.test.tsx tests/pages/DomainAnalysisValueDetail.test.tsx`

---

## Slice 4 [CHECKPOINT]

Add the read-only historical audit script and finish the rollout bookkeeping.

**Type:** audit + rollout

**Estimated diff size:** 120-180 lines

**Files**

- `cloud/scripts/audit-domain-coverage-completeness.ts`
- `STATUS.md`
- `docs/feature-runs/domain-coverage-completeness-guard/closeout.md`

**Work**

1. Add a read-only script that lists processing-complete but coverage-incomplete
   runs.
2. Make the output easy to inspect before any repair or rerun action.
3. Update `STATUS.md` with the feature state once the slices are complete.
4. Write the closeout summary after the implementation is finished.

**Verification**

- `cd cloud && npm run audit:domain-coverage-completeness`
- `git diff -- docs/feature-runs/domain-coverage-completeness-guard docs/STATUS.md`

---

## Final Validation

After all slices:

- `cd cloud && npm run test --workspace @valuerank/api`
- `cd cloud && npm run test --workspace @valuerank/web`
- `cd cloud && npm run typecheck --workspace @valuerank/web`
- `cd cloud && npx eslint apps/api/src/services/run/recovery.ts apps/api/src/services/run/coverage-completeness.ts apps/api/src/graphql/queries/domain-coverage.ts apps/api/src/graphql/queries/domain-coverage-utils.ts apps/api/src/graphql/queries/domain/planning.ts apps/api/src/graphql/queries/domain/planning-utils.ts apps/api/src/graphql/queries/domain/shared.ts apps/api/src/services/domain.ts apps/web/src/components/domains/CoverageMatrix.tsx apps/web/src/components/domains/CoverageCell.tsx apps/web/src/components/domains/coverageMatrixHelpers.ts apps/web/src/components/domains/domainTrials/DomainEvaluationStatusPanel.tsx apps/web/src/components/domains/domainTrials/DomainEvaluationStatusPanel.helpers.ts`
