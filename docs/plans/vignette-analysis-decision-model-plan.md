# Vignette Analysis Decision Model Plan

## Goal
Replace the active vignette-analysis decision model with a canonical `direction + strength` model.

This plan intentionally throws away the earlier score-first migration approach.

The new design should:
- treat transcripts as source data
- extract directly into canonical decision meaning, not numeric score
- preserve raw decision evidence for audit and replay
- keep scalar compatibility support where analytics, exports, and legacy consumers still require it
- reduce context load so GPT-5.4-mini can execute the work safely in small slices

## Core Decision
The canonical decision model is:
- favored value
- opposed value
- direction
- strength
- neutral or unknown state
- normalization provenance
- parse provenance

The active product must not use raw numeric codes as the main concept.

## Locked Product Semantics
1. `score` remains a canonical glossary term only for:
   - a raw 1-to-5 answer on a numeric response scale
   - a derived legacy compatibility view
   It is not the canonical decision model for value-labeled transcripts.
2. For value-labeled transcripts, extraction should target canonical decision meaning first, not a numeric score.
3. Raw audit evidence is the matched text and parse metadata, not a numeric code unless the transcript truly used a numeric response scale.
4. `direction + strength` is the main decision concept for reports, drilldowns, exports, and docs.
5. A scalar compatibility measure remains available for:
   - legacy compatibility
   - replay of older behavior
   - older exports or analyses that still require it
   - variance, consistency, and other worker math that still depends on a scalar
6. Do not delete transcripts.
7. Do not delete raw decision evidence.
8. Do not keep score-first UI semantics in the active hot path once the new model is available.
9. Existing score-based API fields must not change meaning in place during migration.
10. New decision semantics must cross a versioned boundary before any UI migration starts.
11. This is a full-stack migration, not a UI-only migration.

## Migration Contract And Version Boundary
This migration needs an explicit boundary. It cannot rely on informal interpretation changes inside UI code.

### Contract Versions
- **V1 legacy contract**
  - existing `decisionCode`
  - existing `decisionCodeSource`
  - existing score-based exports
  - existing analysis fields that current consumers already use
- **V2 decision contract**
  - `rawDecisionEvidence`
  - `canonicalDecision`
  - `legacyDecisionCompat`
  - optional analysis-facing scalar compatibility fields for worker math and exports

### Boundary Rules
1. Do not change the meaning of any V1 field in place.
2. Add V2 fields additively before migrating any consumer.
3. Gate V2 consumer rollout behind a feature flag such as `decision_model_v2`.
4. During migration, a consumer must read one model or the other for a given surface.
   - allowed: V1-only
   - allowed: V2-only
   - not allowed: ad hoc mixing of V1 score semantics and V2 canonical semantics inside one component
5. If a V2 surface needs fallback, fallback must happen in one server-side adapter layer, not inside React components.
6. Legacy exports stay V1 by default until parity checks pass.
7. V2 export semantics should ship as:
   - additive columns on explicit opt-in export, or
   - a separate export mode
   but never by silently changing the meaning of existing V1 export columns.
8. V1 deprecation can begin only after:
   - parity checks pass
   - canary rollout passes
   - transcript audit surfaces are stable under V2
   - rollback remains possible via the feature flag

### Transition Write Path
During the transition, new transcripts must continue to write the current scalar fields needed by existing workers and exports.

Required transition rule:
1. New transcript summarization writes:
   - existing legacy fields required by current analysis and export paths
   - V2 raw decision evidence
   - enough canonical decision data to derive V2 views deterministically
2. Do not switch the write path to V2-only until:
   - worker math has been updated
   - export compatibility has been updated
   - shadow validation has passed

This is effectively a dual-write phase at the semantic level, even if some V2 fields are derived rather than stored physically at first.

## Rollout Gates
Before any production-facing V2 UI rollout:
1. V2 contract must exist and be documented.
2. Deterministic conversion tests must pass.
3. Parity checks against current legacy behavior must pass on numeric legacy runs.
4. The feature flag must default to off.
5. Rollback must be one flag flip, not a code scramble.

