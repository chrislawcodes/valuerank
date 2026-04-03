# Plan: Domain Coverage Completeness Guard

**Branch**: `TBD` | **Date**: 2026-04-03 | **Spec**: [spec.md](./spec.md)

## Recommendation

Fix reporting truth first.

The safest path is to separate:

- processing status
- coverage completeness

Then make coverage surfaces use coverage completeness instead of trusting `status = COMPLETED`.

## Architecture Decision

Use one shared run completeness service as the source of truth for whether a run should count toward coverage.

This service should compute completeness from:

- selected conditions for the run, from `runScenarioSelection`
- models in the run config
- `samplesPerScenario`
- distinct transcript keys present with `deletedAt: null`

The expected key set is frozen at run creation time from that persisted run configuration so later catalog changes cannot rewrite completeness history.

The service should expose two entry points:

- single-run completeness, for recovery and audits
- bulk completeness, for coverage and batch-status queries

## Settled Decisions

### 1. Counting is binary

If a run is missing even one expected transcript key, it contributes zero to coverage counts.

There is no partial credit in `batchCount` or `pairedBatchCount`.

### 2. Incomplete runs stay visible

Incomplete runs do not count toward coverage, but the UI must still show that they exist.

### 3. Completeness uses distinct keys

Completeness is based on distinct `(scenarioId, modelId, sampleIndex)` keys, not raw transcript totals.

This prevents duplicate transcript rows from masking missing keys.

The bulk completeness service must also preserve the existing paired-batch dedupe rule used by coverage counts:

- respect `jobChoiceBatchGroupId` / `pairedBatchGroupId`
- count each paired batch group once for paired batch metrics
- keep `batchCount` and `pairedBatchCount` math aligned with the existing coverage query
- if any run in a paired batch group is coverage-incomplete, the whole paired batch group is treated as incomplete for coverage-counting purposes

Batch grouping follows the same hierarchy as the current coverage query:

- `jobChoiceBatchGroupId` when present
- otherwise `pairedBatchGroupId` when present
- otherwise the run itself

### 4. Soft deletes are respected

All completeness paths use transcripts with `deletedAt: null`.

### 5. This feature does not redefine `RunStatus`

For this feature, a run may still be processing-complete while coverage-incomplete.

The fix is:

- do not trust `RunStatus` as proof of coverage
- show coverage completeness explicitly where coverage is reported

### 6. Launch-estimate batch counts remain a follow-up

This feature does not change the launch planning estimate surface that reports `existingBatchCount`.

That surface still reflects processing-status history, not coverage completeness. If we want launch estimates to surface coverage completeness later, that is a separate follow-up slice.

### 7. Historical runs without frozen expectations are excluded until backfilled

If a historical run does not have a persisted `runScenarioSelection`, the completeness service must not guess. Those runs are excluded from coverage counts and listed by the audit script until they are backfilled or otherwise repaired.

### 8. Empty expected-key sets are not coverage-complete

If the frozen expected key set for a run is empty, the run is not coverage-complete and does not count toward coverage totals.

### 9. Completeness checks read fresh data

Completeness results are computed from the current database state for each request. The first version of this feature does not cache coverage-complete results.

## File Map

