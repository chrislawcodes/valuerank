# Implementation Plan: Models Consistency Report

**Branch:** `claude/gifted-euclid-294e5d` | **Date:** 2026-04-19 | **Revised:** 2026-04-19 (post-checkpoint)
**Spec:** `docs/workflow/feature-runs/models-consistency-report/spec.md`

## Summary

Add a `/models/consistency` page (nested under the existing Models tab) that shows every model's **Repeatability** (test-retest, random-effects meta-analysis CI) and **Coherence** (per-pair Spearman over net pressure) as a failure-mode scatter, a sortable table, and a per-model drill-down. All statistical work happens server-side; the client renders. The existing `ConditionMatrix` and `PairedStabilityView` components are **not** modified — the drill-down computes summary chips and deep-links out to the pages those components already render inside.

Four implementation slices, each under ~300 lines: (A) API calculation + resolver + SDL, (B) web types + routing + page skeleton, (C) scatter + table, (D) drill-down + progressive-disclosure tooltips.

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Round 4 real findings fixed: domainId carried alongside signature in URL (HIGH-8), repeatPattern corrected from invalid paired-stability to canonical noisy (MEDIUM-10). Stale re-flags of earlier URL shape (already corrected in Decision 10a) and per-scenario data (external dependency, accepted) are context-narrowing artifacts, not action items.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.codex.dependency-order-adversarial.review.md | status: accepted | note: HIGH findings fixed in tasks.md: (1) ConsistencyPerPair extended with conditionsMeasured + perCondition array (with matches, trials, scenarioId) so MetricDisclosure Level-4 rows have the data they need; (2) A4 step 11 now explicitly says 'move' models below minScenarios (remove from models[] AND push to insufficient[]) so no double-counting. MEDIUM URL-writeback fixed in B4: defaults are written back via setSearchParams on first render. MEDIUM runMatchesSignature on historical data accepted as residual risk — acceptable v1 trade-off.

## Technical Context

| Aspect | Detail |
|---|---|
| Language | TypeScript (strict, no `any`) |
| API framework | Pothos (code-first GraphQL) |
| API schema exposure | `cloud/apps/web/schema.graphql` — manually maintained SDL snapshot |
| Web framework | React + urql + Vite |
| Codegen | `npm run codegen --workspace @valuerank/web` |
| DB access | Prisma — reads from existing analysis result tables (no new tables) |
| Testing | Vitest (API and web) |
| File size limit | 400 lines max per file |
| New DB tables | None |
| Performance target | ~8 models × 270 definitions; all server-side math completes in < 500 ms per request. No caching in v1. |

---

## Architecture Decisions

### Decision 1: All statistics computed server-side

**Chosen:** Both Repeatability (random-effects meta-analysis) and Coherence (Spearman + p-value aggregation) are computed in the API resolver. The client fetches final per-model numbers **plus** the per-scenario and per-pair breakdowns needed for drill-down and progressive disclosure.

**Rationale:**
- DerSimonian-Laird and Spearman are well-trodden but non-trivial — safer in one tested server-side utility.
- Keeps the client bundle small and deterministic.
- Drill-down data lives alongside the summary so the client avoids extra round-trips.

**Alternative considered:** Client-side computation. Rejected (duplicates math, ships DL/Spearman to every page load).

### Decision 2: New GraphQL query `modelsConsistency`, parallel to `modelsAnalysis`

**Chosen:** `Query.modelsConsistency(domainId: ID, providerId: ID, minScenarios: Int, signature: String!)` returns a hierarchical response:

```
ModelsConsistencyResult
  models: [ModelConsistencyResult]
  insufficient: [InsufficientModel]   # rows for the footer

ModelConsistencyResult
  modelId, label, provider
  repeatability { value, ciLow, ciHigh, withinScenarioSd, betweenScenarioSd,
                  scenariosMeasured, perDomain: [...], perScenario: [...] }
  coherence     { value, coherentPairs, determinatePairs, indeterminatePairs,
                  perPair: [...] }
  orderEffect   { samePct, flippedPct, noisyPct, notApplicable }
```