## Why This Plan Changes The Old One
The earlier plan still gave too much weight to numeric score.

That is the wrong center of gravity for the current product direction because:
- value-labeled transcripts do not naturally emit numbers
- paired and orientation-sensitive views become confusing when the UI teaches `1..5` first
- storage cost is not the problem; semantic branching in active code is
- a smaller model will do better with one decision model in the hot path and one legacy adapter at the edge

## Target Data Model

### Raw Decision Evidence
This is the source evidence used for audit.

```ts
type RawDecisionEvidence = {
  matchedText: string | null;
  matchedLabel: string | null;
  parseClass: 'exact' | 'fallback_resolved' | 'ambiguous' | 'unparseable' | null;
  parsePath: string | null;
  parserVersion: string | null;
  responseExcerpt: string | null;
  manualOverride: {
    previousValue: string | null;
    overriddenAt: string | null;
    overriddenByUserId: string | null;
  } | null;
};
```

### Canonical Decision
This is the main model used by reports and drilldowns.

```ts
type CanonicalDecision = {
  favoredValueKey: string | null;
  opposedValueKey: string | null;
  direction: 'favor_first' | 'favor_second' | 'neutral' | 'unknown';
  strength: 'strong' | 'lean' | 'neutral' | 'unknown';
  normalizationApplied: boolean;
  normalizationReason: 'orientation_flipped' | null;
  source: 'deterministic' | 'llm' | 'manual' | 'error' | 'unknown';
};
```

### Legacy Compatibility
This is kept for old behavior and for scalar-dependent analysis paths that have not yet been fully migrated.

```ts
type LegacyDecisionCompat = {
  rawScore: 1 | 2 | 3 | 4 | 5 | null;
  canonicalScore: 1 | 2 | 3 | 4 | 5 | null;
};
```

### Notes On Legacy Compatibility
- `rawScore` is populated only when the source transcript actually uses a numeric response scale or an older numeric parse path.
- For value-labeled transcripts, `rawScore` is usually `null`.
- `canonicalScore` may be derived for compatibility when the canonical decision is fully known.
- If canonical decision is `unknown`, both legacy fields must be `null`.
- Worker and export code must treat `canonicalScore` as the analysis-facing scalar unless and until they are explicitly migrated to non-score semantics.

## Interpretation Rules
1. New UI and docs must consume `CanonicalDecision`.
2. Audit UI must expose `RawDecisionEvidence`.
3. Legacy score logic must live behind one adapter for product surfaces, but worker and export code may continue to consume a scalar compatibility field during migration.
4. New code must not read `decisionCode` directly unless it is inside the legacy adapter or a legacy export path.
5. Numeric score should be derived from canonical decision only when an older consumer requires it.
6. If analysis or export code requires aggregation at scale, it must consume precomputed or persisted scalar-compatible analysis artifacts rather than loading raw transcript rows into frontend code.

## Deterministic Conversion Spec
This section is load-bearing. Two different implementations must produce the same result from the same transcript.

### Canonical Value Order
- `favor_first` means favoring the first value in canonical value order after normalization.
- `favor_second` means favoring the second value in canonical value order after normalization.
- Canonical value order must come from the same paired-orientation metadata source everywhere.

### Conversion Precedence
1. Manual override
2. Exact parse
3. Fallback-resolved parse
4. Ambiguous
5. Unparseable

Higher-precedence evidence wins for `CanonicalDecision`.
Lower-precedence evidence must still remain visible in `RawDecisionEvidence`.

### Mapping Rules
1. If parse outcome is `ambiguous` or `unparseable`, then:
   - `CanonicalDecision.direction = 'unknown'`
   - `CanonicalDecision.strength = 'unknown'`
   - `CanonicalDecision.favoredValueKey = null`
   - `CanonicalDecision.opposedValueKey = null`
   - `LegacyDecisionCompat.rawScore = null`
   - `LegacyDecisionCompat.canonicalScore = null`
2. If a manual override exists, it is authoritative for:
   - `CanonicalDecision`
   - `LegacyDecisionCompat`
   while the original parser result remains in `RawDecisionEvidence.manualOverride.previousValue`.
