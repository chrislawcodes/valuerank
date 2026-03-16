# Domain-First Site IA Workflow Plan

Generated: 2026-03-15

## Implementation Strategy

Use [domain-first-site-ia-plan.md](/Users/chrislaw/valuerank/docs/plans/domain-first-site-ia-plan.md) as the migration source of truth and [spec.md](/Users/chrislaw/valuerank/docs/workflows/domain-first-site-ia-migration/spec.md) as the execution-facing behavior contract.

This workflow plan translates that strategy into buildable waves, concrete code anchors, review checkpoints, and rollout guardrails.

The backend/reporting portion of the remaining work is further specified in [backend-engineering-spec.md](/Users/chrislaw/valuerank/docs/workflows/domain-first-site-ia-migration/backend-engineering-spec.md).

## Workflow Rule

This feature should move through workflow checkpoints with Codex and Gemini reviews, not manual review after every wave.

Human review should only be required when:

1. a Phase 0 decision is truly missing
2. Gemini and Codex identify unresolved high-severity conflict
3. a checkpoint cannot be reconciled within the documented guardrails

AI review is a workflow gate, not a substitute for implementation verification. Each wave must still add or update the tests needed to prove its behavior.

## Diff Review Strategy

Diff checkpoints should default to wave-scoped artifacts, not the entire feature-scoped patch.

Rules:

1. each implementation wave should create its own scope manifest under [waves/](/Users/chrislaw/valuerank/docs/workflows/domain-first-site-ia-migration/waves)
2. each diff checkpoint should generate a wave-specific patch in [reviews/](/Users/chrislaw/valuerank/docs/workflows/domain-first-site-ia-migration/reviews) using that manifest
3. Gemini diff reviews should run against the wave-specific artifact by default
4. the feature-scoped artifact [implementation.diff.patch](/Users/chrislaw/valuerank/docs/workflows/domain-first-site-ia-migration/reviews/implementation.diff.patch) should be reserved for:
   - closeout
   - cross-wave regression reconciliation
   - cases where the current wave cannot be bounded safely without losing essential context

Rationale:

1. wave-scoped diffs keep Gemini findings focused on the code that just changed
2. smaller artifacts reduce narrowing and partial-coverage reviews
3. feature-scoped diffs remain useful, but they are too broad for the default per-wave checkpoint

Additional operating rules learned from Waves 3 and 4:

1. a wave manifest must include prerequisite files from earlier accepted waves when the current slice depends on those contracts for compile-time imports or runtime behavior
2. each manifest must carry a short `review_context` note so Gemini knows what is intentionally assumed present versus what is actually changing now
3. each manifest must record the exact verification commands run for that slice
4. if Gemini reports a blocker caused by an intentionally omitted prerequisite file that is already landed in an earlier accepted wave, that finding should be rejected explicitly in reconciliation rather than silently ignored
5. new modals, dialogs, and status surfaces should expose accessible roles or labels so tests can scope assertions to the intended surface instead of brittle global text matches
6. non-failing test warnings should be triaged as cleanup only after correctness has been proven; they should not block the checkpoint unless they hide a real behavior problem

## Current Code Anchors

### Routes And App Shell

1. [App.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/App.tsx)
2. [NavTabs.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/layout/NavTabs.tsx)
3. [MobileNav.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/layout/MobileNav.tsx)
4. [Layout.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/layout/Layout.tsx)

### Current Primary Pages

1. [Dashboard.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Dashboard.tsx)
2. [Domains.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Domains.tsx)
3. [Definitions.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Definitions.tsx)
4. [DefinitionDetail.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DefinitionDetail/DefinitionDetail.tsx)
5. [Runs.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Runs.tsx)
6. [RunDetail.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/RunDetail/RunDetail.tsx)
7. [Analysis.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Analysis.tsx)
8. [AnalysisDetail.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/AnalysisDetail.tsx)
9. [AnalysisTranscripts.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/AnalysisTranscripts.tsx)
10. [DomainAnalysis.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainAnalysis.tsx)
11. [DomainCoverage.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainCoverage.tsx)
12. [Compare.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Compare.tsx)
13. [Survey.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Survey.tsx)
14. [SurveyResults.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/SurveyResults.tsx)
15. [TempZeroEffectAssumptions.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/TempZeroEffectAssumptions.tsx)
16. [AnalysisAssumptions.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/AnalysisAssumptions.tsx)
17. [OrderEffectAssumptions.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/OrderEffectAssumptions.tsx)
18. [Preambles.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Preambles.tsx)
19. [LevelPresets.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/LevelPresets.tsx)
20. [DomainContexts.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainContexts.tsx)
21. [ValueStatements.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/ValueStatements.tsx)

