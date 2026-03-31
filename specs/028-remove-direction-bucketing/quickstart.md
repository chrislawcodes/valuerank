# Quickstart: Remove `canonical.direction` from Frontend Bucketing

## Prerequisites

- [ ] `npm run dev --workspace @valuerank/web` running (http://localhost:3030)
- [ ] `npm run dev --workspace @valuerank/api` running (http://localhost:3031)
- [ ] A paired batch with a clear dominant value available in local dev DB
  (or use the prod URL: `https://valuerank.org/analysis/cmmzamyy6039ikdtm5nszgsr9?tab=scenarios&mode=paired`)

---

## Testing User Story 1: Pivot table shows correct winning value

**Goal**: Verify that the legend color matches the value that actually wins.

**Steps**:
1. Open the analysis page for a paired batch in `mode=paired`
2. Click the **Scenarios** tab
3. Look at the **Pivot Analysis** table

**Expected**:
- The legend identifies the dominant value with the same color as the majority of cells
- For the known batch (`cmmzamyy6039ikdtm5nszgsr9`): Conformity should appear in blue (was incorrectly showing Achievement before this fix)
- Cells that are blue have the blue-labeled value winning; orange cells have the orange-labeled value winning

**Verification**:
- Click a predominantly blue cell → open transcript list → confirm `favoredValueKey` matches the blue legend label
- Click a predominantly orange cell → open transcript list → confirm `favoredValueKey` matches the orange legend label

---

## Testing User Story 2: Condition detail page shows correct column labels

**Goal**: Verify column headers match the actual decisions in each column.

**Steps**:
1. From the pivot table, click any cell with a non-zero score
2. The **Condition Detail** page opens showing Pooled / Current vignette / Companion vignette rows
3. Examine the column headers ("Strongly favors X", "Somewhat favors X", etc.)

**Expected**:
- The "Strongly favors X" column header matches the `favoredValueKey` in the transcripts accessible via that count
- The "Current vignette" and "Companion vignette" rows show the **same** column headers (same value names in each column position), even though the two runs have opposite presentation orders
- Clicking a count navigates to transcripts; all those transcripts have `favoredValueKey` matching the column label's value

**Verification**:
- Click a non-zero count in "Strongly favors Conformity" (for example) → confirm all resulting transcripts show Conformity won

---

## Testing User Story 3: No regression on single-run analysis

**Goal**: Verify single-run mode is unchanged.

**Steps**:
1. Open any single-run analysis (`mode=single` or no mode param)
2. Go to the **Scenarios** tab and view the pivot table
3. Compare cell colors against transcript win rates you know from before

**Expected**:
- Cell colors and scores are identical to pre-change behavior
- Legend labels remain consistent and correct for single-run batches

---

## Automated Verification

```bash
cd /Users/chrislaw/valuerank/cloud

# 1. Lint
npm run lint --workspace @valuerank/web

# 2. Tests (all must pass)
npm run test --workspace @valuerank/web

# 3. Build
npm run build --workspace @valuerank/web

# 4. Confirm direction is gone from the two utility files
grep -n "canonical\.direction" apps/web/src/utils/canonicalConditionSummary.ts
grep -n "canonical\.direction" apps/web/src/utils/conditionDecisionSummary.ts
# Both should produce no output
```

---

## Troubleshooting

**Issue**: Tests fail in `canonicalConditionSummary.test.ts` with mismatched bucket names
**Fix**: Verify `favoredValueKey: 'value-a'` and `opposedValueKey: 'value-b'` in the fixture — `'value-a' < 'value-b'` alphabetically so `value-a` is still the "first" (blue) value.

**Issue**: `resolveConditionDecisionLabelPair` returns null
**Fix**: Check that test transcripts have non-null `favoredValueKey` and `opposedValueKey`. Transcripts with only neutral decisions (null value keys) cannot contribute to label resolution.

**Issue**: "Strongly favors Freedom" column has count 0 but Freedom won
**Fix**: Confirm `Freedom < Harmony` alphabetically — `'F' < 'H'` — so Freedom is `firstValueLabel`. If the winner's key sorts after the loser's key, it goes in the second-side columns. Check `favoredValueKey` vs `opposedValueKey` in the raw transcript.