**Rationale:** Mirrors the `modelsAnalysis` pattern; hierarchical shape matches the progressive-disclosure stack (FR-015); all filtering server-side.

### Decision 3: Statistics live in a dedicated utility module

**Chosen:** `cloud/apps/api/src/services/consistency/statistics.ts` (≤ 400 lines):

```
wilsonInterval(matches, trials, z = 1.96) → { low, high, p }
dersimonianLairdPool(scenarioStats[]) → { estimate, ciLow, ciHigh,
                                          withinSd, betweenSd, tauSquared }
spearmanRankCorrelation(x, y)         → { rho, p }  // handles tied ranks
coherenceForPair(conditionStats[])    → { rho, p, coherent, determinate }
                                        // handles zero-variance input → indeterminate
netPressureRank(condition)            → number  // +2 / +1 / 0 / −1 / −2 from canonical labels
```

All pure functions; worked-example unit tests cite textbook values (DerSimonian & Laird 1986 worked example, tied-rank Spearman from Kendall & Gibbons).

### Decision 4: Canonical net-pressure mapping

**Chosen:** Canonical condition labels map to integer pressure levels: `strongly: +2, somewhat: +1, neutral: 0, opponentSomewhat: −1, opponentStrongly: −2`. The per-condition net pressure is `target_appeal − opponent_appeal`. A value pair is treated as `determinate` for Coherence purposes only if **all four** of these hold:

1. Every condition in that pair uses a label from the canonical set (subset usage is fine — a pair using only `strongly / somewhat / neutral` is still determinate; Spearman is computed over whatever canonical levels are present).
2. The pressure-rank vector has non-zero variance (not all conditions collapse to the same net-pressure value).
3. The pair has enough conditions to compute a Spearman p-value (Spearman needs n ≥ 3; with ties, effective n may be lower — handled inside `coherenceForPair`).
4. The resulting p-value is ≤ 0.05.

If any of (1)–(3) fails the pair is `indeterminate` and excluded from both numerator and denominator of Coherence. If (1)–(3) succeed but (4) fails (p > 0.05), the pair is **determinate but not coherent** — it is included in the denominator and counted as a non-coherent pair, consistent with the spec's FR-003 and the edge-case rule "Spearman ρ is unstable → exclude with a note" re-interpreted as a weak but visible signal.

**Rationale:** The canonical condition data already carries this ordering; no new mapping needed. The subset-is-OK clause preserves usable signal on partial grids. Resolves spec Open Question 4.

### Decision 5: Web routing — nested sub-tabs under existing `/models`

**Chosen:** Models tab gains two sub-tabs: `Matrix` (existing, default at `/models`) and `Consistency` (new, at `/models/consistency`). Existing `/models` URL unchanged.

**Rationale:** Matches user mental model; preserves link stability. Resolves spec Open Question 3.

### Decision 6: Progressive-disclosure components are generic

**Chosen:** One reusable `<MetricDisclosure>` component accepts a metric's definition, formula, and drill-down payload and renders the 4-level tooltip/panel stack. Repeatability and Coherence instantiate with different payloads.

**Rationale:** FR-015 is parallel across metrics; one component enforces consistency.

### Decision 7: No caching in v1

**Chosen:** Compute on every request. No memoization, no Redis, no snapshots.

**Rationale:** At ~54,000 per-scenario items per full query, math runs in < 500 ms on a single worker. Caching adds surface without benefit at current scale.

### Decision 8: `invalid-summary-shape` is a first-class state

**Chosen:** Three row outcomes: `ok`, `insufficient-coverage`, `invalid-summary-shape`. The existing reliability builder already emits these states — we propagate them.

**Rationale:** FR-011; makes pipeline corruption visible instead of mislabeling it.

### Decision 9: Signature scope — inherited from Models tab context

**Chosen:** The resolver's `signature` argument is **required**. The web page reads the Models tab's existing `selectedSignature` (today fetched via `DOMAIN_AVAILABLE_SIGNATURES_QUERY` in `Models.tsx` line 29; default from `DEFAULT_SIGNATURE`) and passes it through to every `modelsConsistency` query. Changing the signature on the Models tab re-fetches the Consistency report.

