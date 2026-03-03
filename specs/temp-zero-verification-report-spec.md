# Temp=0 Verification Report Spec

## Purpose

The Temp=0 Verification Report is a diagnostic report for checking whether recent temp=0 execution batches provide enough stable, comparable evidence to evaluate model-level consistency.

This report is not the same as the Temp=0 Determinism matrix.

- The Determinism matrix answers: "Did the model make the same decision across the latest 3 comparable trials for each vignette condition?"
- The Verification Report answers: "For the most recent temp=0 execution batch, which models have enough complete metadata and transcript evidence to support stability analysis?"

The goal of this report is to provide a compact, per-model verification summary that can be reviewed before drawing stronger conclusions from the assumptions system.

## Scope

This spec applies to the `Temp=0 Verification Report` section rendered in:

- [/Users/chrislaw/valuerank/cloud/apps/web/src/components/assumptions/TempZeroVerification.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/assumptions/TempZeroVerification.tsx)

and its backing GraphQL query:

- [/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/temp-zero-verification.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/temp-zero-verification.ts)

## Data Source

The report reads from the most recent temp=0 execution batch.

Batch selection rules:

1. Find the most recent run where `run.config.temperature = 0`.
2. Use that run's `createdAt` as the anchor timestamp.
3. Include all temp=0 runs created within a 60-second window around that anchor.
4. Collect all non-deleted transcripts belonging to those runs.

This treats one dispatch event ("Re-run Vignettes") as a single logical batch, even if it creates multiple runs.

## Report Shape

The report returns:

- `generatedAt`
- `transcriptCount`
- `batchTimestamp`
- `models[]`

Each model row contains:

- `modelId`
- `transcriptCount`
- `adapterModes`
- `promptHashStabilityPct`
- `fingerprintDriftPct`
- `decisionMatchRatePct`

Notes:

- `batchTimestamp` is part of the payload but is not currently rendered in the UI.
- It is retained for traceability and possible future display, but is presently an internal batch anchor field.

## Column Definitions

### Model

The model identifier for the analyzed transcripts.

### Transcripts

The number of transcripts from the selected temp=0 batch that belong to that model.

### Adapter Mode

The distinct adapter modes observed in transcript provider metadata for that model.

Example values:

- `chat`
- `responses`
- `legacy`

If multiple modes are present, they are shown as a comma-separated list.

### Prompt Hash Stable

The percentage of eligible scenario groups where all observed prompt hashes match.

Eligibility rule:

- A scenario group must have at least 2 transcripts.
- Every transcript in that group must have a non-null prompt hash.

Formula:

- `promptHashMatchedGroups / promptHashEligibleGroups * 100`

### Fingerprint Stable

The percentage stability of the provider fingerprint, displayed as the inverse of drift.

The underlying stored metric is `fingerprintDriftPct`.

Eligibility rule:

- A scenario group must have at least 2 transcripts.
- Every transcript in that group must have a non-null `system_fingerprint`.

Drift formula:

- `fingerprintDriftedGroups / fingerprintEligibleGroups * 100`

Displayed value:

- `100 - fingerprintDriftPct`

This means the UI label is a stability number, not a drift number.

### Decision Match

The percentage of eligible scenario groups where the latest 3 comparable transcripts all share the same `decisionCode`.

Eligibility rule:

- The scenario group must have at least 3 transcripts.
- The latest 3 transcripts in that group must all have non-null `decisionCode` values.

Formula:

- `decisionMatchedGroups / decisionEligibleGroups * 100`

## Transcript Count Semantics

The top-level `transcriptCount` in the report represents:

- the total number of transcripts found in the selected temp=0 batch before model-row filtering

It does not represent:

- only the transcripts belonging to included model rows

Rationale:

- The batch-level transcript count describes the size of the analyzed batch.
- Model-row inclusion is a stricter reporting filter applied after batch collection.
- This means the batch can contain more transcripts than are represented by the visible table rows.

## Inclusion Rule For Model Rows

The report must include only model rows with complete verification evidence.

This is the key behavioral rule for the page.

A model row is included only if all of the following are true:

1. `adapterModes.length > 0`
2. `promptHashStabilityPct !== null`
3. `fingerprintDriftPct !== null`
4. `decisionMatchRatePct !== null`

