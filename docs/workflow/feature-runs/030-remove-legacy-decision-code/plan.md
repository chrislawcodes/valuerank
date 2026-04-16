# Implementation Plan: 030 — Remove Legacy Decision Code and Unify Scoring Model

**Branch**: `030-remove-legacy-decision-code` | **Date**: 2026-04-02 | **Revised**: 2026-04-15 | **Spec**: [spec.md](spec.md)

## Summary

Fix the `ConditionMatrix.tsx` scoring bug and remove the entire 1-5 numeric encoding from all TypeScript, Python, and frontend consumers. The canonical model uses two separate fields: **strength** (0=neutral, 1=somewhat, 2=strongly) and **winner** (`isOpponent` boolean / `favoredValueKey`). Two reference implementations already use this model correctly (`canonicalConditionSummary.ts` and `decision-display.ts:getDecisionPreferenceScore`). All other code converges to match them.

---

## Technical Context

**Language/Version**: TypeScript 5.x (API + Web), Python 3.11 (workers)
**Primary Dependencies**: Prisma (DB), Pothos (GraphQL), Vite (Web)
**Storage**: No schema migrations — `decisionCode`/`decisionCodeSource` columns kept in DB, just not selected in queries
**Testing**: Vitest (API + Web), pytest (Python workers)
**Performance Goals**: No performance change — this is deletion + bug fix
**Constraints**: `resolveTranscriptDecisionModel` in `decision-model.ts` must keep the `decisionCode` fallback for old transcripts
**Scale/Scope**: ~30 legacy symbols removed; 1 component bug fixed; ~15 test files need fixture updates

---

## Architecture Decisions

### Decision 1: Keep the `decisionCode` fallback in one place only

**Chosen**: `resolveTranscriptDecisionModel` retains the `decisionCode` fallback. All other code reads only `decisionMetadata`/canonical fields.

**Rationale**: Old transcripts that were written before the V2 model have `decisionCode` but no `decisionMetadata`. The resolver remains the single gateway that converts both shapes to canonical.

### Decision 2: Fix ConditionMatrix by computing strength from existing counts

**Chosen**: `getConditionMatrixDisplay` computes a weighted-average strength score from the `MatrixCondition` counts (`prioritized`/`deprioritized`/`neutral`), using the same formula as `winnerScore` in `canonicalConditionSummary.ts`. The cell label shows `0`/`1`/`2` (strength). Color encodes which side won (`isOpponent`).

**Rationale**: The `MatrixCondition` type already carries the right data — `prioritized` (focal-side wins), `deprioritized` (opponent-side wins), `neutral`. We just need to compute strength the right way instead of encoding winner as the number. No data model change needed.

**Formula**: Same as `canonicalConditionSummary.ts`:
- Determine winner: `isOpponent = deprioritized > prioritized`
- Get winner's counts: `winnerStrong` and `winnerSomewhat` (from the winning side's trials)
- Strength score: `(2 * winnerStrong + 1 * winnerSomewhat) / totalTrials`
- Display: round to nearest integer (0/1/2) for the cell label

**Note**: The current `MatrixCondition` only has aggregate `prioritized`/`deprioritized`/`neutral` counts — it does not break down strong vs. somewhat within each side. The component needs to either:
- (a) Receive `strongly`/`somewhat`/`opponentStrongly`/`opponentSomewhat`/`neutral` counts (matching the canonical buckets), or
- (b) Compute a simple win-rate ratio and map to 0/1/2 based on thresholds

Option (a) is better because it matches the canonical model exactly. The parent component or data source must provide the 5-bucket breakdown.

### Decision 3: Replace `scoreCounts` with `directionCounts` in variance analysis

**Chosen**: The 5-bucket direction/strength histogram replaces the 1-5 numeric histogram.

**Canonical stability distance mapping**:
| direction | strength | distance | signed |
|---|---|---|---|
| favor_first | strong | 2 | +2 |
| favor_first | lean | 1 | +1 |
| neutral | — | 0 | 0 |
| favor_second | lean | 1 | -1 |
| favor_second | strong | 2 | -2 |

### Decision 4: KS-test uses signed strength for ordinal ranking