3. If the visible response maps to a strong first-side decision, canonical decision is:
   - `direction = 'favor_first'`
   - `strength = 'strong'`
4. If the visible response maps to a lean first-side decision, canonical decision is:
   - `direction = 'favor_first'`
   - `strength = 'lean'`
5. If the visible response maps to neutral, canonical decision is:
   - `direction = 'neutral'`
   - `strength = 'neutral'`
   - `favoredValueKey = null`
   - `opposedValueKey = null`
6. If the visible response maps to a lean second-side decision, canonical decision is:
   - `direction = 'favor_second'`
   - `strength = 'lean'`
7. If the visible response maps to a strong second-side decision, canonical decision is:
   - `direction = 'favor_second'`
   - `strength = 'strong'`
8. Orientation normalization flips direction but does not change strength.
9. If canonical value order or pair metadata is missing, canonical decision must become `unknown` rather than guessed.

### Legacy Score Mapping
When compatibility mapping is required and canonical decision is known:

| Canonical decision | `canonicalScore` |
|---|---|
| `favor_first` + `strong` | `5` |
| `favor_first` + `lean` | `4` |
| `neutral` + `neutral` | `3` |
| `favor_second` + `lean` | `2` |
| `favor_second` + `strong` | `1` |
| `unknown` | `null` |

### Required Examples
The implementation spec and tests must include examples for:
- exact first-side strong decision
- exact second-side lean decision
- neutral decision
- orientation-flipped exact decision
- fallback-resolved decision
- ambiguous response
- unparseable response
- manual override replacing an ambiguous response
- manual override replacing an exact response
- missing pair metadata forcing `unknown`

### Scalar Compatibility Rule
The plan must preserve one analysis-facing scalar during migration.

That scalar is:
- `rawScore` for legacy raw replay only
- `canonicalScore` for normalized worker math, aggregate stats, and compatibility exports

This avoids breaking:
- `cloud/workers/stats/basic_stats.py`
- `cloud/workers/stats/variance_analysis.py`
- `cloud/workers/stats/dimension_impact.py`
- `cloud/workers/stats/model_comparison.py`
- export builders that still compute mean score, standard deviation, and score distributions

The long-term product model is still `direction + strength`, but the migration must not strand worker math without a scalar.

## Required Test Matrix
The first executable slice must include:
1. adapter unit tests for all deterministic conversion cases
2. paired-orientation tests proving direction flips and strength stays constant
3. legacy compatibility tests proving canonical decision back-maps to the expected score
4. manual-override tests proving override precedence and provenance retention
5. invalid or missing metadata tests proving the adapter fails closed to `unknown`
6. parity tests on numeric legacy fixtures proving V2-derived `canonicalScore` matches current behavior
7. worker-level tests proving variance and summary math still behave correctly with the scalar compatibility path
8. export tests proving score-based exports remain stable while V2 is gated off

## GPT-5.4-Mini Execution Rules
These rules are here to keep the work safe for a smaller model.

1. Add one canonical adapter before changing many consumers.
2. Add the V2 boundary and flag before migrating UI semantics.
3. Keep each wave bounded to a small, disjoint file set.
4. Do not rename broad schema and UI terms in one pass.
5. Do not let new components read legacy score fields directly.
6. Move old score logic into one compatibility module as early as possible.
7. Keep one archived legacy behavior doc so old semantics do not stay mixed into active docs.
8. Prefer additive read-time derivation before destructive schema cleanup.
9. Add parity checks before switching any production surface from V1 to V2.
10. Do not optimize the architecture around GPT-5.4-mini context limits if that would move production aggregation out of the proper backend layer.

## Wave Plan

