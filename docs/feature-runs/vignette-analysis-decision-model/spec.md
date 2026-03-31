# Vignette Analysis Decision Model Phase 1 — Spec

## Context

The current vignette-analysis path still teaches and consumes score-first semantics:

- `docs/canonical-glossary.md` defines `score` as a 1-to-5 answer
- `docs/valuerank_prd.yaml` says the summarize worker extracts an explicit numerical decision
- `docs/README.md` still describes transcript summaries in terms of decision codes
- `cloud/apps/api/src/graphql/types/transcript.ts` exposes `decisionCode`, `decisionCodeSource`, and `decisionMetadata`
- `cloud/apps/api/src/graphql/queries/domain/shared.ts` still aggregates decisions from numeric codes
- `cloud/workers/analyze_basic.py` and `cloud/workers/stats/variance_analysis.py` still normalize numeric scores

Phase 1 establishes the canonical contract boundary for the new model. It does not migrate
consumer surfaces yet.

## Problem

The product needs a canonical decision model for value-labeled transcripts that is based on
`direction + strength`, not raw numeric codes. Right now, the active code and docs still
center the numeric score, which makes the new semantics ambiguous and easy to mix with the
legacy path.

We need a first phase that:

- defines the canonical decision contract
- preserves raw audit evidence and legacy compatibility data
- adds a feature-flag boundary for later rollout
- proves deterministic conversion rules with tests
- leaves all current consumer behavior unchanged

## What We Are Building

Phase 1 adds an additive contract layer for vignette-analysis decision meaning.

### New canonical contract

```ts
type RawDecisionEvidence = {
  matchedText: string | null;
  matchedLabel: string | null;
  parseClass: 'exact' | 'fallback_resolved' | 'ambiguous' | 'unparseable' | null;
  parsePath: string | null;
  parserVersion: string | null;
  responseExcerpt: string | null;
  manualOverride: {
    previousDecisionCode: string | null;
    appliedDecision: {
      favoredValueKey: string | null;
      opposedValueKey: string | null;
      direction: 'favor_first' | 'favor_second' | 'neutral' | 'unknown';
      strength: 'strong' | 'lean' | 'neutral' | 'unknown';
    } | null;
    overriddenAt: string | null;
    overriddenByUserId: string | null;
  } | null;
};

type CanonicalDecision = {
  favoredValueKey: string | null;
  opposedValueKey: string | null;
  direction: 'favor_first' | 'favor_second' | 'neutral' | 'unknown';
  strength: 'strong' | 'lean' | 'neutral' | 'unknown';
  normalizationApplied: boolean;
  normalizationReason: 'orientation_flipped' | null;
  source: 'deterministic' | 'manual' | 'error' | 'unknown';
};

type LegacyDecisionCompat = {
  rawScore: 1 | 2 | 3 | 4 | 5 | null;
  canonicalScore: 1 | 2 | 3 | 4 | 5 | null;
};
```

### Phase-1 delivery goals

1. Update active terminology in docs so `direction + strength` is the canonical model for
   value-labeled transcripts.
2. Add a shared decision adapter boundary that can derive canonical and legacy-compatible
   shapes from existing transcript evidence.
3. Add a `decision_model_v2` feature-flag hook that defaults off.
4. Add deterministic tests for the conversion rules and compatibility mapping.
5. Keep V1 field meaning unchanged everywhere that already consumes it.

## Phase Boundary

This phase stops at the contract foundation.

### In scope

- glossary and product-doc wording updates
- a shared decision adapter module
- V2 type definitions
- a default-off feature-flag hook
- deterministic conversion tests
- parity tests for the adapter against legacy numeric fixtures

### Out of scope

- API consumer migration
- worker migration
- export migration
- transcript UI migration
- report UI migration
- shadow validation and rollout
- legacy cleanup or archival docs
- deleting transcripts or raw decision evidence
- changing the meaning of any V1 field in place

## Files To Modify

- `docs/canonical-glossary.md`
- `docs/valuerank_prd.yaml`
- `docs/README.md`
- `cloud/apps/api/src/config.ts`
- `cloud/apps/api/src/graphql/queries/domain/decision-model.ts`
- `cloud/apps/api/src/graphql/queries/domain/shared.ts`
- `cloud/apps/api/tests/graphql/queries/domain/decision-model.test.ts`