**Chosen**: `countsToSample()` maps buckets to signed strength: `opponentStrongly → -2, opponentSomewhat → -1, neutral → 0, somewhat → 1, strongly → 2`. This preserves the ordinal ranking that the KS statistic depends on.

**Rationale**: KS-test cares about the cumulative distribution ordering, not the absolute numeric values. The ordinal ranking `opponent strong < opponent somewhat < neutral < somewhat < strongly` is identical in both encodings. The test statistic will be the same.

### Decision 5: Python workers receive direction/strength from TS — no flip needed

**Chosen**: Python workers read `canonical.direction` and `canonical.strength` from transcript JSON. The `6 - score` flip is removed entirely.

---

## Project Structure

### Files to modify

| File | Change | Notes |
|---|---|---|
| `cloud/apps/web/src/components/domains/ConditionMatrix.tsx` | modify | Fix `getConditionMatrixDisplay` to show strength (0/1/2) with color for winner |
| `cloud/apps/api/src/graphql/queries/domain/decision-model-helpers.ts` | modify | Delete `canonicalDecisionScoreFromDirectionStrength` |
| `cloud/apps/api/src/graphql/queries/domain/decision-model.ts` | modify | Delete `LegacyDecisionCompat`, `parseLegacyScore`, `canonicalDecisionToLegacyScore`, `resolveLegacyDecisionCompat`; remove `legacy` from `DecisionModelResult` |
| `cloud/apps/api/src/graphql/queries/domain/shared.ts` | modify | Remove re-exports of deleted types/functions |
| `cloud/apps/api/src/services/analysis/aggregate/variance.ts` | modify | Replace `canonicalScore`-based math with canonical mapping |
| `cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts` | modify | Remove `decisionBucketCodeToScore`, `normalizeDecisionBucketCode` numeric paths |
| `cloud/apps/api/src/services/decision-model.ts` | modify | Remove `resolveAnalysisScore`, `buildValueOutcomesFromScore`, `parseLegacyDecisionCode` |
| `cloud/apps/api/src/services/export/decision-display.ts` | modify | Remove any `legacy` references |
| `cloud/apps/api/src/graphql/types/transcript.ts` | modify | Remove `legacy` field from `decisionModelV2` GraphQL type |
| `cloud/apps/api/src/queue/handlers/analyze-basic.ts` | modify | Remove `summary.score` from `TranscriptData`; use canonical decision |
| `cloud/apps/api/src/services/assumptions/order-effect-analysis.ts` | modify | Replace `rawScore`/`canonicalScore` with canonical direction/strength |
| `cloud/apps/api/src/services/assumptions/order-effect-comparison.ts` | modify | Remove `rawScore` from variant cell types |
| `cloud/apps/api/src/mcp/tools/get-transcript-summary.ts` | modify | Remove `decisionCode` from response, replace with canonical label |
| `cloud/apps/web/src/utils/decisionDistributionDisplay.ts` | modify | Remove `'1'`-`'5'` code paths from `normalizeBucketCode`, remove `sourceKeyByCode` map from `formatBucketLabel` |
| `cloud/apps/web/src/lib/statistics/ks-test.ts` | modify | Map bucket names to signed strength (-2 to +2) instead of 1-5 |
| `cloud/apps/web/src/utils/transcriptDecisionModel.ts` | modify | Remove `normalizeLegacyDecisionCode`; rewrite sort |
| `cloud/apps/web/src/api/operations/runs.ts` | modify | Remove `TranscriptDecisionModelV2LegacyCompat` type |
| `cloud/apps/web/src/generated/graphql.ts` | regenerate | After GQL schema change |
| `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx` | modify | Replace `scoreCounts` references with `directionCounts` |
| `cloud/workers/stats/decision_model.py` | modify | Remove `normalize_resolved_score`; return canonical model |
| `cloud/workers/stats/variance_analysis.py` | modify | Replace score-based math with canonical mapping |
| `cloud/workers/analyze_basic.py` | modify | Remove score-based fallback, use canonical model |

### Test files to update

All tests referencing `rawScore`, `canonicalScore`, `decisionCode`, `LegacyDecisionCompat`, `canonicalDecisionScoreFromDirectionStrength`, or 1-5 numeric fixtures need updating.