### Backend And Data Anchors

1. [schema.prisma](/Users/chrislaw/valuerank/cloud/packages/db/prisma/schema.prisma)
2. [run.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/mutations/run.ts)
3. [runs.ts](/Users/chrislaw/valuerank/cloud/apps/web/src/api/operations/runs.ts)
4. [definitions.ts](/Users/chrislaw/valuerank/cloud/apps/web/src/api/operations/definitions.ts)

These anchors should be referenced in future implementation waves so the work is not rediscovered from scratch each time.

## Phase 0 Deliverables

Phase 0 is still required before product-facing rollout starts. These are deliverables, not vague discovery work.

1. restore or replace [canonical-glossary.md](/Users/chrislaw/valuerank/docs/canonical-glossary.md)
2. create route compatibility matrix
3. create terminology decision table
4. create file and route inventory for all migrated surfaces
5. document immutable launch provenance approach
6. document legacy run categorization approach
7. document Experiment deprecation path
8. document domain-evaluation summary data contract
9. document status-center scope decision
10. document snapshot-boundary decision

## Proposed Waves

### Wave 0: Workflow And Decision Pack

Focus:

1. lock glossary and terminology
2. lock route compatibility
3. lock migration contracts that later waves depend on

Artifacts:

1. restored glossary
2. route compatibility matrix
3. terminology table
4. file and route inventory

Exit criteria:

1. Phase 0 deliverables exist in the repo
2. spec and plan checkpoints are reconciled

### Wave 1: Top-Level Reframe Without Deep Workflow Rewrite

Focus:

1. establish top-level navigation truth
2. avoid promising domain-workspace behavior that does not exist yet

Likely code anchors:

1. [App.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/App.tsx)
2. [NavTabs.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/layout/NavTabs.tsx)
3. [MobileNav.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/layout/MobileNav.tsx)
4. [Dashboard.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Dashboard.tsx)

Primary outcomes:

1. top-level nav begins teaching `Domains`, `Validation`, and `Archive`
2. transitional labels and compatibility routes exist
3. `Home` starts acting as a return-state surface

Expected verification work:

1. route and redirect coverage for migrated top-level entries
2. nav rendering coverage for desktop and mobile
3. return-state smoke coverage for `Home`

Do not do yet:

1. fake a full domain workspace shell
2. promise domain-evaluation cohort truth without launch provenance

### Wave 2: Domain Workspace Shell

Focus:

1. introduce the domain workspace structure
2. make `Overview`, `Vignettes`, `Setup`, `Runs`, and `Findings` real navigation surfaces

Likely code anchors:

1. [Domains.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Domains.tsx)
2. [DefinitionDetail.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DefinitionDetail/DefinitionDetail.tsx)
3. [Preambles.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Preambles.tsx)
4. [LevelPresets.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/LevelPresets.tsx)
5. [DomainContexts.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainContexts.tsx)
6. [ValueStatements.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/ValueStatements.tsx)

Primary outcomes:

1. guided vignette creation exists
2. Setup vs per-vignette override boundaries are visible
3. Overview cards deep-link to exact objects
4. readiness state is visible and consistent

Hard requirements before shipping:

1. `Ready for pilot` and `Ready for production` behavior matches the spec
2. diagnostics are actionable via `Edit this vignette`
3. archive behavior exists for long-lived domains

Expected verification work:

1. guided vignette creation coverage
2. readiness-transition coverage
3. setup-default versus vignette-override coverage
4. overview deep-link behavior coverage

### Wave 2.5: Compatibility Coverage

Focus:

1. harden the migrated navigation shell with automated coverage
2. verify the highest-risk route aliases before deeper waves land

