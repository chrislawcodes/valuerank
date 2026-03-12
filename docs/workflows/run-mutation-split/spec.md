# Run Mutation Split Spec

## Goal

Break up `cloud/apps/api/src/graphql/mutations/run.ts` into smaller files without changing GraphQL behavior.

This is a structural compaction slice. Mutation names, args, return shapes, and current import paths must keep working.

## Why This Should Be Next

`run.ts` is one of the biggest live backend GraphQL files left at 874 lines. It mixes too many jobs in one place:

1. payload type registration
2. input type registration
3. auth checks
4. run lifecycle mutations
5. recovery mutations
6. maintenance mutations
7. summarization mutations

That makes the file harder to review and harder to change safely.

This is a good next slice because it stays on one GraphQL surface, it is separate from the already-merged domain query split, and it is safe to run in parallel with frontend-only compaction work.

This should come before a larger run-system or assumptions-area refactor because it lowers local complexity first without mixing service moves, naming changes, or queue behavior changes into the same PR.

## Assumptions

- This PR is structural only. Service-layer behavior stays where it is.
- The safest first pass keeps `cloud/apps/api/src/graphql/mutations/run.ts` as a thin compatibility shim so `mutations/index.ts` does not need broad churn.
- Existing tests for run mutations, run control, summarization control, and audit behavior stay in place in this PR.
- If current tests do not directly prove mutation registration for all split files, we will add one focused schema or mutation smoke test later in implementation.
- This slice should prepare the repo for a larger later cleanup in the run area, but it should not start that larger change now.

## In Scope

- `cloud/apps/api/src/graphql/mutations/run.ts`
- new files under `cloud/apps/api/src/graphql/mutations/run/`
- any narrow mutation import changes needed to keep schema registration working
- tests that prove run mutation behavior did not change
- preserving the old `./run.js` entry path for side-effect registration

## Out Of Scope

- changing mutation names, args, or return shapes
- moving service logic out of `cloud/apps/api/src/services/run/`
- queue behavior changes
- audit log behavior changes
- run query changes
- assumptions or order-effect work
- broad terminology renames
- frontend work

## Current File Shape

`run.ts` currently holds:

- 10 `builder.mutationField(...)` registrations
- 4 `builder.objectRef(...).implement(...)` payload types
- 2 input/type helper blocks
- shared auth, logging, audit, and loader patterns repeated across mutation groups

The main safe seam is between:

- payload and input definitions
- lifecycle control mutations
- recovery mutations
- maintenance mutations
- summarization mutations

## Proposed File Layout

Create this folder:

```text
cloud/apps/api/src/graphql/mutations/run/
├── index.ts
├── payloads.ts
├── lifecycle.ts
├── recovery.ts
├── maintenance.ts
└── summarization.ts
```

Keep `cloud/apps/api/src/graphql/mutations/run.ts` as a compatibility file in this first PR:

```ts
import './run/index.js';
```

This keeps the current side-effect import stable while we reduce the large file.

## Responsibilities By File

### `index.ts`

- imports the leaf files for side effects
- keeps registration order explicit
- does not hold mutation logic

### `payloads.ts`

- `StartRunPayload`
- `RecoverRunPayload`
- `TriggerRecoveryPayload`
- `CancelSummarizationPayload`
- `RestartSummarizationPayload`
- `UpdateRunInput`
- small local helper types that only support this mutation surface

This file should stay focused on GraphQL-facing type and input registration.

### `lifecycle.ts`

- `startRun`
- `pauseRun`
- `resumeRun`
- `cancelRun`

These mutations share the core run-control path and use the same auth, audit, and run-loading pattern.

### `recovery.ts`

- `recoverRun`
- `triggerRecovery`

These mutations belong together because they both handle stuck or orphaned runs.

### `maintenance.ts`

- `deleteRun`
- `updateRun`
- `updateTranscriptDecision`

These mutations all change existing run records or transcript-linked run data.

### `summarization.ts`

- `cancelSummarization`
- `restartSummarization`

These mutations already form a clear pair and already have their own test file.

## Compatibility Rules

- Preserve `cloud/apps/api/src/graphql/mutations/run.ts` as the old entry path in this PR.
- Keep `cloud/apps/api/src/graphql/mutations/index.ts` importing one clear path, not many leaf files.
- Do not add a broad barrel that becomes the normal runtime import surface for other modules.
- Keep payload names and GraphQL names unchanged.

## Behavior That Must Not Change

- mutation names and args
- payload type names and fields
- auth requirements
- audit log side effects
- run recovery behavior
- transcript decision override behavior
- summarization control behavior
- current side-effect registration behavior from `mutations/index.ts`

## Edge Cases To Keep Safe

- mutation fields silently disappearing because a split file was not imported
- payload types no longer registering before a mutation uses them
- changing `startRun` model alias handling by accident
- changing `updateTranscriptDecision` recompute behavior for completed runs
- mixing service extraction into this split and making rollback harder
- changing `deleteRun` or summarization control behavior while only trying to compact structure

## Risks

### Risk 1: Pothos side-effect registration

Mutations are registered by importing files for side effects. If a new split file is not imported before schema build, some run mutations can disappear without a TypeScript error.

### Risk 2: Hidden compatibility drift

`mutations/index.ts` imports `./run.js` today. A structural split should not force broad import churn across the mutation registration surface.

### Risk 3: Shared helper creep

It will be tempting to build a big shared helper file while splitting this module. That would reduce the line count but not the mental overhead. This PR should prefer small, local grouping over a new catch-all.

### Risk 4: Test coverage gaps

Current tests cover `startRun`, run control, summarization control, and at least one `deleteRun` path, but this branch does not show focused GraphQL tests for every mutation in `run.ts`, especially `recoverRun`, `triggerRecovery`, and `updateRun`. The implementation may need one focused smoke test to prove registration stays intact.

## Acceptance Criteria

1. `run.ts` is no longer the main 800-line implementation file.
2. The old `cloud/apps/api/src/graphql/mutations/run.ts` path still works as a compatibility shim.
3. The same run mutations still register in GraphQL.
4. Mutation names, args, payload types, and behavior do not change.
5. Existing run mutation tests stay green without changing expected behavior.
6. If current tests do not already prove field registration well enough, the implementation adds one focused schema or mutation smoke test.
7. The PR does not move run service logic into new service files.
8. The PR does not mix in assumptions work, queue redesign, or frontend work.

## Verification

Minimum verification for implementation later:

```bash
cd /private/tmp/valuerank-run-mutation-split
rg -n "import './run\\.js'|startRun|pauseRun|resumeRun|cancelRun|recoverRun|triggerRecovery|deleteRun|updateRun|updateTranscriptDecision|cancelSummarization|restartSummarization" cloud/apps/api/src/graphql
```

```bash
cd /private/tmp/valuerank-run-mutation-split/cloud
npm test --workspace=@valuerank/api -- --run tests/graphql/mutations/run.test.ts
npm test --workspace=@valuerank/api -- --run tests/graphql/mutations/run-control.test.ts
npm test --workspace=@valuerank/api -- --run tests/graphql/mutations/cancel-summarization.test.ts
npm test --workspace=@valuerank/api -- --run tests/graphql/types/audit-fields.test.ts
npm run typecheck --workspace=@valuerank/api
```

If the current suite still leaves registration uncertainty after the split, add one focused GraphQL smoke test for the run mutation surface in the implementation PR.