**Signature filter mechanism (corrected from code review):** There is **no `run.config.signature` column to filter on directly**. Signatures are derived from `definitionSnapshot._meta.definitionVersion` / `definitionSnapshot.version` plus `temperature` in the run's `config` JSON, via `formatTrialSignature` from `@valuerank/shared/trial-signature`. The resolver MUST filter candidate aggregate runs in-memory using the existing `runMatchesSignature(run.config, signature)` helper from `cloud/apps/api/src/graphql/queries/domain-coverage-gql-types.ts` (line 123) — the same pattern used in `domain-coverage.ts` line 172. Do **not** attempt a Prisma `where` clause on `run.config.signature`; that field does not exist.

**Rationale:**
- The existing Models matrix already honors this scope; users expect the Consistency sub-tab to match.
- Aggregate eligibility in the pipeline is keyed on `eligible_same_signature_baseline` — mixing signatures silently would produce invalid metrics (HIGH-2 finding).
- Making the argument required prevents accidental cross-signature queries.
- Reusing `runMatchesSignature` keeps signature logic in one place.

**Client-side scope sharing — URL search params for both domain AND signature:**

To preserve the spec's "byte-for-byte unchanged" guarantee on the existing `/models` Matrix page, we do **not** lift state out of `Models.tsx`. Instead, we carry both `domainId` and `signature` through the URL so the Consistency route can render the same scope the user selected on the Matrix:

1. The new `/models/consistency` route reads `?domainId=...&signature=...` from the URL search params (via `useSearchParams()`).
2. `Models.tsx` remains untouched — it continues to manage its own local `selectedDomainId` and `selectedSignature` state and the existing domain-change reset behavior (line 29: reset to `DEFAULT_SIGNATURE` when `selectedDomainId` changes) is preserved.
3. When the user selects a domain + signature on the Matrix sub-tab and clicks over to Consistency via the nav, the destination URL is built with both params baked in by the `ModelsTabNav` component.
4. If the Consistency route is hit directly (deep link, refresh) **without** `domainId` or `signature`, the page falls back to its own `DomainAvailableSignaturesQuery` lookup and picks `DEFAULT_SIGNATURE`, and uses its own "first domain" default — preserving parity with how Matrix behaves on first load.

**Why both params, not just signature** (round-4 correction): domain scope is also local state in `Models.tsx`. If only signature were URL-carried, the Consistency sub-tab would silently drift to a different domain than the Matrix after tab switches. Carrying both guarantees the two sub-tabs show the same analysis universe.

**Implementation note:** The URL-search-param approach removes any modification to `Models.tsx` state management. Only `App.tsx` (new route) and a new `ModelsTabNav.tsx` (emits URLs for both sub-tabs with the current domain + signature) are touched. Regression test: open `/models`, select a non-default domain + signature, switch sub-tabs via the nav, assert the Consistency page query received both values from the URL.

### Decision 10a: Deep-link spec — `View condition matrix →`

**Chosen:** The per-pair Coherence chip builds a URL of the form:

```
/domains/analysis/value-detail?domainId={domainId}&modelId={modelId}&valueKey={valueKey}&signature={signature}&scoreMethod={scoreMethod}
```

pointing to the existing `DomainAnalysisValueDetail` page (`App.tsx` line 173; read via `useSearchParams` in `DomainAnalysisValueDetail.tsx` lines 30–36), where `ConditionMatrix` is embedded. All five values are URL-encoded.

**Required query params** (verified against source):
- `domainId` — required
- `modelId` — required
- `valueKey` — required
- `signature` — optional on the target page but we always pass it to match the Models tab scope
- `scoreMethod` — optional, defaults to `LOG_ODDS`; pass `LOG_ODDS` unless the user selected `FULL_BT` elsewhere

