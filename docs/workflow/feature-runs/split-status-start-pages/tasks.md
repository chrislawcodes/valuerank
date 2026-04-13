# Tasks: Split Status and Start Pages

## Wave 1: Create new pages, wire routes

### Slice 1.1: Create DomainStatus.tsx (~250 lines, ~250 line diff)

Extract the status/monitoring half of `DomainTrialsDashboard.tsx` into a new page.

- [ ] Create `cloud/apps/web/src/pages/DomainStatus.tsx`
- [ ] Move these state variables from dashboard:
  - `currentEvaluationId`, `definitionRunIds`, `selectedRunId`, `lastStatusUpdatedAt`
  - `planNoContentRetries`, `statusNoContentRetries` (for retry logic)
- [ ] Move these queries:
  - `DOMAIN_EVALUATIONS_QUERY` (to load latest evaluation)
  - `DOMAIN_EVALUATION_QUERY` (current evaluation detail)
  - `DOMAIN_EVALUATION_STATUS_QUERY` (evaluation status)
  - `DOMAIN_TRIAL_RUNS_STATUS_QUERY` (per-run status)
  - `LLM_MODELS_QUERY` (for model display names in gap detection)
- [ ] Move the 5-second polling interval effect
- [ ] Move the `evaluationId` URL param sync effect
- [ ] Move the retry-on-NoContent effects (plan + status)
- [ ] Render `DomainEvaluationStatusPanel` and `DomainEvaluationStatusDrawer`
- [ ] Show domain name header with current launch badge
- [ ] Add "Start new batch" link to `/domains/:domainId/start` at top of page
- [ ] Verify page stays under 400 lines

[CHECKPOINT]

### Slice 1.2: Create DomainStartBatches.tsx (~300 lines, ~300 line diff)

Extract the launch half of `DomainTrialsDashboard.tsx` into a new page.

- [ ] Create `cloud/apps/web/src/pages/DomainStartBatches.tsx`
- [ ] Move these state variables from dashboard:
  - `useDefaultTemperature`, `temperatureInput`
  - `maxBudgetEnabled`, `maxBudgetInput`
  - `targetBatchCountInput`
  - `showLaunchConfirm`, `runError`
- [ ] Move these queries:
  - `DOMAIN_TRIALS_PLAN_QUERY` (plan for domain)
  - `ESTIMATE_DOMAIN_EVALUATION_COST_QUERY` (cost estimates)
  - `LLM_MODELS_QUERY` (model catalog)
- [ ] Move the `startDomainEvaluation` mutation
- [ ] Move `handleStart` function
- [ ] Move `providerBudgetEstimates` computation (uses `buildProviderBudgetEstimates`)
- [ ] Move launch disabled/blocked reason logic
- [ ] Render `LaunchControlsPanel` and `LaunchConfirmModal`
- [ ] On successful launch, redirect to `/domains/:domainId/status?evaluationId=<id>`
- [ ] Show domain name header
- [ ] Verify page stays under 400 lines

[CHECKPOINT]

### Slice 1.3: Wire routes and update links (~80 line diff)

Connect the new pages to the router and update all references to `/run-trials`.

- [ ] Update `cloud/apps/web/src/App.tsx`:
  - Add route `/domains/:domainId/start` → `DomainStartBatches`
  - Add route `/domains/:domainId/status` → `DomainStatus`
  - Change `/domains/:domainId/run-trials` to redirect to `/domains/:domainId/status` preserving query params
  - Remove `DomainTrialsDashboard` import
- [ ] Update `cloud/apps/web/src/pages/StatusRedirect.tsx`:
  - Change redirect from `/domains/${id}/run-trials` to `/domains/${id}/status`
- [ ] Update `cloud/apps/web/src/pages/Domains.tsx`:
  - Change "Add Paired Batches" link from `/domains/${id}/run-trials` to `/domains/${id}/start`