| Wave | Goal | Main work | Primary files | Exit rule |
|---|---|---|---|---|
| 1 | Lock vocabulary | Update glossary, PRD, and core docs so `decision` means canonical `direction + strength`, `score` means raw or legacy numeric answer, and audit language refers to raw decision evidence | `docs/canonical-glossary.md`, `docs/valuerank_prd.yaml`, `docs/README.md` | No active doc teaches `1..5` as the main decision concept |
| 2 | Add versioned boundary and write-path rules | Add V2 decision fields, define the feature flag, document V1 versus V2 read rules for API, web, worker, and export paths, and define transition dual-write semantics | GraphQL transcript and analysis types, summarization write path, export contract files, one new shared decision adapter module | V1 behavior is unchanged, V2 fields exist additively, and new transcripts still satisfy current worker inputs |
| 3 | Implement deterministic adapter and tests | Introduce `RawDecisionEvidence`, `CanonicalDecision`, and `LegacyDecisionCompat`; implement strict mapping rules and edge-case tests | adapter module, transcript and analysis types, test files | Conversion is deterministic and parity tests pass on legacy fixtures |
| 4 | Update backend analysis and export consumers | Make worker and export paths explicitly consume scalar compatibility plus canonical semantics where needed; add analysis-side canonical aggregates rather than relying on frontend-only interpretation | `cloud/workers/analyze_basic.py`, `cloud/workers/stats/basic_stats.py`, `cloud/workers/stats/variance_analysis.py`, `cloud/workers/stats/dimension_impact.py`, `cloud/apps/api/src/queue/handlers/analyze-basic.ts`, export builders | Backend analysis remains correct and large-scope aggregations do not move into frontend code |
| 5 | Change transcript audit surfaces | Make transcript list and viewer surfaces show favored value and strength first; move raw evidence to detail panels; stop presenting normalized score as the main transcript meaning | `cloud/apps/web/src/pages/AnalysisTranscripts.tsx`, `cloud/apps/web/src/components/runs/TranscriptList.tsx`, `cloud/apps/web/src/components/runs/TranscriptViewer.tsx` | Paired transcript drilldowns are understandable without score inversion logic |
| 6 | Rewrite condition drilldown and summary surfaces | Replace score-bin framing in condition detail and score-first condition summaries with decision-direction framing and analysis-produced canonical metrics | `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx`, `cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx`, `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx`, `cloud/apps/web/src/components/analysis/DecisionDistributionChart.tsx`, `cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx`, `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx` | Main report surfaces no longer require users to reason in numeric codes |
| 7 | Shadow validate and roll out safely | Run historical shadow validation, canary rollout, parity verification, and rollback drills; only then expand V2 flag coverage | validation scripts, telemetry, rollout notes | Historical validation passes, canary passes, and rollback is proven |
| 8 | Push legacy behind one boundary and archive | Move product-layer numeric score labels, mappings, query compatibility, and old filtering semantics into one legacy codec or adapter; create one short legacy behavior doc | one `legacyDecisionCodec` module plus legacy call sites and one legacy doc | The hot product path has one active decision model, not two |

## Execution Order
1. Vocabulary and docs
2. Versioned V2 boundary
3. Deterministic adapter and tests
4. Backend analysis and export updates
5. Transcript audit surfaces
6. Condition detail and summary tables
7. Shadow validation, rollout, and verification
8. Legacy boundary cleanup and archive

This order is locked because:
- docs stop new semantic drift
- the versioned boundary prevents silent contract drift
- the adapter reduces branching before UI edits begin
- backend analysis must remain correct before the UI can trust new semantics
- transcript drilldowns are the audit center and must become trustworthy first
- summary surfaces become much easier to rewrite once the underlying meaning is stable

## Metric Definitions
These replacement metrics need exact formulas.

### Scope Terms
- **Analyzable decision count**: number of decisions in scope where `CanonicalDecision.direction != 'unknown'`
- **Unknown decision count**: number of decisions in scope where `CanonicalDecision.direction == 'unknown'`

Unknown decisions must be shown as coverage loss. They must not disappear silently from report denominators.

### Favored-Value Share
For a value `V` in a given scope:

`favored_value_share(V) = count(decisions where favoredValueKey = V) / analyzable_decision_count`

### Neutral Share

`neutral_share = count(decisions where direction = 'neutral') / analyzable_decision_count`

