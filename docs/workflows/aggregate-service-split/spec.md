# Aggregate Service Split Spec

## Goal

Break up `cloud/apps/api/src/services/analysis/aggregate.ts` into smaller files without changing aggregate behavior.

This is a structural refactor, not an aggregate-analysis redesign. The public behavior, database writes, worker handoff, and output contract must stay the same.

## Why This Work Matters

`aggregate.ts` is currently about 1,370 lines and mixes five different jobs:

1. Zod schemas and local TypeScript types
2. Run-config parsing and baseline-eligibility checks
3. Aggregate-run orchestration and database writes
4. Aggregate math for merged outputs
5. Variance math for multi-sample analysis

That makes the file hard to review, hard to test in pieces, and heavier than it needs to be for both people and AI tools.

Compared with splitting the big GraphQL `domain.ts` file, this is a safer structural refactor because it is API-service code, not schema-registration code.

## Assumptions

- This work should preserve behavior and existing contracts, not redesign aggregate semantics.
- Existing import sites should keep working through a compatibility shim in the first PR.
- Existing aggregate tests are the main safety net, but we may need one extra focused test if the current suite does not directly pin worker payload and normalized artifacts.
- The first PR should optimize for low-risk extraction, not for the smallest possible final public API.

## In Scope

- `cloud/apps/api/src/services/analysis/aggregate.ts`
- new files under `cloud/apps/api/src/services/analysis/aggregate/`
- import sites that call `updateAggregateRun`
- import sites that consume the current schema exports from `services/analysis/aggregate.ts`
- tests that directly cover aggregate orchestration or mock `updateAggregateRun`

## Out Of Scope

- changing aggregate eligibility rules
- changing aggregate worker input or output meaning
- changing aggregate output fields or code version
- renaming product terminology
- GraphQL changes
- UI changes
- changing how `plan-final-trial` or queue handlers decide when to call aggregation
- shrinking the old module export surface in the same PR

## Current File Shape

The file currently has these real seams:

- lines `1-367`: constants, schemas, local types, parsing helpers, baseline checks, and `buildValueOutcomes`
- lines `368-857`: `updateAggregateRun` orchestration
- lines `859-1143`: `aggregateAnalysesLogic`
- lines `1145-1370`: variance helpers and `computeVarianceAnalysis`

That split is already meaningful enough to turn into modules without inventing new abstractions.

## Proposed File Layout

Create this folder:

```text
cloud/apps/api/src/services/analysis/aggregate/
├── constants.ts
├── contracts.ts
├── config.ts
├── aggregate-logic.ts
├── variance.ts
└── update-aggregate-run.ts
```

Keep `cloud/apps/api/src/services/analysis/aggregate.ts` as a compatibility file for this first refactor:

```ts
export { updateAggregateRun } from './aggregate/update-aggregate-run.js';
export { zValueStats, zModelStats, zAnalysisOutput } from './aggregate/contracts.js';
```

If repo search finds any other live exports from `services/analysis/aggregate.ts`, preserve those too at the shim path in this PR.

## Responsibilities By File

### `constants.ts`

- `AGGREGATE_ANALYSIS_CODE_VERSION`
- repeat-coverage and drift thresholds
- `BASELINE_COMPATIBLE_ASSUMPTION_KEYS`
- `ANALYZE_WORKER_PATH`

### `contracts.ts`

- Zod schemas:
  - `zRunSnapshot`
  - `zRunConfig`
  - `zValueStats`
  - `zModelStats`
  - `zAnalysisOutput`
  - variance-related schemas
- local TypeScript types inferred from those schemas
- aggregate worker input and output types
- aggregate metadata types
- local type guards:
  - `isPlainObject`
  - `isAggregatedVisualizationData`
  - `isRunVarianceAnalysis`

This file is the shape and validation layer only. No database work and no aggregation math.

### `config.ts`

- `parseDefinitionVersion`
- `getSnapshotMeta`
- `getConfigTemperature`
- `getAssumptionKey`
- `hasAssumptionRunTag`
- `isBaselineCompatibleRun`

This file owns the small helper logic that explains whether a run belongs in a same-signature baseline aggregate.

### `variance.ts`

- `computeVarianceStats`
- `computeConsistencyScore`
- `computeMedian`
- `computeIQR`
- `computeVarianceAnalysis`

This keeps the variance math together and separates it from aggregate-run orchestration.

### `aggregate-logic.ts`

- `aggregateAnalysesLogic`
- any tiny helper types local to merged decision/value aggregation

This file should:
- accept already-loaded analysis objects, transcripts, and scenarios
- compute merged per-model outputs
- call `computeVarianceAnalysis`
- call `normalizeAnalysisArtifacts`
- return the final aggregated in-memory result

It should not do database reads or writes.

For this first pass, `normalizeAnalysisArtifacts` stays in the existing `cloud/apps/api/src/services/analysis/normalize-analysis-output.ts` module. `aggregate-logic.ts` should import and use it directly rather than moving or redesigning that logic in the same PR.

