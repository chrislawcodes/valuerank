# Spec

## Summary

Add a supported way to backfill missing model coverage into an existing Domain Evaluation so reruns stay attached to the original launch instead of creating a separate orphan evaluation.

The first use case is the production `gpt-4.1` gap on the Domain Analysis page. We need a safe product path for "rerun just the missing model coverage" without pretending that a single-model rerun is a brand-new full-cohort launch.

## Problem

Today the product can:

- start a fresh Domain Evaluation across a domain
- retry one vignette/model cell as a standalone run

It cannot do the thing we actually need here:

- choose an existing Domain Evaluation
- backfill one or more missing models into that evaluation
- keep the new runs attached to the original evaluation

Because of that gap, model-specific reruns become separate evaluations, which makes the launch history messy and makes it harder to monitor the original evaluation as one unit.

## Goals

- Let a user start a model backfill from the existing Domain Level Batches screen.
- Attach backfill runs to the selected Domain Evaluation instead of creating a new evaluation.
- Keep the evaluation's original model list as the source of truth for what that evaluation is supposed to contain.
- Launch only the missing model coverage needed to reach the requested paired-batch depth for the selected latest vignettes.
- Preserve paired-batch launch metadata for job-choice vignette pairs.
- Show enough UI state that a user can see which models are missing before starting the backfill.

## Non-Goals

- Redesign the whole Domain Level Batches page.
- Reinterpret old evaluations that were launched with a different vignette set or a different signature.
- Merge separate evaluations after the fact.
- Backfill models that were never part of the target evaluation's original model set.
- Add a production data migration.

## User Story

As a person managing Domain Evaluations, I want to pick an existing evaluation and backfill only the missing model coverage into that same evaluation, so the new runs stay grouped with the original launch and the analysis gaps disappear without creating a fake new cohort.

## Required Behavior

### Launch Surface

- The Domain Level Batches screen should expose a backfill action when there is a current Domain Evaluation to attach to.
- The backfill action should be separate from the normal "start paired batches" action so users can tell the difference between:
  - starting a new full-cohort launch
  - filling missing model coverage into an existing evaluation
- The target evaluation must be explicit. The backfill request must carry one concrete `domainEvaluationId`, and the server must never infer the attach target from `domainId` alone.
- This slice reuses the existing evaluation status model. Backfill does not add a new evaluation state enum. Reopened evaluations simply flow back through the same active and terminal statuses the product already uses today.

### Model Selection

- The UI should only let the user choose model IDs that belong to the target evaluation's original model list and are still active in the system.
- The UI should show which of those models still have missing coverage for the target evaluation's original launch scope, optionally narrowed by the user's current vignette filter when that filter is still inside the original launch scope.
- If no models are missing, the backfill action should stay disabled and explain why.
- If the evaluation lacks the snapshot data needed for a safe attach, the UI should show a blocked state that explains why this evaluation cannot be backfilled.
- Before launch, the UI should show a confirmation summary with:
  - the target evaluation ID
  - the selected model IDs
  - the number of new paired batches or runs that will start
  - the estimated additional spend for this backfill request

### Server-Side Attach Rules

- Backfill runs must attach to an existing Domain Evaluation.
- The server must reuse the target evaluation's saved scope category, temperature, sample percentage, and samples-per-condition settings.
- The server must reject unsafe requests, including:
  - model IDs outside the evaluation's original model set
  - vignettes outside the evaluation's original launch scope
  - evaluations that do not have enough snapshot data to backfill safely
- "Enough snapshot data" means the evaluation snapshot must include:
  - the original model list
  - the original launchable vignette IDs
  - the saved temperature, including an explicit `null` provider-default case
  - the saved sample percentage
  - the saved samples-per-condition value
  - the saved run category or equivalent scope information needed to recreate the original run settings
- The server must re-calculate missing coverage when the request arrives. The client-side missing list is advisory only.
- The server must serialize backfill planning per target evaluation so overlapping requests cannot both launch the same missing work.
- If another backfill already started and the requested model coverage is no longer missing, the server should not fail generically. It should return a clear "nothing left to start" outcome so the UI can explain what happened.
- This slice uses the same authenticated access model as the existing Domain Level Batches screen. It does not introduce a separate creator-only permission rule.

### Coverage Rules

- Backfill launches are single-model runs.
- A model only counts as covered when the attached run is in one of these statuses:
  - `COMPLETED`
  - `PENDING`
  - `RUNNING`
  - `PAUSED`
  - `SUMMARIZING`
- `FAILED` and `CANCELLED` runs do not count as coverage and may be replaced by backfill work.
- In-flight runs still count as occupied coverage in this slice. If an operator decides a run is truly stuck and should be replaced, they must first cancel or otherwise move that run out of a countable active status.
- For non-paired vignette launches, the server should count existing coverage per vignette/model inside the target evaluation and top up only the missing depth.
- For paired job-choice launches, the server should use paired-min logic per model so a model only counts as covered when both sides of the pair have the requested depth.
- The unit of a paired model backfill is one paired batch for one model across both sides of a job-choice pair.
- One paired model backfill materializes as two attached child runs, one per vignette side, with a shared paired-batch group ID and the same paired-batch metadata shape used by normal paired launches.
- Backfill may intentionally create mixed-depth evaluations when one selected model is topped up deeper than another. That is allowed, and the product should not imply that every model inside one evaluation has identical depth.
- Backfill requests are gap-idempotent, not all-or-nothing. If a request partially succeeds and the client retries, the server should re-check the remaining gap under the per-evaluation lock and launch only the still-missing work.

### Evaluation State

- New backfill runs must be added as members of the existing Domain Evaluation.
- Reopening a completed evaluation with attached backfill work should make that evaluation read as active again while the new runs are in flight.
- The evaluation summary should keep the original model list, but its member list and run totals should include the attached backfill work.
- Once the attached backfill runs are no longer active, the evaluation should fall back to the same terminal-state rules used for any other evaluation:
  - `COMPLETED` when all member runs are complete and none failed
  - `FAILED` when any attached member run failed or was cancelled
- Reopened evaluations should appear in the same active views the product already uses for running evaluations, and return to the usual completed or failed views once the attached backfill work is no longer active.

## Acceptance Criteria

- A user can start a model backfill from the Domain Level Batches screen for the current Domain Evaluation.
- The user can select one or more missing models from the target evaluation's original model set.
- The server starts only the missing model coverage needed to reach the requested paired-batch depth for the selected latest vignettes.
- The server attaches those runs to the existing Domain Evaluation instead of creating a new evaluation.
- The current Domain Evaluation view shows the attached backfill runs as members of that evaluation.
- Unsafe backfill requests are rejected with clear errors instead of silently attaching the wrong runs.
- Overlapping backfill requests against the same evaluation do not launch duplicate missing work.
