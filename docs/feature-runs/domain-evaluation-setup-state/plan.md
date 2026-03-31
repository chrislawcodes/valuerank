# Plan

## Approach

1. Keep the Domain Evaluation page split into a setup state and a live status state.
2. Use the setup state to choose `samplesPerScenario`, verify provider readiness, and confirm the launch.
3. Use the status state to show only live batches, separate exceptions, and a row-level detail view backed by existing run data.
4. Reuse the current launch record as the source of truth for all counts, so completed rows can fall off the live table without breaking the aggregate numbers.

## Architecture

### Setup slice

- `LaunchControlsPanel` remains the primary launch form, but it becomes paired-batch first instead of cohort-history first.
- The paired-batch depth input maps directly to `samplesPerScenario`.
- Provider readiness is computed on the client from existing GraphQL data:
  - `llmModels` for model-to-provider grouping
  - provider health for `remainingBudgetUsd`
  - the current cost estimate for expected spend
- Expected spend is summed per provider before comparing it to `remainingBudgetUsd`.
- The client-side readiness view is only a preview; the `startDomainEvaluation` mutation remains the authoritative launch gate and must repeat the budget/readiness check just before it starts work.
- Launch is blocked when any provider is underfunded, missing a budget signal, or has a budget snapshot older than 10 minutes.
- The mutation returns a specific launch-time failure reason when budgets change between preflight and confirm, using structured codes such as `INSUFFICIENT_BUDGET`, `STALE_BUDGET`, and `PROVIDER_DISABLED`.
- The existing `blockedByActiveLaunch` check stays authoritative for concurrent starts on the same domain.
- The confirm modal restates the paired-batch depth, vignette count, and total individual trial runs for large launches.

### Status slice

- Add a dedicated `DomainEvaluationStatusPanel` that replaces the old launch-status summary as the main live monitor.
- The live table is row-based, not matrix-based.
- Live rows only include batches that are actively moving or still in a live state such as summarizing or analyzing.
- Pending or queued work is not shown until the batch starts actively moving.
- A small header count still shows pending/queued work so the user can see that work is accepted even before it becomes active.
- The status view refreshes every 5 seconds while the current launch still has live or queued work.
- Completed rows fall off the live list once they are terminal.
- A separate exceptions table captures stalled or failed batches.
- If a stalled batch recovers, it moves back into the live table on the next poll; if a failed batch is retried, the new run replaces the failed one in the current launch record.
- Row click opens a detail drawer that fetches the existing `RUN_QUERY` data for the selected `runId` and shows progress, stage, recent task/log-style data, execution metrics, and a direct link to the existing run diagnostics page as a fallback.

### Backend slice

- Extend the domain trial run status query only as far as needed for the live view.
- The current expected augmentation is limited to:
  - `updatedAt`
  - `stalledModels`
  - `analysisStatus`
- The backend remains the authority for whether a batch is stalled, using the existing no-progress threshold already enforced in run diagnostics.
- The frontend may warn when a status snapshot is old, but it must not invent a stall diagnosis from elapsed time alone.
- The budget freshness warning uses the same 10-minute threshold so tests can assert the edge of stale data deterministically.

### Current-launch scoping

- Use the active `domainEvaluationId` / launch record as the current-launch boundary for counts and row membership.
- Keep all setup and status numbers scoped to that launch record only.
- Do not merge earlier launches into the live counts, even if they share the same vignette version or temperature.
- Header counts are snapshot values from the current launch record and the status query, not calculations derived from the visible live rows.

## Risks

- Provider readiness is advisory data until the launch mutation runs, so the UI must surface launch-time failures cleanly if the budget changes between preflight and confirm.
- The budget freshness threshold and the launch-time failure codes must remain stable enough for tests to assert them.
- The live count math depends on the current launch record staying authoritative after completed rows leave the table.
- The row detail drawer depends on existing run data being rich enough to show useful progress and log-style information.
- Pending work is intentionally hidden from the live table, so the header copy must be precise enough that users do not confuse "remaining" with "not yet started."

## Scope Boundary

- Do not add a historical top-up-to-total-across-all-prior-launches contract.
- Do not introduce a dense matrix as the primary status view.
- Do not add a new budget persistence system.
- Do not remove the existing `/domains/:domainId/run-trials` route.

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Spec now blocks stale or missing budget data, revalidates readiness immediately before launch, defines completion and current-launch scoping, and gives completed work a clear diagnostics path.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: The spec now defines paired-batch completion, backend-authoritative stall handling, launch diagnostics after rows fall off the live table, and budget freshness behavior.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Spec now makes current-launch aggregation explicit, excludes pending work from the live table until it is actually moving, and keeps completed work inspectable through launch diagnostics or run detail.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: Resolved by making the backend mutation authoritative for launch readiness, summing provider spend before the compare, surfacing queued work in the header, and grounding the row drawer in the existing run query.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Resolved by defining a 10-minute budget freshness threshold, a 5-second polling cadence, snapshot-based counts, and explicit drawer fallback behavior for missing run data.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Resolved by keeping queued work visible in a header count, using the current launch record for aggregate counts, and basing the drawer on existing run details instead of inferred state.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Resolved by tying launch-failure snapshots to the active launch record, splitting multi-provider budget reporting into provider-level details plus totals, standardizing freshness handling through backend verdicts and shared constants, and keeping live rows limited to batches that are still actively moving.
- review: reviews/diff.gemini.regression-adversarial.review.md | status: accepted | note: Accepted. Orphaned-analysis behavior now uses explicit queue evidence plus the existing completedAt timeout fallback, and legacy aggregate jobs without definitionVersion now match via wildcard compatibility.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: Accepted with residual risk. The refactor still relies on JSONB-backed PgBoss lookups and metadata-based aggregate matching, but those are existing queue-shape tradeoffs for this slice and are now covered by focused tests.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: Accepted. The runAnalysisStatus DataLoader fetches full run rows before calling resolveRunAnalysisStatuses, so the integration concern is resolved in code. Aggregate matching also now supports legacy payloads where definitionVersion is omitted via wildcard behavior.
