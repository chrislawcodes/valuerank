# Plan

## Implementation Strategy

Use the methodology docs in [spec.md](/Users/chrislaw/valuerank/docs/plans/job-choice-vignettes/spec.md) and [plan.md](/Users/chrislaw/valuerank/docs/plans/job-choice-vignettes/plan.md) as the source of truth, then land the product and backend work in staged slices.

## Proposed Slices

### Slice 1: Workflow-safe scaffolding

- add `Job Choice` family metadata shape
- define parser metadata contract
- identify launch/reporting surfaces that need `Old V1` labeling
- preserve same-signature compatibility assumptions
- define the feature-flag and rollback seam for `Job Choice` launch/reporting surfaces
- lock the initial migration inventory for the first `Old V1` labels

### Slice 2: Vignette creation

- duplicate live professional root vignettes into `Job Choice`
- apply matching preamble version
- rewrite the ten role archetypes without job titles
- generate conditions and store canonical A/B and shown-first metadata
- run full-family smoke coverage across all 45 root vignettes before any default-family switch

### Slice 3: Text-label interpretation

- add deterministic exact-match parsing
- add fallback classification and ambiguity handling
- store raw parse metadata and parser version
- preserve manual override compatibility
- add CSV export for fallback-resolved adjudication
- define parser corpus cases for exact, fallback, ambiguous, contradictory, and explanation-led responses
- expose per-model/per-vignette parse outcome counters for exact, fallback, ambiguous, and unresolved outputs

### Slice 4: Launch UX

- add `Start Paired Batch`
- add `Start Ad Hoc Batch`
- ensure only `Paired Batch` is methodology-safe by default
- label retained legacy pages as `Old V1`
- keep `Ad Hoc Batch` visually secondary and excluded from methodology-safe reporting by default
- keep the current professional launch path operational during the first `Job Choice` rollout slice

### Slice 5: Bridge-support reporting

- surface parser-only versus adjudicated coverage
- expose coverage loss in analysis/reporting
- make ambiguous cells drill into transcript detail
- ensure stability views show contributing trial counts
- ensure degraded coverage is visible in exports and GraphQL surfaces instead of silently dropping unresolved transcripts
- capture fallback/ambiguous exemplars so bridge review can inspect failure cases quickly

## Current Status

### Implemented in this workflow pass

- Slice 1 is implemented for transcript decision metadata, parser/adjudication typing, export/reporting audit fields, and manual override provenance.
- Slice 2 is implemented as a transform utility plus a duplication script that can create `Job Choice` definitions from live professional root definitions without mutating the legacy family.
- Slice 3 is implemented in the summarize worker and queue path, with deterministic text-label matching, LLM fallback classification, parser metadata persistence, CSV export fields, and web/API transcript exposure.
- Slice 4 is implemented for `Start Paired Batch` and `Start Ad Hoc Batch` launch behavior, Job Choice companion-definition launch orchestration, and primary `Old V1`/`Job Choice` page labeling on definition-driven launch surfaces.
- Migration-facing UI cleanup is now in place on the downstream detail views as well: run detail and analysis detail both surface `Old V1` versus `Job Choice`, and Job Choice runs also surface `Paired Batch` versus `Ad Hoc Batch` context.
- Slice 5 reporting is now implemented for transcript, aggregate, and stability surfaces: ambiguous/fallback/manual badges, clickable transcript adjudication paths, scale-aware manual relabeling, transcript coverage summaries, analysis-wide decision coverage warnings, and stability-tab parser/adjudicated coverage breakdowns.
- The first one-vignette manual pilot is now operational: local single-definition Job Choice generation, Job Choice adjudication CSV export from the run page, and a documented local pilot runbook are all in place.
- Full bridge-support tooling is now operational: a multi-run bridge report generator writes auditable JSON and Markdown artifacts with per-run, per-vignette, and per-model/per-vignette parser breakdowns, plus exemplar transcript links that open directly into the transcript inspection UI.

### Still deferred

- Workflow diff checkpoint, which is currently blocked because the repo has many unrelated dirty paths outside this feature scope and the canonical diff writer fails closed in that situation

## Verification Completed

