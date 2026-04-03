# Implementation Plan: 030 — Remove Legacy 1-5 Decision Code System

**Branch**: `030-remove-legacy-decision-code` | **Date**: 2026-04-02 | **Spec**: [spec.md](spec.md)

## Summary

Remove the `LegacyDecisionCompat` type and its entire 1-5 numeric encoding from all TypeScript, Python, and frontend consumers. The canonical `direction`/`strength` model is already the authoritative source — this plan cleans up the compatibility layer that was kept for the transition. The single allowed fallback for old transcripts (reading `decisionCode` when `decisionMetadata` is absent) stays in `resolveTranscriptDecisionModel` only.

---

## Technical Context

**Language/Version**: TypeScript 5.x (API + Web), Python 3.11 (workers)
**Primary Dependencies**: Prisma (DB), Pothos (GraphQL), Vite (Web)
**Storage**: No schema migrations — `decisionCode`/`decisionCodeSource` columns kept in DB, just not selected in queries
**Testing**: Vitest (API + Web), pytest (Python workers)
**Performance Goals**: No performance change — this is a deletion
**Constraints**: `resolveTranscriptDecisionModel` in `decision-model.ts` must keep the `decisionCode` fallback for old transcripts
**Scale/Scope**: ~27 legacy symbols removed across 9 files; ~15 test files need fixture updates

---

## Architecture Decisions

### Decision 1: Keep the `decisionCode` fallback in one place only

**Chosen**: `resolveTranscriptDecisionModel` (in `cloud/apps/api/src/graphql/queries/domain/decision-model.ts`) retains the `decisionCode` fallback. All other code reads only `decisionMetadata`/canonical fields.

**Rationale**: Old transcripts that were written before the V2 model have `decisionCode` but no `decisionMetadata`. Rather than backfilling (out of scope), the resolver remains the single gateway that converts both shapes to canonical. No other code needs to know about this.

**Tradeoffs**:
- Pros: Clean separation — callers never see the legacy column
- Cons: Permanent maintenance burden in one function (accepted trade-off)

### Decision 2: Replace `scoreCounts` with `directionCounts` in variance analysis

**Chosen**: The 5-bucket direction/strength histogram replaces the 1-5 numeric histogram. The `scoreCounts` JSON field stored in aggregate runs will need a migration in the normalizer that can handle both shapes.

**Canonical stability distance mapping**:
| direction | strength | distance | signed |
|-----------|----------|----------|--------|
| favor_first | strong | 2 | +2 |
| favor_first | lean | 1 | +1 |
| neutral | — | 0 | 0 |
| favor_second | lean | 1 | −1 |
| favor_second | strong | 2 | −2 |

**Tradeoffs**:
- Pros: Semantically clear, no numeric magic
- Cons: Stored aggregate runs have old `scoreCounts` shape — frontend normalizer handles both shapes temporarily

### Decision 3: Python workers receive direction/strength from TS — no flip needed

**Chosen**: Python workers read `canonical.direction` and `canonical.strength` from transcript JSON. The `6 - score` flip (`normalize_resolved_score`) is removed entirely.

**Rationale**: The flip was needed when Python received raw 1-5 scores where 1=favor_second and 5=favor_first. The canonical model encodes direction explicitly — no numeric inversion needed.

---

## Project Structure

### Files to modify

| File | Change | Notes |
|------|--------|-------|
| `cloud/apps/api/src/graphql/queries/domain/decision-model.ts` | modify | Delete `LegacyDecisionCompat`, `parseLegacyScore`, `canonicalDecisionToLegacyScore`, `resolveLegacyDecisionCompat`; remove `legacy` from `DecisionModelResult` |
| `cloud/apps/api/src/graphql/queries/domain/shared.ts` | modify | Remove re-exports of deleted types/functions |
| `cloud/apps/api/src/services/analysis/aggregate/variance.ts` | modify | Replace `canonicalScore`-based math with canonical mapping; replace `scoreCounts` with `directionCounts` |
| `cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts` | modify | Remove `decisionBucketCodeToScore`, `normalizeDecisionBucketCode` numeric paths; remove `DecisionBucketCode` type, `resolveBucketValue`, `DECISION_BUCKET_ORDER` |
| `cloud/apps/api/src/services/decision-model.ts` | modify | Remove `resolveAnalysisScore`, `buildValueOutcomesFromScore`, `parseLegacyDecisionCode`; keep resolver with `decisionCode` fallback |
| `cloud/apps/api/src/services/export/decision-display.ts` | modify | Remove any `legacy` references |
| `cloud/apps/api/src/graphql/types/transcript.ts` | modify | Remove `legacy` field from `decisionModelV2` GraphQL type |
| `cloud/apps/api/src/queue/handlers/analyze-basic.ts` | modify | Remove `summary.score` from `TranscriptData`; use canonical decision |
| `cloud/apps/api/src/services/assumptions/order-effect-analysis.ts` | modify | Replace `rawScore`/`canonicalScore` with canonical direction/strength |
| `cloud/apps/api/src/services/assumptions/order-effect-comparison.ts` | modify | Remove `rawScore` from variant cell types |
| `cloud/workers/stats/decision_model.py` | modify | Remove `normalize_resolved_score`, `_parse_compat_score`, `resolve_transcript_score`, `resolve_transcript_normalized_score`; rewrite `resolve_transcript_score_details` to return `(direction, strength, source)` |
| `cloud/workers/stats/variance_analysis.py` | modify | Replace score-based math with canonical direction/strength mapping |
| `cloud/apps/web/src/utils/transcriptDecisionModel.ts` | modify | Remove `normalizeLegacyDecisionCode`; rewrite `getTranscriptDecisionSortValue` to use canonical |
| `cloud/apps/web/src/api/operations/runs.ts` | modify | Remove `TranscriptDecisionModelV2LegacyCompat` type |
| `cloud/apps/web/src/generated/graphql.ts` | regenerate | After GQL schema change |
| `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx` | modify | Replace `scoreCounts` references with `directionCounts` |

