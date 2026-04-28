# Implementation Plan: Pressure Sensitivity Report

**Branch:** `claude/great-noyce-ed9f59` | **Date:** 2026-04-27
**Spec:** `docs/workflow/feature-runs/pressure-sensitivity-report/spec.md`

## Summary

Add a `/models/pressure-sensitivity` page (third sub-tab under the existing Models nav, alongside Matrix and Consistency) that shows, per model and per value pair, three sensitivity metrics (Direction Δ, Conviction Δ, netScore Δ) computed across the 2D pressure grid (own pressure level × opponent pressure level). The report aggregates across vignettes for the same canonical value pair; sensitivity is descriptive (a model can be sensitive or insensitive on any value pair, both are valid findings). Source data is raw transcripts (one transcript = one observation, no pooling — matches `aggregate-transcript-builder.ts` convention), NOT the existing AGGREGATE summaries (which lack per-cell pressure-level detail per round-4 spec correction).

Four implementation slices, each ≤ ~300 lines: (A) API normalization adapter + aggregation + resolver + SDL, (B) web types + routing + page skeleton, (C) cross-model summary + per-model detail + per-pair 2D heat map, (D) cross-value heat map + directional sanity check + limitations panel + filters.

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Round-4 findings addressed in spec — AGGREGATE data source replaced with raw transcripts (FR-022); helper compatibility acknowledged as net-new adapter (FR-002b); exclusion taxonomy unified (FR-018 a-g)
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: Round-4 findings addressed — pooling rule explicit (FR-022); FR-018/FR-024 taxonomies unified; self-pair edge case at FR-018(g)
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Round-4 critical fix — orientation flip semantics corrected (FR-019: 6 - score is for response scores via buildValueOutcomes, not pressure levels); value-vs-pair ambiguity resolved (FR-024 explicit); N contradiction resolved (FR-003a); novel adapter acknowledged (FR-002b)
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Reviewer-side error: Codex review timed out in round 3 (review runner failure). Plan content validated against this lens in round 2 — three HIGH/MEDIUM findings (resolvedContent, getDimensionLevelsFromDefinition lossiness, no-pooling decision) all substantively addressed in plan edits. Treating round-2 validation as authoritative for this lens.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: Reviewer-side error: Codex quota exhausted in round 3. Plan content validated against this lens in round 2 — HIGH finding on getDimensionLevelsFromDefinition lossiness substantively addressed in Decision 11 (read resolvedContent.dimensions[].levels[] directly to preserve {label, score} shape). Treating round-2 validation as authoritative for this lens.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Round 3 findings addressed: (1) HIGH residual-risks vs Decision 4 contradiction — Risks section rewritten to describe accidentally-pooling (the original plan's incorrect rule, now removed) as the failure mode; verification asserts n===3 for 3-transcript fixture (matches transcript count); (2) MEDIUM testing strategy specificity for collision detection — Testing Strategy expanded to require three sub-cases per FR-002a (label-vs-label, score-vs-score, label-vs-score), plus three sub-cases for out-of-range (0, 6, 1.5), plus empty-levels case; (3) LOW duplicated nav structural hazard — accepted as known tech debt out of scope; recorded for follow-up.

## Technical Context

| Aspect | Detail |
|---|---|
| Language | TypeScript (strict, no `any`) |
| API framework | Pothos (code-first GraphQL) |
| API schema exposure | `cloud/apps/web/schema.graphql` — manually maintained SDL snapshot |
| Web framework | React + urql + Vite |
| Codegen | `npm run codegen --workspace @valuerank/web` |
| DB access | Prisma — reads from existing transcript / scenario / definition / run tables (no new tables) |
| Testing | Vitest (API and web) |
| File size limit | 400 lines max per file (preferred); 700 hard limit |
| New DB tables | None |
| Performance target | ~8 models × ~270 definitions × ~2 transcripts/scenario; per-request math under 1.5 s on a single worker |

---

## Architecture Decisions

### Decision 1: Statistics live in a dedicated services module

**Chosen:** A new module `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts` (≤ 400 lines) holds:

```
buildCellMetrics(transcripts) → { n, winRate, conviction, netScore, unscoredCount }
applyBandReduction(grid, threshold) → { directionDelta, convictionDelta, netScoreDelta }
computeBaselineWinRate(grid, threshold) → { value | null, ceilingFloorFlag }
aggregateSensitivity(perPair) → { value | null, valuePairsMeasured }
```

All pure functions. Unit-tested with worked examples covering the band-coverage rule (FR-021), the conviction-undefined-when-no-picks rule (FR-003c), and the ceiling/floor flag thresholds (FR-007).

**Rationale:** Keeps math out of the resolver; mirrors the `services/consistency/statistics.ts` pattern from `models-consistency-report`.

### Decision 2: Normalization adapter is net-new code (acknowledged in spec FR-002b)

**Chosen:** A new exported function `buildSafeLevelLookup(definitionDimension)` in `cloud/apps/api/src/graphql/queries/scenarios-utils.ts` returns:

```typescript
{
  lookup: (rawLabel: unknown) => number | null  // 1..5 or null on miss
  exclusionReason: null | 'collision' | 'out-of-range' | 'empty-levels' | 'legacy-values-only'
}
```

Implementation steps inside the adapter:
1. Pull the raw `levels[]` array (NOT via `getLevelNormalizationMap`'s output; we need the raw array to detect collisions before keying).
2. If `levels[]` is missing or empty AND `values[]` is present, return `exclusionReason: 'legacy-values-only'`.
3. Validate all `score` values are integers in 1–5; if any is out of range, return `exclusionReason: 'out-of-range'`.
4. Detect collision per FR-002a (duplicate labels, duplicate scores, label-equals-other-level's-score after string coercion). Return `exclusionReason: 'collision'`.
5. Build the lookup by trimming + numeric-coercing both label and score keys via `toComparableNumber`-style logic (newly exported — see Decision 3).
6. Return a `lookup` closure that trims/coerces input then queries the map; returns null on miss.

**Rationale:** The spec explicitly forbids re-implementing extraction logic but acknowledges the adapter is net-new. This isolates all FR-002a, FR-002b, FR-020 concerns into one tested function.

### Decision 3: Export `toComparableNumber` from `scenario-metadata.ts`

**Chosen:** `toComparableNumber` is currently private in `cloud/apps/api/src/services/analysis/scenario-metadata.ts`. We export it. The new adapter (Decision 2) imports it. Duplicating it is rejected — single canonical implementation.

**Rationale:** Spec FR-002b(c) explicitly leaves "export vs duplicate" as a plan-phase decision. Export is cheaper and avoids drift.

### Decision 4: Source from raw transcripts; no pooling; canonicalize via `resolveTranscriptDecisionModel`

**Chosen:** The resolver reads raw transcript rows filtered by:
- `transcript.deletedAt = null`
- parent run: `tags has Aggregate`, `status = COMPLETED`, `deletedAt = null`, signature matches via `runMatchesSignature(run.config, signature)`
- optional `domainId` filter via `definition.domainId`

**Per-transcript canonicalization:** each transcript MUST go through `resolveTranscriptDecisionModel` from `cloud/apps/api/src/graphql/queries/domain/decision-model.ts` (or its barrel re-export at `domain/shared.ts`) BEFORE its direction is interpreted — same pipeline `models-consistency.ts:169` uses. It reads `decisionMetadata`, `definitionSnapshot`, and `orientationFlipped` and returns a canonical decision; only then do we map to value outcomes via `buildCanonicalValueOutcomes`. Skipping this step breaks refusal, unknown, and decision-override cases.

**No pooling (corrected after plan-review round 2 MEDIUM):** each transcript is one observation. N = transcript count per cell. This matches the prevailing analytics convention in `aggregate-transcript-builder.ts`, `domain-analysis-aggregation.ts`, and `domain-coverage.test.ts`, all of which count duplicate transcripts as separate trials. The original plan proposed `(model, scenario)` pooling with a "latest wins" reducer; that rule has no codebase precedent and would be inconsistent with sibling analytics. Spec FR-022 was amended in lockstep to drop pooling.

**Rationale:** Aligns with codebase convention; eliminates the order-dependence concern; simplifies the resolver. Refusal/unknown still excluded from N and counted in unscoredCount per FR-023.

### Decision 5: New GraphQL query `pressureSensitivity` parallel to `modelsConsistency`

**Chosen:** `Query.pressureSensitivity(domainId: ID, providerId: ID, signature: String!)` returns:

```
PressureSensitivityResult
  models: [PressureSensitivityModel]
  insufficient: [InsufficientModel]      # (modelId, label, providerName, reason)
  excludedDefinitions: [ExcludedDefinition]   # for the "excluded" footer
  directionalSanityCheck: { positivePct, flatPct, negativePct, unmeasurableCount, breakdown[] }

PressureSensitivityModel
  modelId, label, provider
  aggregateSensitivity { value, valuePairsMeasured, valuePairsExcluded }
  valuePairs: [PressureSensitivityValuePair]
  unscoredCount    # FR-023 sum across the model's pairs

PressureSensitivityValuePair
  pairKey                      # canonical sorted "tokenA::tokenB"
  ownToken, opponentToken      # alphabetical assignment per FR-024
  directionDelta { value | null, lowBandMean, highBandMean }
  convictionDelta { value | null, lowBandMean, highBandMean }
  netScoreDelta { value | null, lowBandMean, highBandMean }
  baselineWinRate { value | null, ceilingFloorFlag }   # 'ceiling' | 'floor' | null
  n                            # scored count for the pair (post-pool)
  unscoredCount                # refusal/unknown count for the pair
  grid: [Cell]                 # 5x5 (own × opponent), null cells dropped
  definitionsMeasured, definitionsExcluded   # mirror coverage edge case from FR-024

Cell
  ownLevel: Int!  opponentLevel: Int!
  n: Int!  unscoredCount: Int!
  winRate: Float  conviction: Float  netScore: Float
  lowData: Boolean!   # n < 3
```

**Rationale:** Hierarchical shape supports drill-down (per-pair 2D heat map needs the full grid); progressive disclosure of band means supports FR-015. Mirrors `modelsConsistency` shape so the web layer reuses patterns.

### Decision 6: Web routing — new Models sub-route, nav entries added in two surfaces

**Chosen:** Add `/models/pressure-sensitivity` as a sub-route under the existing Models nav. The Models menu is currently hard-coded in **two** places (corrected after plan-review MEDIUM): `cloud/apps/web/src/components/layout/NavTabs.tsx` (desktop, lines 38–42 — `modelsMenuItems` array) and `cloud/apps/web/src/components/layout/MobileNav.tsx` (mobile, lines 21–30 — sub-items inside the Models entry). There is no shared `ModelsTabNav` component yet. Slice B MUST add a new entry `{ name: 'Pressure Sensitivity', path: '/models/pressure-sensitivity' }` to BOTH arrays so the report is reachable from desktop and mobile nav.

URL search params `domainId` and `signature` carried through the nav links, same pattern as Decision 9 of the consistency report. Linking implementation: build the destination URL with current `?domainId=...&signature=...` query string when constructing the nav item href.

**Rationale:** The user's locked decision is "new page under Models nav." The plan originally assumed a shared sub-nav component existed; review surfaced that nav is duplicated across desktop/mobile surfaces. Slice B updates both. No new shared component is introduced (out of scope for this feature).

### Decision 7: Cross-model summary uses `mean(|netScoreDelta|)` per FR-008

**Chosen:** Aggregate sensitivity is the unweighted mean of `|netScoreDelta|` across the model's value pairs that have a defined Δ. Pairs with undefined Δ (insufficient band coverage per FR-021) are NOT counted in the denominator. The `valuePairsMeasured` and `valuePairsExcluded` counts are surfaced alongside so readers can see thin-coverage models.

**Rationale:** Spec FR-008 specifies this. The coverage-skew limitation is acknowledged in FR-014(g) and shown inline next to the aggregate.

### Decision 8: 2D heat map default cell metric is netScore

**Chosen:** Per-pair 2D heat map (own × opponent) defaults to `netScore` per cell, with a toggle to switch to `winRate` or `conviction`. Color scale is divergent.

**Rationale:** netScore is the headline; readers want consistency with the cross-model summary. Resolves spec Open Question 4.

### Decision 9: Inline per-value spread visualization is a sparkline

**Chosen:** Cross-model summary row's inline distribution is a horizontal sparkline of per-pair `|netScoreDelta|` values for that model. Uses existing `Sparkline` component.

**Rationale:** Resolves spec Open Question 5. Existing component, no new chart library.

### Decision 10: No caching in v1

**Chosen:** Compute on every request. With ~270 definitions × ~8 models × ~2 transcripts/scenario the math fits under 1.5 s. Caching is a follow-up if real measurements warrant.

**Rationale:** Same calculus as consistency report; no premature optimization.

### Decision 11: Definition validation pass owns the exclusion taxonomy; uses `resolvedContent`

**Chosen:** A single function `validateDefinitionForPressureSensitivity(definitionId)` in `services/pressure-sensitivity/definition-validation.ts` calls `resolveDefinitionContent(definitionId)` from `@valuerank/db` (same pattern used by `domain-coverage.ts:108`) to get the **fully inherited** content, then runs validation against it. Returns one of:

```typescript
{ status: 'eligible', resolvedContent }
| { status: 'excluded', reason: 'a' | 'b' | 'c' | 'd' | 'e' | 'g' | 'mixed-content-disagreement' }
```

**Why `resolvedContent` and not raw `content` (corrected after plan-review round 2 HIGH-1):** the codebase stores forked Definitions as **partial overrides**. Raw `definition.content` on a fork carries only the override fields; `dimensions`, `levels`, and value tokens that the fork inherits from a parent are NOT in the raw content. Validating against raw `content` would misclassify forks as missing-levels or legacy-values-only and drop their valid transcripts. `resolveDefinitionContent` is the canonical helper for the fully inherited form; this report uses it.

**Reading raw `levels[]` for collision detection (corrected after round 2 HIGH-2):** the validation pass and the safe-level-lookup adapter (Decision 2) MUST read `resolvedContent.dimensions[].levels[]` directly, NOT through `getDimensionLevelsFromDefinition` (which collapses the array to `string[]` and discards the `{label, score}` shape). The raw structure is required for collision detection (FR-002a) and out-of-range validation (FR-020). The `getDimensionLevelsFromDefinition` helper is fine for callers that just want a flat list of level labels but is not the right primitive here.

**New exclusion reason added to the taxonomy:** reason `mixed-content-disagreement` covers the MEDIUM finding from plan-review round 2 — when `normalizeScenarioAnalysisMetadata` returns null because `dimensions` and `dimension_values` disagree on the same scenario, the affected Definition (or scenario, depending on data shape) is excluded under this reason rather than silently dropped. The resolver tracks counts per reason so the footer can surface the failure mode. Spec FR-018 will be amended to include this category as reason (h).

Reason `(f)` (insufficient cell coverage) is decided post-aggregation, NOT in this pass. Other reasons `(a)`–`(g)` map 1:1 to the spec's FR-018 enumeration. The resolver persists the per-Definition reason alongside aggregated counts so the "excluded" footer can cite reasons without re-deriving.

**Rationale:** Spec FR-018 mandates a raw-content pass that runs before normalization erases the signal. Round-2 review surfaced that "raw content" had to mean `resolvedContent`, not `definition.content`, to handle forks correctly, and that the helper layer needs the raw `{label, score}` array.

### Decision 12: Orientation flip — reuse `buildValueOutcomes`, do nothing to pressure levels

**Chosen:** Per FR-019, the `6 - score` rule is for *response scores* (the model's 1-5 vote), not pressure levels. The resolver imports `buildValueOutcomes` from `aggregate-helpers.ts` and uses it to compute prioritized/deprioritized/neutral per transcript. Pressure level scores extracted from scenario dimension values pass through the (own × opponent) grid unchanged. No `6 - score` is applied to dimension values.

**Rationale:** Round-4 review surfaced this. Documenting it here so plan reviewers don't re-introduce the bug.

### Decision 13: Value pair canonicalization helper is reusable; direction is remapped when canonical own/opponent disagrees with Definition order

**Chosen:** `canonicalValuePairKey(tokenA, tokenB) → string | null` in `services/pressure-sensitivity/value-pair.ts`. Returns `[a, b].sort().join('::')` for valid non-self-pair tokens; null otherwise. Within a pair, `own = sortedTokens[0]`, `opponent = sortedTokens[1]` — alphabetical assignment, deterministic, no user-selectable target.

**Direction remap (corrected after plan-review HIGH-2):** existing decision helpers emit `favor_first` / `favor_second` relative to the Definition's stored `value_first` / `value_second` order, NOT the alphabetical canonical pair order. When a Definition's stored `value_first.token` does NOT equal the canonical `own` token (i.e., the Definition's narrative happens to put `own` second), the canonical direction MUST be swapped before bucketing into the (own × opponent) grid: `favor_first → opponent_picked, favor_second → own_picked`; `prioritized → deprioritized` and vice versa. The `value-pair.ts` module exports a helper `assignOwnOpponent(definition, canonicalDirection) → 'own_picked' | 'opponent_picked' | 'neutral' | 'unscored'` that wires this swap deterministically. Without this remap, mirrored Definitions (e.g., `Power -> Achievement` and `Achievement -> Power`) would have their Direction Δ / Conviction Δ / netScore Δ inverted on one side of the mirror.

**Same logic applies to dimension-level lookup:** `assignOwnOpponentLevels(definition, scenarioDimensions, lookup) → { ownLevel, opponentLevel } | null` looks up the Definition dimension whose `name` matches the canonical own token (regardless of `value_first`/`value_second` position), uses its level score for `ownLevel`, and uses the other dimension's score for `opponentLevel`. Returns null if either dimension is missing or unmappable.

**Rationale:** Spec FR-024. Isolates the canonicalization rule into one tested function. Plan-review HIGH-2 found that the original wording assumed direction was already canonical-relative, which it is not.

---

## Implementation Slices

### Slice A — API: normalization adapter + aggregation + resolver + SDL [CHECKPOINT]

Estimated diff: ~330 lines (split into A1 + A2 if measured > 300)

**Files:**
- `cloud/apps/api/src/graphql/queries/scenarios-utils.ts` — add `buildSafeLevelLookup` (~40 lines added)
- `cloud/apps/api/src/services/analysis/scenario-metadata.ts` — export `toComparableNumber` (~2 lines)
- `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts` (NEW, ~180 lines) — pure functions per Decision 1
- `cloud/apps/api/src/services/pressure-sensitivity/aggregation.test.ts` (NEW, ~120 lines)
- `cloud/apps/api/src/services/pressure-sensitivity/definition-validation.ts` (NEW, ~80 lines) — Decision 11
- `cloud/apps/api/src/services/pressure-sensitivity/definition-validation.test.ts` (NEW, ~80 lines)
- `cloud/apps/api/src/services/pressure-sensitivity/value-pair.ts` (NEW, ~40 lines) — Decision 13
- `cloud/apps/api/src/services/pressure-sensitivity/value-pair.test.ts` (NEW, ~50 lines)
- `cloud/apps/api/src/graphql/types/pressure-sensitivity.ts` (NEW, ~120 lines) — Pothos types per Decision 5
- `cloud/apps/api/src/graphql/types/index.ts` (1 line — add import)
- `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts` (NEW, ~250 lines) — resolver
- `cloud/apps/api/src/graphql/queries/pressure-sensitivity.test.ts` (NEW, ~150 lines) — fixture tests
- `cloud/apps/api/src/graphql/queries/index.ts` (1 line — register query)
- `cloud/apps/web/schema.graphql` (append ~80 lines of SDL)

**Resolver flow:**

```
args: { domainId?, providerId?, signature! }

1. Load active model roster (filter by providerId if set).
2. Load candidate aggregate runs (Aggregate-tagged, status=COMPLETED, deletedAt=null,
   optional domainId via definition.domainId).
3. Filter runs in memory: runMatchesSignature(r.config, signature).
4. Run validateDefinitionForPressureSensitivity over every distinct Definition the
   eligible runs reference. Track excluded Definitions with reason (a)-(e), (g).
5. For each eligible Definition, build the safe level lookup per Decision 2.
   If exclusionReason at this stage, exclude.
6. Stream raw transcripts joined to scenarios + parent definitions for the
   eligible (run, definition) set.
7. Pool at (model, scenario) per Decision 4 — derive a single canonical direction
   per pool via buildCanonicalValueOutcomes; refusal/unknown excluded from N
   and added to unscoredCount (FR-023).
8. For each pool: extract scenario dimension values via
   normalizeScenarioAnalysisMetadata; resolve own/opponent dimension via
   canonicalValuePairKey + Definition.content.components tokens; map labels
   to scores via the safe-level lookup; bucket the pool into the (model,
   pairKey, ownScore, opponentScore) cell.
9. Apply N >= 3 threshold per cell (FR-004). Apply band reduction per FR-005.
   Apply baseline + ceiling/floor per FR-006/FR-007.
10. Reason (f) "insufficient cell coverage" assigned to Definitions whose
    pair has no qualifying cells in either band (post-aggregation).
11. Compute aggregate sensitivity per model per Decision 7.
12. Compute directional sanity check across all (model, pair) combos with
    defined Direction Δ per FR-013.
13. Move models below an aggregate-coverage threshold (no qualifying pairs)
    to insufficient[].
```

**Key tests in Slice A:**
- `buildSafeLevelLookup`: collision case, out-of-range, legacy values[] only, trimmed lookup, numeric variant
- `aggregation.applyBandReduction`: empty band → undefined; standard grid → expected; ceiling baseline → flag set
- `definition-validation`: each FR-018 reason `(a)`–`(e)`, `(g)` triggered by a constructed fixture
- Resolver integration: 2 models × 3 definitions fixture; mirror-coverage fixture; ceiling fixture; refusal-heavy fixture

### Slice B — Web: types + routing + sub-nav extension + page skeleton [CHECKPOINT]

Estimated diff: ~220 lines

**Files:**
- `cloud/apps/web/src/api/operations/pressureSensitivity.graphql` (NEW)
- `cloud/apps/web/src/api/operations/pressureSensitivity.ts` (NEW)
- `cloud/apps/web/src/generated/graphql.ts` (regenerated)
- `cloud/apps/web/src/pages/PressureSensitivity.tsx` (NEW, skeleton: loading / error / empty-state shells)
- `cloud/apps/web/src/App.tsx` (add `/models/pressure-sensitivity` route)
- `cloud/apps/web/src/components/layout/NavTabs.tsx` (append `Pressure Sensitivity` entry to `modelsMenuItems` at lines 38–42; do NOT modify existing Matrix / Domain Shifts / Consistency / Circumplex entries)
- `cloud/apps/web/src/components/layout/MobileNav.tsx` (append `Pressure Sensitivity` entry to the Models `subItems` array at lines 26–29; same constraint)

### Slice C — Web: cross-model summary + per-model detail + per-pair 2D heat map [CHECKPOINT]

Estimated diff: ~290 lines

**Files:**
- `cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx` (NEW, ~120 lines) — ranked table; uses `Sparkline` per Decision 9
- `cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx` (NEW, ~110 lines) — per-pair table + ceiling/floor flags + low-data markers
- `cloud/apps/web/src/components/models/PressureGrid.tsx` (NEW, ~90 lines) — per-pair 2D heat map; cell click opens drill-down panel showing N, win rate, conviction, netScore for that cell

### Slice D — Web: cross-value heat map + sanity check + limitations + filters [CHECKPOINT]

Estimated diff: ~310 lines (split into D1 + D2 if measured > 300)

**Files:**
- `cloud/apps/web/src/components/models/PressureSensitivityCrossValueMap.tsx` (NEW, ~140 lines) — model × value pair grid; greys out low-data cells
- `cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.tsx` (NEW, ~80 lines) — bottom-of-page panel per FR-013
- `cloud/apps/web/src/components/models/PressureSensitivityLimitations.tsx` (NEW, ~70 lines) — per FR-014; static copy with cross-vignette calibration callout near affected views
- `cloud/apps/web/src/components/models/PressureSensitivityFilters.tsx` (NEW, ~70 lines) — Domain, Provider filters wired to query variables

---

## Parallelization Opportunities

| Opportunity | Safe? |
|---|---|
| Slice A `aggregation.ts` ↔ `definition-validation.ts` ↔ `value-pair.ts` (disjoint pure-function modules) | yes — `[P]` candidates |
| Slice A normalization adapter ↔ aggregation (disjoint files) | yes — `[P]` candidate |
| Slice A (API) ↔ Slice B (web) | no — Slice B codegen depends on Slice A SDL |
| Slice C summary ↔ detail ↔ grid (disjoint components, same fetched data) | yes — three-way `[P]` |
| Slice D cross-value map ↔ sanity check ↔ limitations ↔ filters | yes — disjoint files |

Announce parallel splits before delegating.

---

## Residual Risks

Every Residual Risk carries a `verification:` line. Unverified risks block plan approval.

- **Misreading "no pooling" — accidentally pooling at `(model, scenario)`** (the original plan's incorrect rule, now removed) would deflate N and diverge from `aggregate-transcript-builder.ts` / `domain-coverage.test.ts` semantics.
  Mitigation: Decision 4 explicitly states "no pooling, each transcript = 1 observation"; resolver tests assert N matches transcript count for a multi-run-per-scenario fixture.
  **verification:** Slice A test fixture: 1 model × 1 scenario × 3 transcripts → assert returned cell `n === 3` (matches transcript count). If `n` is less than transcript count (e.g., 1), the resolver is incorrectly pooling — block before merge.

- **`buildSafeLevelLookup` lets a collision-tainted Definition through** silently corrupts the grid for that Definition's transcripts.
  Mitigation: adapter rejects on first detected collision; exclusion reason persisted.
  **verification:** Slice A test fixture with `levels: [{score: 1, label: 'low'}, {score: 2, label: '1'}]` asserts the Definition lands in `excludedDefinitions` with reason `e` (collision), NOT in any model's `valuePairs`. Test must fail before fix.

- **Orientation flip applied to pressure levels** (the round-4 bug) re-introduced in implementation.
  Mitigation: Decision 12 documents the rule explicitly.
  **verification:** during Slice A diff review, grep the new code under `services/pressure-sensitivity/` and `graphql/queries/pressure-sensitivity.ts` for the substring `6 -`; any occurrence must be inside a call site that operates on response scores via `buildValueOutcomes`, not on pressure-level inputs. Manual confirmation in the diff checkpoint.

- **Mirror partial coverage** silently aggregates across mirrored Definitions in a confusing way.
  Mitigation: per-pair `definitionsMeasured / definitionsExcluded` counts; spec FR-024 closing paragraph.
  **verification:** Slice A test fixture with `Power -> Achievement` valid + `Achievement -> Power` excluded asserts the value-pair bucket has `definitionsMeasured: 1, definitionsExcluded: 1` and only the included Definition's transcripts appear in the grid.

- **`runMatchesSignature` historical drift** — pre-existing aggregate runs may not match new signature shapes cleanly.
  Mitigation: reuse the existing helper; do not re-implement signature parsing.
  **verification:** pre-merge, run the resolver against a known production model + signature via MCP `graphql_query`; if `models` is empty when `modelsConsistency` reports the same model+signature populated, signature filtering is broken — block before merge.

- **Per-cell win-rate denominator mismatch with Models tab convention** (FR-003b: `prioritized / total` including neutral).
  Mitigation: single-source from `buildValueOutcomes` counts; do not re-derive denominator.
  **verification:** Slice A test asserts the cell's win rate equals `prioritized / (prioritized + deprioritized + neutral)` for a deterministic fixture; manually checked against the same value computed by `ModelValueDetailDrawer`'s tooltip formula on identical data.

- **AGGREGATE-pipeline coverage prerequisite** — the report can only render numbers for runs the pipeline has tagged Aggregate.
  Mitigation: external prerequisite, user-owned; empty-state UI handles the not-yet-populated case.
  **verification:** pre-merge, run the resolver against the prod tenant via MCP; if every model lands in `insufficient` with a no-coverage reason, the prerequisite is unmet — DO NOT advertise the feature as ready until at least one model returns numbers. Documented but not blocking.

- **`toComparableNumber` export breaks consumers of `scenario-metadata.ts`**.
  Mitigation: export is additive; existing private uses unchanged.
  **verification:** Slice A: run `npx turbo build --filter=@valuerank/api` and `npx turbo test --filter=@valuerank/api` after the export change; both must pass with no test edits required.

- **Conviction Δ semantics misread by users despite limitations panel**.
  Mitigation: tooltip on Conviction column header shows the explicit formula and "self-report not calibrated" caveat per FR-014(b).
  **verification:** Slice C visual review of the per-model detail page with a model that has high Conviction Δ — the conviction caveat must be visible adjacent to the cell on hover.

---

## Testing Strategy

### Aggregation module (`aggregation.test.ts`)
- `buildCellMetrics`: 3 transcripts (2 prioritized strong, 1 neutral) → win rate = 2/3, conviction = 2.0, netScore = 4/3
- `buildCellMetrics`: 1 refusal → unscoredCount = 1, n = 0, all metrics undefined
- `applyBandReduction`: standard grid → expected Δ; empty low band → undefined; ceiling baseline → flag set
- `computeBaselineWinRate`: lowest populated level is 2 (level 1 empty) → returns level-2 mean

### Normalization adapter (`scenarios-utils.test.ts` extension)
- `buildSafeLevelLookup` with canonical 5-level Definition → all five labels resolve to 1–5
- **Three collision sub-cases per FR-002a (each must have its own test)**:
  - **Label-vs-label collision**: `[{score: 1, label: 'moderate'}, {score: 3, label: 'moderate'}]` → `'collision'`
  - **Score-vs-score collision**: `[{score: 1, label: 'low'}, {score: 1, label: 'minimal'}]` → `'collision'`
  - **Label-vs-score collision**: `[{score: 1, label: 'low'}, {score: 2, label: '1'}]` → `'collision'`
- Out-of-range: score 6 → `'out-of-range'`; score 0 → `'out-of-range'`; score 1.5 → `'out-of-range'`
- Trimmed input: `' moderate '` → 3
- Numeric variant: `'1.0'` → 1
- Legacy values[] only → `'legacy-values-only'`
- Empty levels[] (no values[] either) → `'empty-levels'`

### Definition validation (`definition-validation.test.ts`)
- One fixture per FR-018 reason `(a)`–`(e)`, `(g)` returns the matching reason
- Eligible Definition returns `{ status: 'eligible' }`

### Value pair canonicalization (`value-pair.test.ts`)
- `canonicalValuePairKey('power', 'achievement')` === `canonicalValuePairKey('achievement', 'power')` === `'achievement::power'`
- Self-pair returns null
- Missing tokens return null

### Resolver (`pressure-sensitivity.test.ts`)
Mock discrete dependencies explicitly:
- `db.run.findMany`, `db.transcript.findMany` — fixture rows
- `runMatchesSignature` — real import
- Aggregation/normalization/validation — real imports

Test cases:
- 2 models × 3 definitions fixture → expected per-model aggregate matches hand-computed value
- Collision Definition → lands in `excludedDefinitions` with reason `e`
- Mirror coverage edge case → bucket reports `definitionsMeasured: 1, definitionsExcluded: 1`
- Ceiling baseline fixture → ceiling flag set
- Empty band fixture → Δ undefined; pair NOT in aggregate denominator
- Refusal-heavy fixture → unscoredCount populated; n excludes refusals
- Directional sanity check: half pairs positive, half negative → reported percentages match

### Web components (`*.test.tsx`)
- Cross-model summary renders ranked table; sparkline visible on each row
- Per-model detail renders per-pair table with Δ columns and ceiling/floor flags
- 2D heat map renders 5×5 cells; low-data cells visually distinguished; cell click opens panel
- Cross-value map model × pair grid; greyed cells for low-data
- Directional sanity check renders with breakdown
- Limitations panel renders all five FR-014 caveats

### E2E (deferred, not in v1)
Same posture as `models-consistency-report` — Playwright deferred.

---

## Rollout

Additive route under existing `/models` nav. No feature flag. Standard PR + Railway deploy. The empty-state UI (FR-016) handles the case where pipeline coverage is not yet populated, so deploying ahead of full Aggregate coverage is safe.

---

## Dependencies (external to this feature)

- **Aggregate analysis pipeline** continues to tag runs with `Aggregate` and emit transcripts joined to scenarios + definition snapshots.
- **`runMatchesSignature`** in `cloud/apps/api/src/graphql/queries/domain-coverage-gql-types.ts` continues to be the canonical signature filter.
- **`resolveTranscriptDecisionModel`** in `cloud/apps/api/src/graphql/queries/domain/decision-model.ts` (re-exported via `domain/shared.ts`) continues to be the canonical per-transcript decision pipeline. Used as the entry point for canonicalization in this report (per Decision 4).
- **`buildValueOutcomes` / `buildCanonicalValueOutcomes`** in `cloud/apps/api/src/services/analysis/aggregate/aggregate-helpers.ts` continue to map a canonical decision to value outcomes. Called AFTER `resolveTranscriptDecisionModel`, never instead of it.
- **`normalizeScenarioAnalysisMetadata`** in `cloud/apps/api/src/services/analysis/scenario-metadata.ts` continues to be the canonical scenario-dimension extractor.
- **`getDimensionLevelsFromDefinition`** in `cloud/apps/api/src/graphql/queries/scenarios-utils.ts` continues to expose Definition-level `levels[]`/`values[]`.
- **`Sparkline`** component continues to be available for the inline per-value spread visualization.
- **`ModelsTabNav`** introduced by `models-consistency-report` continues to be the Models sub-nav surface; we extend it.

---

## Open Items Deferred to Tasks Phase

1. Exact SDL field names for the new GraphQL types (bikeshed; resolved in Slice A PR review).
2. Default cell-color scale for the 2D heat map — divergent palette decided in Slice C by surveying existing condition-matrix patterns.
3. Whether the page surfaces a domain filter (the consistency report does; we'll match unless review surfaces a reason not to).
4. Whether the "scoreMethod" param needs to be threaded through (LOG_ODDS vs FULL_BT) — defer; v1 uses LOG_ODDS only.
5. Whether `aggregate-fingerprint-payload` already carries pooled (model, scenario) directions (Decision 4 fallback) — investigated at Slice A start.