**Reference implementation to copy:** `ModelValueDetailDrawer.tsx` line 340 already builds exactly this URL shape (`to={`/domains/analysis/value-detail?domainId=${encodeURIComponent(domain.domainId)}&modelId=${encodeURIComponent(model.modelId)}&valueKey=${encodeURIComponent(value.valueKey)}`}`). The Consistency chip reuses the same pattern plus signature/scoreMethod appended.

**Rationale:**
- Matches the actual registered route in `App.tsx` (not the guessed `/domains/{domainId}/values/{valueKey}` from the pre-correction plan).
- `domainId`, `valueKey`, `modelId`, `signature`, and `scoreMethod` are all present in the per-pair data payload the resolver returns, so URL construction is a direct mapping.
- No existing page needs modification; we build the URL in the new report and link out.

### Decision 10b: Deep-link spec — `View transcripts →`

**Chosen:** The order-effect chip builds a URL via the existing `buildAnalysisTranscriptsPath` helper in `cloud/apps/web/src/utils/analysisRouting.ts` (line 69). The URL shape is:

```
/analysis/{runId}/transcripts?modelId={modelId}&repeatPattern={pattern}&companionRunId={companionId}&primaryConditionIds={ids}&companionConditionIds={companionIds}
```

**Required query params** (verified against `useAnalysisTranscriptParams.ts` lines 49–58; `isPairedStabilityDrilldown` requires `repeatPattern && companionRunId && searchParams.has('primaryConditionIds')`):
- `modelId` — read via `searchParams.get('modelId') ?? searchParams.get('model')` on the target; pass `modelId`
- `repeatPattern` — one of the canonical repeat patterns (`stable`, `softLean`, `torn`, `noisy`) per `formatRepeatPatternLabel` in `analysisTranscriptParams.ts` line 73. **Use `noisy`** for the order-effect drilldown. `paired-stability` is **not** a valid value (round-4 correction); the paired-stability drilldown is activated by the combination of `repeatPattern` + `companionRunId` + `primaryConditionIds` search params, not by a dedicated token.
- `companionRunId` — the paired aggregate run's ID
- `primaryConditionIds` — **required** for the drilldown to activate; comma-separated scenario IDs from the primary run (ordered `A→B`)
- `companionConditionIds` — comma-separated scenario IDs from the companion run (ordered `B→A`); required so the hook can split the two vignette orders

**Reference implementation to copy:** `OverviewTabComponents.tsx` lines 201–202 already build this exact URL with `primaryConditionIds` and `companionConditionIds` joined from the metrics struct. The Consistency chip reuses the same building block.

**Rationale:**
- The pairing logic lives in `useAnalysisTranscriptsData` and `useAnalysisTranscriptParams`, not `PairedStabilityView` (which is presentational). The deep-link reaches the hook via the existing route.
- `runId`, `companionRunId`, and the condition IDs are already emitted by the aggregate analysis pipeline; we surface them in the `orderEffect` payload from the resolver.
- Zero modifications to `PairedStabilityView`, `AnalysisTranscripts`, or the hook. Matches the "link, don't modify" direction from the spec.

---

## Implementation Slices

### Slice A — API: statistics module + resolver + SDL + pairing-helper extraction [CHECKPOINT]
Estimated diff: ~350 lines (trimmed to ≤ 300 via the split below if it grows)

**Files:**
- `cloud/apps/api/src/services/consistency/statistics.ts` (NEW, ~160 lines) — pure math
- `cloud/apps/api/src/services/consistency/statistics.test.ts` (NEW, ~100 lines) — textbook-example unit tests, including **zero-variance Spearman → indeterminate** and **single-scenario DL → fall back to Wilson with `betweenSd = 0`**
- `cloud/apps/api/src/services/consistency/orderEffectPairing.ts` (NEW, ~40 lines) — extracted from where pairing logic currently lives (search: `companionRunId` / `pairedBatchGroupId` handling in the analysis-result service). If extraction turns out larger than ~60 lines, split into A1 (extraction PR) and A2 (consistency service) — **no duplication**.
- `cloud/apps/api/src/services/consistency/orderEffectPairing.test.ts` (NEW, ~50 lines)
- `cloud/apps/api/src/graphql/types/models-consistency.ts` (NEW, ~100 lines) — Pothos types matching Decision 2
- `cloud/apps/api/src/graphql/types/index.ts` (1 line — add import)
- `cloud/apps/api/src/graphql/queries/models-consistency.ts` (NEW, ~200 lines) — resolver
- `cloud/apps/api/src/graphql/queries/models-consistency.test.ts` (NEW, ~120 lines) — resolver integration tests with discrete mocks (see Testing Strategy)
- `cloud/apps/web/schema.graphql` (append ~70 lines of SDL)

