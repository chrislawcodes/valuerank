# Spec: Replace Legacy decisionCode in Domain Analysis

**Feature run:** `replace`
**Status:** spec
**Last updated:** 2026-03-25

---

## What This Does

Replaces the legacy `decisionCode` integer (1–5) with the canonical decision model
(`direction` + `strength`) in the domain analysis GraphQL backend and its frontend
display surface.

The **score shape is unchanged** — log-odds, Bradley-Terry, and win rate still exist.
What changes is how those scores are derived: from canonical decisions instead of
raw integer parsing, which makes the pipeline correct for job-choice-v2 batches
(where orientation is irrelevant) and gives the UI meaningful, readable cells.

---

## Canonical Decision Model (Reference)

All aggregation is built on these types from `decision-model.ts`:

```
direction: 'favor_first' | 'favor_second' | 'neutral' | 'unknown'
strength:  'strong' | 'lean' | 'neutral' | 'unknown'
```

`resolveCanonicalDecision(input)` returns a `CanonicalDecision` with:
- `favoredValueKey`  — which value won (or null for neutral/unknown)
- `opposedValueKey`  — which value lost (or null)
- `direction`, `strength`, `source`

A trial is **unknown** when `resolveCanonicalDecision` returns `direction: 'unknown'`.
Unknown trials are **excluded from all counts** and exposed as `unknownCount` so
the UI can surface them to the user.

---

## Five Outcome Buckets

Replace `prioritized / deprioritized / neutral` with:

| Bucket | Meaning | Canonical mapping |
|---|---|---|
| `strongly` | Selected value strongly preferred | `favoredValueKey == selectedValue && strength == 'strong'` |
| `somewhat` | Selected value lean preferred | `favoredValueKey == selectedValue && strength == 'lean'` |
| `neutral` | No preference | `direction == 'neutral'` |
| `opponentSomewhat` | Opponent lean preferred | `favoredValueKey == opponentValue && strength == 'lean'` |
| `opponentStrongly` | Opponent strongly preferred | `favoredValueKey == opponentValue && strength == 'strong'` |

Plus:
- `unknownCount` — count of trials excluded (not in denominator)
- `totalTrials` — `strongly + somewhat + neutral + opponentSomewhat + opponentStrongly` (excludes unknown)

### Derived Metrics

**Win rate** (for the selected value):
```
winRate = (strongly + somewhat) / totalTrials
```
Neutral is in the denominator. `null` when `totalTrials == 0`.

**Mean preference score** (0–2 scale, for the selected value):
```
meanPreferenceScore = (2 × strongly + 1 × somewhat) / totalTrials
```
- `0.0` = value never chosen (neutral or opponent always wins)
- `1.0` = value chosen somewhat on average
- `2.0` = value chosen strongly on average
- Never negative — "not chosen" is 0 for this value; the opponent gets its own positive score
- `null` when `totalTrials == 0`

**Pairwise win** (for BT scoring): incremented whenever `favoredValueKey` is resolved
(i.e. direction is NOT neutral/unknown). Same logic as today.

---

## Aggregation Logic Change

### Today
```typescript
const decision = Number.parseInt(transcript.decisionCode, 10);
// ...integer comparison to classify prioritized/deprioritized/neutral
```

### After
```typescript
// 1. Select decisionMetadata (JSON) alongside existing fields — no definitionSnapshot needed
// 2. Call resolveCanonicalDecision({ pair, decisionCode, decisionMetadata, orientationFlipped: null })
//    orientationFlipped: null is correct for job-choice-v2 (value identified by name, not position)
// 3. Classify into the five buckets based on favoredValueKey vs selectedValue
// 4. Increment pairwiseWin using favoredValueKey (not the integer score)
// 5. Count unknown separately
```

The `decisionCode: { in: ['1','2','3','4','5'] }` filter is removed from all three
resolvers. Any transcript with valid `decisionMetadata` can now be resolved.

---

## Bug Fix: decision-model.ts orientationFlipped Guard

**File:** `cloud/apps/api/src/graphql/queries/domain/decision-model.ts`
**Function:** `resolveCanonicalDecision`

**Current code (lines ~471–473):**
```typescript
if (input.orientationFlipped == null) {
  return buildUnknownCanonicalDecision('unknown');
}
// ... job-choice-v2 branch below
```