## Deterministic Rules

The adapter must behave the same way every time the same transcript evidence is supplied.

### Conversion precedence

1. manual override
2. exact parse
3. fallback-resolved parse
4. ambiguous
5. unparseable

### Parse classes

- `exact` means the parser matched the response directly to a canonical value label
- `fallback_resolved` means the parser resolved the response through a deterministic alias or
  normalization rule after exact matching failed
- `ambiguous` means the parser could not uniquely identify a canonical value
- `unparseable` means the parser could not classify the response at all

### Required behavior

- `ambiguous` and `unparseable` inputs map to `direction: 'unknown'`, `strength: 'unknown'`,
  and `source: 'unknown'`
- manual override is authoritative for canonical and legacy-compatible output
- `parseClass: null` means the stored evidence has no classified parse result yet, or the
  class was not preserved in a legacy row; the adapter still treats it as `unknown`
- any unrecognized future `parseClass` value also degrades to `unknown`
- `parsePath` is a stable, human-readable parser-branch label such as
  `exact.favor_first.strong`, `fallback.favor_second.lean`, or `manual.override`
- `parserVersion` records the parser implementation version or build identifier used to
  produce the raw evidence
- `manualOverride.previousDecisionCode` stores the prior legacy `decisionCode` string exactly
  as it existed before the override
- `manualOverride.appliedDecision` stores the canonical decision that should be treated as
  authoritative for this transcript
- if `previousDecisionCode` conflicts with `appliedDecision`, the applied canonical decision
  wins; `previousDecisionCode` is audit history only
- if `manualOverride.appliedDecision` is missing or internally inconsistent, the adapter
  returns `unknown` with `source: 'error'`
- if a legacy row lacks canonical metadata but does have a valid numeric `rawScore`, the
  adapter preserves that scalar in `LegacyDecisionCompat` even when `CanonicalDecision`
  remains `unknown`
- orientation normalization flips direction but does not change strength
- canonical direction and strength are relative to canonical pair order from the same
  value-pair metadata source used by `cloud/apps/api/src/graphql/queries/domain/shared.ts`
- missing value-pair metadata yields `unknown` rather than a guess
- malformed pair metadata, such as `valueA === valueB` or keys outside the canonical value
  registry, also yields `unknown`
- `canonicalScore` is derived only when canonical direction and strength are known
- raw audit evidence stays visible even when canonical output is `unknown`
- `direction: 'neutral'` always pairs with `strength: 'neutral'`
- `direction: 'unknown'` always pairs with `strength: 'unknown'`
- no mixed states are valid: `favor_first` and `favor_second` only pair with `lean` or
  `strong`; `neutral` only pairs with `neutral`; `unknown` only pairs with `unknown`

### Compatibility mapping

| Canonical decision | `canonicalScore` |
|---|---|
| `favor_first` + `strong` | `5` |
| `favor_first` + `lean` | `4` |
| `neutral` + `neutral` | `3` |
| `favor_second` + `lean` | `2` |
| `favor_second` + `strong` | `1` |
| `unknown` | `null` |

### Provenance rules

- `source: 'deterministic'` means the adapter derived the canonical decision from raw
  evidence without human intervention
- `source: 'manual'` means a manual override authored the canonical output
- `source: 'error'` means the adapter rejected malformed input or hit a runtime failure
- `source: 'unknown'` means the stored evidence predates the phase-1 provenance fields or
  the provenance could not be reconstructed from legacy data
- raw parser provenance stays in `RawDecisionEvidence`, not in the `source` field
- `rawScore` is the legacy numeric answer parsed from the current applied legacy decision
  value when that value is numeric; if manual override supplies only canonical data, the
  adapter derives `rawScore` from the compatibility mapping; otherwise it is `null`

### Normalization input

- the adapter receives a resolved pair record with `valueA` and `valueB` from the same
  value-pair metadata used by `cloud/apps/api/src/graphql/queries/domain/shared.ts`
- the adapter also receives the transcript's orientation flag from stored transcript or
  scenario metadata