**Resolver flow (pseudocode) — roster-first pattern:**

```
args: { domainId?, providerId?, minScenarios?, signature! }

1. Load full model roster:
     activeModels = db.llmModel.findMany({ status: 'ACTIVE' })
     // optionally filter by providerId arg
2. Load candidate aggregate runs WITHOUT filtering on run.config.signature
   (that field does not exist — see Decision 9):
     runs = db.run.findMany({
       where: {
         tags: { some: { tag: { name: 'Aggregate' } } },   // nested tag relation
         status: 'COMPLETED',                              // uppercase enum
         ...(domainId && { definition: { domainId } }),
         deletedAt: null,
       },
       include: { analysisResults: true },                 // plural, not analysisResult
     })
3. Filter runs in memory using the canonical helper:
     eligibleRuns = runs.filter(r => runMatchesSignature(r.config, signature))
4. For each model in activeModels:
     resultsForModel = eligibleRuns
       .flatMap(r => r.analysisResults)                    // plural
       .filter(ar => ar.analysisType === 'AGGREGATE' && ar.status === 'CURRENT')
       .map(ar => parseRawReliabilitySummaryEntry(ar.reliabilitySummary?.perModel?.[model.modelId]))
       .filter(Boolean)
     if (resultsForModel.length === 0):
        insufficient.push({ modelId, reason: 'no-repeat-coverage' })
        continue
     if (any parse returned invalid-summary-shape):
        insufficient.push({ modelId, reason: 'invalid-summary-shape' })
        continue
5. Extract per-scenario (matches, trials) from the parsed entries
   (depends on pipeline prerequisite — see Dependencies. If field is absent
    at query time, fall back to the empty-state path; this is explicitly
    acceptable during the rollout window.)
6. dersimonianLairdPool(perScenarioStats) → model-level Repeatability + CI
   Pool separately per domain for perDomain
7. For each (model, value pair):
     extract per-condition { netPressureRank, winRate } from the existing
     canonical condition grid
     coherenceForPair(...) → { rho, p, coherent, determinate }
   Aggregate → model.coherence
8. orderEffectPairing.compute(transcriptPairs) → { samePct, flippedPct, noisyPct }
9. Apply minScenarios filter → move models below threshold from models[] to insufficient[]
```

**Why start from the roster, not the results** (per Gemini F-02): a results-first scan would silently omit models that have zero coverage. Spec US-1 AS-3 requires those models to appear in the "Insufficient coverage" footer. Roster-first iteration makes the missing rows explicit.

### Slice B — Web: types + routing + Models-tab sub-nav + page skeleton [CHECKPOINT]
Estimated diff: ~230 lines

**Files:**
- `cloud/apps/web/src/api/operations/modelsConsistency.graphql` (NEW)
- `cloud/apps/web/src/api/operations/modelsConsistency.ts` (NEW)
- `cloud/apps/web/src/generated/graphql.ts` (regenerated)
- `cloud/apps/web/src/pages/ModelsConsistency.tsx` (NEW, skeleton: loading / error / empty-state shells)
- `cloud/apps/web/src/App.tsx` (add `/models/consistency` route)
- `cloud/apps/web/src/components/models/ModelsTabNav.tsx` (NEW or extend — sub-tabs `Matrix` / `Consistency`)
- `cloud/apps/web/src/pages/Models.tsx` — **not modified** (see Decision 9). The URL-search-param approach means the sub-tab nav builds outgoing URLs with the current signature; `Models.tsx` keeps its existing local state and domain-change reset behavior unchanged.

