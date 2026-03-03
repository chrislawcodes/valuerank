# Assumptions Run UX Diagnostics Plan

## Goal

Make the Assumptions launch flow and the Runs pages understandable and trustworthy by fixing:

1. run-name date mismatches
2. ambiguous progress counters
3. missing launch diagnostics for temp=0 top-up runs
4. duplicate-run ambiguity

This is a diagnostics and UX-integrity pass. The purpose is to make the current behavior explainable before changing core launch logic.

## Problem Summary

Users currently cannot reliably answer:

1. why a run is named `Mar 02-A` while its visible timestamps say `Mar 1`
2. why a run can show one denominator during execution and a different denominator later
3. whether `Re-run Vignettes` launched a full rerun, a `2x` top-up, a `1x` top-up, or nothing
4. whether two visually similar runs are true duplicates or just similar-looking top-up runs

These are interpretability failures. Some may also hide real launch bugs.

## Current Behavior To Preserve During Audit

This plan does not assume the current top-up math is wrong.

Current temp=0 assumptions launch behavior is:

1. one run per locked vignette
2. `samplesPerScenario` is computed as the remaining amount needed to reach `3`
3. total scheduled probe jobs are:
   - `scenarioCount x modelCount x samplesPerScenario`

Example:

- `25` conditions
- `10` models
- `2` missing batches

Expected probe jobs:

- `25 x 10 x 2 = 500`

That means a `500` job count can be correct if one batch already existed.

## Workstream 1: Run Naming Timezone Consistency

### Problem

Run names are generated with a server-side date label, while the UI renders timestamps in the browser timezone.

This can produce:

- run name: `Mar 02-A`
- created/started: `Mar 1, 04:48 PM`

for the same run.

### Files To Inspect

- `/Users/chrislaw/valuerank/cloud/apps/api/src/services/run/start.ts`
- `/Users/chrislaw/valuerank/cloud/apps/web/src/components/runs/RunCard.tsx`
- `/Users/chrislaw/valuerank/cloud/apps/web/src/pages/RunDetail/RunDetail.tsx`

### Diagnostic Questions

1. What timezone does the server use for `runName` generation in production?
2. What timezone boundary is used for the daily suffix count (`A`, `B`, `C`, etc.)?
3. Is the name intended to be user-facing chronology or just a backend bucket label?

### Proposed Fix

Make run naming use an explicit timezone rule instead of server-local default.

Options:

1. use UTC explicitly
2. use a fixed product timezone such as `America/Los_Angeles`
3. stop encoding the calendar date into `run.name`

### Recommended Direction

Short term:

- make the run-name date and the daily suffix boundary use the same explicit timezone

Long term:

- remove semantic date meaning from `run.name` and let visible timestamps carry the real chronology

## Workstream 2: Progress Indicator Semantics

### Problem

Users can see:

1. one denominator during probe execution
2. another denominator during summarization

The UI currently makes this look like one progress number changed meaning.

### Files To Inspect

- `/Users/chrislaw/valuerank/cloud/apps/api/src/services/run/start.ts`
- `/Users/chrislaw/valuerank/cloud/apps/api/src/services/run/summarization.ts`
- `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/types/run.ts`
- `/Users/chrislaw/valuerank/cloud/apps/web/src/components/runs/RunCard.tsx`
- `/Users/chrislaw/valuerank/cloud/apps/web/src/components/runs/RunProgress.tsx`

### Current Semantics

1. `run.progress.total`
   - scheduled probe jobs
2. `run.summarizeProgress.total`
   - transcripts entering summarization

These are different counters with different populations.

### Diagnostic Questions

1. Which statuses show probe progress vs summarize progress?
2. Does the UI label them distinctly?
3. Is the user ever shown both at once?
4. Are failed probe jobs visible anywhere in a way that explains reduced summarization totals?

### Proposed Fix

Expose progress by phase instead of one generic label.

Recommended display:

1. `Probe Jobs`
   - `completed / total`
2. `Summaries`
   - `completed / total`
3. optional: `Successful Transcripts`
   - count of transcript rows created so far

### Success Criterion

A user should be able to tell whether:

1. work is still probing
2. probing is done and summarization is running
3. fewer summaries than probes is expected because the counters represent different phases

## Workstream 3: Assumptions Launch Diagnostics

### Problem