| File | Planned change |
|---|---|
| `cloud/apps/api/src/services/run/coverage-completeness.ts` | New shared completeness service with single-run and bulk entry points |
| `cloud/apps/api/src/services/run/recovery.ts` | Reuse the shared completeness service instead of a private missing-key implementation |
| `cloud/apps/api/src/graphql/queries/domain-coverage.ts` | Count only coverage-complete runs and expose incomplete-run metadata per cell |
| `cloud/apps/api/src/graphql/queries/domain/planning.ts` | Use shared completeness data for batch status and make the signature picker honest |
| `cloud/apps/api/src/graphql/queries/domain/shared.ts` | Update shared signature-resolution helpers so analysis and exports do not keep assuming `COMPLETED` is enough |
| `cloud/apps/api/src/services/domain.ts` | Reuse the shared completeness rule in analysis/detail/export paths that depend on the shared domain helpers |
| `cloud/apps/web/src/components/domains/CoverageMatrix.tsx` | Show incomplete-run warnings in the coverage UI |
| `cloud/apps/web/src/components/domains/domainTrials/DomainEvaluationStatusPanel.tsx` | Show coverage completeness separately from processing status |
| `cloud/apps/web/src/api/operations/domainCoverage.ts` | Add new coverage metadata fields |
| `cloud/apps/web/src/api/operations/domainAnalysis.ts` | Add any signature metadata needed for incomplete-only labeling |
| `cloud/apps/api/src/scripts/` | Add a read-only audit script for historical processing-complete but coverage-incomplete runs |

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Accepted: the spec already makes the completeness check bulk-based and records the on-demand performance tradeoff as a residual risk; the batch-integrity, mixed-cell UI, and aggregate-link concerns are all explicitly scoped in the spec's product decisions and concrete UI behavior.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: Accepted: the spec now explicitly defines paired-batch rollup, duplicate transcript handling via distinct keys and duplicate counts, and the visible mixed-state cell treatment; the remaining race-condition and UX concerns are residual risks, not blockers.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Accepted: the tasks now point at the root STATUS.md file, wire the audit script into package.json, and keep the verification steps aligned with the actual repo layout and script entry points.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Accepted: the spec already defines the batch-group rollup rule, adds completeness-aware signature states, and deliberately uses coverageState != COMPLETE for the incomplete-data drill-down so the review's remaining concerns are covered by the current spec or explicit residual risks.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: deferred | note: Deferred by design: this feature intentionally separates processing-complete from coverage-complete. The lifecycle fix is out of scope for this slice, and the plan documents that split explicitly.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Accepted: the plan now preserves paired-batch dedupe semantics, keeps the recovery service aligned with the shared completeness rule, and explicitly defers launch-estimate coverage counts as a follow-up so the testability burden stays bounded to the reporting surfaces in scope.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Accepted: the plan intentionally keeps historical runs without persisted runScenarioSelection out of live coverage totals and routes them through the audit script instead of inventing a third live state; the paired-batch and bulk-loading behavior are bounded by the explicit coverageState fields and the bulk-query decision already recorded in the plan.

## New API Fields

These names are fixed for implementation unless a later review explicitly changes them.

### `DomainValueCoverageCell`

| Field | Type | Notes |
|---|---|---|
| `incompleteBatchCount` | `Int!` | Counts excluded incomplete batches using the same batch-depth math as `batchCount` |
| `incompleteRunCount` | `Int!` | Count of coverage-incomplete runs for the cell |

Rule:

- populate these fields for every cell that has at least one incomplete run, even if the cell also has complete runs

### `DomainAvailableSignature`

| Field | Type | Notes |
|---|---|---|
| `hasCoverageCompleteRuns` | `Boolean!` | Drives normal enabled behavior |
| `hasCoverageIncompleteRuns` | `Boolean!` | Drives incomplete-only labeling and warning state |

Rule:

- if `hasCoverageCompleteRuns = false` and `hasCoverageIncompleteRuns = true`, the option label gets the suffix ` (incomplete only)`
- if the picker has at least one coverage-complete option, prefer a coverage-complete option as the default
- if every available signature is incomplete-only, use a deliberate incomplete-only fallback and show the warning banner instead of leaving the matrix blank
- if the selected signature has any incomplete runs, the UI shows an amber warning banner above the matrix
- the warning banner includes a direct link to a filtered batch-status view for the incomplete runs behind that signature

### Domain batch status row

| Field | Type | Notes |
|---|---|---|
| `coverageComplete` | `Boolean!` | Separate from processing status |
| `coverageState` | `String!` | One of `COMPLETE`, `INCOMPLETE`, `LEGACY_UNAVAILABLE`, or `EMPTY_EXPECTATION`. |
| `expectedKeyCount` | `Int!` | Distinct expected keys |
| `presentKeyCount` | `Int!` | Distinct present keys |
| `missingKeyCount` | `Int!` | Expected minus present |
| `duplicateKeyCount` | `Int!` | Extra rows beyond the distinct-key set |
| `missingModelIds` | `[String!]!` | Any model with at least one missing key |

## Query Shape Decision

Do not implement completeness by calling a helper once per run from domain queries.

That would create an N+1 query pattern and become expensive on larger domains.

Instead, the bulk completeness path should:

1. load the relevant runs in one query
2. load selected conditions for those runs in one query
3. load distinct transcript keys for those runs in one query, filtered by `deletedAt: null`
4. compute completeness in memory

This keeps the completeness rule centralized without adding one extra database round-trip per run.

`domainAvailableSignatures` performance rule:

- do not scan all transcripts for a domain without first narrowing to candidate run IDs from the latest-definition run set
- compute completeness booleans from that candidate run set only
- aggregate to signature-level booleans in memory
- allow early exit per signature once both `hasCoverageCompleteRuns` and `hasCoverageIncompleteRuns` are known

## Consistency Decision

The new shared service must agree with existing batch-status transcript counts in `domain/planning.ts`.

That means:

- the same soft-delete rule
- the same model list source
- the same selected-condition source

If coverage and batch status use different counting rules, the feature fails.

Batch status presentation rule:

