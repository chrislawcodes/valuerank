# Duplicate Module Inventory

**Created:** 2026-05-05
**Scope:** `cloud/` only (`src/` is legacy and not audited)
**Phase:** 1 (catalog complete) — Phase 2 (triage + consolidation PRs) not started
**Source:** Three parallel read-only inventory passes (workers, api+db, web+shared)

## How to read this file

This is a living catalog. The Active Inventory below lists every duplicate-module cluster found in Phase 1, ranked by severity × lift. Each row has its own detail section further down.

When a PR resolves (or partially resolves) a cluster:

1. Move the row from **Active Inventory** to **Resolved**, link the PR, and date it.
2. If a cluster splits or expands, edit the row — don't fork a new one.
3. Edit this file in the **same PR** that does the work, so the catalog stays honest.

If you find a new cluster, add it as a new `DEDUP-<n>` row at the bottom of Active Inventory and write a detail section. Don't renumber existing rows — the IDs are stable references.

## Preserve — do not regress

These user-facing surfaces must not change as a side effect of any dedup PR. If a cluster is suspected to feed these surfaces, snapshot the output before the change and verify byte-equivalent output after.

- **Models reports** — visible output unchanged
- **Domains reports** — visible output unchanged

Clusters in this catalog that likely touch these surfaces (cross-check before scoping a PR):

- DEDUP-6 — snapshot builder twin (domain-analysis side)
- DEDUP-14 — `DomainAnalysisLegacy` GraphQL query
- DEDUP-10 — decision-summary utility sprawl
- DEDUP-5 — `analysis-v2/` stalled migration (depending on which pages consume v2)
- DEDUP-4 — Run / Analysis component family (if Models / Domains share these primitives)

DEDUP-8 (`isRecord`) is independent of report output — pure type guard.

## Active Inventory

| ID | Cluster | Slice | Severity | Lift | Status |
|---|---|---|---|---|---|
| DEDUP-1 | `pauseQueue` / `resumeQueue` — two implementations | API | High (bug risk) | Medium | Decision needed |
| ~~DEDUP-2~~ | ~~Schwartz + signature-preference forked web↔shared~~ | ~~Web/Shared~~ | ~~High~~ | ~~Small~~ | **Resolved (partial) — PR #937** |
| ~~DEDUP-3~~ | ~~`useRuns` vs `useRunsWithAnalysis` (and infinite variants)~~ | ~~Web~~ | ~~High~~ | ~~Small~~ | **Resolved — PR #934** |
| DEDUP-4 | Run vs Analysis list/card/folder views | Web | High | Large | Decision needed |
| DEDUP-5 | `analysis-v2/` stalled migration | Web | High | Large | Decision needed |
| DEDUP-6 | Snapshot builder twin (domain-analysis vs pressure-sensitivity) | API | Medium | Large | Decision needed |
| DEDUP-7 | `cloud/packages/db/src/queries/*` mostly orphaned | API/db | High | Medium | Decision needed |
| ~~DEDUP-8~~ | ~~`isRecord` defined 9 times~~ | ~~API~~ | ~~Medium~~ | ~~Trivial~~ | **Resolved — PR #928** |
| ~~DEDUP-9~~ | ~~`wilsonInterval` defined twice~~ | ~~API~~ | ~~Medium~~ | ~~Small~~ | **Resolved — PR #943** |
| DEDUP-10 | Decision-summary utility sprawl | Web | Medium-High | Large | Decision needed |
| ~~DEDUP-11~~ | ~~Shared `*-value-statements.ts` (4× boilerplate)~~ | ~~Shared~~ | ~~Medium~~ | ~~Small~~ | **Resolved — PR #TBD** |
| DEDUP-12 | Run lifecycle / recovery sprawl | API | Medium-Low | Large | Decision needed |
| DEDUP-13 | `validate_input` pattern across 5 workers | Workers | Low | Small | Open |
| DEDUP-14 | `DomainAnalysisLegacy` GraphQL query — alive, feeds Models + Domains pages | Web | Medium | Large (migration, not delete) | Decision needed |
| ~~DEDUP-15~~ | ~~`runsWithAnalysis(ids:)` resolver and query unused~~ | ~~API + Web~~ | ~~Medium~~ | ~~Small (deletion)~~ | **Resolved — PR #936** |

