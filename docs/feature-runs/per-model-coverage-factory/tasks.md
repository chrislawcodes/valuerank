# Tasks: Per-Model Coverage with Mismatch Warning

## Phase 1 — Schema + Migration

- [ ] 1.1 In `cloud/packages/db/prisma/schema.prisma`, add to `Domain` model:
  ```
  defaultModelIds String[] @default([]) @map("default_model_ids")
  ```
  Place it after `defaultContextId` line, before the relation fields.

- [ ] 1.2 Run `npx prisma migrate dev --name add_domain_default_model_ids` from `cloud/packages/db/`.
  Verify the migration file is created at `cloud/packages/db/prisma/migrations/TIMESTAMP_add_domain_default_model_ids/migration.sql` and contains:
  ```sql
  ALTER TABLE "domains" ADD COLUMN "default_model_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
  ```

- [ ] 1.3 Run `npx prisma generate` from `cloud/packages/db/` to regenerate the Prisma client.

- [ ] 1.4 Verify: `npm run build --workspace @valuerank/db` passes with no errors.

## Phase 2 — GraphQL Types (API)

- [ ] 2.1 In `cloud/apps/api/src/graphql/types/domain.ts`:
  - Add `defaultModelIds: t.exposeStringList('defaultModelIds')` to `DomainRef` objectType fields (after `defaultContextId` field).
  - Add `defaultModelIds: string[]` to `DomainSettingsShape` type.
  - Add `defaultModelIds: t.exposeStringList('defaultModelIds')` to `DomainSettingsRef` objectType fields.

- [ ] 2.2 In `cloud/apps/api/src/graphql/queries/domain-settings.ts`:
  - Add `defaultModelIds: true` to the `domain` select in the `domainSettings` resolver.
  - Add `defaultModelIds: domain.defaultModelIds` to the `DomainSettingsShape` result object.

## Phase 3 — Mutations (API)

- [ ] 3.1 In `cloud/apps/api/src/graphql/mutations/domain/settings.ts`:

  **`setDomainDefaults` mutation:**
  - Add arg `defaultModelIds: t.arg.stringList({ required: false })` to the args block
  - In resolver, when `args.defaultModelIds != null`:
    - Validate: query `db.llmModel.findMany({ where: { modelId: { in: args.defaultModelIds }, status: 'ACTIVE' }, select: { modelId: true } })`
    - If any ID is missing, throw: `Invalid or inactive model IDs: ${missingIds.join(', ')}`
    - Include `defaultModelIds: args.defaultModelIds` in the `db.domain.update({ data: {...} })` call
  - When `args.defaultModelIds == null`, do not include `defaultModelIds` in the update data

  **`setDomainSettings` mutation:**
  - Add arg `defaultModelIds: t.arg.stringList({ required: false })` to the args block
  - In resolver, when `args.defaultModelIds != null`:
    - Validate model IDs BEFORE the `db.$transaction` block (use top-level `db` client): query `db.llmModel.findMany(...)` and throw if any ID is missing or inactive
    - Inside the transaction, add `defaultModelIds: args.defaultModelIds` to `tx.domain.update({ data: {...} })`
  - When `args.defaultModelIds == null`, do not include `defaultModelIds` in the update data

## Phase 4 — Coverage Utils (API)

- [ ] 4.1 In `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts`:
  - Add type:
    ```ts
    export type CoverageModelBreakdown = { modelId: string; label: string; trialCount: number };
    ```
  - Add function:
    ```ts
    export function computePerModelTrialCounts(
      runs: Array<{ config: unknown; transcripts: Array<{ modelId: string }> }>,
      defaultModelIds: string[],
      modelLabelById: Map<string, string>,
    ): { minTrialCount: number | null; maxTrialCount: number | null; modelBreakdown: CoverageModelBreakdown[] | null }
    ```
    - Return null fields when `defaultModelIds.length === 0`
    - Init a `Map<string, number>` with each default model ID set to 0
    - For each run: compute increment = `getCoverageBatchIncrement(...)`, for each default model, if model is in `run.transcripts`, add increment to that model's count
    - Build breakdown array with label from `modelLabelById` (fallback to modelId if missing)
    - Return min, max, and breakdown

## Phase 5 — Coverage Query (API)

