# Tasks: 030 — Remove Legacy Decision Code and Unify Scoring Model

## Wave 1 — P1: ConditionMatrix bug fix + core TS API cleanup

### Slice 1.1 — Fix ConditionMatrix scoring display
[P: cloud/apps/web/src/components/domains/ConditionMatrix.tsx]

- [X] In `cloud/apps/web/src/components/domains/ConditionMatrix.tsx`:
  - Investigated data source: 5-bucket data IS available via GraphQL (strongly/somewhat/opponentSomewhat/opponentStrongly already fetched)
  - Updated `MatrixCondition` type to include `strongly`, `somewhat`, `opponentSomewhat`, `opponentStrongly` counts
  - Rewrote `getConditionMatrixDisplay` to compute strength score using `winnerScore = (2 * winnerStrong + 1 * winnerSomewhat) / totalTrials`
  - Label now shows strength (0/1/2), color shows winner (blue/orange via isOpponent)
  - Updated `validateMatrixCondition` to validate 5-bucket fields
  - Updated test fixtures in `DomainAnalysisValueDetail.test.tsx` with 5-bucket data and corrected expected labels
- [X] Run `npm run build --workspace @valuerank/web` — all tests pass (121 files, 1232 tests), build and lint clean

[CHECKPOINT]

### Slice 1.2 — Remove `LegacyDecisionCompat` type, `canonicalDecisionScoreFromDirectionStrength`, and all producers
[P: cloud/apps/api/src/graphql/queries/domain/decision-model.ts, cloud/apps/api/src/graphql/queries/domain/decision-model-helpers.ts, cloud/apps/api/src/graphql/queries/domain/shared.ts, cloud/apps/api/src/services/decision-model.ts]

- [X] In `cloud/apps/api/src/graphql/queries/domain/decision-model-helpers.ts`:
  - Deleted `canonicalDecisionScoreFromDirectionStrength()` function
- [X] In `cloud/apps/api/src/graphql/queries/domain/decision-model.ts`:
  - Deleted `LegacyDecisionCompat` type, `parseLegacyScore()`, `canonicalDecisionToLegacyScore()`, `resolveLegacyDecisionCompat()`
  - Removed `legacy` field from `DecisionModelResult` type
  - Kept `decisionCode` fallback inside `resolveTranscriptDecisionModel`
- [X] In `cloud/apps/api/src/graphql/queries/domain/shared.ts`:
  - Removed re-exports of deleted types/functions
- [X] In `cloud/apps/api/src/services/decision-model.ts`:
  - Codex verified no legacy functions remained (already cleaned in prior PRs)
- [X] Run `npm run build --workspace @valuerank/api` — builds clean

[CHECKPOINT]

### Slice 1.3 — Clean variance analysis and aggregate logic
[P: cloud/apps/api/src/services/analysis/aggregate/variance.ts, cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts]

- [X] Verified: no `canonicalScore`, `scoreCounts`, `decisionBucketCodeToScore`, or legacy references remain in variance.ts or aggregate-logic.ts (already using canonical model)
- [X] Run `npm run build --workspace @valuerank/api` — builds clean

[CHECKPOINT]

---

## Wave 2 — P1/P2: GraphQL schema + Python workers

### Slice 2.1 — Remove `legacy` from GraphQL type
[P: cloud/apps/api/src/graphql/types/transcript.ts, cloud/apps/api/src/queue/handlers/analyze-basic.ts]

- [X] In `cloud/apps/api/src/graphql/types/analysis.ts` and `cloud/apps/api/src/server.ts`:
  - Removed `legacy` sub-object from GraphQL schema, updated analysis types
- [X] In `cloud/apps/web/schema.graphql`:
  - Removed `legacy` field from schema
- [X] Regenerated `cloud/apps/web/src/generated/graphql.ts`
- [X] Run `npm run build --workspace @valuerank/api` — builds clean

[CHECKPOINT]

### Slice 2.2 — Python worker cleanup
[P: cloud/workers/stats/decision_model.py, cloud/workers/stats/variance_analysis.py]

- [X] In `cloud/workers/stats/decision_model.py`:
  - Deleted `normalize_resolved_score()`, `_parse_compat_score()`, `resolve_transcript_score()`, `resolve_transcript_normalized_score()`
  - Rewrote `resolve_transcript_score_details()` to return `(direction, strength, source)` tuple
  - Added `resolve_transcript_signed_distance()` using canonical mapping (-2 to +2)
  - Added `SIGNED_TO_BUCKET` mapping for histogram keying
- [X] Updated Python worker tests (`test_analyze_basic.py`, `test_variance_analysis.py`)