Status values: `Open` (mechanical, ready to do) · `Decision needed` (needs a direction call before code) · `Investigate` (verify before deleting) · `In progress` (PR open) · `Blocked`

## Cluster details

### DEDUP-1 — `pauseQueue` / `resumeQueue` two implementations

**Files:** `cloud/apps/api/src/services/queue/control.ts` (86 LOC), `cloud/apps/api/src/queue/orchestrator.ts` (140 LOC)
**Shared:** Both export `pauseQueue`, `resumeQueue`, `isQueuePaused`, `getQueueState` / `getOrchestratorState`.
**Differs:** `services/queue/control.ts` calls `stopBoss` / `startBoss`. `queue/orchestrator.ts` uses `boss.offWork` + `registerHandlers`. Different in-memory state vars. Both alive.
**Callers:** GraphQL mutations + queries layer (`mutations/queue.ts`, `queries/queue.ts`) → `services/queue/control.ts`. Server bootstrap (`index.ts`) → `queue/orchestrator.ts`.
**Canonical guess:** `services/queue/control.ts` (cleaner, used by GraphQL). Orchestrator's pause/resume looks like an older mechanism.
**Why it matters:** Pausing via GraphQL leaves `getOrchestratorState().isPaused === false`. Real bug surface — the only cluster in this audit with active-bug risk.
**Decision needed:** What's the intended semantics of "queue paused"? Should there be one source of truth, or do these track different things (admin pause vs runtime pause)?

### DEDUP-2 — Schwartz + signature-preference forked web↔shared

**Status: Resolved (partial) in PR #937 (2026-05-06).**

`cloud/apps/web/src/utils/signaturePreference.ts` (57 LOC) deleted. Both importers
(`useAvailableSignatures.ts`, `coverageMatrixHelpers.ts`) updated to import
`preferDefaultSignature` and `AvailableSignature` directly from `@valuerank/shared`.
Type rename (`AvailableSignature` → `PreferredSignatureOption`) handled with an import
alias at each consumer site.

`cloud/apps/web/src/utils/schwartz.ts` was NOT deleted — Phase 1 audit description was
inaccurate. The web file exports `formatFullSchwartzValueName` (using the web-local
`ValueKey` from `data/domainAnalysisData.ts`) which has no equivalent in the shared
package. It is not a duplicate. Its 4 importers (CircumplexMatrix, CircumplexMdsScatter,
ConfidenceDomainBreakout, ConfidenceHeatmap) were left untouched.

**Original notes (for history):**
- Files: `cloud/apps/web/src/utils/schwartz.ts` (18) ↔ `cloud/packages/shared/src/schwartz.ts` (33)
- Files: `cloud/apps/web/src/utils/signaturePreference.ts` (57) ↔ `cloud/packages/shared/src/signature-preference.ts` (57)
- Shared: Same algorithm; web `signaturePreference.ts` is line-for-line near-identical to the shared one.
- Differs: Web copy renames `AvailableSignature` → `PreferredSignatureOption` and uses `!= null` instead of truthy checks.
- Callers: Web `utils/signaturePreference.ts` → 2 importers (`useAvailableSignatures.ts`, `coverageMatrixHelpers.ts`).

### DEDUP-3 — `useRuns` / `useRunsWithAnalysis` twin hooks

**Status: Resolved in PR #934 (2026-05-05).**

Added `hasAnalysis?: boolean` and `analysisStatus?` params to `useRuns` and `useInfiniteRuns`. When `hasAnalysis: true`, both hooks pass the flag to the query and apply `.filter(isNonSurveyRun)` on the result. `Analysis.tsx` (the only `useInfiniteRunsWithAnalysis` caller) updated to `useInfiniteRuns({ hasAnalysis: true })`. `useRunsWithAnalysis` had no page-level callers (only a barrel re-export); barrel updated. Both wrapper files deleted. `comparison.graphql:RunsWithAnalysis` left untouched — it calls a different resolver (`runsWithAnalysis(ids: [ID!]!)`) and is unrelated.

