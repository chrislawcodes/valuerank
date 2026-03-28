# Implementation Plan: Remove `canonical.direction` from Frontend Bucketing

**Branch**: `feat/028-remove-direction-bucketing` | **Date**: 2026-03-28 | **Spec**: [spec.md](./spec.md)

## Summary

Replace all reads of `canonical.direction` in the two frontend bucketing utilities with alphabetical ordering of `favoredValueKey` / `opposedValueKey`. Because each transcript carries both the winning and losing value key, alphabetical order can be determined per-transcript with no external context, eliminating the positional ambiguity that produced inverted labels in paired batches.

---

## Technical Context

**Language/Version**: TypeScript (strict mode)
**Primary Dependencies**: No new dependencies — pure utility-function refactor
**Storage**: None — frontend-only change, no database or API schema changes
**Testing**: Vitest (web package)
**Target Platform**: Vite / React SPA
**Performance Goals**: No performance impact — same O(n) bucketing per transcript
**Constraints**: No `@ts-ignore`; all 1458 existing tests must continue to pass
**Scale/Scope**: Two utility files + their test files; no callers need changes

---

## Constitution Check

No constitution file found. Validated against `cloud/CLAUDE.md`:

- ✅ TypeScript strict mode: new code uses no `any`, preserves all types
- ✅ Test coverage: all existing tests updated + new tests added
- ✅ File size limits: both files shrink (complexity removed)
- ✅ No `console.log`: utilities are pure functions, no logging needed

---

## Architecture Decision

### Decision 1: Alphabetical ordering as the stable "first/second" reference

**Chosen**: `favoredValueKey.localeCompare(opposedValueKey) < 0` → the favored value is "first" (blue); otherwise it is "second" (orange). Determined per-transcript from the two keys already present on the canonical object.

**Rationale**:
- Every directional transcript carries both `favoredValueKey` and `opposedValueKey`, so no external context is needed
- `localeCompare` is stable and deterministic across the entire codebase
- Alphabetical order is consistent regardless of which run a transcript came from, fixing the paired-batch inversion bug
- The `direction` field's `favor_first`/`favor_second` meaning is tied to the run's `valueA`/`valueB` ordering, which flips between companion runs — alphabetical ordering has no such dependency

**Alternatives Considered**:
- **Pass `selectedValueKey` as a parameter**: Would require threading the "selected value" through callers (`summarizeCanonicalConditionTranscripts`, `PivotAnalysisTable`, `AnalysisConditionDetail`). More correct semantically but more invasive. Alphabetical ordering achieves the same stable result with zero caller changes.
- **Keep direction, fix label resolution only**: The approach taken in the previous patch (majority-vote `firstPositionCounts`). Correct but complex. Still reads `direction` in the bucketing layer, preserving the conceptual confusion.
- **Use win-rate majority (original approach)**: Wrong — as demonstrated by the original bug, the most-favored value ≠ the `favor_first` value.

**Tradeoffs**:
- Pros: Self-contained per-transcript, no caller changes, simple to audit
- Cons: "First" = alphabetically first, which is an arbitrary ordering a reader has to learn (vs. a meaningful "selected value"). Accepted — the prior ordering was equally arbitrary and actively wrong.

---

## Affected Files

```
cloud/apps/web/src/utils/
├── canonicalConditionSummary.ts   ← getCanonicalBucket rewritten (remove direction)
└── conditionDecisionSummary.ts    ← getConditionDecisionBucketKey +
                                      resolveConditionDecisionLabelPair rewritten,
                                      PairLabelStats type simplified

cloud/apps/web/tests/utils/
├── canonicalConditionSummary.test.ts  ← new test: favoredValueKey is alpha-second
└── conditionDecisionSummary.test.ts   ← new test: Harmony wins (alpha-second)

DO NOT TOUCH:
- cloud/apps/api/  (backend direction field stays)
- cloud/apps/web/src/api/operations/runs.ts  (type stays)
- cloud/apps/web/src/utils/transcriptDecisionModel.ts  (direction reads there are
    neutral/unknown state guards + sort ordering — user explicitly keeps these)
- cloud/apps/web/src/pages/AnalysisTranscripts.tsx  (direction === 'unknown' filter
    is a state check, not positional — keep)
- cloud/apps/web/src/pages/  (no other caller changes needed)
- cloud/apps/web/src/components/  (no caller changes needed)
- CLAUDE.md, AGENTS.md, MEMORY.md, .gitignore
```

### Why `transcriptDecisionModel.ts` is NOT in scope

Gemini flagged this as a gap. The `direction` reads there fall into two categories:
1. **State guards** (`=== 'neutral'`, `=== 'unknown'`): These check what kind of decision was made, not which slot won. They remain correct after this change.
2. **Sort ordering** (`getCanonicalTranscriptDecisionSortValue`): This sorts individual transcripts in a list by strong→lean→neutral→lean→strong order. Per the user's direction, sort-ordering reports that are specifically about order keep `direction`. No label inconsistency arises because this function returns a numeric sort key, not a displayed label.