### `update-aggregate-run.ts`

This remains the orchestration entry point. It should still:

- load source runs and scenarios
- acquire the advisory lock
- filter runs by preamble, definition version, and temperature
- validate source outputs
- build worker transcripts
- compute aggregate eligibility
- call the Python worker only for `eligible_same_signature_baseline`
- find or create the aggregate run
- supersede the old analysis result
- save the new aggregate analysis result

Keep `buildValueOutcomes` here in the first pass. In the current file it is part of worker-transcript shaping and orientation handling, not config parsing.

Any later move of `buildValueOutcomes` is outside the scope of this PR.

## Compatibility Rules

- Preserve the current shim-path exports at `services/analysis/aggregate.ts` in the first PR.
- Do not remove the compatibility shim in the same PR.
- Internal files under `services/analysis/aggregate/` should import leaf modules directly.
- Do not add a barrel and do not import through the shim path from inside the aggregate folder.

## Behavior That Must Not Change

- advisory-lock behavior around aggregate updates
- run filtering by definition, preamble version, definition version, and temperature
- baseline eligibility rules for assumption runs and temp-zero runs
- fail-closed behavior for partial condition coverage
- worker invocation only for `eligible_same_signature_baseline`
- worker payload construction, including planned scenario IDs, transcript shaping, and aggregate-semantics thresholds
- aggregate-run config matching and update behavior for existing aggregate runs
- superseding old `CURRENT` analysis rows before writing the new one
- aggregate output shape, including:
  - `preferenceSummary`
  - `reliabilitySummary`
  - `aggregateMetadata`
  - `decisionStats`
  - `valueAggregateStats`
  - `methodsUsed.codeVersion`
- normalization of visualization and variance artifacts
- orientation-corrected scoring behavior for variance and value outcomes
- existing shim-path exports used by current callers

## Edge Cases To Keep Safe

- no compatible runs found
- compatible runs found but no valid current analysis outputs
- missing or deleted scenario rows in pooled transcripts
- temp-zero same-signature runs that are baseline-compatible
- assumption runs that must fail closed
- pooled models missing planned conditions
- existing aggregate run already present and needing update instead of create

## Risks

### Risk 1: Breaking current imports

The current module exports more than `updateAggregateRun`. Existing callers such as MCP tools already import `zAnalysisOutput` from the old path. A structural-only refactor cannot silently break that.

### Risk 2: Quiet contract drift

The file contains both orchestration and math. A sloppy split can accidentally change:

- eligibility messages
- worker payload fields
- aggregate output field names
- variance normalization behavior
- code-version fields

### Risk 3: Circular imports

Adding a barrel too early makes it easy for internal modules to import through the wrong layer. This first pass should use leaf-to-leaf imports only.

### Risk 4: Over-extraction

Do not create tiny files for one-liner helpers. The goal is fewer concepts per file, not maximum file count.

## Acceptance Criteria

1. `aggregate.ts` is no longer a 1,300-line mixed-responsibility file.
2. Existing callers at `services/analysis/aggregate.ts` still import successfully, including schema imports such as `zAnalysisOutput`.
3. Existing aggregate behavior tests stay green without changing their expectations.
4. `plan-final-trial` mocks keep working.
5. No new output fields, renamed fields, changed eligibility messages, or changed `methodsUsed.codeVersion` values are introduced.
6. Worker payload construction and aggregate-run supersede behavior are still covered by tests after the split.
7. Internal aggregate-folder files do not import through a barrel or through the shim path.

## Verification

Minimum required verification:

```bash
cd /Users/chrislaw/valuerank/cloud
npm test --workspace=@valuerank/api -- --run tests/services/analysis/aggregate.test.ts
npm test --workspace=@valuerank/api -- --run tests/services/analysis/normalize-analysis-output.test.ts
npm test --workspace=@valuerank/api -- --run tests/services/run/plan-final-trial.test.ts
npm test --workspace=@valuerank/api -- --run src/cli/recompute-aggregates.test.ts
npm test --workspace=@valuerank/api -- --run tests/graphql/queries/analysis.test.ts
npm test --workspace=@valuerank/api -- --run tests/graphql/queries/analysis-cost.test.ts
npm run typecheck --workspace=@valuerank/api
```

Add this targeted check before replacing old exports:

```bash
cd /Users/chrislaw/valuerank
rg -n "services/analysis/aggregate" cloud/apps/api
```

If the existing test suite does not directly pin worker payload construction or normalized aggregate artifacts, add one focused aggregate-service test in this PR. This is required, not optional. That test must assert:

- the spawned worker payload still includes the expected `aggregateSemantics` fields and transcript shape
- the saved output still includes normalized `visualizationData`, `varianceAnalysis`, and unchanged `methodsUsed.codeVersion`

## Non-Goals

- aggregate feature redesign
- same-signature aggregate product changes
- import-path cleanup beyond what is needed to compile safely
- public API cleanup of the old aggregate module