Likely code anchors:

1. [App.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/App.tsx)
2. [NavTabs.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/layout/NavTabs.tsx)
3. [MobileNav.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/layout/MobileNav.tsx)
4. [App.test.tsx](/Users/chrislaw/valuerank/cloud/apps/web/tests/App.test.tsx)
5. [NavTabs.test.tsx](/Users/chrislaw/valuerank/cloud/apps/web/tests/components/layout/NavTabs.test.tsx)
6. [MobileNav.test.tsx](/Users/chrislaw/valuerank/cloud/apps/web/tests/components/layout/MobileNav.test.tsx)

Primary outcomes:

1. top-level shell expectations are asserted in tests
2. validation and archive compatibility links remain discoverable in tests
3. redirect aliases for `/assumptions` and `/experiments` are covered by route tests

Expected verification work:

1. app-route redirect coverage
2. desktop nav coverage for `Home`, `Domains`, `Validation`, `Archive`
3. mobile nav coverage for top-level items and nested compatibility routes

### Wave 3: Runs And Domain Evaluation

Focus:

1. make `Runs` the canonical launch and diagnostics home
2. introduce `Domain Evaluation Summary`

Likely code anchors:

1. [Runs.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Runs.tsx)
2. [RunDetail.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/RunDetail/RunDetail.tsx)
3. [DomainTrialsDashboard.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainTrialsDashboard.tsx)
4. [runs.ts](/Users/chrislaw/valuerank/cloud/apps/web/src/api/operations/runs.ts)
5. [run.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/mutations/run.ts)

Primary outcomes:

1. launch flow follows the spec sequence
2. setup summary is visible before confirmation
3. cost estimate is shown with confidence labeling
4. evaluation confirmation opens a cohort-level summary
5. status surfaces are distinct

Blocked on:

1. domain-grouped run query strategy
2. immutable launch provenance
3. domain-level cost preview contract
4. final domain-evaluation cohort model and status aggregation contract

Expected verification work:

1. launch-flow sequencing coverage
2. domain-evaluation summary versus run-detail scope coverage
3. cost-estimate-state coverage, including low-confidence estimates
4. status-surface consistency coverage

### Wave 4: Findings And Auditable Interpretation

Focus:

1. establish `Findings` as the interpretation surface
2. keep diagnostics linked but scoped

Likely code anchors:

1. [Analysis.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Analysis.tsx)
2. [AnalysisDetail.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/AnalysisDetail.tsx)
3. [AnalysisTranscripts.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/AnalysisTranscripts.tsx)
4. [DomainAnalysis.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainAnalysis.tsx)
5. [DomainCoverage.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainCoverage.tsx)

Primary outcomes:

1. domain interpretation is clearly separated from diagnostics
2. non-auditable findings state appears when required
3. findings eligibility reflects actual backend support

Blocked on:

1. expanded snapshot support
2. findings eligibility contract
3. run category exclusion rules

Expected verification work:

1. findings-eligibility coverage
2. non-auditable-state coverage
3. diagnostic-scope labeling coverage
4. run-category exclusion coverage

### Wave 5: Validation And Cross-Domain Reporting

Focus:

1. give `Validation` strong information scent
2. avoid split-brain between domain-scoped checks and cross-domain reporting

Likely code anchors:

1. [TempZeroEffectAssumptions.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/TempZeroEffectAssumptions.tsx)
2. [AnalysisAssumptions.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/AnalysisAssumptions.tsx)
3. [OrderEffectAssumptions.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/OrderEffectAssumptions.tsx)

Primary outcomes:

1. domain-scoped checks still launch from `Runs`
2. top-level `Validation` reads as reference and reporting
3. cross-domain validation reporting consumes the right run categories

Expected verification work:

1. validation-route and labeling coverage
2. domain-scoped check entry-point coverage
3. reporting exclusion and inclusion coverage by run category

### Wave 6: Archive And Legacy Retirement

Focus:

1. move historical work to `Archive`
2. retire legacy surfaces only after compatibility rules are satisfied

Likely code anchors:

1. [Survey.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Survey.tsx)
2. [SurveyResults.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/SurveyResults.tsx)
3. [App.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/App.tsx)