**Problem:** The `orientationFlipped == null` guard fires BEFORE the job-choice-v2
branch. Job-choice transcripts don't have a scenario, so `orientationFlipped` is `null`.
This causes them to return `unknown` instead of resolving correctly.

**Fix:** Move the `orientationFlipped == null` guard to AFTER the job-choice-v2 block,
so job-choice transcripts resolve correctly without needing orientation.

**Corrected order inside `resolveCanonicalDecision`:**
1. Manual override check (keep as-is)
2. parseClass check (keep as-is)
3. **job-choice-v2 branch** ← move BEFORE the null guard
4. `orientationFlipped == null` guard ← now only applies to standard-parser vignettes
5. Standard parser path

---

## Scope — Files to Modify

### Backend

**`cloud/apps/api/src/graphql/queries/domain/decision-model.ts`**
- Move `orientationFlipped == null` guard to after the job-choice-v2 block (bug fix above)

**`cloud/apps/api/src/graphql/queries/domain/shared.ts`**

Type changes:
- **Remove** `meanDecisionScore: number | null` from `DomainAnalysisConditionDetail`
- **Add** to `DomainAnalysisConditionDetail`:
  ```typescript
  strongly: number;
  somewhat: number;
  opponentSomewhat: number;
  opponentStrongly: number;
  unknownCount: number;
  meanPreferenceScore: number | null;         // (2×strongly + 1×somewhat) / totalTrials, 0–2
  opponentMeanPreferenceScore: number | null; // (2×opponentStrongly + 1×opponentSomewhat) / totalTrials, 0–2
  selectedValueWinRate: number | null;        // (strongly + somewhat) / totalTrials
  ```
- **Remove** `classifyDecisionForSelectedValue` function entirely
- **DO NOT change `aggregateValueCountsFromTranscripts`** — it feeds the top-level
  `domainAnalysis` grid which stays on the legacy integer path this wave. If it is
  changed, the main value priorities table will break.

**`cloud/apps/api/src/graphql/queries/domain/analysis.ts`**

All three resolvers:
- Remove `decisionCode: { in: ['1','2','3','4','5'] }` from all `db.transcript.findMany` where clauses
- Add `decisionMetadata: true` to all transcript selects

`domainAnalysis` resolver:
- Passes updated `aggregateValueCountsFromTranscripts` result (no local changes needed beyond shared.ts update)

`domainAnalysisValueDetail` resolver:
- **Remove** `MutableCondition.decisionSum` field
- Replace `classifyDecisionForSelectedValue` call with direct five-bucket classification via `resolveCanonicalDecision`
- Compute `meanPreferenceScore` and updated `selectedValueWinRate` on conditions and vignettes

`domainAnalysisConditionTranscripts` resolver:
- Remove `decisionCode` filter only — no aggregation change here

**`cloud/apps/api/src/graphql/queries/domain/types.ts`**

Update `DomainAnalysisConditionDetailRef` builder registration:
- **Remove** `meanDecisionScore` field
- **Add** `strongly`, `somewhat`, `opponentSomewhat`, `opponentStrongly`, `unknownCount`, `meanPreferenceScore`, `opponentMeanPreferenceScore`, and update `selectedValueWinRate`

### Frontend

**`cloud/apps/web/src/api/operations/domainAnalysis.ts`**

Update both `DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY` and `DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY_LEGACY` conditions subfield:
- Remove `meanDecisionScore`
- Add `strongly`, `somewhat`, `opponentSomewhat`, `opponentStrongly`, `unknownCount`, `meanPreferenceScore`, `opponentMeanPreferenceScore`

Update `DomainAnalysisValueDetailCondition` TypeScript type:
- Remove `meanDecisionScore: number | null`
- Add the new fields including `opponentMeanPreferenceScore: number | null`

**`cloud/apps/web/src/pages/DomainAnalysisValueDetail.tsx`**

`MatrixCondition` type:
- Remove `meanDecisionScore: number | null`
- Add `meanPreferenceScore: number | null`, `opponentMeanPreferenceScore: number | null`,
  `unknownCount: number`, `strongly: number`, `opponentStrongly: number`

Helper functions — replace `getHeatmapColor` / `getScoreTextColor`:
- `getPreferenceBackground(score: number, isOpponent: boolean): string`
  - Blue tint when `!isOpponent`, orange tint when `isOpponent`
  - Opacity scales with score 0→2 (0 = transparent, 2 = full tint)