---

## Wave Breakdown

### Wave 1 — P1: ConditionMatrix bug fix + core TS API cleanup

Fix the user-visible bug first (ConditionMatrix), then remove legacy types and functions from the decision model, aggregate logic, and variance analysis.

Scope: `ConditionMatrix.tsx`, `decision-model-helpers.ts`, `decision-model.ts` (both), `variance.ts`, `aggregate-logic.ts`

### Wave 2 — P1/P2: GraphQL schema + Python workers

Remove `legacy` from GraphQL type, update analyze-basic handler, update Python workers.

Scope: `transcript.ts`, `analyze-basic.ts`, `decision_model.py`, `variance_analysis.py`

### Wave 3 — P2: Frontend statistics and distribution cleanup

Clean frontend sort, KS-test, decision distribution display, remove legacy type from operations.

Scope: `transcriptDecisionModel.ts`, `runs.ts`, `ks-test.ts`, `decisionDistributionDisplay.ts`, `OverviewTab.tsx`

### Wave 4 — P2/P3: Exports + order-effect + MCP

Update exports, order-effect services, and MCP tool responses.

Scope: `decision-display.ts`, `order-effect-*.ts`, `get-transcript-summary.ts`

### Wave 5 — Test cleanup + regression coverage

Update all test fixtures. Add regression test for `decisionCode` fallback. Add parity test for variance analysis. Add ConditionMatrix display test.

---

## Risks

| Risk | Mitigation |
|---|---|
| Old `scoreCounts` in stored aggregate JSON | Frontend normalizer handles both shapes |
| Hidden consumers of `rawScore`/`canonicalScore` | Grep success criterion catches remaining references |
| KS-test statistical equivalence | Ordinal ranking is identical; add test confirming same KS statistic on fixture data |
| ConditionMatrix data source doesn't provide 5-bucket breakdown | Check parent component; may need to pass through canonical bucket counts instead of aggregate `prioritized`/`deprioritized` |
| Python worker tests break on score removal | Run pytest after each Python change |
| In-flight PgBoss jobs at deploy time | Workers receive TS-resolved canonical decisions via job queue — no compatibility issue |
| GraphQL clients still requesting `legacy` sub-object | Build breaks catch remaining references |
| `decisionCode` fallback regression | Wave 5 adds explicit regression test |

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: Valid findings, addressed in plan. ConditionMatrix collapse uses winnerScore formula, rounds to nearest int. In-flight payloads already have canonical fields. Sort uses direction+strength ordering. normalizeBucketCode keeps backward compat. Null handling exists.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: HIGH ambiguity: plan Decision 2 resolves ConditionMatrix approach (option a: 5-bucket data). US-7 migration: normalizeBucketCode keeps backward compat during transition. HIGH float-to-int: uses Math.round on winnerScore. MEDIUM bucket names: opponentSomewhat naming is established convention in canonical reference impl, renaming out of scope. MEDIUM malformed metadata: resolver already handles per original spec. CRITICAL deployment coupling: TS+Python deploy together via Railway, canonical fields present in payloads for months. HIGH exports: only affects newly generated files.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: HIGH test-last: accepted, will update tasks to move relevant test updates into each wave instead of deferring to Wave 5. HIGH 5-bucket dependency: accepted, Slice 1.1 already starts with investigation step. MEDIUM single gateway: accepted, grep sweep in Wave 5 catches stragglers. MEDIUM in-flight jobs: canonical fields have been present in payloads for months alongside legacy. MEDIUM normalizer lifecycle: accepted, will add tests. LOW fixtures: accepted, legacy fixtures preserved for fallback test.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.codex.dependency-order-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: HIGH GraphQL breaking change: only consumer is our own web app (verified — no external GraphQL clients exist). HIGH KS-test: ordinal ranking preserved, KS statistic depends on CDF rank not absolute values — mathematically equivalent. HIGH legacy data migration: out of scope per spec, decisionCode fallback kept intentionally. MEDIUM division by zero: guarded by Math.max(1, totalTrials) in implementation. MEDIUM Python callers: all callers verified via grep. MEDIUM external consumers: MCP and exports already use canonical model.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.codex.regression-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