- [ ] 5.1 In `cloud/apps/api/src/graphql/queries/domain-coverage.ts`:
  - Add `CoverageModelBreakdown` fields to `DomainValueCoverageCell` local type: `minTrialCount: number | null; maxTrialCount: number | null; modelBreakdown: CoverageModelBreakdown[] | null`
  - Import `CoverageModelBreakdown, computePerModelTrialCounts` from `domain-coverage-utils.js`
  - Register `CoverageModelBreakdownRef` object type:
    ```ts
    const CoverageModelBreakdownRef = builder.objectRef<CoverageModelBreakdown>('CoverageModelBreakdown').implement({
      fields: (t) => ({
        modelId: t.exposeString('modelId'),
        label: t.exposeString('label'),
        trialCount: t.exposeInt('trialCount'),
      }),
    });
    ```
  - Add new fields to `DomainValueCoverageCellRef`:
    - `minTrialCount: t.exposeInt('minTrialCount', { nullable: true })`
    - `maxTrialCount: t.exposeInt('maxTrialCount', { nullable: true })`
    - `modelBreakdown: t.expose('modelBreakdown', { type: [CoverageModelBreakdownRef], nullable: true })`
  - In resolve:
    - Update `db.domain.findUnique` select to add `defaultModelIds: true`
    - After domain fetch, if `domain.defaultModelIds.length > 0`, fetch default model labels: `await db.llmModel.findMany({ where: { modelId: { in: domain.defaultModelIds } }, select: { modelId: true, displayName: true } })` → build `defaultModelLabelById: Map<string, string>`
    - Add `nonAggregateRunsByDefinitionId: Map<string, Array<{ config: unknown; transcripts: Array<{ modelId: string }> }>>` tracked in the main run loop (add only when `!isAggregateRun`)
    - In cell assembly, compute per-model data: `const perModel = computePerModelTrialCounts(nonAggregateRunsByDefinitionId.get(primaryDefId) ?? [], domain.defaultModelIds, defaultModelLabelById);`
    - Push `minTrialCount: perModel.minTrialCount, maxTrialCount: perModel.maxTrialCount, modelBreakdown: perModel.modelBreakdown` to each cell

## Phase 6 — Analysis Query Integration (API)

- [ ] 6.1 In `cloud/apps/api/src/graphql/queries/domain/shared.ts`:
  - Add helper function:
    ```ts
    export function runModelsContainAll(config: unknown, defaultModelIds: string[]): boolean {
      if (defaultModelIds.length === 0) return true;
      const models = (config as { models?: string[] } | null)?.models;
      if (!Array.isArray(models)) return false;
      return defaultModelIds.every((id) => models.includes(id));
    }
    ```
  - Modify `resolveSignatureRuns` signature to accept optional third param:
    ```ts
    export async function resolveSignatureRuns(
      latestDefinitionIds: string[],
      selectedSignature: string | null,
      defaultModelIds: string[] = [],
    ): Promise<SignatureResolutionResult>
    ```
  - After the existing `matchedRuns` filter, add model filter:
    ```ts
    const modelFilteredRuns = defaultModelIds.length === 0
      ? matchedRuns
      : matchedRuns.filter((run) => runModelsContainAll(run.config, defaultModelIds));
    if (modelFilteredRuns.length === 0) {
      missingReasonByDefinitionId.set(definitionId, 'NO_SIGNATURE_MATCH');
      continue;
    }
    ```
    Use `modelFilteredRuns` instead of `matchedRuns` for the push loop.

- [ ] 6.2 In `cloud/apps/api/src/graphql/queries/domain/analysis.ts`, in all three query resolvers (`domainAnalysis`, `domainAnalysisValueDetail`, `domainAnalysisConditionTranscripts`):
  - The `db.domain.findUnique({ where: { id: domainId } })` already returns the full domain record including `defaultModelIds`
  - Update the `resolveSignatureRuns(latestDefinitionIds, requestedSignature)` call to `resolveSignatureRuns(latestDefinitionIds, requestedSignature, domain.defaultModelIds)`

## Phase 7 — Web Operations (Client)

