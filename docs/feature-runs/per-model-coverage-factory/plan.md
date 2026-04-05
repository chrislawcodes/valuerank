# Technical Implementation Plan: Per-Model Coverage with Mismatch Warning

## Architecture Decisions

### A1: Schema Field Type
`defaultModelIds String[] @default([])` as a Prisma native PostgreSQL array. The `@default([])` is required so Prisma generates `DEFAULT ARRAY[]::TEXT[]` in the migration SQL. No foreign key (model IDs are denormalized strings from `llmModel.modelId`). Reason: FK would require a join table; array is simpler and consistent with `redirectUris`, `grantTypes`, etc. in the schema.

### A2: Validation in Mutations
Validate `defaultModelIds` against `llmModel.findMany({ where: { modelId: { in: ids }, status: 'ACTIVE' } })`. Throw if any ID is missing or inactive. Do not silently drop invalid IDs — fail fast.

### A3: Coverage Calculation Strategy
The coverage query already iterates all completed runs per definition. We extend this loop to track per-model trial counts using a `Map<definitionId, Map<modelId, number>>`. At cell-assembly time, we compute min/max from this map filtered to `defaultModelIds`. O(runs * models) time — acceptable.

### A4: `resolveSignatureRuns` Signature Change
Add `defaultModelIds: string[] = []` as an optional parameter. When non-empty, filter runs by checking `(run.config as { models?: string[] } | null)?.models?.includes(modelId)` for ALL model IDs. Runs missing the `models` field or missing any required model are excluded. This is a backward-compatible default.

### A5: GraphQL Cell Type Extension
Add optional fields to `DomainValueCoverageCell`:
- `minTrialCount: Int` (nullable — null when defaultModelIds is empty)
- `maxTrialCount: Int` (nullable — null when defaultModelIds is empty)
- `modelBreakdown: [CoverageModelBreakdown!]` (nullable — null when defaultModelIds is empty)

New object type `CoverageModelBreakdown` with fields `modelId: String!`, `label: String!`, `trialCount: Int!`.

### A6: UI Warning Strategy
Use a simple `title` attribute for tooltip (no new dependency). Add an orange left border or warning icon (`⚠`) when `minTrialCount !== null && minTrialCount < maxTrialCount`. Display `minTrialCount` as the primary number when per-model data is present.

## File-by-File Changes

### 1. `cloud/packages/db/prisma/schema.prisma`
- Add `defaultModelIds String[] @default([]) @map("default_model_ids")` to `Domain` model
- `@@map` is already present

### 2. Migration File
Create `cloud/packages/db/prisma/migrations/TIMESTAMP_add_domain_default_model_ids/migration.sql`:
```sql
ALTER TABLE "domains" ADD COLUMN "default_model_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
```

### 3. `cloud/apps/api/src/graphql/types/domain.ts`
- Add `defaultModelIds: t.exposeStringList('defaultModelIds')` to `DomainRef` fields

### 4. `cloud/apps/api/src/graphql/mutations/domain/settings.ts`
- Add `defaultModelIds: t.arg.stringList({ required: false })` to both `setDomainDefaults` and `setDomainSettings` mutations
- In each resolver, when `args.defaultModelIds != null`:
  - Query `db.llmModel.findMany({ where: { modelId: { in: args.defaultModelIds }, status: 'ACTIVE' } })`
  - If count < args.defaultModelIds.length, throw with message listing invalid IDs
  - Include `defaultModelIds: args.defaultModelIds` in `db.domain.update({ data: { ... } })`
- In `setDomainSettings`, add to the `tx.domain.update` call inside the transaction

### 5. `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`
Add new types and a new helper:
```ts
export type CoverageModelBreakdown = { modelId: string; label: string; trialCount: number };

export function computePerModelTrialCounts(
  runs: Array<{ config: unknown; transcripts: Array<{ modelId: string }> }>,
  defaultModelIds: string[],
  modelLabelById: Map<string, string>,
): { minTrialCount: number | null; maxTrialCount: number | null; modelBreakdown: CoverageModelBreakdown[] | null }
```
Logic:
- If `defaultModelIds.length === 0`, return `{ minTrialCount: null, maxTrialCount: null, modelBreakdown: null }`
- For each run, compute increment = `getCoverageBatchIncrement((run.config as { samplesPerScenario?: unknown })?.samplesPerScenario)`
- For each default model: count += increment if that model appears in `run.transcripts`
- Build `modelBreakdown` array
- Return min/max across the counts
- **Important**: only pass NON-AGGREGATE runs to this function (same filter as `batchCountByDefinitionId`)

### 6. `cloud/apps/api/src/graphql/queries/domain-coverage.ts`
- Add `CoverageModelBreakdown` to `DomainValueCoverageCell` type and its GQL schema type
- Add `minTrialCount: number | null`, `maxTrialCount: number | null`, `modelBreakdown: CoverageModelBreakdown[] | null` to the type
- Register new `CoverageModelBreakdownRef` object type
- In the main `resolve`:
  - Update `db.domain.findUnique` select to include `defaultModelIds` (currently only selects `id`)
  - Fetch default model labels early: before the main run loop, query `db.llmModel.findMany({ where: { modelId: { in: domain.defaultModelIds }, status: 'ACTIVE' } })` to build `defaultModelLabelById: Map<string, string>`. This is separate from the later `modelDetailRows` fetch for `availableModels`.
  - Build a `nonAggregateRunsByDefinitionId: Map<string, Array<{ config, transcripts }>>` alongside the existing `signatureScopedRunsByDefinitionId`. Add to this map only for non-aggregate runs (skip aggregate runs — same `isAggregateRun` check as today).
  - When building cells, call `computePerModelTrialCounts(nonAggregateRunsByDefinitionId.get(primaryDefId) ?? [], domain.defaultModelIds, defaultModelLabelById)` for per-model data
  - The `DomainValueCoverageCellRef` gains optional fields; null-safe
