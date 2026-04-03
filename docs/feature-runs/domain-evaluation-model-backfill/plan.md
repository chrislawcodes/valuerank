# Plan

## Summary

Implement a dedicated evaluation-attached model backfill path. The backend will own the attach rules and missing-coverage math. The web app will surface a small backfill panel on the Domain Level Batches page so users can pick missing models and attach reruns to the current evaluation.

## Architecture Decisions

### 1. Use a dedicated mutation for backfill

Add a new mutation instead of overloading the normal launch action.

Why:

- a normal launch creates a new Domain Evaluation
- a backfill must attach to an existing Domain Evaluation
- a backfill reuses the evaluation's saved launch settings instead of accepting fresh launch settings from the page

Planned shape:

- `backfillDomainEvaluationModels(domainEvaluationId, modelIds, definitionIds?, targetBatchCount?)`

The response can reuse the existing `DomainTrialRunResult` shape.

### 2. Keep backfill runs single-model

Each backfill run should contain exactly one model.

Why:

- the user explicitly needs "rerun just GPT-4.1"
- it avoids duplicating already-covered models inside a mixed backfill run
- it keeps the missing-coverage math straightforward and auditable

This means selecting multiple models can create multiple runs per vignette pair, one per model as needed.

For paired job-choice work, one logical paired backfill unit is:

- one model
- one pair
- two child runs
- one shared paired-batch group ID

### 3. Reuse the evaluation's saved launch settings

Backfill should read the target evaluation's snapshot and reuse:

- scope category
- temperature
- sample percentage
- samples-per-condition
- original model list
- launchable vignette scope

The user should not be allowed to silently change those settings during attach.

### 4. Count missing coverage inside the target evaluation only

Backfill math should look only at runs already attached to the selected evaluation.

Rules:

- count statuses: `COMPLETED`, `PENDING`, `RUNNING`, `PAUSED`, `SUMMARIZING`
- for single vignettes: count coverage per vignette/model
- for paired job-choice launches: use paired-min coverage per model
- launch only the missing depth up to `targetBatchCount`
- failed and cancelled runs do not count as coverage

This keeps backfill semantics tied to the chosen evaluation instead of the whole domain history.

### 5. Preserve original evaluation identity

The evaluation's `models` field stays as the original full model set.

Backfill should update the evaluation's live totals, member list, and running/completed state, but it should not pretend the evaluation was originally launched as a single-model cohort.

Operationally:

- attach new `domainEvaluationRun` rows to the existing evaluation
- clear `completedAt` when reopening a completed evaluation
- update `startedRuns`, `failedDefinitions`, `skippedForBudget`, and `projectedCostUsd` cumulatively

### 6. Lock backfill planning per evaluation

Use a per-evaluation database lock while computing gaps and creating backfill runs.

Why:

- the client-side missing list can be stale
- two users can click the same backfill at the same time
- a lock is the safest way to prevent duplicate top-ups on the same evaluation

Implementation target:

- acquire a transaction-scoped advisory lock keyed by `domainEvaluationId`
- re-read evaluation members and recalculate gaps inside that locked transaction
- only then decide which runs to start
- if the re-check finds no remaining gap, return a clean "nothing to start" result instead of a generic failure

### 7. Give the UI just enough data to show missing models

Extend Domain Evaluation members to expose each member run's `modelIds`.

The dashboard can then compute:

- which evaluation models are already covered for the selected latest vignettes
- which models still have missing depth
- how many backfill paired batches remain per model

This avoids introducing a whole new planning query for the first slice.

The dashboard should also surface a blocked state when the current evaluation is not backfillable because required snapshot fields are missing.

## File Plan

### Backend

- `cloud/apps/api/src/graphql/mutations/domain/evaluation.ts`
  - add the new backfill mutation
- `cloud/apps/api/src/graphql/mutations/domain/launch.ts`
  - add shared backfill attach logic
  - reuse paired grouping helpers already in this file
- `cloud/apps/api/src/graphql/mutations/domain/types.ts`
  - extend input types as needed
- `cloud/apps/api/src/graphql/queries/domain/evaluation.ts`
  - expose `modelIds` on evaluation members

### Web

- `cloud/apps/web/src/api/operations/domains.ts`
  - add the new mutation and member `modelIds`
- `cloud/apps/web/src/pages/DomainTrialsDashboard.tsx`
  - compute missing model coverage from the current evaluation + latest vignette plan
  - wire the new backfill mutation
- `cloud/apps/web/src/components/domains/domainTrials/*`
  - add a focused backfill controls surface and confirmation UI
  - add helper logic for model-level missing counts and expected spend

### Tests

- `cloud/apps/api/tests/graphql/mutations/domain.test.ts`
  - cover attach, validation, and missing-coverage behavior
- `cloud/apps/web/tests/pages/DomainTrialsDashboard.test.tsx`
  - cover model selection, disabled state, and mutation wiring

## Risks

### Risk 1: attaching to the wrong evaluation scope

Mitigation:

- require launchable vignette IDs from the target evaluation snapshot
- reject requests when the selected latest vignette set falls outside that scope

### Risk 2: paired launches becoming semantically unbalanced

Mitigation:

- use paired-min counting per model
- when a paired model is short, launch both sides of the pair for that model

### Risk 3: reopened evaluations showing stale summary numbers

Mitigation:

- update evaluation snapshot totals when attaching new runs
- clear `completedAt` when reopening work

### Risk 4: UI pretending normal launch counts and model backfill counts are the same

Mitigation:

- keep the backfill surface separate from the full launch surface
- compute model gaps from evaluation members, not from generic vignette batch counts

### Risk 5: duplicate launches from overlapping backfill requests

Mitigation:

- acquire a per-evaluation advisory lock
- recalculate missing coverage after the lock is held, not from stale client state

## Verification Plan

- API GraphQL mutation tests for:
  - successful attach to an existing evaluation
  - blocking a model outside the original evaluation model set
  - paired missing-coverage top-up behavior
- Web tests for:
  - backfill controls rendering when a current evaluation exists
  - disabled state when nothing is missing or nothing is selected
  - correct mutation payload when starting a backfill
- Targeted workspace tests:
  - `npm run test --workspace @valuerank/api -- domain.test.ts`
  - `npm run test --workspace @valuerank/web -- DomainTrialsDashboard.test.tsx`

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Accepted the main scope and safety findings. The spec now requires an explicit domainEvaluationId, original-scope vignette handling, blocked UI for un-backfillable historical evaluations, active-model intersection, clear stale-request handling, confirmation summary, and explicit reuse of the existing status model. Rejected introducing new evaluation enum states and persistent-failure automation in this slice because they would widen the feature into a broader status-machine redesign.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: Accepted the actionable edge-case findings. The spec now makes in-flight runs count as occupied coverage until they are cancelled or otherwise moved out of a countable active status, clarifies the consequences of reopening a completed evaluation under the existing status model, adds blocked messaging for missing snapshot fields, and calls out mixed depth as allowed rather than hidden. Rejected a new override path for stuck runs in this slice because it would require separate operator controls and policy.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Accepted the feasibility findings. The spec and plan now define the paired backfill unit as two child runs with one shared pair group id, require per-evaluation locked gap recalculation, and describe gap-idempotent retries plus clear no-op handling when stale client selections no longer have missing work. The remaining unverified runtime-state concerns stay as residual risk because the current run status enum already defines the concrete states used by this code path.