Primary outcomes:

1. `Archive` clearly reads as historical
2. active work is not stranded there
3. route aliases can begin sunset once telemetry allows it

Expected verification work:

1. archive-routing coverage
2. active-versus-archived classification coverage
3. alias and redirect sunset regression coverage

## Migration Appendix Requirements

These are mandatory workflow artifacts:

1. route compatibility matrix
2. immutable launch provenance note
3. legacy run categorization note
4. canonical edit vs attach vs fork contract
5. temporary old/new labeling rules for analysis and validation surfaces

## Review Policy

This workflow is both `sensitive` and `large_structural`.

Mandatory checkpoints:

1. spec
   - Codex `architecture`
   - Gemini `requirements`
   - Gemini `risk`
2. plan
   - Codex `architecture`
   - Gemini `testability`
   - Gemini `risk`
3. diff
   - Codex `correctness`
   - Gemini `regression`
   - Gemini `quality`

Rationale:

1. the migration is structurally large
2. route, wording, and category changes can create hidden regressions
3. backend gaps make testability and risk review important before code lands

## Reconciliation Rule

Every checkpoint must be reconciled in this plan and in the review records before implementation advances to the next checkpoint.

If a review remains unresolved:

1. try the repo-compatible repair and verification path first
2. keep the checkpoint blocked
3. only involve a human if the issue is a true product or migration decision that cannot be safely bounded

## Verification Expectations

This workflow still needs an analytics instrumentation plan, but that lives separately from this document.

At minimum, each implementation wave should verify:

1. route compatibility still works
2. old deep links still resolve safely
3. readiness and launch states are consistent across surfaces
4. domain evaluation, run detail, and global status surfaces do not contradict each other
5. diagnostics and findings exclusions still respect run categories
6. new behavior has corresponding automated test coverage at the right level for the surface being changed
7. new modal or status surfaces are testable through accessible roles or labels rather than ambiguous text-only selectors

## Current Status

### Completed In This Workflow Pass