**Original notes (for history):**
- Files: `cloud/apps/web/src/hooks/useRuns.ts`, `useRunsWithAnalysis.ts`, `useInfiniteRuns.ts`, `useInfiniteRunsWithAnalysis.ts`. Plus GraphQL `runs.graphql:Runs` and `comparison.graphql:RunsWithAnalysis`.
- Shared: Same `RUNS_QUERY`, same urql plumbing, same result shape.
- Differs: `WithAnalysis` variants preset `hasAnalysis: true` and filter via `isNonSurveyRun`. `comparison.graphql:RunsWithAnalysis` is an `ids: [ID!]!`-by-id variant.
- Callers: 5 page importers (`Analysis.tsx`, `Runs.tsx`, `SurveyResults.tsx`, `AnalysisDetailHeader.tsx`, `AnalysisConditionDetail.tsx`).
- Canonical: Collapse to `useRuns({ hasAnalysis })` / `useInfiniteRuns({ hasAnalysis })`.

### DEDUP-4 — Run vs Analysis list/card/folder views

**Files:** `cloud/apps/web/src/components/runs/{RunCard, RunFolderView, VirtualizedRunList, VirtualizedFolderView}.tsx` and `cloud/apps/web/src/components/analysis/{AnalysisCard, AnalysisFolderView, VirtualizedAnalysisList, VirtualizedAnalysisFolderView}.tsx`. ~1,500 LOC total.
**Shared:** Identical structure (confirmed by `diff`). `VirtualizedRunList` vs `VirtualizedAnalysisList` differ only by component name and `itemLabel`.
**Differs:** Analysis variants split items by an "Aggregate" tag; Run variants don't. Cards differ in icons + which fields are highlighted. `RunFolderView` vs `AnalysisFolderView` differ by ~25 lines.
**Callers:** `Analysis.tsx`, `Runs.tsx`, `SurveyResults.tsx`.
**Canonical guess:** A single `RunListView` family parameterized by a card renderer + optional aggregate-split prop.
**Decision needed:** Are the Run and Analysis surfaces meant to converge, or stay distinct product surfaces? If converge: this is a single design + refactor. If distinct: do we still want shared primitives underneath?

### DEDUP-5 — `analysis-v2/` stalled migration

**Files:** `cloud/apps/web/src/components/analysis/*` (~5,970 LOC) and `cloud/apps/web/src/components/analysis-v2/*` (~1,222 LOC, includes `analysisSemantics.ts`, `analysisSemantics.preference`, `analysisSemantics.reliability`, `analysisSemantics.types`, `analysisSemantics.utils`).
**Shared:** Concept of preference / reliability semantics.
**Differs:** v2 is a parallel view-model layer; only ~5 v1 files (`OverviewTab`, `OverviewSummaryTable`, `DecisionsTab`, `useAnalysisState`, `ModelConsistencyChart`) currently import v2. Every page-level entry still uses v1.
**Decision needed:** Finish the v1 → v2 migration, or formally retire v2? The "v2" name overstates current adoption. Until there's a direction, no code change should happen here.

### DEDUP-6 — Snapshot builder twin (domain-analysis vs pressure-sensitivity)

**Files:**
- `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-builder.ts` (~225) and `domain-analysis-cache.ts`
- `cloud/apps/api/src/services/pressure-sensitivity/snapshot-builder.ts` (350) and `snapshot-cache.ts`
- Queue handlers `refresh-domain-analysis-snapshot.ts` vs `refresh-pressure-sensitivity-snapshot.ts`

**Shared:** Both expose `writeSnapshot`, `parseSnapshotOutput`, `prepare*State`, `queue*Refresh`, `refresh*Snapshot`, `get*Result`. Same fingerprint + queue + cache pattern.
**Differs:** Domain shapes differ. Domain-analysis writes to `domain_analysis` snapshot table; pressure-sensitivity writes pair-keyed snapshots. Both flow `prepare → build → write` under transaction.
**Callers:** Each used in its own GraphQL query path + queue refresh handler (~6 callsites each).
**Canonical guess:** Likely a shared `SnapshotPipeline<T>` abstraction; today neither dominates.
**Decision needed:** Is the abstraction worth extracting now, or wait for a third snapshot pipeline before generalizing? The twin queue handlers (8 LOC shells) are the strongest dup — those alone could be merged.

### DEDUP-7 — `cloud/packages/db/src/queries/*` mostly orphaned