[CHECKPOINT]

---

## Wave 3 — P2: Frontend statistics and distribution cleanup

### Slice 3.1 — Frontend sort + distribution display + KS-test
[P: cloud/apps/web/src/utils/transcriptDecisionModel.ts, cloud/apps/web/src/utils/decisionDistributionDisplay.ts, cloud/apps/web/src/lib/statistics/ks-test.ts, cloud/apps/web/src/api/operations/runs.ts]

- [X] In `cloud/apps/web/src/utils/transcriptDecisionModel.ts`:
  - Deleted `normalizeLegacyDecisionCode()`, cleaned sort to use canonical only
- [X] In `cloud/apps/web/src/utils/decisionDistributionDisplay.ts`:
  - Removed `'1'`-`'5'` numeric string branches from `normalizeBucketCode()`
  - Removed `sourceKeyByCode` map from `formatBucketLabel()`, now uses bucket code as key directly
- [X] In `cloud/apps/web/src/lib/statistics/ks-test.ts`:
  - Updated `countsToSample()` to use signed strength: opponentStrongly=-2, opponentSomewhat=-1, neutral=0, somewhat=1, strongly=2
  - Removed numeric string key fallbacks
- [X] In `cloud/apps/web/src/api/operations/runs.ts`:
  - Removed `TranscriptDecisionModelV2LegacyCompat` type
- [X] Run `npm run build --workspace @valuerank/web` — builds clean

[CHECKPOINT]

### Slice 3.2 — OverviewTab + GraphQL regeneration
[P: cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx]

- [X] Verified: `OverviewTab.tsx` has no `scoreCounts` references (already clean)
- [X] `generated/graphql.ts` already regenerated in Slice 2.1
- [X] Run `npm run build --workspace @valuerank/web` — builds clean

[CHECKPOINT]

---

## Wave 4 — P2/P3: Exports + order-effect + MCP

### Slice 4.1 — Exports + order-effect + MCP cleanup
[P: cloud/apps/api/src/services/export/decision-display.ts, cloud/apps/api/src/mcp/tools/get-transcript-summary.ts]

- [X] In `cloud/apps/api/src/services/export/decision-display.ts`:
  - Verified: no `legacy` references remain (already clean, uses canonical 0/1/2)
- [X] Order-effect files (`order-effect-analysis.ts`, `order-effect-comparison.ts`) do not exist — removed in a prior PR
- [X] In `cloud/apps/api/src/mcp/tools/get-transcript-summary.ts`:
  - Verified: no legacy `decisionCode` in response format
- [X] Run `npm run build --workspace @valuerank/api` — builds clean

[CHECKPOINT]

---

## Wave 5 — Test cleanup + regression coverage

### Slice 5.1 — Update test fixtures and add regression tests
[P: cloud/apps/api/tests, cloud/apps/web/src]

- [X] Searched for legacy shapes — zero hits for `rawScore`, `canonicalScore`, `LegacyDecisionCompat`, `scoreCounts`, `canonicalDecisionScoreFromDirectionStrength` across all TS/TSX/PY files
- [X] Updated test fixtures across 15+ test files (Codex commit c2fbb29b):
  - `decision-model.test.ts`, `TranscriptList.test.tsx`, `TranscriptViewer.test.tsx`, `RunResults.test.tsx`, `AnalysisPanel.test.tsx`, `ConditionDecisionsTable.test.tsx`, `PivotAnalysisTable.test.tsx`, `scenarioUtils.test.ts`, `AnalysisConditionDetail.test.tsx`, `AnalysisTranscripts.test.tsx`, `DomainAnalysisValueDetail.test.tsx`, `SurveyResults.test.tsx`, `canonicalConditionSummary.test.ts`, `conditionDecisionSummary.test.ts`, `reportDecisionDisplay.test.ts`, `transcriptDecisionModel.test.ts`
- [X] `decisionCode` fallback regression: existing test in `decision-model.test.ts` covers the resolver fallback path
- [X] Run full test suite: `npm run test --workspace @valuerank/api` — 165 files, 2012 tests pass
- [X] Run full test suite: `npm run test --workspace @valuerank/web` — 121 files, 1232 tests pass
- [X] Final grep verification (success criterion):
  ```
  grep -r "LegacyDecisionCompat\|rawScore\|canonicalScore\|parseLegacyScore\|canonicalDecisionToLegacyScore\|canonicalDecisionScoreFromDirectionStrength\|decisionBucketCodeToScore\|normalize_resolved_score" --include="*.ts" --include="*.py" cloud/
  ```
  Returns zero hits ✓

[CHECKPOINT]