1. migration strategy is documented in [domain-first-site-ia-plan.md](/Users/chrislaw/valuerank/docs/plans/domain-first-site-ia-plan.md)
2. execution-facing product behavior is now documented in [spec.md](/Users/chrislaw/valuerank/docs/workflows/domain-first-site-ia-migration/spec.md)
3. Gemini review is a required part of the checkpoint policy for this workflow
4. spec checkpoint reviews have been saved and reconciled
5. plan checkpoint reviews have been saved and reconciled
6. Phase 0 deliverables are now checked into the workflow folder
7. Wave 1 top-level shell changes are implemented in the web app with focused page coverage
8. the existing `Domains` surface has been reshaped into a clearer transitional workspace with `Overview`, `Vignettes`, and `Setup`
9. the transitional domain workspace now includes `Runs` and `Findings` tabs, guided vignette creation, and richer overview action cards
10. Wave 3 backend and UI slices are implemented, including `Domain Evaluation Summary`, scoped launch controls, and grouped run history
11. Wave 4 findings gating is implemented with an explicit diagnostics-only state when auditable findings are not yet available
12. Wave 5 validation reporting is implemented, with `Validation` acting as a reporting hub and deep-linking into `VALIDATION` run history
13. Wave 6 archive retirement is implemented at the routing and navigation layer: `/archive/surveys` and `/archive/survey-results` are now canonical, while `/survey` and `/survey-results` remain compatibility aliases with legacy labeling
14. Wave 7 findings snapshot completeness is implemented in the backend launch path, so completed production-style runs can now persist the resolved findings snapshot boundary needed for auditable eligibility checks
15. Wave 8 usability hardening is implemented on the web side: `Home` now offers exact resume links into active domain work, `Domains` restores deep-linked setup surfaces from query params, the domain-evaluation launch flow includes explicit configuration review links before confirmation, and `Findings` now says more clearly when the page is showing diagnostic evidence rather than auditable interpretation
10. the vignette-pair creator preserves domain context when launched from a selected domain workspace
11. focused automated coverage now exists for the domain workspace slice and `JobChoiceNew` domain preselection
12. compatibility coverage now protects the migrated desktop and mobile shell plus the `/assumptions` and `/experiments` redirect aliases
13. no further front-end-safe wave remains without crossing into backend or reporting contracts that are still intentionally blocked by the migration plan
14. the blocked backend/reporting portion now has a dedicated engineering spec covering schema, query, mutation, and migration requirements for Waves 3 through 6
15. the backend engineering spec has completed Codex architecture plus Gemini requirements and risk review, and those reviews are reconciled in this workflow plan
16. the first backend implementation slice is now landed: `RunCategory` exists in the Prisma schema, new launches can persist an explicit category, assumptions launches now stamp `VALIDATION`, and run query surfaces can filter by category end-to-end
17. targeted API verification now covers run-category parsing, persistence, GraphQL filtering, and GraphQL mutation pass-through
18. the second backend implementation slice is now landed: `DomainEvaluation` and immutable membership models exist in the Prisma schema, `runTrialsForDomain` now creates cohort records with provenance, and the mutation returns `domainEvaluationId`
19. targeted API verification now covers domain-evaluation creation, membership persistence, query registration, and derived evaluation-status reads
20. the next backend implementation slice is now landed: `estimateDomainEvaluationCost` provides a domain-scoped launch-cost preview with per-model and per-definition totals, fallback metadata, and confidence labeling
21. `domainTrialsPlan` now shares the same estimate builder so the legacy planning surface and the new cost-preview contract do not drift
22. the next backend implementation slice is now landed: `startDomainEvaluation` provides the first-class launch mutation for domain work while `runTrialsForDomain` remains as a compatibility wrapper
23. the shared launch helper now keeps scope category, run category, model selection, and sampling settings aligned between the new mutation and the compatibility path
24. the next backend implementation slice is now landed: grouped domain query surfaces now expose `domainEvaluationMembers` and `domainRunSummary`, giving the future `Runs` workspace a direct cohort-members contract plus domain-level aggregate counts without client-side fan-out
25. targeted API verification now covers grouped domain query registration, latest cohort identity, summary aggregation, and scope-filtered summary reads
26. diff checkpoints now default to wave-scoped artifacts for this workflow so Gemini reviews stay focused on the current implementation slice instead of the full feature patch
27. Wave 3 is now implemented on the web side: [DomainTrialsDashboard.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainTrialsDashboard.tsx) uses `startDomainEvaluation`, `domainEvaluations`, `domainEvaluation`, and `domainRunSummary` to make `Runs` the canonical home for scoped domain-evaluation launch, monitoring, and member-run drilldown
28. the launch flow now exposes setup summary, estimate confidence, fallback notes, and known exclusions before confirmation, and the confirmation surface is an accessible `dialog` tied to the cohort-level `Domain Evaluation Summary`
29. focused web verification now covers scoped launch wording, cohort-summary rendering, member-run drilldown links, and estimate exclusion messaging for the Wave 3 `Runs` slice
30. Wave 4 is now implemented conservatively: [evaluation.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/domain/evaluation.ts) exposes `domainFindingsEligibility(domainId)` and [DomainAnalysis.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainAnalysis.tsx) shows an explicit diagnostics-only state until auditable snapshot support is genuinely available
31. focused API and web verification now covers the findings-eligibility contract plus the diagnostics-only findings state, so `Findings` no longer overclaims backend auditability during the migration
32. Wave 5 is now implemented as a validation reporting slice: [ValidationHome.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/ValidationHome.tsx) now shows live `VALIDATION` run history plus current temp=0 and order-invariance summaries instead of acting as a static migration landing page
33. the global [Runs.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Runs.tsx) surface now honors URL-driven `runCategory` filtering so validation reporting can deep-link into an operational history view without creating a second execution home
34. compatibility validation pages now point back to top-level Validation reporting and validation run history, reducing split-brain navigation while keeping detailed assumptions views live during migration
35. focused web verification now covers the live Validation home reporting cards plus the validation-filtered Runs empty state and routing behavior
36. Wave 7 is now implemented as the final backend snapshot slice: [start.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/services/run/start.ts) stamps each new run with `findingsSnapshotVersion`, resolved prompt inputs, and evaluator/target-model metadata, while [evaluation.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/domain/evaluation.ts) can now graduate completed production-style work to `ELIGIBLE` when those persisted snapshot fields are present
37. [infra-models.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/services/infra-models.ts) now resolves `judge` infrastructure models explicitly, so the launch snapshot can preserve evaluator configuration instead of leaving that boundary implicit
38. focused API verification now covers both ends of the snapshot contract: `startRun` persistence in [start.test.ts](/Users/chrislaw/valuerank/cloud/apps/api/tests/services/run/start.test.ts) and eligible findings reads in [domain.test.ts](/Users/chrislaw/valuerank/cloud/apps/api/tests/graphql/queries/domain.test.ts)
39. Wave 8 is now implemented as a usability-hardening slice: [Dashboard.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Dashboard.tsx) links directly into active domain flows, [Domains.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/Domains.tsx) preserves domain/setup deep links via query state, [DomainTrialsDashboard.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainTrialsDashboard.tsx) distinguishes domain-evaluation summaries from run-scoped diagnostics more explicitly, and [DomainAnalysis.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainAnalysis.tsx) now labels the evidence scope directly on the findings surface
40. focused web verification now covers the Wave 8 usability seams through [Dashboard.test.tsx](/Users/chrislaw/valuerank/cloud/apps/web/tests/pages/Dashboard.test.tsx), [Domains.test.tsx](/Users/chrislaw/valuerank/cloud/apps/web/tests/pages/Domains.test.tsx), [DomainTrialsDashboard.test.tsx](/Users/chrislaw/valuerank/cloud/apps/web/tests/pages/DomainTrialsDashboard.test.tsx), and [DomainAnalysis.test.tsx](/Users/chrislaw/valuerank/cloud/apps/web/tests/pages/DomainAnalysis.test.tsx)

