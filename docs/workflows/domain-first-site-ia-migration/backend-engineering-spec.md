# Domain-First Site IA Backend Engineering Spec

Generated: 2026-03-15

## Goal

Define the backend and integration work required to safely complete the remaining domain-first IA waves:

1. `Wave 3: Runs And Domain Evaluation`
2. `Wave 4: Findings And Auditable Interpretation`
3. `Wave 5: Validation And Cross-Domain Reporting`
4. `Wave 6: Archive And Legacy Retirement`

This document is the engineering counterpart to:

1. [spec.md](/Users/chrislaw/valuerank/docs/workflows/domain-first-site-ia-migration/spec.md)
2. [plan.md](/Users/chrislaw/valuerank/docs/workflows/domain-first-site-ia-migration/plan.md)
3. [domain-first-site-ia-plan.md](/Users/chrislaw/valuerank/docs/plans/domain-first-site-ia-plan.md)

It is intentionally implementation-facing. It answers:

1. what must change in the data model
2. what queries and mutations must exist
3. what migration rules preserve historical truth
4. what backend gates must pass before each remaining wave can ship

## Non-Goals

This spec does not:

1. redesign the front-end IA again
2. define pixel-level UI behavior already covered in [spec.md](/Users/chrislaw/valuerank/docs/workflows/domain-first-site-ia-migration/spec.md)
3. force a big-bang rewrite of runs, analysis, surveys, or assumptions
4. require every historical record to be perfectly normalized on day one

## Current Backend Reality

These constraints are real in the current checkout and must be treated as design inputs:

1. `Run` is persisted per vignette through `Run.definitionId`, not per domain.
2. `Definition.domainId` is mutable, so current domain membership is not safe historical provenance.
3. `runs(...)` filtering supports `definitionId`, `experimentId`, `status`, `analysisStatus`, and `runType = ALL | SURVEY | NON_SURVEY`, but not `domainId`.
4. `runType` in queries is currently a survey/non-survey filter, not a workflow category like pilot or production.
5. assumptions exclusion currently depends on the reserved `assumption-run` tag pattern.
6. `DomainContext` and `ValueStatement` are domain-owned records, not global reusable assets.
7. launch-time snapshotting is incomplete for auditable findings. FK references alone are not enough.
8. cost estimation is primarily definition-scoped and not yet a true domain-evaluation estimate.
9. `Experiment` still exists and is referenced by `Run.experimentId` and `RunComparison.experimentId`.
10. survey identity still relies partly on naming/convention behavior in the existing stack.

## Design Principles

1. Do not invent a backend object in UI copy before it exists in the database or service layer.
2. Preserve historical truth separately from present-day grouping.
3. Prefer additive schema changes and dual-read compatibility before destructive cleanup.
4. Default to explicit unknown states instead of heuristic relabeling.
5. Make auditable findings depend on real snapshot completeness, not UI optimism.
6. Keep execution truth, reporting truth, and compatibility routing separable.

## Target Backend Capabilities

The remaining waves need six concrete capabilities:

1. immutable domain-evaluation provenance
2. domain-grouped run querying and status aggregation
3. first-class workflow run categorization
4. complete launch snapshotting for findings eligibility
5. cross-domain validation reporting over the right categories
6. explicit legacy/archive classification rules that do not depend on weak naming heuristics

## Workstream 1: Domain Evaluation Provenance

### Problem

The product needs `Domain Evaluation Summary`, grouped domain history, and stable cohort membership. Today that cannot be reconstructed safely from `Definition.domainId`.

### Decision

Add an explicit persisted launch/cohort object rather than leaving domain evaluation as a purely synthetic front-end grouping.

### Recommended Model

Introduce a new persisted model, referred to here as `DomainEvaluation`.

Minimum fields:

1. `id`
2. `domainId`
3. `domainNameAtLaunch`
4. `scopeCategory`
   - `PILOT`
   - `PRODUCTION`
   - `REPLICATION`
   - `VALIDATION`