### Strength Mix
Strength mix is the distribution of strong versus lean among non-neutral analyzable decisions in scope.

For a value `V`:

`strong_share(V) = count(decisions where favoredValueKey = V and strength = 'strong') / count(decisions where favoredValueKey = V and strength in {'strong', 'lean'})`

`lean_share(V) = count(decisions where favoredValueKey = V and strength = 'lean') / count(decisions where favoredValueKey = V and strength in {'strong', 'lean'})`

### Paired Runs
For paired runs, normalization happens before all metric aggregation.

That means:
1. normalize each decision to canonical value order
2. compute analyzable and unknown counts from normalized decisions
3. compute favored-value share, neutral share, and strength mix on normalized scope only

### Aggregation Boundary
These metrics must be produced from backend analysis artifacts for large report surfaces.

Do not rely on frontend-only aggregation over raw transcript rows for:
- large runs
- exports
- aggregate analyses
- repeated-trial summary views

Frontend adapters may format and label canonical decisions, but backend analysis must remain the source of truth for large-scope aggregation.

## Report Surfaces To Update First

| Priority | Surface | File | Why |
|---|---|---|---|
| 1 | Transcript drilldown page | `cloud/apps/web/src/pages/AnalysisTranscripts.tsx` | This is the audit entry point and currently exposes normalized score as the main concept |
| 1 | Transcript table | `cloud/apps/web/src/components/runs/TranscriptList.tsx` | It currently mixes raw score, normalized score, and decision meaning |
| 1 | Transcript modal | `cloud/apps/web/src/components/runs/TranscriptViewer.tsx` | It is the main place to verify one trial end to end |
| 2 | Condition detail | `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx` | It explicitly teaches score-bin interpretation today |
| 3 | Condition table | `cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx` | Mean score cells are compact but semantically weak |
| 3 | Pivot table | `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` | Average score by condition pair is not the right primary report concept |
| 3 | Decision distribution chart | `cloud/apps/web/src/components/analysis/DecisionDistributionChart.tsx` | This is a score-first chart and should become a decision-shape chart |
| 4 | Paired comparison card | `cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx` | Mostly close to the target model, but still explains itself through score-first tooltips |
| 4 | Overview copy | `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx` | Lower urgency because it already leans toward semantic summaries |

## Compatibility Strategy

### Keep
- transcripts
- raw matched text
- parse metadata
- manual override history
- orientation and normalization provenance
- legacy numeric score fields in storage
- scalar compatibility fields needed by workers and exports during migration
- old exports that rely on numeric score columns

### Keep Only Behind A Boundary
- raw numeric decision display
- canonical numeric score
- old score query params
- old score filter semantics
- old score label mappings
- legacy exports as the default export behavior during migration

### Temporary Measures To Delete Later
These are intentionally transitional. Remove them in the legacy cleanup phase
once the remaining API, worker, export, and UI consumers are fully canonical.

- `summary.score` as a product-facing analysis concept
- `decisionCode` as the temporary bridge for Job Choice transcript meaning until canonical transcript summaries are the only source of direction and strength
- worker-side fallback math that accepts legacy score values for mixed data
- API compatibility helpers that turn canonical decisions back into scalar scores
- dual-read logic that prefers the V2 envelope but still falls back to legacy score fields
- export columns or charts that still treat the scalar score as the meaning of a transcript decision
- tests that exist only to protect legacy scalar compatibility once all consumers have moved to canonical decisions

### Do Not Keep In The Hot Path
- new report UI that reads `decisionCode` directly
- docs that teach `1..5` as the main report concept
- duplicate ad hoc normalization helpers across pages
- score-first copy in paired or orientation-sensitive views

## Archival Strategy

Archive very little, but archive it cleanly.

Create one short legacy doc that preserves:
- old score-first UI semantics
- old normalization rules
- old query param meanings
- old score-bin chart meanings
- replay notes for older exports and analyses

Do not archive:
- transcripts
- raw decision evidence
- parser metadata
- override history

## Rollout, Verification, Rollback, And Backfill

