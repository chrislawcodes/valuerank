# Plan: Split Status and Start Pages

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: F-01 HIGH (backfill state clearing): Rejected — backfill mode is driven entirely by URL params, not component state. Navigating away clears the URL; returning loads a fresh page. No stale state possible. F-02 HIGH (misleading banner on depth change): Rejected — adjusting depth is the intended use case. The banner says 'Filling gap for GPT-4o' which remains true regardless of depth. The user is still filling a gap for that model, just to a different depth. F-03 MEDIUM (multiple models): Accepted — clarified in FR-011 that each model gets its own link. Will ensure this is explicit in the plan. F-04 MEDIUM (old bookmark to /run-trials): Rejected — /run-trials was primarily a status/monitoring page, not a launch page. Redirecting to /status is the correct semantic mapping. F-05 MEDIUM (async hook): Rejected [UNVERIFIED] — StatusRedirect already handles this with a loading state and null check. Existing behavior unchanged. F-06 LOW (highlighting mechanism): Rejected — evaluationId in query params auto-selects the evaluation. Already implemented in current code. F-07 LOW (redundant API calls): Rejected — minor optimization, not a spec concern.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: HIGH (loss of confirmation): Rejected — the Start page reuses LaunchConfirmModal which DOES show cost estimates and requires explicit confirmation. The user is not losing a safeguard, they're seeing it on the Start page instead of the Status page. MEDIUM (validation failure): Rejected — already specified in spec FR-003a and edge cases: show error, fall back to fresh-launch mode. MEDIUM (blocked-reason handling): Rejected — the old blocked reasons were about missing saved settings or inactive models, which the Start page will handle via its existing validation (disabled submit button, error messages). The Status page only shows fill-gap links for active models. LOW (hideAdvancedControls): Accepted — the plan does modify LaunchControlsPanel with a new prop. Updated the plan to be consistent about this. It's a minor prop addition, not a structural change. LOW (routing fragmentation): Rejected — StatusRedirect and the /run-trials redirect serve different purposes: one handles /status with no domainId, the other handles legacy /run-trials with a domainId. Not duplicated.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: A-1 CRITICAL (missing backend mutation): Rejected — the backfillDomainEvaluationModels mutation ALREADY EXISTS in the codebase. No backend work needed. This is a frontend-only feature. The reviewer assumed it was new but it's been live since the original backfill UI was built. A-2 HIGH (URL param validation): Rejected — already covered in spec edge cases. Invalid depth defaults to NaN which triggers existing validation. Non-existent model IDs handled by the API which returns an error. B-1 MEDIUM (deferred testing): Accepted — will add build verification to each checkpoint. Each slice already has a verify-build step but will ensure lint+test run at Wave 1 completion. B-2 MEDIUM (gap detection for new models): Rejected — backfill is specifically about filling gaps in an EXISTING evaluation's model set, not adding new models. Adding new models is a fresh launch. C-1 LOW (polling cleanup): Rejected — React's useEffect with setInterval and clearInterval return is standard pattern. The cleanup runs on unmount automatically via the effect's return function. Already implemented this way in the existing code being moved. C-2 LOW (React Router state loss): Rejected — the current code passes evaluationId via URL params, not Router state. No state to lose.

## Architecture Decision

**Approach: Extract-and-split from DomainTrialsDashboard.tsx**

The current 872-line `DomainTrialsDashboard.tsx` contains interleaved state for launch, backfill, and status monitoring. Rather than refactoring in-place, we create two new page components and delete the old one.

No API changes. No new GraphQL operations. No changes to existing child components (`LaunchControlsPanel`, `LaunchConfirmModal`, `DomainEvaluationStatusPanel`, `DomainEvaluationStatusDrawer`). The child components already have clean prop interfaces; they just need different parents.

### File constraint

CI now enforces a **400-line maximum** per file in `cloud/` (via `check-file-sizes.sh`). Each new page must stay under this limit.

## New Files

| File | Purpose | Est. lines |
|---|---|---|
| `cloud/apps/web/src/pages/DomainStartBatches.tsx` | Start page — launch controls, cost estimates, confirm modal, backfill mode | ~300 |
| `cloud/apps/web/src/pages/DomainStatus.tsx` | Status page — evaluation status panel, drawer, polling, fill-gap links | ~250 |

## Modified Files

| File | Change |
|---|---|
| `cloud/apps/web/src/App.tsx` | Add routes for `/domains/:domainId/start` and `/domains/:domainId/status`. Add redirect from `/domains/:domainId/run-trials` to `/domains/:domainId/status` (preserving query params). Remove old `DomainTrialsDashboard` route. |
| `cloud/apps/web/src/pages/StatusRedirect.tsx` | Change redirect target from `/domains/${id}/run-trials` to `/domains/${id}/status`. |
| `cloud/apps/web/src/pages/Domains.tsx` | Update "Add Paired Batches for all Vignettes" link from `/domains/${id}/run-trials` to `/domains/${id}/start`. |

## Deleted Files

| File | Reason |
|---|---|
| `cloud/apps/web/src/pages/DomainTrialsDashboard.tsx` | Replaced by `DomainStartBatches.tsx` + `DomainStatus.tsx` |
| `cloud/apps/web/src/components/domains/domainTrials/BackfillConfirmModal.tsx` | Backfill UI eliminated; Start page handles backfill via prefilled params |