### Slice C — Web: scatter + table + insufficient-coverage footer [CHECKPOINT]
Estimated diff: ~280 lines

**Files:**
- `cloud/apps/web/src/components/models/ConsistencyScatter.tsx` (NEW, ~150 lines)
- `cloud/apps/web/src/components/models/ConsistencyTable.tsx` (NEW, ~130 lines)
- `cloud/apps/web/src/components/models/InsufficientCoverageFooter.tsx` (NEW, ~60 lines) — groups rows by `insufficient-coverage` vs `invalid-summary-shape`

### Slice D — Web: drill-down + MetricDisclosure + filters [CHECKPOINT]
Estimated diff: ~330 lines (split into D1 + D2 if > 300)

**Files:**
- `cloud/apps/web/src/components/models/ConsistencyDrill.tsx` (NEW, ~180 lines) — per-model drill-down; chips with `View condition matrix →` and `View transcripts →` links built per Decisions 10a/10b
- `cloud/apps/web/src/components/models/MetricDisclosure.tsx` (NEW, ~150 lines) — reusable 4-level progressive-disclosure component
- `cloud/apps/web/src/components/models/ConsistencyFilters.tsx` (NEW, ~80 lines) — Domain, Provider, Min n filters wired to query variables (signature is inherited, not a filter — per Decision 9)

---

## Parallelization Opportunities

| Opportunity | Safe? |
|---|---|
| Slice A statistics.ts + orderEffectPairing.ts (disjoint files, both pure) | yes — `[P]` candidate |
| Slice A (API) ↔ Slice B (web) | no — Slice B codegen depends on Slice A SDL |
| Slice C scatter ↔ Slice C table | yes — disjoint files, same fetched data |
| Slice D ConsistencyDrill ↔ Slice D MetricDisclosure | partial — Disclosure is used by Drill, but can be built & tested in isolation first |

Announce parallel splits before delegating.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **Pipeline per-scenario `(matches, trials)` not surfaced** by time this feature ships (HIGH-1) | Treated as external prerequisite, user-owned. Plan ships empty-state UI (US-6) that renders cleanly while pipeline is catching up. Fallback: live re-count from transcripts at query time — adds ~1–2 s to query latency at current scale; acceptable as a temporary stopgap if flagged in Slice A. Documented but not implemented in v1. |
| **Signature mismatches** silently invalidate metrics (HIGH-2) | Decision 9: `signature` is a required resolver argument; the web page inherits from Models tab context. Resolver tests cover the "missing signature" error path. |
| **`ConditionMatrix` / transcripts deep-link URL drift** — if someone later renames the route params, the consistency chips would 404 | Centralize URL construction in `analysisRouting.ts` (already used by other pages). Tests in Slice D assert the built URL matches the expected shape. |
| **Order-effect pairing helper extraction is invasive** | If extraction turns out to be > 60 lines, split into A1 (extraction-only PR, ships first) and A2 (consistency service using the extracted helper). Duplication is explicitly forbidden. |
| **DerSimonian-Laird degenerate cases** (single scenario; zero between-scenario variance) | Handled explicitly in `dersimonianLairdPool` — fall back to pure Wilson CI and set `betweenSd = 0`. Tooltip shows "within-scenario only." Unit-tested. |
| **Zero-variance Spearman input** (all conditions share net-pressure rank — e.g. all-neutral vignette) | `coherenceForPair` detects zero variance and returns `{ determinate: false }` so the pair is excluded from the denominator. Unit-tested (LOW finding F-04). |
| **Recharts scatter performance** | 8 models is trivial. Revisit only if future filters produce hundreds of dots. |
| **Models tab `selectedSignature` sharing** accidentally breaks the existing Matrix | URL-search-param approach (Decision 9) avoids any modification to `Models.tsx`. Regression test asserts sub-tab navigation preserves the current signature. |

---

## Testing Strategy