### Rollout Strategy
1. Ship V2 fields dark behind the feature flag.
2. Validate parity on legacy numeric runs before any UI switch.
3. Enable V2 only for internal canary users first.
4. Convert transcript audit surfaces first.
5. Expand to condition detail and summary surfaces only after transcript audit canary is stable.

### Parity Checks
Required parity checks:
1. On legacy numeric runs, V2-derived `canonicalScore` must match current orientation-corrected legacy behavior.
2. On paired transcript fixtures, V2 direction must match expected favored value after normalization.
3. On manual override fixtures, V2 must honor the override while preserving prior parser evidence.
4. Export parity must prove V1 export columns are unchanged when the V2 flag is off.
5. Worker parity must prove variance, directionality, and consistency outputs remain stable on legacy-compatible fixtures.

### Historical Shadow Validation
Before production cutover, run a shadow-validation script across historical transcripts.

The script must:
1. derive V2 canonical decision and scalar compatibility output from historical transcript rows
2. record counts for:
   - exact
   - fallback-resolved
   - ambiguous
   - unparseable
   - missing metadata
3. compare V2-derived scalar compatibility with current legacy-compatible outputs where such outputs exist
4. emit failure buckets and sample exemplars for manual review

The UI must not cut over to V2 by default until this shadow validation passes on the intended production population.

### Rollback Criteria
Rollback the feature flag immediately if any of these happen in canary:
- deterministic fixture mismatch
- transcript audit disagreement on paired-orientation cases
- legacy export column meaning changes unexpectedly
- unresolved coverage is hidden instead of surfaced

### Rollback Mechanism
- Web rollout must be disabled by one feature flag.
- API V1 fields must remain valid while the flag is off.
- No destructive storage rewrite is allowed before V2 has already passed canary and parity.

### Backfill Strategy
Do not start with an in-place rewrite of historical analyses.

Use this order:
1. derive V2 decision data at read time from stored transcript evidence and definition metadata
2. verify parity and canary behavior
3. only then consider optional background materialization for performance or export convenience

This keeps rollback cheap and avoids mutating historical rows before the new semantics are proven.

### Database And Performance Note
The migration must not force high-cardinality transcript aggregation into React or ad hoc Node-only view adapters.

If canonical report metrics cannot be served efficiently from existing analysis artifacts, the plan must add:
- backend-computed canonical summary fields, or
- persisted/materialized analysis artifacts, or
- a schema/backfill step

before large production surfaces switch to those metrics by default.

## What A Future AI Needs To Reconstitute Old Behavior
- transcript content
- raw matched decision evidence
- parser metadata
- definition snapshot
- value order and presentation order
- orientation or normalization flags
- manual override history
- legacy score mapping rules
- analysis code version
- export field definitions

If these survive, old behavior can be replayed without keeping old semantics active in everyday code.

## Acceptance Criteria

| Area | Must be true |
|---|---|
| Docs | Canonical decision is defined as `direction + strength` everywhere in active docs |
| API and adapters | New UI code can consume `CanonicalDecision` directly and V1 field meaning remains unchanged |
| Audit UI | Users can inspect a paired transcript without knowing score inversion rules |
| Report UI | Main summaries show favored value, neutral share, and strength, not average score |
| Legacy support | Older score-based behavior remains reproducible through one adapter |
| Rollout safety | V2 can be turned off with one flag and parity checks are documented and passing |
| Backend safety | Workers and exports still have a valid scalar path during migration and large-scope canonical metrics come from backend analysis, not frontend row scans |
| Maintainability | Active product code does not require carrying two decision models at once |

## Non-Goals
- deleting transcript history
- deleting raw decision evidence
- deleting legacy numeric fields immediately
- rewriting every historical analysis result in place
- preserving score-first UX semantics for user comfort

## Recommended First Slice
For the first implementation slice, do only this:
1. update docs language
2. add the V2 contract boundary and feature flag
3. implement the canonical decision adapter
4. add deterministic mapping tests and legacy parity tests

Do not migrate production-facing UI before that slice is complete.

That slice gives the biggest safety gain with the lowest context burden for GPT-5.4-mini.
