# Temp-Zero Verification All Models Plan

## Goal

Change the `Temp=0 Verification Report` so it shows statistics for all models in the batch, not just the models with complete metadata.

Right now, only Grok appears because the current resolver filters out any model row that is missing one of the required verification metrics.

## 1. Root Cause

The current production implementation filters the model list at the end of the resolver.

File:

- `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/temp-zero-verification.ts`

Current logic:

1. it builds all model rows
2. then applies:
   - `filter(hasCompleteVerificationData)`

That helper requires:

1. `adapterModes.length > 0`
2. `promptHashStabilityPct !== null`
3. `fingerprintDriftPct !== null`
4. `decisionMatchRatePct !== null`

So if a provider does not emit one of those metadata fields, the entire model row disappears.

That is why only Grok may appear:

- Grok is likely the only model in the latest batch with all columns populated.

## 2. What Should Change

We should stop excluding incomplete models.

New behavior:

1. Include every model that appears in the latest temp=0 batch
2. Keep the metrics nullable
3. Let the UI render `n/a` for unavailable values

This changes the report from:

- “models with complete verification evidence only”

to:

- “all models in the latest batch, with stats where available”

That matches the product need and is more faithful to what actually ran.

## 3. API Changes

File:

- `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/temp-zero-verification.ts`

Planned changes:

1. Remove the final `.filter(hasCompleteVerificationData)`
2. Remove the `hasCompleteVerificationData(...)` helper if it becomes unused
3. Keep all current metric calculations unchanged:
   - `adapterModes`
   - `promptHashStabilityPct`
   - `fingerprintDriftPct`
   - `decisionMatchRatePct`
4. Keep `null` values when evidence is missing

What stays the same:

1. latest-batch scoping
2. `batchTimestamp`
3. `transcriptCount`
4. batch grouping logic
5. no schema change required

## 4. UI Changes

File:

- `/Users/chrislaw/valuerank/cloud/apps/web/src/components/assumptions/TempZeroVerification.tsx`

Planned changes:

1. No major structural UI change is required
2. The table already supports nullable values and renders:
   - `n/a` for null percentages
   - `n/a` when `adapterModes` is empty
3. Add a short explanatory note above or below the table:
   - some providers do not expose all metadata fields
   - `n/a` means the metric is unavailable for that model in this batch

Recommended note:

- “All models in the batch are shown. `n/a` means that provider metadata was not available for that metric.”

This prevents confusion when users see partially populated rows.

## 5. What Not To Change

Do not change:

1. latest-batch selection logic
2. `Re-run Vignettes` behavior
3. transcript counting
4. metric formulas
5. the copy-as-image control
6. GraphQL schema shape
7. run launch mutation

This is a display-scope fix, not a launch or analysis redesign.

## 6. Expected User-Visible Outcome

After the change:

1. The report will show all models included in the latest temp=0 batch
2. Grok will still show full metrics if available
3. Other models will appear too, even if some columns show `n/a`

Example:

- `GPT-5.1` may show:
  - `Adapter Mode`: present
  - `Prompt Hash Stable`: present
  - `Fingerprint Stable`: `n/a`
  - `Decision Match`: present

That is better than hiding the model entirely.

## 7. Risks And Tradeoffs

Main tradeoff:

- The table becomes less visually clean because some rows will have missing values.

But that is the right tradeoff because:

1. hiding models makes the report misleading
2. the user needs visibility into all models that were actually part of the batch

The correct fix is transparency, not over-filtering.

## 8. Validation Plan

After implementation:

1. API
   - query `tempZeroVerificationReport`
   - confirm that models with partial metadata still appear in `models[]`
   - confirm that incomplete models are not filtered out just because one or more metrics are `null`

2. UI
   - load `/assumptions`
   - verify the `Temp=0 Verification Report` shows more than just Grok
   - verify incomplete models still render in the table
   - verify nullable metrics render as `n/a`

3. Build checks
   - `cd /Users/chrislaw/valuerank/cloud && npm run typecheck`
   - `cd /Users/chrislaw/valuerank/cloud && npm test`

## Files To Touch

1. `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/temp-zero-verification.ts`
2. `/Users/chrislaw/valuerank/cloud/apps/web/src/components/assumptions/TempZeroVerification.tsx`
3. `/Users/chrislaw/valuerank/cloud/apps/api/tests/graphql/queries/temp-zero-verification.test.ts`
4. `/Users/chrislaw/valuerank/cloud/apps/web/tests/components/assumptions/TempZeroVerification.test.tsx`