## Component Ownership After Split

```
DomainStartBatches.tsx (new)
├── LaunchControlsPanel       (reused, no changes)
├── LaunchConfirmModal         (reused, no changes)
├── launch-state.ts            (reused, no changes)
└── backfill banner + mode     (new inline logic ~30 lines)

DomainStatus.tsx (new)
├── DomainEvaluationStatusPanel (reused, no changes)
├── DomainEvaluationStatusDrawer (reused, no changes)
├── launch-state.ts              (reused for getBatchRuntimeState)
└── fill-gap link computation    (new inline logic ~40 lines)
```

## State Split

The 872-line dashboard has ~30 state variables. Here's how they divide:

### DomainStartBatches.tsx owns:
- `useDefaultTemperature`, `temperatureInput` — temperature controls
- `maxBudgetEnabled`, `maxBudgetInput` — budget cap
- `targetBatchCountInput` — batch count
- `showLaunchConfirm` — launch modal state
- `runError` — error display
- `planResult`, `estimateResult`, `llmModelsResult` — queries for plan/cost/models
- `startDomainEvaluation` mutation
- `backfillDomainEvaluationModels` mutation (when in backfill mode)
- Backfill mode detection from URL params (`evaluationId`, `models`, `depth`)

### DomainStatus.tsx owns:
- `currentEvaluationId` — which evaluation is selected
- `definitionRunIds` — mapping for status polling
- `selectedRunId` — drawer selection
- `lastStatusUpdatedAt` — polling timestamp
- `showBackfillConfirm` — DELETED (no more backfill modal)
- `selectedBackfillModelId` — DELETED
- `backfillTargetBatchCountInput` — DELETED
- All backfill candidate/coverage/estimate state — DELETED
- `currentEvaluationResult`, `currentEvaluationStatusResult`, `statusResult` — status queries
- `launchesResult` — latest evaluation lookup
- 5-second polling interval

### Neither page needs:
- All backfill-specific state (`backfillCandidates`, `backfillCoverageCounts`, `backfillEstimate`, `backfillBlockedReason`, `selectedBackfillCandidate`, etc.) — DELETED

## Backfill Mode on Start Page

When the Start page receives URL params `?evaluationId=abc&models=gpt-4o&depth=5`:

1. **Parse params** — read `evaluationId`, split `models` by comma, parse `depth` as integer
2. **Fetch evaluation** — use `DOMAIN_EVALUATION_QUERY` to load the evaluation
3. **Validate** — confirm evaluation belongs to the `:domainId` in the path (FR-003a)
4. **Prefill form** — set `targetBatchCountInput` to `depth`, display model name(s) in a read-only banner
5. **On submit** — call `backfillDomainEvaluationModels` instead of `startDomainEvaluation`
6. **On success** — redirect to `/domains/:domainId/status?evaluationId=abc`

The mode switch is a single boolean: `isBackfillMode = evaluationId != null`.

In backfill mode, the `LaunchControlsPanel` hides the temperature and budget cap controls — backfill uses the original evaluation's settings for these. Only the batch depth input is shown and editable. This requires a new `hideAdvancedControls` prop on `LaunchControlsPanel` (or equivalent conditional rendering).

## Fill-Gap Links on Status Page

The Status page needs simplified gap detection (FR-010). For each model in the current evaluation:

1. Count completed batches per (definition, model) pair from `currentEvaluation.members`
2. Compare to `currentEvaluation.targetBatchCount`
3. If any model has fewer batches than target, render a link:
   ```
   /domains/:domainId/start?evaluationId=<id>&models=<modelId>&depth=<target>
   ```

This is ~40 lines of logic — much simpler than the old 150-line backfill candidate machinery because it doesn't need cost estimates, blocked-reason handling, or radio button selection.

## Wave Breakdown

### Wave 1: Create new pages, wire routes (~250 lines changed)
1. Create `DomainStartBatches.tsx` — extract launch state/logic from dashboard
2. Create `DomainStatus.tsx` — extract status state/logic from dashboard
3. Update `App.tsx` — add new routes, add `/run-trials` redirect
4. Update `StatusRedirect.tsx` — change redirect target
5. Update `Domains.tsx` — update button link

### Wave 2: Add backfill mode to Start page (~60 lines changed)
1. Add URL param parsing and backfill mode detection
2. Add domain validation for evaluationId (FR-003a)
3. Add backfill banner UI
4. Hide temperature/budget controls in backfill mode (add prop to `LaunchControlsPanel`)
5. Wire `backfillDomainEvaluationModels` mutation conditionally

### Wave 3: Add fill-gap links to Status page, delete old code (~100 lines changed, ~300 lines deleted)
1. Add simplified gap detection logic
2. Add fill-gap link rendering
3. Delete `DomainTrialsDashboard.tsx`
4. Delete `BackfillConfirmModal.tsx`
5. Remove all backfill-specific imports and dead code

## Risks

| Risk | Mitigation |
|---|---|
| New pages exceed 400-line CI limit | Budget tracked above; Start ~300, Status ~250. If close, extract shared hooks. |
| Backfill mode adds complexity to Start page | Single boolean mode switch. No conditional rendering of sub-components — same `LaunchControlsPanel` in both modes, just different submit handler. |
| Fill-gap links show stale data | Same risk as current backfill UI. API already handles this gracefully (returns `startedRuns=0`). |