- `getPreferenceTextColor(isOpponent: boolean): string`
  - Returns `'text-blue-700'` when `!isOpponent`, `'text-orange-700'` when `isOpponent`

Cell rendering in `ConditionMatrix`:
```typescript
const selectedScore = condition.meanPreferenceScore ?? 0;
const opponentScore = condition.opponentMeanPreferenceScore ?? 0;
const isOpponent = opponentScore > selectedScore;
// Display the winner's score (never show 0.0 on a colored cell)
const displayScore = isOpponent ? condition.opponentMeanPreferenceScore : condition.meanPreferenceScore;
const hasData = condition.totalTrials > 0;
```
- Display: `displayScore?.toFixed(1)` — e.g. `1.0` or `2.0`
- Show `–` when `!hasData`
- Text color: `getPreferenceTextColor(isOpponent)` (only applied when `hasData`)
- Background: `getPreferenceBackground(displayScore ?? 0, isOpponent)`
- Tie (selectedScore === opponentScore > 0): render as opponent (orange) — explicit convention

Unknown count footnote: replace existing footnote text with:
```
Click a cell to load transcripts.
{unknownCount > 0 && " · N unknown — excluded from counts."}
```

Pair subtitle (vignette-level meta line):
- Render the two value names colored: selected value in blue, opponent in orange
- Example: `Pair: **Benevolence** vs **Achievement** · 25 trials · Win rate: 100%`

Legend (if shown): use actual value names from `vignette.otherValueKey` and the page-level `valueKey`, not generic labels.

---

## What Is NOT Changing

- `DomainAnalysisValueScore` shape on the top-level domain analysis grid — `prioritized`, `deprioritized`, `neutral`, `totalComparisons` fields are unchanged this wave to avoid breaking the ranking grid. A follow-up wave aligns those counts.
- BT scores, log-odds scores, ranking shapes, cluster analysis — unchanged
- `selectedValueWinRate` at the vignette level — updated denominator logic but no rename
- Export surfaces, Python workers, MCP tools, assumptions surfaces — out of scope
- `DomainAnalysisConditionTranscripts` transcript list display — out of scope
- **Scenarios tab** on `AnalysisDetail` — **separate wave**. That wave MUST produce visually and numerically identical output to this one: same 0–2 score scale, same blue/orange color convention, same bucket definitions.

---

## Cell Display Design (Confirmed)

The condition matrix cells show the **mean preference score (0–2)** as a 1-decimal number:

| Score | Direction | Display |
|---|---|---|
| `2.0` | Blue | Selected value strongly preferred |
| `1.0` | Blue | Selected value somewhat preferred |
| `–` | Gray | Neutral / no data |
| `1.0` | Orange | Opponent somewhat preferred |
| `2.0` | Orange | Opponent strongly preferred |

Color alone carries direction. The number carries strength. No words needed in the cell.

Pair subtitle shows value names in matching colors so the legend is self-evident:
`Pair: **Benevolence** vs **Achievement**`

---

## Out-of-Scope Items (Explicit)

- `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `.gitignore` — DO NOT TOUCH
- Any file not listed in the scope above — DO NOT TOUCH without noting it in output
- No new DB migrations
- No changes to Prisma schema
- No changes to Python workers
- No changes to export endpoints

---

## Acceptance Criteria

1. `decisionCode: { in: ['1','2','3','4','5'] }` filter removed from all three resolvers
2. `decisionMetadata` selected on all transcript fetches in domain analysis resolvers
3. `resolveCanonicalDecision` used for all aggregation — no `parseInt(decisionCode)` anywhere in scope
4. orientationFlipped bug fixed: job-choice transcripts without a scenario resolve correctly (not `unknown`)
5. `classifyDecisionForSelectedValue` deleted from `shared.ts`
6. `meanDecisionScore` removed from: `DomainAnalysisConditionDetail` type, `types.ts` GraphQL registration, `domainAnalysis.ts` queries, `DomainAnalysisValueDetail.tsx`
7. New fields (`strongly`, `somewhat`, `opponentSomewhat`, `opponentStrongly`, `unknownCount`, `meanPreferenceScore`, `opponentMeanPreferenceScore`) present on condition type end-to-end
8. Condition matrix cells show 0–2 decimal score with blue/orange color tied to value names
9. Unknown badge shown when `unknownCount > 0`
10. `npm run build` clean, no `@ts-ignore`, all existing tests pass