The Assumptions launch UI does not expose enough detail to explain what a rerun actually scheduled.

Current mutation output is too thin to explain:

1. which vignette launched
2. how many batches were added for each vignette
3. what existing batch floor caused that choice
4. which vignettes were skipped because they were already fully covered

### Files To Inspect

- `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/mutations/assumptions.ts`
- `/Users/chrislaw/valuerank/cloud/apps/web/src/api/operations/assumptions.ts`
- `/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainAssumptions.tsx`

### Proposed API Additions

Return per-vignette launch details:

1. `definitionId`
2. `vignetteTitle`
3. `existingBatchFloor`
4. `samplesPerScenarioLaunched`
5. `runId` if started
6. `status`
   - `started`
   - `skipped_already_covered`
   - `failed`

### Proposed UI Additions

After launch, show a structured summary:

1. which vignettes started
2. which were skipped
3. exact `samplesPerScenario` used for each

This removes guesswork about whether a rerun was full, partial, or redundant.

## Workstream 4: Duplicate-Run Detection

### Problem

When two runs look identical in the Runs UI, the product does not make it clear whether they are:

1. true duplicate launches
2. valid repeated top-ups with the same visible size
3. runs on different vignettes that happen to have the same counts

### Files To Inspect

- `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/mutations/assumptions.ts`
- `/Users/chrislaw/valuerank/cloud/apps/web/src/pages/RunDetail/RunDetail.tsx`

### Diagnostic Checks

For each apparently duplicate run, compare:

1. `definitionId`
2. `config.models`
3. `config.samplesPerScenario`
4. `config.assumptionKey`
5. `scenarioIds.length`
6. `progress.total`

### Proposed Guardrail

If the next launch plan for a vignette is identical to a very recent completed launch plan and no new qualifying coverage has been added, show a warning before launching again.

This should not block launch by default, but it should surface likely duplicates.

## Workstream 5: Run Detail Page Improvements

### Problem

Run detail pages do not currently make assumptions runs self-describing enough for debugging.

### Files To Inspect

- `/Users/chrislaw/valuerank/cloud/apps/web/src/pages/RunDetail/RunDetail.tsx`
- `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/types/run.ts`

### Proposed Additions

Show these fields clearly in Run Detail:

1. `Assumption Key`
2. `Samples Per Scenario`
3. `Scenario Count`
4. `Model Count`
5. `Expected Probe Jobs`
6. `Run Mode`
7. `Top-up Basis`
   - if available, show the pre-launch floor that drove the top-up

This gives users enough context to validate whether a run size makes sense.

## Hypothesis Check: Is The System Confusing 250 Conditions With 3 Samples?

This specific hypothesis should be tested explicitly.

### Current expected math

For one locked vignette:

1. conditions per vignette: `25`
2. models: typically `10`
3. samples per scenario: `1`, `2`, or `3`

Expected total probe jobs:

- `25 x 10 x samplesPerScenario`

This means:

1. `samplesPerScenario = 1` -> `250`
2. `samplesPerScenario = 2` -> `500`
3. `samplesPerScenario = 3` -> `750`

### What to verify

1. `progress.total` should always equal:
   - `selectedScenarioIds.length x models.length x samplesPerScenario`
2. The UI should label this as `Probe Jobs`, not a generic progress count
3. The system should never multiply the `250` base by `3` more than once for a single run

### Expected Conclusion

The more likely issue is not arithmetic confusion inside one run.

The likely sources of confusion are:

1. phase-switched progress counters
2. multiple separate runs with similar sizes
3. a launch label that does not reveal per-vignette top-up details

## Delivery Sequence

1. Audit and document current run naming and progress semantics
2. Fix timezone consistency in run naming
3. Split progress display into explicit phases
4. Add launch diagnostics to assumptions mutation + UI
5. Improve Run Detail fields for assumptions runs
6. Re-test duplicate-run cases using the richer UI

## Success Criteria

After this work:

1. a run name will not contradict its visible timestamps
2. users will know whether they are looking at probe progress or summarization progress
3. users will know exactly how many batches each rerun launched per vignette
4. users will be able to distinguish a real duplicate launch from a valid top-up

## Out Of Scope

This plan does not change:

1. the 5 locked assumptions vignettes
2. the core temp=0 matching logic
3. model selection rules
4. transcript parsing logic

This is specifically a diagnostics and UX clarity pass.