- coverage counts and summarization counts are different concepts and must be shown in separate UI language
- `presentKeyCount` does not replace existing summarization telemetry
- the status panel should show a dedicated coverage section for `expected/present/missing`
- existing summarization totals stay in the processing section and should not be relabeled as coverage

Aggregate analysis link rule:

- if a cell has any incomplete runs, do not render the aggregate analysis link at all
- aggregate runs never affect counted coverage
- the incomplete-run metadata is aggregated across all definitions folded into the cell, even though `definitionId` still points at the primary drill-down target

## Completion Write-Path Inventory

This feature does not change `RunStatus` semantics, but the implementation should still document the places that write `status = COMPLETED` for run lifecycle code:

- `cloud/apps/api/src/services/run/progress.ts`
- `cloud/apps/api/src/queue/handlers/summarize-persistence.ts`
- `cloud/apps/api/src/services/run/recovery.ts`
- `cloud/apps/api/src/services/run/summarization.ts`

Why this still matters:

- these paths should not be treated as proof of coverage completeness
- future lifecycle cleanup should centralize them behind one finalizer

That lifecycle cleanup is a follow-up, not required for this reporting fix.

## Wave Breakdown

### Wave 1: Shared completeness service

Create the new completeness service with:

- single-run entry point
- bulk entry point
- distinct-key logic
- `deletedAt: null` handling
- duplicate detection
- tests for one-sample, multi-sample, missing-key, and duplicate-key cases

This wave should also define the shared return shape, including:

- `coverageComplete`
- `expectedKeyCount`
- `presentKeyCount`
- `missingKeyCount`
- `duplicateKeyCount`
- `missingModelIds`

### Wave 2: Honest API surfaces

Update backend coverage-related queries to use the shared completeness service:

- `domainValueCoverage`
- coverage-page signature availability
- domain batch status

This wave should ensure:

- complete counts remain accurate
- incomplete runs do not count
- incomplete-only signatures are explainable
- batch status and coverage stay consistent
- cells with both complete and incomplete runs still return incomplete metadata
- `aggregateRunId` remains available for drill-down even when incomplete runs exist

### Wave 3: UI visibility

Update the frontend so incomplete data is visible instead of silent.

Coverage UI should:

- keep the complete counts
- show when incomplete runs exist for a cell or signature
- render an amber warning dot in any cell where `incompleteBatchCount > 0`
- render an amber popover line for incomplete batches not counted
- label the analysis link with `incomplete data` when the cell has incomplete runs

Batch status UI should:

- show processing status
- show coverage completeness
- show missing counts and affected models

Legacy compatibility rule:

- if `CoverageMatrix.tsx` falls back to the legacy coverage query path, the UI must show a clear message that incomplete-run metadata is unavailable in that environment
- the legacy path must not silently imply that no incomplete data exists

### Wave 4: Historical audit

Add a read-only audit script that finds runs that are:

- processing-complete
- but coverage-incomplete

The script should produce a list that is easy to inspect before any repair or rerun action is taken.

## Testing Strategy

### Backend

- unit tests for the completeness service
- tests for distinct-key handling
- tests for duplicate-key handling
- tests for soft-delete handling
- query tests for `domainValueCoverage`
- query tests for signature availability
- query tests for batch status consistency

### Web

- tests for coverage warnings when incomplete runs exist
- tests for incomplete-only signature states
- tests for batch status display of missing counts and affected models

## Rollout Plan

1. Land the shared completeness service and tests.
2. Land the backend query changes for coverage, signatures, and batch status.
3. Land the frontend visibility changes.
4. Run the read-only production audit.
5. Review audit results and decide whether follow-up repair or rerun work is needed.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Coverage numbers drop in a surprising way | High | Call out binary counting in rollout notes and verify expected production deltas |
| Bulk completeness logic becomes slow | Medium | Use a bulk query shape, not per-run queries |
| Duplicate transcript rows create confusing totals | Medium | Report distinct-key coverage and duplicate-key counts separately |
| UI still hides the problem | Medium | Make incomplete runs visible in both the cell and signature flows |

## Deferred Follow-Up

This feature deliberately does not change the meaning of `RunStatus`.

A future follow-up can decide whether to:

- centralize all run finalization writes behind one gate
- persist coverage completeness on the run
- add a dedicated lifecycle state for processing-complete but coverage-incomplete runs

Those are valid follow-up ideas, but they are not required to make Domain Coverage honest now.

## Recommended First Slice

The first implementation slice should be:

- build the shared completeness service
- test the distinct-key and soft-delete rules
- wire `domainValueCoverage` to use bulk completeness and return incomplete-run metadata

That gives the fastest path to fixing the misleading report while staying aligned with the review.