### Still Pending

1. run the final feature-scoped closeout checkpoint and reconcile its review records
2. optional deeper archive classification remains available as a follow-on platform hardening task, but it is no longer required to complete the domain-first IA migration itself

## Review Reconciliation

- review: reviews/spec.codex.architecture.review.md | status: accepted | note: No architecture blocker in the spec; residual risks are carried as Phase 0 and shared-view-model constraints.
- review: reviews/spec.gemini.requirements.review.md | status: accepted | note: No blocking requirements gaps; the remaining concerns are already represented in acceptance criteria and migration guardrails.
- review: reviews/spec.gemini.risk.review.md | status: accepted | note: Spec-level risks are acknowledged and intentionally handled through Phase 0 contracts, route compatibility, and explicit non-auditable findings states.
- review: reviews/plan.codex.architecture.review.md | status: accepted | note: No phase-ordering blocker remains; the main architecture risks are already captured as Phase 0 prerequisites and migration guardrails.
- review: reviews/plan.gemini.risk.review.md | status: accepted | note: The plan still has real migration risk, but those items are intentionally represented as pending Phase 0 deliverables and wave blockers rather than hidden assumptions.
- review: reviews/plan.gemini.testability.review.md | status: accepted | note: The plan now requires per-wave verification work and explicit automated coverage, so the remaining testability concerns are tracked rather than unresolved.
- review: reviews/diff.codex.correctness.review.md | status: accepted | note: No blocking correctness issue remains in the current scoped diff; the grouped domain query surfaces expose cohort-member and domain-summary contracts with matching GraphQL, typed-client, and API test coverage.
- review: reviews/diff.gemini.regression.review.md | status: accepted | note: No blocker in the grouped domain-query slice; Gemini stayed broad because the feature-scoped diff still includes earlier accepted navigation and launch-contract work.
- review: reviews/diff.gemini.quality.review.md | status: accepted | note: No blocker in the grouped domain-query slice; residual concerns are expected follow-through on later status, categorization, and UI adoption waves.
- review: reviews/wave-3-4-runs-and-findings.codex.correctness.review.md | status: accepted | note: No blocking correctness issue remains in the Wave 3 and 4 slice; the `Runs` surface now consumes the domain-evaluation backend contracts directly and `Findings` stays conservatively gated behind explicit eligibility checks.
- review: reviews/wave-3-4-runs-and-findings.gemini.regression.review.md | status: rejected | note: Gemini raised a scope-context blocker because the diff artifact did not include the already-landed `cloud/apps/web/src/api/operations/domains.ts` contract from an earlier accepted backend wave. The remaining residual risks about history backfill, stricter findings gating, and polling load are informative but not blockers for this slice.
- review: reviews/wave-3-4-runs-and-findings.gemini.quality.review.md | status: accepted | note: No quality blocker in the Wave 3 and 4 slice; the remaining concerns are about later UX polish and fuller auditability rather than the landed launch and findings-gate behaviors.
- review: reviews/wave-5-validation-reporting.codex.correctness.review.md | status: accepted | note: No blocking correctness issue remains in the Wave 5 slice; Validation now acts as a reporting hub over existing validation contracts and Runs accepts URL-driven run-category filtering without inventing a new execution model.
- review: reviews/wave-5-validation-reporting.gemini.regression.review.md | status: accepted | note: No regression blocker in the Wave 5 slice; the main residual concerns are the existing React test warnings in Runs and the need to keep validation run history clearly differentiated from launch entry points.
- review: reviews/wave-5-validation-reporting.gemini.quality.review.md | status: accepted | note: No quality blocker in the Wave 5 slice; Gemini mainly reinforced the stronger information scent and clearer division between reporting and execution.
- review: reviews/backend-spec.codex.architecture.review.md | status: accepted | note: No architecture blocker remains in the backend engineering spec; the main open work is deliberate boundary choice around Experiment coexistence and findings-eligibility implementation shape.
- review: reviews/backend-spec.gemini.requirements.review.md | status: accepted | note: The requirements review mainly reinforced that this backend spec is intentionally paired with the product spec and plan; no new missing contract blocked adoption.
- review: reviews/backend-spec.gemini.risk.review.md | status: accepted | note: The risk review confirms that the remaining work is still migration-heavy, but those risks are now explicitly bounded by DomainEvaluation, runCategory, snapshotting, and archive-classification gates rather than hidden assumptions.
- review: reviews/wave-6-archive-retirement.codex.correctness.review.md | status: accepted | note: No blocking correctness issue in Wave 6; archive-prefixed canonical routes and compatibility aliases are implemented and covered.
- review: reviews/wave-6-archive-retirement.gemini.regression.review.md | status: accepted | note: No regression blocker in Wave 6; redirects, canonical archive links, and compatibility aliases behave correctly in the verified archive retirement slice.
- review: reviews/wave-6-archive-retirement.gemini.quality.review.md | status: accepted | note: No quality blocker in the Wave 6 slice; the archive retirement work improves information scent, canonical routing, and transition guidance without increasing maintenance risk materially.
- review: reviews/wave-7-findings-snapshot-completeness.codex.correctness.review.md | status: accepted | note: No blocking correctness issue remains in Wave 7; new runs now persist the resolved findings snapshot boundary and completed production-style evaluations can become auditable when those fields are present.
- review: reviews/wave-7-findings-snapshot-completeness.gemini.regression.review.md | status: accepted | note: No regression blocker in the Wave 7 slice; the snapshot enrichment extends the existing launch and eligibility contracts without regressing earlier domain-evaluation behavior.
- review: reviews/wave-7-findings-snapshot-completeness.gemini.quality.review.md | status: accepted | note: No quality blocker in the Wave 7 slice; the implementation improves auditability with additive `Run.config` fields and focused tests instead of expanding into unfinished schema migrations.
- review: reviews/wave-8-usability-hardening.codex.correctness.review.md | status: accepted | note: No blocking correctness issue remains in the Wave 8 slice; the new exact links, configuration-review affordances, findings-state wording, and query-string restore behavior match the intended usability hardening and are covered by focused web tests.
- review: reviews/wave-8-usability-hardening.gemini.regression.review.md | status: accepted | note: No regression blocker in the Wave 8 slice; the exact deep links, launch-review copy, and findings-state messaging harden the existing domain workflow without regressing prior domain-evaluation behavior.
- review: reviews/wave-8-usability-hardening.gemini.quality.review.md | status: accepted | note: No quality blocker in the Wave 8 slice; the UI copy, exact-linking, and launch-review surfaces improve clarity and future maintenance without expanding the backend surface area.