`formatCanonicalDecisionHeadline` does NOT read `direction` to output a label — it outputs `"Strongly favors ${favoredValueKey}"`, which is already value-key-based and correct.

---

## Implementation Detail

### `canonicalConditionSummary.ts` — `getCanonicalBucket`

**Before** (reads `direction`):
```typescript
if (canonical.direction === 'neutral' && canonical.strength === 'neutral') return 'neutral';
if (canonical.direction === 'favor_first' && canonical.strength === 'strong') return 'strongly';
if (canonical.direction === 'favor_first' && canonical.strength === 'lean') return 'somewhat';
if (canonical.direction === 'favor_second' && canonical.strength === 'lean') return 'opponentSomewhat';
if (canonical.direction === 'favor_second' && canonical.strength === 'strong') return 'opponentStrongly';
```

**After** (reads `favoredValueKey`):
```typescript
if (canonical.strength === 'neutral') return 'neutral';
const { favoredValueKey, opposedValueKey, strength } = canonical;
if (favoredValueKey == null || opposedValueKey == null) return null;
const isFirst = favoredValueKey.localeCompare(opposedValueKey) < 0;
if (isFirst && strength === 'strong') return 'strongly';
if (isFirst && strength === 'lean') return 'somewhat';
if (!isFirst && strength === 'lean') return 'opponentSomewhat';
if (!isFirst && strength === 'strong') return 'opponentStrongly';
return null;
```

---

### `conditionDecisionSummary.ts` — `getConditionDecisionBucketKey`

Same pattern as above but mapping to `strong_first`/`lean_first`/`lean_second`/`strong_second`.

---

### `conditionDecisionSummary.ts` — `resolveConditionDecisionLabelPair` + `PairLabelStats`

The `firstPositionCounts: Map<string, number>` field introduced in the previous patch is no longer needed. Labels are always `[alphabetically-first, alphabetically-second]` of the sorted pair — the same sorting already used to compute the pair key. The function becomes:

```typescript
type PairLabelStats = {
  count: number;
  labels: [string, string]; // labels[0] < labels[1] alphabetically (already sorted)
};

export function resolveConditionDecisionLabelPair(transcripts) {
  const pairCounts = new Map<string, PairLabelStats>();

  for (const transcript of transcripts) {
    // ... skip non-renderable + null favoredValueKey ...
    const labels = [favoredLabel, opposedLabel]
      .sort((a, b) => a.localeCompare(b)) as [string, string];
    const key = `${labels[0]}||${labels[1]}`;
    const current = pairCounts.get(key);
    if (current) { current.count += 1; }
    else { pairCounts.set(key, { count: 1, labels }); }
  }

  // ... find bestPair by count (tie-break alphabetically) ...
  return { firstValueLabel: bestPair.labels[0], secondValueLabel: bestPair.labels[1] };
}
```

No `direction` reads anywhere in the function.

---

### Test fixture updates

**`canonicalConditionSummary.test.ts`**:
- `createTranscript` currently sets `favoredValueKey: 'value-a'` for `favor_first` and `favoredValueKey: 'value-b'` for `favor_second`. Since `'value-a' < 'value-b'` alphabetically, all existing expectations remain correct — `value-a` is still blue, `value-b` is still orange.
- Add one new test: transcript where `favoredValueKey = 'value-b'` (alphabetically second, i.e. was `favor_second` in old model) should bucket as `opponentStrongly`, confirming `direction` is no longer consulted.

**`conditionDecisionSummary.test.ts`**:
- `Freedom` < `Harmony` alphabetically. All existing `A_first` tests set `favoredValueKey: 'Freedom'` for `decisionCode=5` (strong_first) — still blue. All assertions pass unchanged.
- The "dominant unordered pair" test (`B_first` + `A_first` mixed) now returns `firstValueLabel: 'Freedom'` because `Freedom < Harmony`. The test expectation added in the previous patch already expects `'Freedom'` — ✅ no change needed.
- Add one new test: all transcripts where `favoredValueKey = 'Harmony'` (alphabetically second) → `firstValueLabel = 'Freedom'`, `secondValueLabel = 'Harmony'`, and all counts land in `strong_second`/`lean_second`.

---

## Verification

After implementation, confirm:

1. `npm run lint --workspace @valuerank/web` — no errors
2. `npm run test --workspace @valuerank/web` — 1458+ tests pass
3. `npm run build --workspace @valuerank/web` — clean compile
4. `grep -r "canonical\.direction" cloud/apps/web/src/utils/` — zero results in the two utility files