**Files:** `runs.ts` (381), `definitions.ts` (671), `analysis.ts` (371), `transcripts.ts`, `users.ts`, `llm.ts`. ~1,500 LOC total.
**Shared:** Hand-written Prisma helpers (`createRun`, `getRunById`, `listRuns`, `softDeleteRun`, `createDefinition`, `forkDefinition`, `listDefinitions`, `getAncestors`, `createExperiment`, etc.).
**Competing path:** API services (`services/run/*`) call `db.run.*` directly via Prisma. The hand-written helpers and the raw Prisma usage cover the same ground.
**Callers of helpers:** ~15 callsites total — `mcp/tools/delete-run.ts`, `mcp/tools/delete-definition.ts`, several `mcp/tools/*-llm-*.ts`, `scripts/debug-analysis.ts`. The handful of MCP tools is the only thing keeping them alive.
**Decision needed:** Adopt the helpers app-wide (delete raw-Prisma usage), or shrink the helpers to just what MCP needs and delete the rest? Either direction is a multi-PR program.

### DEDUP-8 — `isRecord` defined 9 times

**Status: Resolved in PR #928 (2026-05-05).** 8 byte-identical sites consolidated to `cloud/apps/api/src/utils/isRecord.ts`. The narrowing variant in `services/consistency/modelsConsistencyData.ts` was intentionally left in place per the Models-reports preserve constraint. `isPlainJsonObject` (queue/handlers/summarize-types.ts and 2 importers) was renamed to `isRecord` as part of the consolidation.

**Original notes (for history):**
- Files (exported): `mutations/run/lifecycle-helpers.ts`, `queries/domain/decision-model-helpers.ts`, `queue/handlers/summarize-types.ts` (as `isPlainJsonObject`).
- Files (private): `cli/normalize-aggregate-analysis-output.ts`, `cli/backfill-aggregate-consistency.ts`, `cli/backfill-job-choice-value-first.ts`, `cli/backfill-condition-weighted.ts`, `services/analysis/transcript-cell-accumulator.ts`, `services/consistency/modelsConsistencyData.ts`. `start-helpers.ts` has a different `asRecord`.
- Body: `value !== null && typeof value === 'object' && !Array.isArray(value)`. `modelsConsistencyData.ts` narrowed to `RawRecord`.

### DEDUP-9 — `wilsonInterval` defined twice

**Status: Resolved in PR #943 (2026-05-05).**

Canonical implementation: `cloud/apps/api/src/services/statistics/wilson-interval.ts`.
Signature: `wilsonInterval(matches, trials, z?) → { low, high, p } | null`.
Default z = 1.96 (matching both prior implementations).

**Boundary-contract decision:** Invalid inputs (trials ≤ 0, NaN, non-integer, etc.) now return `null` instead of throwing (was throwing in consistency) or returning zeros (was returning `{ low:0, high:0, p:0 }` for `trials=0` in consistency). This is the user-approved fail-loud contract. The `WilsonIntervalResult` type was deleted from `consistency/statistics.ts`.

Both `aggregation.ts` and `consistency/statistics.ts` now re-export `wilsonInterval` from the canonical module — external consumers see no import-path change. The `wilsonIntervalFromProportion` private helper stays in `aggregation.ts` because `diffProportionCI` calls it directly with a proportion input. All callers updated to handle `null`. Consistency test updated to expect `null` for `wilsonInterval(0, 0)`.

**Files:** `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts:378`, `cloud/apps/api/src/services/consistency/statistics.ts:69`.
**Shared:** Wilson confidence interval for a binomial proportion. Same math.
**Differs:** Different signatures. Pressure-sensitivity takes `(successes, trials)` returning `{lo, hi}`. Consistency takes `(matches, trials, z)` returning `WilsonIntervalResult`. Pressure-sensitivity also has a private `wilsonIntervalFromProportion`.
**Canonical:** Move to `services/statistics/` (already has `spearman.ts` there). Pick one return shape.
**Plan:** Note that consolidation will change return-shape contracts at 2 callsites — small refactor, not pure mechanical.

### DEDUP-10 — Decision-summary utility sprawl