5. `status`
   - aggregated launch/cohort status
6. `configSnapshot`
   - cohort-level launch request and guardrails
7. `createdAt`
8. `startedAt`
9. `completedAt`
10. `createdByUserId`

Add a join model, referred to here as `DomainEvaluationRun`, with:

1. `domainEvaluationId`
2. `runId`
3. `definitionIdAtLaunch`
4. `definitionNameAtLaunch`
5. `domainIdAtLaunch`
6. `createdAt`

### Why a Real Model

Without a real `DomainEvaluation` record:

1. `Domain Evaluation Summary` has no durable identity
2. domain-grouped history can drift when definitions move
3. cohort-level status has to be recomputed from loosely grouped runs each time
4. troubleshooting launch failures becomes much harder

### Minimum APIs

Queries:

1. `domainEvaluations(domainId, scopeCategory?, status?, limit, offset)`
2. `domainEvaluation(id)`
3. `domainEvaluationStatus(id)`

Mutations:

1. `startDomainEvaluation(input)`
2. `retryDomainEvaluationMember(input)`
3. `cancelDomainEvaluation(input)` if cancellation is supported

### Interim Compatibility Rule

Until the new model exists:

1. `/domains/:domainId/run-trials` remains a compatibility flow
2. `Domains > Runs` may show present-day grouping only
3. it must not be described as authoritative cohort history

## Workstream 2: Run Categorization

### Problem

The product now needs categories like pilot, production, replication, validation-oriented, and unknown legacy. Existing `runType` is not that concept.

### Decision

Add a first-class workflow category on `Run` and preserve current survey/non-survey filtering as a separate concern.

### Recommended Schema Change

Add `runCategory` to `Run`.

Values:

1. `PILOT`
2. `PRODUCTION`
3. `REPLICATION`
4. `VALIDATION`
5. `UNKNOWN_LEGACY`

Do not overload the current `runType` filter with this meaning.

### Migration Rules

1. Existing runs default to `UNKNOWN_LEGACY`.
2. No silent backfill from weak heuristics.
3. Explicit backfill is allowed only when evidence is durable and explainable.
4. Validation/assumptions runs may continue to use reserved tags during transition, but `runCategory` must become the source of truth for new work.

### Query/API Changes

Add `runCategory` filtering to:

1. `runs(...)`
2. `runCount(...)` or equivalent count queries
3. `domainEvaluations(...)`
4. findings and validation reporting queries

### Shipping Gate

`Wave 3` and `Wave 4` should not ship their final filtering logic until:

1. `runCategory` exists
2. new launches persist it
3. history views expose `UNKNOWN_LEGACY`
4. findings exclusions are backend-enforced, not client-guessed

## Workstream 3: Domain-Grouped Query Surface

### Problem

The UI cannot safely build `Domains > Runs` or `Domain Evaluation Summary` out of N+1 run queries and client joins.

### Decision

Add backend query surfaces that understand domain evaluation cohorts and domain-scoped history directly.

### Required Queries

1. `domainEvaluations(domainId, ...)`
   - list view for domain history
2. `domainEvaluation(id)`
   - summary/detail view
3. `domainEvaluationMembers(id)`
   - grouped run membership
4. `domainRunSummary(domainId, filters...)`
   - optional lightweight aggregation for Overview cards

### Required Fields

For each domain evaluation:

1. aggregate counts by run status
2. aggregate counts by analysis status where relevant
3. aggregate counts by run category
4. stalled/suspect member counts when derivable
5. links or IDs for all child runs
6. estimate confidence and actual realized cost if available

### Performance Guidance

1. avoid client-side `definitionId IN [many ids]` fan-out as the primary implementation
2. avoid historical grouping based only on current `Definition.domainId`
3. add indexes needed for cohort lookup and category filtering

## Workstream 4: Launch Flow and Cost Contract

### Problem

The front-end spec requires setup summary, domain-evaluation cost preview, confirmation, and post-launch status. Current cost estimation is too definition-scoped and not fully representative.