- `valueA` is the canonical first-side value and `valueB` is the canonical second-side value
- `parsePath` supplies the canonical branch, including direction and strength, such as
  `exact.favor_first.strong`, `exact.favor_second.lean`, `exact.neutral`, or the matching
  fallback variants
- if either the pair record or the orientation flag is missing, the adapter returns
  `unknown` for canonical output, but it may still preserve a valid legacy `rawScore`
- `normalizationApplied: true` requires `normalizationReason: 'orientation_flipped'`
- `normalizationApplied: false` requires `normalizationReason: null`
- the adapter resolves labels against the value registry snapshot attached to the transcript
  definition snapshot, not against a moving live registry
- `parsePath` is not rewritten by normalization; it records the raw parser branch that
  produced the evidence

### Decision tree

- `manualOverride.appliedDecision` present and valid -> `source: 'manual'`
- `parseClass: 'exact'` with a recognized label and pair metadata -> `source: 'deterministic'`
- `parseClass: 'fallback_resolved'` with a recognized label and pair metadata ->
  `source: 'deterministic'`
- `parseClass: 'ambiguous'`, `parseClass: 'unparseable'`, or `parseClass: null` ->
  `direction: 'unknown'`, `strength: 'unknown'`, `source: 'unknown'`
- malformed metadata or malformed manual override input -> `direction: 'unknown'`,
  `strength: 'unknown'`, `source: 'error'`

### Label resolution

- `matchedLabel` must resolve to one of the canonical value keys in the snapshot value
  registry before the adapter can emit `favoredValueKey` or `opposedValueKey`
- `matchedLabel` may name either side of the pair; the adapter must not assume it always
  refers to the favored side
- if `matchedLabel` does not resolve to a canonical key, the adapter returns `unknown`
- the shared registry is the same canonical value source used by the value-pair metadata
  that feeds `cloud/apps/api/src/graphql/queries/domain/shared.ts`
- `manualOverride.appliedDecision` must itself be internally consistent; if it is not, the
  adapter returns `unknown` with `source: 'error'`
- invalid manual override inputs and malformed pair metadata fail closed instead of being
  coerced into a best guess

### Required test cases

The phase-1 test suite must cover:

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
- legacy back-mapping from canonical decision to compatibility score
- parity against current numeric legacy fixtures

### Parity fixtures

- treat the existing numeric legacy cases in
  `cloud/apps/api/tests/graphql/queries/domain-analysis.test.ts` and
  `cloud/workers/tests/test_analyze_basic.py` as source-of-truth compatibility examples
- add any new minimal fixture data next to the adapter tests only if the existing cases do
  not already cover a listed example
- do not invent a second legacy fixture source for this phase

## Delivery Plan

| Wave | Scope | Why it is separate |
|---|---|---|
| 1 | Update terminology in `docs/canonical-glossary.md`, `docs/valuerank_prd.yaml`, and `docs/README.md` | Locks the new meaning before code changes |
| 2 | Add the shared adapter, V2 types, and default-off flag hook | Creates the contract boundary without changing consumers |
| 3 | Add adapter tests and parity fixtures | Proves the new contract is deterministic and legacy-compatible |

## Acceptance Criteria

- Active docs define vignette-analysis decision meaning in terms of `direction + strength`
- `score` remains a canonical glossary term for the raw 1-to-5 answer, not the primary model for value-labeled transcripts
- The shared adapter can derive `RawDecisionEvidence`, `CanonicalDecision`, and `LegacyDecisionCompat`
- The adapter handles exact, fallback, ambiguous, unparseable, manual override, orientation normalization, and missing metadata cases deterministically
- The feature-flag hook exists and defaults off
- Existing V1 field meanings remain unchanged
- Current consumer behavior still compiles and passes tests
- Existing domain-analysis aggregation outputs remain identical on legacy numeric fixtures
  when the new adapter module is introduced but not yet wired into live consumers
- No UI surface reads the new V2 contract directly yet

## Non-Goals

- migrating API consumers to the new model
- migrating workers or exports to the new model
- changing transcript list or transcript viewer behavior
- changing condition detail or summary behavior
- deleting legacy score logic
- removing raw transcript evidence
- tracking the full chain of repeated manual overrides in phase 1
