# Tasks: Deduplicate Definition Lineage Functions

## Phase 1: Extract shared module

- [ ] T001 [P: cloud/apps/api/src/services/definition-lineage.ts] Create `services/definition-lineage.ts` with `LineageDefinitionRow` type, `getLineageRootId` (private), `isNewerDefinition` (private), `selectLatestDefinitionPerLineage` (generic, exported), `hydrateDefinitionAncestors` (exported, with optional `selectFields` param)

## Phase 2: Replace duplicates

- [ ] T002 [P: cloud/apps/api/src/graphql/queries/domain/shared.ts] Remove lineage functions from `shared.ts` (lines 600-680), add import from `services/definition-lineage.ts`, re-export `selectLatestDefinitionPerLineage` and `hydrateDefinitionAncestors` so `analysis.ts` and `planning.ts` imports don't break
- [ ] T003 [P: cloud/apps/api/src/graphql/mutations/domain/launch.ts] Remove lineage functions from `launch.ts` (lines 27-100), import from `services/definition-lineage.ts`, keep local `DefinitionRow` type for non-lineage fields (`name`, `content`, `createdByUserId`), pass custom select fields to `hydrateDefinitionAncestors`
- [ ] T004 [P: cloud/apps/api/src/services/domain.ts] Remove lineage functions from `domain.ts` (lines 13-90), import from `./definition-lineage.js`

## Phase 3: Verify

- [ ] T005 Run `npm run lint --workspace @valuerank/api` — must pass
- [ ] T006 Run `npm run test --workspace @valuerank/api` — all existing tests pass
- [ ] T007 Run `npm run build --workspace @valuerank/api` — compiles cleanly
- [ ] T008 Grep confirms exactly one copy of `getLineageRootId` remains in codebase
