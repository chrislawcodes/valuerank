# Feature Spec: Per-Model Coverage with Mismatch Warning

## Problem Statement

The domain coverage matrix shows one number per cell: total completed batch count across all runs for that value pair. This number is misleading when different runs included different sets of models.

**Example:** Cell shows "6" but Model A has 5 trials and Model B has 1 trial. The UI implies balanced coverage but the data is skewed. Analysis drawn from these runs may not fairly represent all models.

## User Stories

### US-1: Domain Default Models
As a domain administrator, I want to configure which models are "default" for my domain, so that coverage calculations and analysis filtering can use a consistent model set.

**Acceptance criteria:**
- A domain has a `defaultModelIds` field (array of strings, empty by default).
- The `setDomainDefaults` mutation accepts an optional `defaultModelIds` argument.
- The `setDomainSettings` mutation also accepts an optional `defaultModelIds` argument. When provided, `setDomainSettings` includes `defaultModelIds` in the `domain.update` call (alongside preamble/level preset/context). When omitted, the field is not touched.
- Each model ID in `defaultModelIds` must correspond to an ACTIVE LLM model in the database. The mutation rejects invalid or inactive IDs with a descriptive error.
- The `Domain` GraphQL type exposes `defaultModelIds: [String!]!`.
- The DomainSettingsPanel shows a multi-select of active models. The user can pick zero or more. Saving updates `defaultModelIds` via `setDomainDefaults` or `setDomainSettings`.
- The `domains.ts` GQL operations include `defaultModelIds` in relevant queries and mutation return types.

### US-2: Per-Model Coverage Calculation
As an analyst, I want coverage matrix cells to show the minimum trial count across default models, so that I can see the worst-covered model at a glance and immediately spot imbalances.

**Acceptance criteria:**
- When `defaultModelIds` is non-empty on the domain:
  - For each non-aggregate completed run in scope (filtered by signature if provided), the query computes how many trials each default model has. Trial increment per run = `samplesPerScenario` from `run.config` (or 1 if absent/non-integer). A model M has trials in a run if M appears in any transcript of that run. This matches the existing `getCoverageBatchIncrement` logic.
  - The coverage number in the cell = `min(trialCount)` across all default models. If a default model has no trials in any matching run, its trial count is 0.
  - When all default models have 0 trials, `minTrialCount = 0` (the cell shows 0, not the legacy batchCount fallback).
  - The cell also carries `maxTrialCount` = `max(trialCount)` across default models.
  - A `modelBreakdown` array is returned per cell: `[{ modelId, label, trialCount }]` for each default model.
- When `defaultModelIds` is empty, the cell falls back to the existing `batchCount` / `pairedBatchCount` behavior (no regression).
- The GraphQL cell type `DomainValueCoverageCell` gains new optional fields: `minTrialCount`, `maxTrialCount`, `modelBreakdown`.

### US-3: Mismatch Warning in UI
As an analyst, I want to see a visual warning when trial counts differ across default models, so that I know to interpret results with caution.

**Acceptance criteria:**
- When `minTrialCount < maxTrialCount` (and `defaultModelIds` is non-empty), the cell shows a warning indicator (orange border, icon, or distinct color).
- The primary number shown is `minTrialCount` when per-model data is available; otherwise `batchCount`.
- A tooltip (rendered via HTML `title` attribute or a styled hover element) shows the per-model breakdown: one line per model with model label and trial count.
- When `defaultModelIds` is empty (no per-model data), cells render as today with no change.

### US-4: Analysis Query Integration
As an analyst, I want domain analysis to be filtered to runs that contain all default models, so that comparison results are fair across models.

**Acceptance criteria:**
- `resolveSignatureRuns()` in `shared.ts` accepts an optional `defaultModelIds: string[]` parameter.
- When non-empty, a run is only included if its `config.models` array contains ALL model IDs in `defaultModelIds`. Runs missing any default model are excluded.
- A helper `runModelsContainAll(config, defaultModelIds)` implements this check and is unit-testable.
- `domainAnalysis`, `domainAnalysisValueDetail`, `domainAnalysisConditionTranscripts` queries pass `domain.defaultModelIds` to `resolveSignatureRuns()`.
- When `defaultModelIds` is empty, the filter is not applied (backward compatible).

## Scope

### In scope
- Prisma schema: add `defaultModelIds String[]` to `Domain` model
- Migration file for the new column
- GraphQL type `Domain`: expose `defaultModelIds`
- Mutations `setDomainDefaults` and `setDomainSettings`: accept and validate `defaultModelIds`
- Coverage query `domainValueCoverage`: compute per-model min/max trial counts; add new fields to cell type
- Coverage UI `CoverageMatrix.tsx`: display min count, warning indicator, per-model tooltip
- `DomainSettingsPanel.tsx`: multi-select for active models
- `domains.ts` GQL operations: include `defaultModelIds` in `Domain` type, `SET_DOMAIN_DEFAULTS_MUTATION` return fields, and the `SetDomainSettingsMutationVariables` type
- `shared.ts` `resolveSignatureRuns()`: add model containment filter
- Helper `runModelsContainAll()` in `shared.ts`
- Pass `defaultModelIds` into the three analysis queries

### Out of scope
- Changing aggregate run logic
- Changing the `pairedBatchCount` / `batchCount` path when `defaultModelIds` is empty
- Any UI beyond DomainSettingsPanel and CoverageMatrix
- Sorting or re-ordering of cells based on coverage
- Backfilling historical runs with model data

## Key Design Decisions

1. **Fallback behavior**: Empty `defaultModelIds` → no change to existing behavior. New fields (`minTrialCount`, `maxTrialCount`, `modelBreakdown`) are `null` when no default models configured.

2. **Trial counting**: A model has N trials in a definition cell = sum of `samplesPerScenario` (or 1) across all completed non-aggregate runs for that definition where that model appears in the run's transcripts. This counts at the transcript level, not run level.

3. **Min as the primary number**: Min is the conservative metric. It shows how little the worst-covered model has, which is the honest signal.

4. **Mismatch threshold**: `min < max` triggers the warning. Even a 1-trial gap is meaningful.

5. **`config.models` for run model containment**: In analysis, we use `config.models` (the run configuration field listing model IDs, confirmed to exist in production run configs) rather than querying transcripts, to avoid the N+1 problem. The schema stores `config` as JSON, so this is a runtime JSON access. The field may be absent in older runs; treat absent as empty array (run is excluded when `defaultModelIds` is non-empty).

6. **Validation in mutations**: `defaultModelIds` is validated against `llmModel` where `status = 'ACTIVE'`. Invalid IDs → mutation throws. This prevents phantom model IDs silently filtering out all runs.

7. **`setDomainSettings` scope**: The settings mutation already updates preamble, level preset, and context. Adding `defaultModelIds` here keeps all domain defaults co-located. It's optional (omitted = no change to that field).

## Glossary Mapping
- Trial: one transcript (one model answering one condition once)
- Batch: operational unit (one launch, may contain many trials)
- Coverage: minimum trials per cell across default models (or total batch count when no default models)
- Default models: the canonical set of models configured on the domain for coverage and analysis filtering