If any of those values are missing, the model row is excluded from the report entirely.

Rationale:

- The report is intended to summarize verified stability evidence.
- Rows that cannot support one or more columns do not meet the bar for inclusion.
- This avoids mixing complete and incomplete verification evidence in the same table.

Important clarification:

- This is not a cosmetic "hide `n/a` cells" rule.
- It is a data-validity rule: incomplete models are not part of the report population.

## Grouping Logic

Transcripts are grouped by:

- `modelId`
- then `scenarioId`

The report computes stability metrics across scenario groups for each model.

Within each scenario group:

- prompt-hash checks use all available transcripts once the group has at least 2
- fingerprint checks use all available transcripts once the group has at least 2
- decision checks use only the latest 3 transcripts, and only if those 3 exist

## UI Behavior

The section should display:

1. Header
   - `Temp=0 Verification Report`

2. Description
   - If report data exists:
     - `Per-model stability metrics from the most recent temp=0 execution batch. {transcriptCount} transcripts analyzed.`
   - If no report data exists:
     - `Generate a per-model stability report from recent temp=0 transcripts.`

   Auto-load behavior:
   - The report loads automatically on mount.
   - There is no manual "Generate Verification Report" gate in the current implementation.
   - The query executes immediately using standard query lifecycle behavior.

3. Primary action
   - `Re-run Vignettes`
   - This launches a new temp=0 batch.

4. Feedback message
   - Shows launch success or failure feedback.

5. Copy action
   - A table image copy control is shown for the report.
   - In the current implementation this is rendered via `CopyVisualButton` rather than a literal text button labeled `Copy as Image`.
   - It copies the rendered table visual when supported.

6. Table
   - Only renders rows for complete model entries
   - Does not show partial or incomplete models

7. Batch timestamp visibility
   - `batchTimestamp` is not currently displayed in the rendered UI.
   - This is intentional in the current implementation.
   - If future UI work surfaces it, that should be treated as a separate presentation change.

## Re-run Behavior

`Re-run Vignettes` starts a fresh temp=0 batch for the locked vignette package.

The report itself remains a latest-batch report:

- after rerun, the report should reflect the newest temp=0 batch once those runs complete
- it is not a cumulative historical report across multiple unrelated batches

## Out of Scope

This spec does not change:

- the Temp=0 Determinism matrix
- the locked vignette package
- assumptions launch mutation semantics outside this report's rerun button
- transcript schema
- run schema
- scenario schema

This spec also does not introduce:

- per-run drilldown from the verification report
- per-model exclusion reasons in the UI
- explicit temp-parameter verification labels

This spec also intentionally does not restore the older query model:

- no `days` query argument
- no `daysLookedBack` response field
- no manual "Generate Verification Report" button flow

The report is now latest-batch-based rather than lookback-window-based.

## Test Expectations

Tests for this page must reflect the current implementation, not the older paused-query version.

Required test assumptions:

1. The component auto-loads on mount.
2. There is no days selector.
3. There is no "Generate Verification Report" button.
4. The report description refers to the most recent temp=0 execution batch.
5. Incomplete model rows are excluded rather than rendered with `n/a`.

Any older tests built around:

- paused queries
- manual first-fetch interactions
- `days` variables
- `daysLookedBack`
- a gated "Generate Verification Report" first render

should be treated as stale and rewritten.

## Files Covered

- [/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/temp-zero-verification.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/temp-zero-verification.ts)
- [/Users/chrislaw/valuerank/cloud/apps/web/src/api/operations/temp-zero-verification.ts](/Users/chrislaw/valuerank/cloud/apps/web/src/api/operations/temp-zero-verification.ts)
- [/Users/chrislaw/valuerank/cloud/apps/web/src/components/assumptions/TempZeroVerification.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/assumptions/TempZeroVerification.tsx)
- [/Users/chrislaw/valuerank/cloud/apps/api/tests/graphql/queries/temp-zero-verification.test.ts](/Users/chrislaw/valuerank/cloud/apps/api/tests/graphql/queries/temp-zero-verification.test.ts)
- [/Users/chrislaw/valuerank/cloud/apps/web/tests/components/assumptions/TempZeroVerification.test.tsx](/Users/chrislaw/valuerank/cloud/apps/web/tests/components/assumptions/TempZeroVerification.test.tsx)