**Files:** `cloud/apps/web/src/utils/{decisionLabels.ts (497), decisionBuckets.ts (123), decisionDistributionDisplay.ts (120), reportDecisionDisplay.ts (188), transcriptDecisionModel.ts (229), conditionDecisionSummary.ts (217), canonicalConditionSummary.ts (234), analysisCoverage.ts (184)}`.
**Shared:** All operate on `Transcript[]` to bucket / summarize decisions. Types `DecisionBucket`, `ReportDecisionSummary`, `ConditionDecisionSummary`, `CanonicalConditionSummary`, `DecisionCoverageSummary` overlap heavily.
**Differs:** Bucketing dimensions differ (a/b/neutral vs strong/lean/neutral/unknown vs canonical-vs-legacy).
**Callers:** 15+ across pages, hooks, charts. `decisionBuckets.ts` has 0 importers.
**Decision needed:** Pick one bucketing model (likely the "report" one — it's canonical) and merge. This needs a product/UX call about what "decision summary" means going forward.

### DEDUP-11 — Shared value-statements 4× boilerplate

**Status: Resolved in PR #TBD (2026-05-05).**

Consolidated the four 52-LOC files into `cloud/packages/shared/src/value-statements.ts` (220 LOC). All exported symbol names (`JOB_CHOICE_VALUE_STATEMENTS`, `NATIONAL_PRIORITIES_VALUE_STATEMENTS`, `NEIGHBORHOOD_VALUE_STATEMENTS`, `SOFTWARE_APPROACH_VALUE_STATEMENTS` and the four getter functions) are preserved exactly. `cloud/packages/shared/src/index.ts` updated to `export * from './value-statements.js'`. Zero caller changes required — all callers import from `@valuerank/shared` via the package barrel. Lint, build (shared + api + web), and report snapshots all pass.

**Original notes (for history):**
**Files:** `cloud/packages/shared/src/{job-choice, national-priorities, neighborhood, software-approach}-value-statements.ts` (52 LOC each, 208 total).
**Shared:** Same shape — a `[{token, body}]` array exported via `export *` from `index.ts`.
**Differs:** Only the `body` strings per scenario.
**Callers:** Each file used by exactly one seed script; one hits an API test.
**Canonical:** Single `value-statements.ts` keyed by scenario name (or a `defineValueStatements` factory).
**Plan:** Library hygiene; low risk because callers are seed scripts.

### DEDUP-12 — Run lifecycle / recovery sprawl

**Files:** `cloud/apps/api/src/services/run/{recovery.ts, recovery-jobs.ts, scheduler.ts, stall-detection.ts, progress.ts, summarize-progress.ts, derived-progress.ts, coverage-completeness.ts}`.
**Issue:** Borderline-overlapping responsibilities — three "progress" files (`progress.ts`, `derived-progress.ts`, `summarize-progress.ts`) all return `ProgressData`-shaped objects. `recovery.ts` vs `recovery-jobs.ts` (orphan detection vs requeue mechanics).
**Callers:** Heavy internal use plus `mcp/tools/recover-run.ts`, `mcp/tools/trigger-recovery.ts`, `cli/reopen-premature-runs.ts`, `mutations/run/recovery.ts`.
**Decision needed:** Probably needs a `services/run/lifecycle/` subdir merge, but no single canonical file today. Listed for completeness — fragmentation, not pure duplication.

### DEDUP-13 — `validate_input` pattern across 5 workers

**Files:** `cloud/workers/{summarize.py, compute_token_stats.py, probe.py, analyze_basic_aggregation.py, generate_scenarios.py}`.
**Shared:** Each defines `def validate_input(data: dict[str, Any]) -> None` raising `ValidationError`. Same protocol, same error type.
**Differs:** Bodies are domain-specific (different required keys per worker).
**Plan:** A common `workers/common/validation.py` with helpers like `require_field(name, type)` would shrink each worker by ~10 LOC and standardize error messages. Pattern duplication, not module duplication — low priority.

### DEDUP-14 — `DomainAnalysisLegacy` GraphQL query

**Files:** `cloud/apps/web/src/api/operations/domainAnalysis.graphql` defines both `DomainAnalysis` and `DomainAnalysisLegacy`. Web hook re-exports both as `DOMAIN_ANALYSIS_QUERY` and `DOMAIN_ANALYSIS_QUERY_LEGACY`.
**Verified callers (2026-05-05):**
- `cloud/apps/web/src/pages/ModelsGroups.tsx` (line 173) — feeds the **Models** report
- `cloud/apps/web/src/pages/DomainAnalysis.tsx` (line 141) — feeds the **Domains** report
- `cloud/apps/web/tests/pages/ModelsGroups.test.tsx` — tests for the same surface

**Reclassified:** Not dead. This query is alive and feeds two surfaces explicitly named in the Preserve list. Cannot be deleted. Resolution is a migration: pick a canonical shape (likely converging `DomainAnalysisLegacy` into `DomainAnalysis`), update the two pages and the test, and verify byte-equivalent report output for both Models and Domains.

**Decision needed:** Migration plan. Treat this as Large lift, paired with DEDUP-6 (snapshot builder twin) since both touch the domain-analysis pipeline.

### DEDUP-15 — `runsWithAnalysis(ids:)` resolver and query unused

**Status: Resolved in PR #936 (2026-05-05).**

The `runsWithAnalysis(ids: [ID!]!)` GraphQL resolver and its paired web query had zero product consumers. The architecture decision documented at `cloud/specs/016-analysis-tab/plan.md` (lines 43–51) explicitly chose NOT to have this resolver, preferring the canonical `runs(hasAnalysis: true)` filter instead. Phase 1 grep across `cloud/` confirmed no files outside the deleted files themselves referenced the resolver or its generated types.

**What was removed:**
- `cloud/apps/web/src/api/operations/comparison.graphql` — `RunsWithAnalysis` query block (~9 lines)
- `cloud/apps/web/src/api/operations/comparison.ts` — export + two manual query types (~15 lines)
- `cloud/apps/api/src/graphql/queries/run.ts` — resolver, `MAX_COMPARISON_RUNS` constant, `ValidationError` import (~55 lines)
- `cloud/apps/api/tests/graphql/queries/run.test.ts` — full `describe('runsWithAnalysis(ids)')` block (~226 lines)
- `cloud/apps/web/schema.graphql` — `runsWithAnalysis` field removed from schema snapshot
- `cloud/apps/web/src/generated/graphql.ts` — `RunsWithAnalysisDocument` and related codegen output removed

Total: ~250 LOC removed. Lint, build, and report snapshots all passed clean post-deletion.

## Dead-code candidates (verified 2026-05-05)

Phase 1 flagged six likely-dead files. Verification found four were **not** dead. Recording the audit trail so they don't get re-flagged.

| File | Verdict | Notes |
|---|---|---|
| `cloud/workers/temp_zero_report.py` | **Deleted (PR #928)** | No callers anywhere in `cloud/`. Confirmed standalone analyst script. |
| `cloud/workers/canary_runner.py` | **Deleted (PR #928)** | Same. |
| `cloud/apps/web/src/utils/decisionBuckets.ts` | Alive — keep | Imported by `analysisTranscriptFilters.ts:7` (`collectScenarioIdsForDecisionBucket`). Phase 1 missed this caller. |
| `cloud/apps/web/src/utils/displayLabels.ts` | Alive — keep | 17 importers across pages and components (`formatDisplayLabel`). Tiny utility but heavily used. |
| `cloud/workers/summarize_batch.py` | Alive — keep | Active batch-mode entry point. Reached via circular import from `summarize.py:__main__`. Not a deletion target — at most a refactor (fold into `summarize.py`). |
| GraphQL `DomainAnalysisLegacy` | Alive — see DEDUP-14 | Used by `pages/ModelsGroups.tsx` and `pages/DomainAnalysis.tsx` — Preserve surfaces. Reclassified as a migration cluster. |

## Demoted: looked duplicate, isn't

Recorded so future audits don't re-flag these.

| Cluster | Why it isn't a duplicate |
|---|---|
| `cloud/workers/summarize_*.py` (5 files) | One pipeline split for the 400-LOC linter cap. `summarize.py` orchestrates; `_batch` wraps batch envelope; `_extract` is regex/text-label extractors; `_llm` is LLM-fallback classifier; `_text` is normalization helpers. Real smell: `summarize.py` re-exports `_extract` symbols only so tests can patch them. |
| `cloud/workers/analyze_basic_*.py` (3 files) | Same pattern. `analyze_basic.py` is the orchestrator; `_aggregation.py` is pure helpers; `_metadata.py` is 22 lines of constants extracted purely to dodge the 400-LOC linter. |
| `cloud/workers/stats/*.py` siblings | Related but distinct (`basic_stats`, `variance_analysis`, `preference_stats`, etc. — each consumes different aggregations of the same scores). |
| `Cluster{Bar, Dot, Heatmap, Radar}*Plot.tsx` | Alternative views fed into a `viewMode` switch in `ModelGroupsSection.tsx`. |
| `mutations/run.ts`, `mutations/definition.ts`, `queries/domain.ts` (1–6 line files) | Intentional re-export barrels next to `*/index.ts`. |

## Infrastructure

Tracking infrastructure that protects against dedup-induced (or any) drift in user-facing report output.

| ID | Project | Status | Notes |
|---|---|---|---|
| DEDUP-INFRA-1 | Report snapshot check | Live in PR #928 | Locks the GraphQL responses for every Models-nav page at `signature=vnewtd`, all domains, default models. CI runs on every push to `main` and on a 6h cron. Required repo secret: `PROD_API_KEY`. Fixtures in `cloud/tests/snapshot-baselines/`. Verify locally with `npm run verify:report-snapshots` from `cloud/`. |

## Resolved

### Cluster consolidations

| ID | Cluster | PR | Date | Notes |
|---|---|---|---|---|
| DEDUP-8 | `isRecord` consolidation | #928 | 2026-05-05 | 8 byte-identical sites consolidated to `cloud/apps/api/src/utils/isRecord.ts`. `isPlainJsonObject` renamed to `isRecord` in summarize handlers. `services/consistency/modelsConsistencyData.ts` narrowing variant intentionally left in place per Models-reports preserve constraint. |
| DEDUP-3 | `useRuns` / `useRunsWithAnalysis` hook collapse | #934 | 2026-05-05 | Added `hasAnalysis` + `analysisStatus` params to `useRuns` and `useInfiniteRuns`. Deleted `useRunsWithAnalysis.ts` and `useInfiniteRunsWithAnalysis.ts`. `comparison.graphql:RunsWithAnalysis` left in place (different resolver). |
| DEDUP-15 | `runsWithAnalysis(ids:)` resolver and web query deleted | #936 | 2026-05-05 | Zero consumers. Architecture decision at `cloud/specs/016-analysis-tab/plan.md` chose `runs(hasAnalysis:)` instead. ~250 LOC removed across API resolver, tests, web query, re-export, manual types. Schema snapshot and codegen regenerated. |
| DEDUP-2 | `signaturePreference` fork web↔shared (partial) | #937 | 2026-05-06 | Deleted `cloud/apps/web/src/utils/signaturePreference.ts` (57 LOC). Updated 2 importers to use `@valuerank/shared`. `schwartz.ts` NOT deleted — not a true duplicate (exports different function). |
| DEDUP-9 | `wilsonInterval` consolidation | #943 | 2026-05-05 | Canonical: `cloud/apps/api/src/services/statistics/wilson-interval.ts`. Invalid inputs now return `null` (fail-loud contract). `WilsonIntervalResult` type deleted. Both prior sites re-export from canonical. `wilsonIntervalFromProportion` stays local in `aggregation.ts` (used by `diffProportionCI`). |
| DEDUP-11 | Shared `*-value-statements.ts` consolidation | #TBD | 2026-05-05 | 4 files × 52 LOC → 1 file (220 LOC). All exported symbol names preserved; zero caller changes. Lint, build (shared + api + web), and report snapshots all pass. |

### Dead-code deletions

| File | PR | Date | Notes |
|---|---|---|---|
| `cloud/workers/temp_zero_report.py` | #928 | 2026-05-05 | Standalone analyst script; no callers in `cloud/`. |
| `cloud/workers/canary_runner.py` | #928 | 2026-05-05 | Same. |

## Phase 2 — recommended starting order

DEDUP-8, DEDUP-3, DEDUP-2 (partial), DEDUP-9, and DEDUP-11 are done. Suggested next picks:

1. **DEDUP-13** (`validate_input` in 5 workers) — small, self-contained, no contract changes.
2. **DEDUP-1** (`pauseQueue`) — start with a design note, not code. The only active-bug cluster.

Note: `cloud/apps/web/src/utils/schwartz.ts` was audited during DEDUP-2 and found NOT to be a duplicate. It exports `formatFullSchwartzValueName` which has no equivalent in shared. Remove the schwartz half of DEDUP-2 from any future planning.

Larger clusters (DEDUP-4, DEDUP-5, DEDUP-6, DEDUP-7, DEDUP-10, DEDUP-12, DEDUP-14) need a direction call before any implementation. DEDUP-14 is now paired with DEDUP-6 since both touch the domain-analysis pipeline and feed Preserve surfaces.