- Update the cell assembly to populate `minTrialCount`, `maxTrialCount`, `modelBreakdown`

### 7. `cloud/apps/api/src/graphql/queries/domain/shared.ts`
- Add helper:
  ```ts
  export function runModelsContainAll(config: unknown, defaultModelIds: string[]): boolean
  ```
  Returns true if `defaultModelIds.length === 0` OR `config.models` contains all IDs.
- Modify `resolveSignatureRuns(latestDefinitionIds, selectedSignature, defaultModelIds = [])`:
  - After `matchedRuns` filter, further filter with `runModelsContainAll(run.config, defaultModelIds)`
  - Also update `db.run.findMany` select to include `config` (already selected)

### 8. `cloud/apps/api/src/graphql/queries/domain/analysis.ts`
In all three query resolvers (`domainAnalysis`, `domainAnalysisValueDetail`, `domainAnalysisConditionTranscripts`):
- Load `domain.defaultModelIds` alongside other domain fields (add to `db.domain.findUnique` select, or it's already loaded via `db.domain.findUnique({ where: { id: domainId } })` which returns the full record)
- Pass `domain.defaultModelIds` to `resolveSignatureRuns(latestDefinitionIds, requestedSignature, domain.defaultModelIds)`

### 9. `cloud/apps/web/src/api/operations/domains.ts`
- Add `defaultModelIds: string[]` to the `Domain` TypeScript type
- Add `defaultModelIds` to `DOMAINS_QUERY` GQL fragment
- Add `defaultModelIds` to `SET_DOMAIN_DEFAULTS_MUTATION` return fields
- Add `defaultModelIds` to `SetDomainDefaultsMutationResult` and `SetDomainDefaultsMutationVariables`
- Add `defaultModelIds?: string[] | null` to `SetDomainSettingsMutationVariables`

### 10. `cloud/apps/api/src/graphql/queries/domain-settings.ts`
- Add `defaultModelIds` to the `domain` select in the `domainSettings` resolver
- Include it in the `DomainSettingsShape` result object

### 11. `cloud/apps/api/src/graphql/types/domain.ts`
- Add `defaultModelIds: string[]` to `DomainSettingsShape` type
- Add `defaultModelIds: t.exposeStringList('defaultModelIds')` to `DomainSettingsRef` objectType fields

### 12. `cloud/apps/web/src/api/operations/domains.ts`
- Add `defaultModelIds: string[]` to `DomainSettings` type
- Add `defaultModelIds` to `DOMAIN_SETTINGS_QUERY` fragment
- Add `defaultModelIds` to `SET_DOMAIN_SETTINGS_MUTATION` variables and GQL body
- Add `defaultModelIds?: string[] | null` to `SetDomainSettingsMutationVariables`
- Add `defaultModelIds` to `SetDomainSettingsMutationResult` return shape

### 13. `cloud/apps/web/src/components/domains/DomainSettingsPanel.tsx`
- Fetch active models via a new inline query (`ActiveModelsForSettings`)
- Add local state `localDefaultModelIds: string[]` synced from `settings.defaultModelIds` on load
- Add a multi-select UI (checkboxes per model) labeled "Default models"
- Include `defaultModelIds: localDefaultModelIds` in the save call (passed via `setDomainSettings`)

### 14. `cloud/apps/web/src/api/operations/domainCoverage.ts`
- Extend `DomainValueCoverageCell` type with `minTrialCount`, `maxTrialCount`, `modelBreakdown`
- Update `DOMAIN_VALUE_COVERAGE_QUERY` to request these new fields

### 15. `cloud/apps/web/src/components/domains/CoverageMatrix.tsx`
- In cell rendering, when `cell.minTrialCount !== null`:
  - Display `cell.minTrialCount` as the primary count
  - When `cell.minTrialCount < cell.maxTrialCount`, add visual warning (orange border/icon)
  - Add `title` attribute with per-model breakdown string

## Migration Notes
- Migration: `ALTER TABLE "domains" ADD COLUMN "default_model_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];`
- Safe to run on production: adds a nullable-equivalent column (empty array default) with no data deletion
- No backfill required — empty array is the correct default (no-filter behavior)
- Prisma client regeneration required after migration

## Test Strategy

### Unit tests
- `runModelsContainAll(config, ids)` — cases: empty ids, all present, one missing, config missing `models` field
- `computePerModelTrialCounts(runs, modelIds, labelMap)` — cases: empty modelIds (null result), all models present, one model with 0 trials, multiple runs contributing to same model

### Integration tests
- `domain-coverage.test.ts`: add test for `defaultModelIds` behavior — domain with 2 models, one with 2 trials and one with 1 trial; expect minTrialCount=1, maxTrialCount=2, modelBreakdown length=2
- `domain-coverage.test.ts`: empty `defaultModelIds` → no change in behavior (batchCount still primary)
- `settings.ts` mutation tests: invalid model ID → throws; valid models → saved

### E2E (manual)
- Set domain default models in settings panel → verify saved
- Coverage matrix shows min count and warning indicator
- Analysis query respects model filter

## Risks
- `domain.defaultModelIds` is not yet in the `DomainSettings` GraphQL shape (separate from `Domain`). The settings panel currently doesn't read domain-level fields from the `Domain` type directly; it uses the `DomainSettings` shape. We need to verify `useDomainSettings` hook source and ensure we can pass `defaultModelIds` through the save path without a full hook refactor.
- Coverage query already builds per-run transcript model sets; adding per-model counting only requires iterating the existing transcripts array. Performance should be fine.
