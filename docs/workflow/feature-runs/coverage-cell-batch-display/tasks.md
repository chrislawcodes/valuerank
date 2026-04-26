# Tasks: Fix Coverage Matrix Cell to Show Model-Set-Filtered Batch Count

## Slice 1 — API: model-set filter + directional count fields

Est. diff: ~80 lines changed across 3 files + test updates.

- [x] **1.1** `domain-coverage-utils.ts`: Add `valueA: string` and `valueB: string` parameters to `selectPrimaryDefinitionCounts`. After the `merged` map is computed, derive `aFirstBatchCount = merged.get(valueA)?.size ?? 0` and `bFirstBatchCount = merged.get(valueB)?.size ?? 0`. Update the return type to add both fields. Update the zero-case early return to also include them as 0.
- [x] **1.2** `domain-coverage-gql-types.ts`: Add `aFirstBatchCount: number` and `bFirstBatchCount: number` to the `DomainValueCoverageCell` TypeScript type. Expose both fields in the Pothos `DomainValueCoverageCellRef` objectRef with appropriate int descriptions.
- [x] **1.3** `domain-coverage.ts`: Apply model-set filter — after the existing `matchesModelFilter` check, when `effectiveModelIds.length > 0`, add a secondary gate: `effectiveModelIds.every(id => models.includes(id))`. This gates `batchCountByDefinitionId`, `directionalGroupsByDefinitionId`, and `incompleteBatchCountByDefinitionId`. Move `nonAggregateRunsByDefinitionId` population to AFTER this gate (currently it's before `matchesModelFilter`). Pass `valueA` and `valueB` to `selectPrimaryDefinitionCounts`. Populate `aFirstBatchCount` and `bFirstBatchCount` in both the zero-cell branch and the real-cell branch.
- [x] **1.4** Tests: Update existing `selectPrimaryDefinitionCounts` tests to pass `valueA`/`valueB`. Add cases: model-set filter excludes a run missing one default model from batchCount; same run excluded from incompleteBatchCount and nonAggregateRuns; aFirstBatchCount/bFirstBatchCount correctly derived from direction tokens matching value names.
- [x] **1.5** Build and test: `npm run build --workspace @valuerank/api` and `npm run test --workspace @valuerank/api` must pass.

**[CHECKPOINT]**

## Slice 2 — Frontend: cell display + badge repurpose

Est. diff: ~60 lines changed across 3 files.

- [x] **2.1** `cloud/apps/web/src/api/operations/domainCoverage.ts`: Add `aFirstBatchCount`, `bFirstBatchCount`, and `orphanedBatchCount` to both `DOMAIN_VALUE_COVERAGE_QUERY` and `DOMAIN_VALUE_COVERAGE_QUERY_LEGACY` fragment selections. Regenerate or update the generated GraphQL types if needed.
- [x] **2.2** `cloud/apps/web/src/components/domains/CoverageMatrix.tsx`: Pass `aFirstBatchCount`, `bFirstBatchCount`, and `orphanedBatchCount` from cell data into the `CoverageCell` component.
- [x] **2.3** `cloud/apps/web/src/components/domains/CoverageCell.tsx`:
  - Add props `aFirstBatchCount: number` and `bFirstBatchCount: number`.
  - Remove `hasPerModelData` / `minTrialCount`-based `displayCount`, `countForColor`, and `batchLabel` branches. New `displayCount = pairedBatchCount > 0 ? pairedBatchCount : batchCount`. New `countForColor = displayCount`. New `batchLabel`: "paired batch(es)" when `pairedBatchCount > 0`, otherwise "batch(es)".
  - Replace `hasMismatch` condition: `aFirstBatchCount !== bFirstBatchCount`.
  - Tooltip (`title` attr): when `hasMismatch`, set to `A-first: ${aFirstBatchCount}, B-first: ${bFirstBatchCount}`; otherwise remove tooltip.
  - Popover: when `hasMismatch`, add a direction breakdown row in the header section (above model breakdown) showing A-first and B-first counts. Keep existing model breakdown rows unchanged.
  - `minTrialCount` and `maxTrialCount` props may remain declared but must not drive any display logic.
- [x] **2.4** Build and test: `npm run build --workspace @valuerank/web` and `npm run test --workspace @valuerank/web` must pass.

**[CHECKPOINT]**

## Pre-merge Verifications (Residual Risks)

- [x] **V1** Query prod via MCP `graphql_query` for one domain with known default models. Compare `batchCount` from the new query vs current. Confirm the delta matches runs whose `config.models` did not include all default models.
- [x] **V2** Run this query against prod DB via `DATABASE_PUBLIC_URL`: `SELECT DISTINCT config->>'jobChoiceValueFirst' FROM "Run" WHERE config->>'jobChoiceValueFirst' IS NOT NULL LIMIT 100`. Confirm all values match COVERAGE_VALUE_KEYS spellings exactly.
- [x] **V3** TypeScript build passes with no errors — confirms fragment shape and prop types are consistent.