### Test files to update

All tests referencing `rawScore`, `canonicalScore`, `decisionCode`, `LegacyDecisionCompat`, or 1-5 numeric fixtures need updating to use canonical direction/strength shapes.

---

## Wave Breakdown

### Wave 1 — P1: Core TypeScript API (decision model + aggregate logic)
Remove legacy types and functions from the decision model, aggregate logic, and variance analysis. These are the core producers — once they're clean, the rest follows.

Scope: `decision-model.ts` (both), `variance.ts`, `aggregate-logic.ts`, `decision-model.ts` service

### Wave 2 — P1: GraphQL schema + Python workers
Remove `legacy` from GraphQL type, update analyze-basic handler, update Python workers.

Scope: `transcript.ts`, `analyze-basic.ts`, `decision_model.py`, `variance_analysis.py`

### Wave 3 — P2/P3: Frontend + exports + order-effect
Update frontend sort, remove legacy type from operations, update exports and order-effect services.

Scope: `transcriptDecisionModel.ts`, `runs.ts`, `decision-display.ts`, `order-effect-*.ts`, `OverviewTab.tsx`

### Wave 4 — Test cleanup + regression coverage
Update all test fixtures that reference legacy shapes. Add a specific regression test for the `decisionCode` fallback path in `resolveTranscriptDecisionModel` (feed a transcript with only `decisionCode`, verify canonical output). Add a parity test comparing `directionCounts` output vs. the old `scoreCounts` mapping on the same fixture.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Old `scoreCounts` in stored aggregate JSON | Frontend normalizer handles both shapes. Python workers only write aggregate results, never read them — no backend compatibility layer needed for JSONB aggregate results. |
| Hidden consumers of `rawScore`/`canonicalScore` | Grep success criterion catches remaining references. For GraphQL fragments and persisted queries, `grep -r "legacy\|rawScore\|canonicalScore" cloud/apps/web/src --include="*.ts" --include="*.tsx"` run at end of Wave 3. |
| Python worker tests break on score removal | Run pytest against workers after each Python change |
| In-flight PgBoss jobs at deploy time | Workers receive TS-resolved canonical decisions via job queue, not raw DB rows. No in-flight job compatibility issue — the canonical fields have always been present in payloads. |
| GraphQL clients still requesting `legacy` sub-object | Wave 2 includes grep sweep; builds break if any TS client still references the removed field. MCP tool response format excluded per spec. |
| `decisionCode` fallback regression | Wave 4 adds explicit regression test for the fallback path. |

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/diff.gemini.regression-adversarial.review.md | status: accepted | note: HIGH is [UNVERIFIED] and intentional per spec US-4. summary.score removal is required. Downstream consumers (Python workers Slice 2.2, frontend Slice 3.1, tests Slice 4.1) updated in subsequent slices before deployment.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: HIGH (technical debt shim) is known and intentional — _canonicalToScore with explicit TODO is a bridge pattern. Slice 3.2 will fully migrate order-effect to canonical direction/strength. MEDIUM (duplicated logic) same — accepted bridge. LOW (flag divergence) intentional; full flag removal is out of scope. UNVERIFIED (downstream consumers) addressed in subsequent slices.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: All findings are [UNVERIFIED]. summary.score removal is intentional per spec US-4; consumers updated in Slice 2.2 (Python), 3.1 (frontend), 4.1 (tests). Empty summary {} for unscored is correct behavior. Integration test for analyze-basic will be updated in Slice 4.1.
