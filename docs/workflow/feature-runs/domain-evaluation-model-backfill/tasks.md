# Tasks

1. [CHECKPOINT] Add a backend attach path for evaluation model backfills in `cloud/apps/api/src/graphql/mutations/domain/launch.ts` and `cloud/apps/api/src/graphql/mutations/domain/evaluation.ts`. Implement explicit evaluation targeting, required snapshot validation, single-model backfill launch slots, paired-min missing-depth math, a per-evaluation advisory lock, evaluation reopen behavior, and attachment to the existing `domainEvaluation`. Estimated diff: 220-320 LOC.
2. Update `cloud/apps/api/tests/graphql/mutations/domain.test.ts` to cover successful attach, unsafe-model rejection, and paired missing-depth top-up behavior for the new backfill mutation. Estimated diff: 120-220 LOC.
3. [CHECKPOINT] Extend `cloud/apps/api/src/graphql/queries/domain/evaluation.ts` and `cloud/apps/web/src/api/operations/domains.ts` so evaluation members expose `modelIds`, and add small web-side helpers for computing missing model coverage from the current evaluation plus selected latest vignettes. Estimated diff: 80-140 LOC.
4. [CHECKPOINT] Add a focused backfill UX to `cloud/apps/web/src/pages/DomainTrialsDashboard.tsx` and `cloud/apps/web/src/components/domains/domainTrials/` so users can:
   - see which models are still missing at the current target depth
   - select one or more models from the current evaluation
   - review an explicit confirmation summary before launch
   - confirm and start the attached backfill
   Estimated diff: 180-280 LOC.
5. Update `cloud/apps/web/tests/pages/DomainTrialsDashboard.test.tsx` to cover the backfill panel, disabled states, and the backfill mutation payload. Estimated diff: 100-180 LOC.
6. Verify the focused API and web test files pass:
   - `npm run test --workspace @valuerank/api -- domain.test.ts`
   - `npm run test --workspace @valuerank/web -- DomainTrialsDashboard.test.tsx`