### Decision

Treat domain-evaluation cost preview as a first-class backend contract.

### Required Mutation Contract

`startDomainEvaluation(input)` should:

1. validate launch scope
2. resolve selected definitions
3. validate required setup state
4. create a `DomainEvaluation`
5. create member `Run` records
6. persist run category on those runs
7. return the `DomainEvaluation.id`

### Required Estimate Contract

Add a domain-level estimate query, referred to here as `estimateDomainEvaluationCost`.

Input:

1. `domainId`
2. selected definitions or selection mode
3. selected models
4. sample/repetition settings
5. evaluation scope

Output:

1. total estimated cost
2. per-model cost
3. per-definition cost or summary buckets
4. `isUsingFallback`
5. `fallbackReason`
6. estimate confidence
7. known exclusions or overhead caveats

### Cost Rules

The estimate should eventually account for:

1. probe passes
2. judge/evaluator passes
3. summarizer passes
4. retry overhead
5. provider/model routing differences

### Realized Cost

The product should distinguish:

1. estimate
2. committed launch scope
3. realized cost

This does not all have to ship in Wave 3, but the contract must leave room for it.

## Workstream 5: Status and Operational Visibility

### Problem

The product needs three separate truths:

1. `Domain Evaluation Summary`
2. `Run Detail`
3. `Global Status Center`

Those truths must agree on state while remaining scoped differently.

### Decision

Use `DomainEvaluation` as the cohort truth, `Run` as the run truth, and keep the status center as cross-domain operational monitoring.

### Required Backend Support

1. aggregate member progress for each `DomainEvaluation`
2. expose suspect/stalled member detection where possible
3. distinguish queued, running, completed, failed counts per cohort
4. keep run-level execution metrics available for detail pages

### Nice-To-Have But Not Required For Initial Shipping

1. SSE or websocket updates
2. precise ETA
3. cross-user operational segmentation

Initial shipping should prefer trustworthy counts over optimistic live estimates.

## Workstream 6: Snapshotting and Findings Eligibility

### Problem

`Findings` must be auditable. Current launch-time snapshots are incomplete.

### Decision

Add a first-class launch snapshot boundary and findings-eligibility contract.

### Recommended Schema Direction

Prefer one of these two approaches:

1. version missing mutable assets properly
2. store resolved launch-time text directly in a structured snapshot object

The minimum viable safe path is resolved launch-time snapshot capture on the execution side.

### Required Snapshot Contents

Per member run, capture:

1. definition identity and version
2. resolved preamble
3. resolved context
4. resolved value statements
5. resolved level words
6. execution parameters
7. model/provider configuration
8. evaluator/judge configuration

### Findings Eligibility Contract

Add a backend-computed eligibility concept for findings.

At minimum, the backend should be able to answer:

1. does this run or domain evaluation meet the snapshot boundary?
2. is the run category eligible for findings?
3. is the analysis current enough for findings surfaces?

### Required Queries

1. `domainFindingsEligibility(domainId or domainEvaluationId)`
2. `runFindingsEligibility(runId)` if needed for diagnostics linkage

### Rule

The front end should not infer eligibility from partial fields when the backend can answer it directly.

## Workstream 7: Validation Reporting

### Problem

`Validation` must become a reporting/reference area without duplicating the execution home.

### Decision

Keep validation execution in domain runs, but add reporting queries that aggregate only validation-category work.

### Required Backend Support

1. `runCategory = VALIDATION`
2. optional `validationType` or stable subtype metadata for temp-zero, order effect, and future checks
3. cross-domain reporting queries that aggregate only validation runs

### Minimal Query Set

1. `validationReports(...)`
2. `validationReport(type, filters...)`
3. `validationRunHistory(domainId?)`

### Rule

Validation reporting should never rely on front-end reconstruction from mixed history without category support.

## Workstream 8: Archive and Legacy Classification

### Problem