- [ ] 7.1 In `cloud/apps/web/src/api/operations/domains.ts`:
  - Add `defaultModelIds: string[]` to the `Domain` type
  - Add `defaultModelIds` to `DOMAINS_QUERY` GQL fragment
  - Add `defaultModelIds` to `SET_DOMAIN_DEFAULTS_MUTATION` GQL body and return shape
  - Add `defaultModelIds?: string[]` to `SetDomainDefaultsMutationVariables`
  - Update `SetDomainDefaultsMutationResult` to include `defaultModelIds: string[]`
  - Add `defaultModelIds: string[]` to `DomainSettings` type
  - Add `defaultModelIds` to `DOMAIN_SETTINGS_QUERY` GQL fragment
  - Add `$defaultModelIds: [String!]` to `SET_DOMAIN_SETTINGS_MUTATION` GQL args and body
  - Add `defaultModelIds?: string[] | null` to `SetDomainSettingsMutationVariables`
  - Update `SetDomainSettingsMutationResult.setDomainSettings` to include `defaultModelIds: string[]`

- [ ] 7.2 In `cloud/apps/web/src/api/operations/domainCoverage.ts`:
  - Add to `DomainValueCoverageCell` type: `minTrialCount: number | null; maxTrialCount: number | null; modelBreakdown: Array<{ modelId: string; label: string; trialCount: number }> | null`
  - Add `minTrialCount maxTrialCount modelBreakdown { modelId label trialCount }` to `DOMAIN_VALUE_COVERAGE_QUERY` GQL cells fragment

## Phase 8 — UI: Settings Panel

- [ ] 8.1 In `cloud/apps/web/src/components/domains/DomainSettingsPanel.tsx`:
  - Add inline query:
    ```ts
    const ACTIVE_MODELS_QUERY = `
      query ActiveModelsForSettings {
        llmModels(status: "ACTIVE") {
          modelId
          displayName
        }
      }
    `;
    type ActiveModelsData = { llmModels: Array<{ modelId: string; displayName: string }> };
    ```
  - Execute query with `useQuery<ActiveModelsData>({ query: ACTIVE_MODELS_QUERY })`
  - Add `localDefaultModelIds: string[]` state; sync from `settings.defaultModelIds` in the `useEffect`
  - In `handleSave`, add `defaultModelIds: localDefaultModelIds` to the `SetDomainSettingsMutationVariables` input
  - Add a "Default models" section in the JSX with checkboxes for each active model

  **Note**: The `llmModels` query accepts `status: String` arg. Use `llmModels(status: "ACTIVE")` with fields `modelId displayName`. Return type is `LlmModel[]`.

## Phase 9 — UI: Coverage Matrix

- [ ] 9.1 In `cloud/apps/web/src/components/domains/CoverageMatrix.tsx`:
  - Locate where cells are rendered (in the grid JSX, inside the `CoverageCell` component or inline)
  - When a cell has `minTrialCount !== null`:
    - Use `minTrialCount` as the primary display number instead of `batchCount`
    - When `minTrialCount < maxTrialCount!`, add a visual warning (orange text or border, or `⚠` prefix)
    - Build tooltip text: `"GPT-4.1: 5 trials\nClaude Sonnet: 1 trial"` from `modelBreakdown`
    - Add `title={tooltipText}` to the cell element

## Phase 10 — Verification

- [ ] 10.1 From `cloud/`:
  ```bash
  npm run lint --workspace @valuerank/shared
  npm run lint --workspace @valuerank/db
  npm run lint --workspace @valuerank/api
  npm run build --workspace @valuerank/api
  npm run lint --workspace @valuerank/web
  npm run build --workspace @valuerank/web
  ```
  Fix all errors before proceeding.

- [ ] 10.2 From `cloud/`, run API tests:
  ```bash
  npm run test --workspace @valuerank/api
  ```
  Add/verify tests:
  - `runModelsContainAll` unit tests in a new or existing test file
  - `computePerModelTrialCounts` unit tests
  - Coverage query test with `defaultModelIds` set
  - Mutation test: invalid model ID → error

- [ ] 10.3 From `cloud/`, run web tests:
  ```bash
  npm run test --workspace @valuerank/web
  ```
  Fix any failures caused by new fields.

- [ ] 10.4 Manual smoke test:
  - Set domain default models in settings panel → save → verify in network response
  - Coverage matrix: cell with default models shows minTrialCount; warning if min < max
  - Analysis: domain with default models filters runs correctly

## DO NOT MODIFY
`CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `MEMORY.md`, `.gitignore`, `canonical-glossary.md`, or any file not listed in the scope above.