- `PYTHONPATH=/Users/chrislaw/valuerank/cloud/workers python3 -m pytest /Users/chrislaw/valuerank/cloud/workers/tests/test_summarize.py`
- `./node_modules/.bin/vitest run scripts/__tests__/job-choice-transform.test.ts`
- `npm run test --workspace=@valuerank/api -- export.test.ts`
- `npm run test --workspace=@valuerank/api -- run.test.ts`
- `npm run test --workspace=@valuerank/web -- RunForm`
- `npm run test --workspace=@valuerank/web -- tests/lib/analysisCoverage.test.ts tests/components/analysis/StabilityTab.test.tsx tests/pages/AnalysisDetail.test.tsx`
- `npm run test --workspace=@valuerank/web -- tests/api/export.test.ts tests/pages/RunDetail.test.tsx`
- `npm run test --workspace=@valuerank/web -- tests/pages/AnalysisTranscripts.test.tsx`
- `npm run test --workspace=@valuerank/web -- tests/pages/RunDetail.test.tsx tests/pages/AnalysisDetail.test.tsx`
- `./node_modules/.bin/vitest run scripts/__tests__/job-choice-bridge-report.test.ts`
- `npm run typecheck --workspace=@valuerank/api`
- `npm run typecheck --workspace=@valuerank/web`
- `npm run build --workspace=@valuerank/db`
- `npm run db:test:reset`

## Verification Expectations

- add backward-compatibility checks for the existing professional `Jobs (...)` path before any `Job Choice` default switch
- validate same-signature reuse assumptions on real pilot data, not a test-only launch path
- verify CSV export contents against parser metadata and manual adjudication needs
- keep a documented local path for creating only the pilot vignette pair instead of the full 45-definition family
- add parser corpus coverage for exact-match, fallback-resolved, ambiguous, quoted-label, explanation-first, contradictory, and off-scale responses
- verify methodology-safe reporting excludes `Ad Hoc Batch` by default while still keeping those results visible as exploratory data
- run full-family smoke coverage across all 45 root vignettes before any broader rollout beyond the one-vignette pilot
- keep parser/adjudicated coverage warnings visible anywhere aggregate or stability summaries can silently drop unresolved transcripts

## Observability Expectations

- log and surface exact, fallback, ambiguous, unresolved, and manually adjudicated outcome counts by model, vignette, and batch
- surface coverage denominators anywhere stability or aggregate reporting could otherwise look artificially cleaner after dropped transcripts
- preserve enough parser metadata to root-cause why a transcript was scored, downgraded to ambiguous, or manually relabeled
- keep bridge review outputs auditable with transcript exemplars for fallback and ambiguous cases

## Migration Guardrails

- keep the current professional-domain system as the default production path during the first `Job Choice` implementation slices
- do not switch the sentinel or assumptions stack in this workflow until the bridge-specific migration contract exists
- use `Old V1` labeling on retained legacy pages before exposing the corresponding `Job Choice` replacement
- keep run and analysis detail surfaces aligned with definition-detail migration labels so users do not lose methodology context after launch
- require an explicit rollback seam for any page or launch surface that starts exposing `Job Choice`

## Current Open Decisions

- exact size of the first full bridge after the one-vignette manual pilot
- where final bridge signoff should live after the first generated review artifact

## Pilot Workflow

- create the one-vignette `Job Choice` pair locally with [local-pilot.md](/Users/chrislaw/valuerank/docs/workflows/job-choice-implementation/local-pilot.md)
- launch that vignette as a real `Paired Batch`
- use the run page `Adjudication CSV` export for fallback review
- use the transcript viewer `Change` dropdown for ambiguous transcript adjudication
- keep the resulting data reusable if later paired batches share the same signature

## Bridge Workflow

- collect the completed bridge run IDs
- generate the multi-run report with [bridge-review.md](/Users/chrislaw/valuerank/docs/workflows/job-choice-implementation/bridge-review.md)
- use the generated JSON and Markdown files as the bridge review artifact
- inspect linked fallback and ambiguous exemplars in the transcript UI through direct transcript links
- keep conclusions descriptive only; do not treat the artifact as a cross-family equivalence claim

## Review Triggers

This workflow should be treated as `sensitive` because it includes migration and reporting-risk changes. If implementation scope grows to a large structural change in analysis aggregation, add the large-structural trigger as well.

## Review Reconciliation

- review: reviews/adversarial.diff.gemini.quality.review.md | status: deferred | note: Quality review surfaced follow-up improvements rather than immediate blockers; kept them deferred because the current slice already has focused coverage and no failing behavior after the fixes.
- review: reviews/adversarial.diff.gemini.regression.review.md | status: accepted | note: Fixed the actionable regression findings by restoring backward-compatible CSV defaults and tightening deterministic text-label matching; reran export and worker coverage afterward.