The product wants `Archive` to mean historical/retired work, but current survey and experiment behavior still depends partly on legacy shapes and conventions.

### Decision

Add explicit classification rather than relying on route or naming conventions.

### Recommended Direction

Introduce explicit classification on the relevant entity, likely `Experiment` or the future replacement of survey metadata.

Minimum categories:

1. `ACTIVE_DOMAIN_WORK`
2. `VALIDATION_WORK`
3. `ARCHIVED_RESEARCH`
4. `SURVEY_ARCHIVE` if surveys remain distinct during transition

### Rule

Do not let `[Survey]` name prefixes remain the long-term classifier for Archive routing.

## Recommended Delivery Order

### Phase A: Foundation

1. add `runCategory`
2. add `DomainEvaluation` and `DomainEvaluationRun`
3. add immutable cohort provenance
4. keep existing run and experiment behavior working

### Phase B: Execution Contracts

1. add `startDomainEvaluation`
2. add `estimateDomainEvaluationCost`
3. add domain-evaluation status queries
4. wire new launches to persist category and cohort membership

### Phase C: Findings Foundation

1. expand launch snapshotting
2. add findings eligibility computation
3. backend-enforce category exclusions for findings

### Phase D: Reporting Layers

1. add validation reporting over `runCategory = VALIDATION`
2. add archive classification support
3. deprecate experiment-centric and naming-centric behavior where replacements exist

## Backward Compatibility Rules

1. Existing `Run` records remain valid.
2. Existing `Experiment` records remain readable during transition.
3. `UNKNOWN_LEGACY` must remain a visible state, not a silent exclusion.
4. Old routes may keep pointing to compatibility pages until new backend truth exists.
5. The front end must not call grouped history canonical until Phase A and B are live.

## Testing and Verification Requirements

### Schema And Migration

1. migration tests for `runCategory`
2. migration tests for `DomainEvaluation` and member joins
3. backfill tests proving old runs stay visible as `UNKNOWN_LEGACY`

### GraphQL/API

1. query tests for domain-evaluation listing and detail
2. mutation tests for `startDomainEvaluation`
3. estimate query tests for domain-level cost preview
4. findings-eligibility tests
5. validation-report filtering tests

### Integration

1. domain launch creates stable cohort membership even if definitions later move domains
2. grouped status counts match child runs
3. findings exclude validation and legacy-unknown runs unless explicitly requested
4. archive classification does not depend on weak route/name assumptions

## Exit Criteria By Wave

### Wave 3 can ship when:

1. `DomainEvaluation` exists
2. grouped domain-evaluation queries exist
3. launch mutation returns cohort identity
4. domain-level cost preview exists
5. run category is persisted for new launches

### Wave 4 can ship when:

1. snapshot boundary is implemented enough for eligibility computation
2. findings eligibility is backend-computed
3. run-category exclusions are backend-enforced

### Wave 5 can ship when:

1. validation runs are first-class categorized work
2. cross-domain validation reporting queries exist
3. domain execution and validation reporting are clearly separated in data contracts

### Wave 6 can ship when:

1. archive classification is explicit
2. survey/legacy work no longer depends on weak naming conventions
3. route-sunset decisions are backed by telemetry and explicit classification

## Open Engineering Decisions

These still need implementation decisions, but they are now bounded:

1. exact schema names for `DomainEvaluation` and its member join table
2. whether findings eligibility is persisted, computed on demand, or cached/materialized
3. whether validation subtype lives on `Run`, `DomainEvaluation`, or a separate metadata table
4. how much realized-cost detail ships in Wave 3 versus later
5. whether `Experiment` is soft-deprecated in place or hard-mapped into a newer classification model

## Recommendation

Treat `DomainEvaluation` plus `runCategory` plus expanded snapshotting as the minimum backend platform for the rest of the migration.

Without those three pieces:

1. `Runs` cannot become the canonical domain execution home
2. `Findings` cannot safely become auditable interpretation
3. `Validation` and `Archive` remain mostly navigational shells over legacy behavior