- [ ] Update `cloud/apps/web/src/pages/Dashboard.tsx`:
  - Change link from `/domains/${id}/run-trials` to `/domains/${id}/status`
- [ ] Update `cloud/apps/web/src/pages/DomainAnalysis.tsx`:
  - Change navigate target from `/domains/${id}/run-trials` to `/domains/${id}/status`
- [ ] Update `cloud/apps/web/src/components/layout/NavTabs.tsx`:
  - Change aliases from `['/run-trials']` to `['/run-trials', '/status']`
- [ ] Delete `cloud/apps/web/src/pages/DomainTrialsDashboard.tsx`
- [ ] Grep for any remaining `/run-trials` references and fix them
- [ ] Verify build passes: `npm run build --workspace @valuerank/web`

[CHECKPOINT]

## Wave 2: Add backfill mode to Start page

### Slice 2.1: Backfill mode with URL params (~80 line diff)

Add the ability for the Start page to operate in backfill mode when given URL parameters.

- [ ] In `DomainStartBatches.tsx`, parse URL search params: `evaluationId`, `models` (comma-separated), `depth` (integer)
- [ ] When `evaluationId` is present, set `isBackfillMode = true`
- [ ] Add query for `DOMAIN_EVALUATION_QUERY` to load the evaluation (only when `evaluationId` present)
- [ ] Validate evaluation belongs to the `:domainId` in URL path (FR-003a). On mismatch, show error and fall back to fresh-launch mode
- [ ] Prefill `targetBatchCountInput` from `depth` param
- [ ] Show a banner: "Filling gap for {modelName} in evaluation {evaluationId}"
- [ ] Add `hideAdvancedControls` prop to `LaunchControlsPanel` — when true, hide temperature and budget cap controls
- [ ] Pass `hideAdvancedControls={isBackfillMode}` to `LaunchControlsPanel`
- [ ] Add `backfillDomainEvaluationModels` mutation
- [ ] In submit handler, call `backfillDomainEvaluationModels` when `isBackfillMode`, else `startDomainEvaluation`
- [ ] On success, redirect to `/domains/:domainId/status?evaluationId=<id>`
- [ ] Handle invalid/missing evaluation gracefully (show error, fall back to fresh mode)
- [ ] Verify page stays under 400 lines
- [ ] Verify build passes

[CHECKPOINT]

## Wave 3: Fill-gap links on Status page, delete old code

### Slice 3.1: Add fill-gap links to Status page (~60 line diff)

Add simplified model gap detection and "Fill gap" links to the Status page.

- [ ] In `DomainStatus.tsx`, compute incomplete model coverage:
  - For the current evaluation, count completed batches per (definition, model) pair from `evaluation.members`
  - Compare to `evaluation.targetBatchCount`
  - Build a list of `{ modelId, modelName, missingCount }` for models below target
- [ ] For each model with gaps, render a "Fill gap" link:
  - URL: `/domains/:domainId/start?evaluationId=<id>&models=<modelId>&depth=<target>`
  - Only show for active models (check against model catalog)
- [ ] Verify page stays under 400 lines
- [ ] Verify build passes

[CHECKPOINT]

### Slice 3.2: Delete BackfillConfirmModal and dead code (~300 lines deleted)

Clean up all backfill-specific code that is no longer needed.

- [ ] Delete `cloud/apps/web/src/components/domains/domainTrials/BackfillConfirmModal.tsx`
- [ ] Remove all backfill-related imports from any remaining files
- [ ] Remove backfill-related type definitions if they are no longer used (`BackfillCandidate`, `BackfillGroup`, `coverageKey` function)
- [ ] Grep for `BackfillConfirmModal`, `backfillCandidate`, `backfillCoverage`, `backfillEstimate`, `backfillBlocked` — verify no remaining references
- [ ] Verify build passes: `npm run build --workspace @valuerank/web`
- [ ] Run lint: `npm run lint --workspace @valuerank/web`
- [ ] Run tests: `npm run test --workspace @valuerank/web`

[CHECKPOINT]