### Statistics module (`statistics.test.ts`)
- Wilson CI: assert on known reference values (`k=20, n=25` → `p=0.80, CI ≈ 0.61–0.92`)
- DerSimonian-Laird: worked example from the 1986 paper
- DerSimonian-Laird **degenerate**: single-scenario input → `betweenSd = 0`, falls back to scenario's Wilson CI
- Spearman with tied ranks: reference example from Kendall & Gibbons
- Spearman **zero-variance** input: returns `{ determinate: false }` (LOW F-04)

### Order-effect pairing helper (`orderEffectPairing.test.ts`)
- Both orders present → same / flipped / noisy counts match expected
- Only one order present → `notApplicable: true`
- Mixed — some scenarios paired, some not → correct proportions over paired subset only

### Resolver (`models-consistency.test.ts`)
Per Gemini finding F-03, mock **discrete dependencies** explicitly:

- `db.analysisResult.findMany` — mocked to return fixture rows for each test case
- `parseRawReliabilitySummaryEntry` — real implementation is a pure function; use real import
- `orderEffectPairing.compute` — real import (exercised via fixture transcripts)
- `statistics.*` — real import (already tested)

Test cases:
- Normal case: 3 models × 5 scenarios → expected Repeatability and Coherence values
- `invalid-summary-shape` fixture row → model appears in `insufficient[]` with the right reason
- Signature filter applied: rows with non-matching signature are excluded
- `minScenarios` filter applied: low-coverage model moves to `insufficient[]`
- No models have any coverage → empty `models`, non-empty `insufficient[]` with pipeline-pending reason

### Web components (`*.test.tsx`)
- Scatter renders dots for N models, colored by provider
- Table sorts on column click
- Drill-down opens with correct data when a row is clicked
- MetricDisclosure navigates Level 2 → 3 → 4 on progressive clicks
- Insufficient-coverage footer groups rows by reason (`insufficient-coverage` vs `invalid-summary-shape`)
- `View condition matrix →` link generates the URL pattern from Decision 10a (test uses URL assertion only — does not need the target page to exist in test)
- `View transcripts →` link generates the URL pattern from Decision 10b (same)

### E2E (deferred, not in v1 scope)
- Playwright opens `/models/consistency`, verifies a known model's summary matches a fixture.

---

## Rollout

Additive route; no feature flag needed. Models tab gains a sub-nav; `/models` URL continues to render the Matrix unchanged. Standard PR + Railway deploy.

---

## Dependencies (external to this feature)

- **`AGGREGATE`-analysis pipeline** emits per-scenario `(matches, trials)` counts inside `reliabilitySummary.perModel[modelId].perScenario[scenarioId]`. Exact field name decided by the pipeline work; this report reads whatever shape the pipeline produces and adapts its `parseRawReliabilitySummaryEntry` input accordingly. **User is resolving in parallel; this feature does not block on it but cannot render real numbers until it lands.**
- **`selectedSignature`** is available from the Models tab's existing `DOMAIN_AVAILABLE_SIGNATURES_QUERY` path (`cloud/apps/web/src/pages/Models.tsx`). No new backend work needed for the signature wiring.
- **`ConditionMatrix`** continues to render inside `DomainAnalysisValueDetail` at `/domains/:domainId/values/:valueKey`. We link to it; zero modifications.
- **`AnalysisTranscripts` route** continues to accept the `repeatPattern=paired-stability` search param and render `PairedStabilityView`. We link to it; zero modifications.
- **Canonical condition labels** from `canonicalConditionSummary.ts` provide the appeal-level ordering for net pressure.

---

## Open Items Deferred to Tasks Phase

1. Exact SDL names for the new GraphQL types (bikeshed; resolved in Slice A PR review).
2. Color palette for green/red/gray Coherence chips — use existing app palette; decided in Slice D.
3. `MetricDisclosure` primitive — shadcn popover vs. existing `Tooltip` — decided in Slice D by surveying existing Models-tab patterns.
4. Whether "Copy methodology" button (US-7, P3) lands in v1 — decided in tasks review.
5. Whether order-effect pairing extraction is a standalone PR (Slice A1) or part of the main Slice A PR — decided at the start of Slice A based on measured diff size.
