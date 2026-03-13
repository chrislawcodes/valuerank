# Local Pilot Runbook

## Goal

Run the first one-vignette `Job Choice` manual pilot as a real reusable `Paired Batch`, then review ambiguous and fallback transcripts with the same product surfaces we will use later.

## Local setup

1. Pick one live professional root vignette to pilot.
   - Use the definition ID from the existing professional `Old V1` page.
2. Create the paired `Job Choice` vignette definitions for only that source vignette.

```bash
cd /Users/chrislaw/valuerank/cloud
node --import tsx ./scripts/create-job-choice-vignettes.ts --apply --definition-id <professional-definition-id>
```

3. Confirm that two `Job Choice` definitions exist for that source vignette:
   - one `A First`
   - one `B First`

## Launch

1. Open the new `Job Choice` vignette definition page.
2. Click `Start Paired Batch`.
3. Keep the run as a normal production-style batch:
   - all active default models
   - standard signature inputs you expect to reuse later
4. Start the batch.

This launch is baseline-compatible data, not throwaway test data. If future paired batches use the same signature, they can be pooled later.

## Review in product

1. Open the resulting run page.
2. Use the transcript list and badges to inspect parser outcomes:
   - `Fallback`
   - `Ambiguous`
   - `Manual`
3. Click any ambiguous transcript row to open the transcript viewer.
4. Use the `Change` dropdown to assign the final `1-5` decision when needed.

Use in-product adjudication for ambiguous transcripts first, because those are the transcripts most likely to disappear from numeric summaries until someone resolves them.

## Export for fallback adjudication

From the run page:

1. Use `Adjudication CSV` for the metadata-rich export.
2. Use `Transcripts` if you also want the raw JSON transcript archive.

The adjudication CSV includes parser metadata columns, including parse class and matched label, so fallback-resolved transcripts can be reviewed systematically outside the UI when needed.

## What to check

- The run was launched as a `Paired Batch`, not `Ad Hoc Batch`.
- The run signature matches the signature you would want to reuse later.
- Ambiguous transcripts are visible and manually relabelable in-product.
- Fallback-resolved transcripts are exportable in the adjudication CSV.
- Analysis and stability views show decision coverage warnings instead of silently hiding unresolved transcripts.

## Not in scope for this pilot

- full five-vignette bridge
- sentinel migration
- any assumptions-stack switch
