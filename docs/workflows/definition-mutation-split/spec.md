# Definition Mutation Split Spec

## Goal

Break up `cloud/apps/api/src/graphql/mutations/definition.ts` into smaller files without changing GraphQL behavior.

This is a structural compaction slice. Mutation names, args, return shapes, and current import paths must keep working.

## Why This Should Be Next

`definition.ts` is one of the biggest live backend GraphQL files left at 849 lines. It mixes too many jobs in one place:

1. JSON content helpers
2. input type registration
3. result type registration
4. create and fork mutations
5. update and unfork mutations
6. delete and scenario-expansion mutations

That makes the file harder to review and harder to change safely.

This is a good next slice because it stays on one GraphQL surface, it is outside the order-effect area, and it follows the same safe pattern that worked for the domain and run splits.

This should come before a larger definition-system cleanup because it lowers local complexity first without mixing database renames, scenario-service redesign, or frontend work into the same PR.

## Assumptions

- This PR is structural only. Database and scenario-service behavior stays where it is.
- The safest first pass keeps `cloud/apps/api/src/graphql/mutations/definition.ts` as a thin compatibility shim so `mutations/index.ts` does not need broad churn.
- Existing definition mutation tests stay in place in this PR.
- If current tests do not directly prove mutation registration for all split files, we will add one focused schema or mutation smoke test later in implementation.
- This slice should not rename `definition` to `vignette`. That larger naming change belongs to a different workflow.

## In Scope

- `cloud/apps/api/src/graphql/mutations/definition.ts`
- new files under `cloud/apps/api/src/graphql/mutations/definition/`
- any narrow mutation import changes needed to keep schema registration working
- tests that prove definition mutation behavior did not change
- preserving the old `./definition.js` entry path for side-effect registration

## Out Of Scope

- changing mutation names, args, or return shapes
- changing database schema or Prisma models
- changing scenario expansion behavior
- changing audit log behavior
- definition query changes
- broad terminology renames
- frontend work
- order-effect or assumptions work

## Current File Shape

`definition.ts` currently holds:

- 8 `builder.mutationField(...)` registrations
- 4 input type registrations
- 3 result type registrations
- shared JSON/content helper logic
- repeated auth, logging, queue, and audit patterns

The safest seam is between:

- JSON and content helpers
- input type definitions
- create and fork mutations
- update and lineage mutations
- delete and scenario-expansion mutations
- result type definitions used by the expansion and delete paths

## Proposed File Layout

Create this folder:

```text
cloud/apps/api/src/graphql/mutations/definition/
├── index.ts
├── shared.ts
├── inputs.ts
├── results.ts
├── create-and-fork.ts
├── updates.ts
└── maintenance.ts
```

Keep `cloud/apps/api/src/graphql/mutations/definition.ts` as a compatibility file in this first PR:

```ts
import './definition/index.js';
```

This keeps the current side-effect import stable while we reduce the large file.

## Responsibilities By File

### `index.ts`

- imports the leaf files for side effects
- keeps registration order explicit
- does not hold mutation logic

### `shared.ts`

- `CURRENT_SCHEMA_VERSION`
- `zContentObject`
- `ensureSchemaVersion`
- `normalizeJsonValue`
- `jsonValuesEqual`
- `stripRootSchemaVersion`

This file should stay focused on definition-mutation helper logic only.

### `inputs.ts`

- `CreateDefinitionInput`
- `ForkDefinitionInput`
- `UpdateDefinitionInput`
- `UpdateDefinitionContentInput`

### `results.ts`

- `DeleteDefinitionResultRef`
- `RegenerateScenariosResultRef`
- `CancelExpansionResultRef`
- the local shape types these result refs need

### `create-and-fork.ts`

- `createDefinition`
- `forkDefinition`

These belong together because they create new definition records and both feed the async scenario-expansion path.

### `updates.ts`

- `updateDefinition`
- `updateDefinitionContent`
- `unforkDefinition`

These mutations all edit existing definitions or their inherited content behavior.

### `maintenance.ts`

- `deleteDefinition`
- `regenerateScenarios`
- `cancelScenarioExpansion`

These mutations all handle cleanup or expansion lifecycle behavior after a definition already exists.

## Compatibility Rules

- Preserve `cloud/apps/api/src/graphql/mutations/definition.ts` as the old entry path in this PR.
- Keep `cloud/apps/api/src/graphql/mutations/index.ts` importing one clear path, not many leaf files.
- Do not add a broad barrel that becomes the normal runtime import surface for other modules.
- Keep input type names, result type names, and GraphQL mutation names unchanged.

## Behavior That Must Not Change

- mutation names and args
- input type names and fields
- result type names and fields
- schema version auto-fill behavior
- fork inheritance behavior
- update content equality checks
- delete behavior
- scenario expansion queue behavior
- audit log side effects
- current side-effect registration behavior from `mutations/index.ts`

## Edge Cases To Keep Safe

- mutation fields silently disappearing because a split file was not imported
- result types no longer registering before a mutation uses them
- changing sparse fork behavior by accident
- changing the content comparison rules in `updateDefinitionContent`
- mixing a terminology rename into this split and making rollback harder
- changing queue or audit behavior while only trying to compact structure

## Risks

### Risk 1: Pothos side-effect registration

Mutations are registered by importing files for side effects. If a new split file is not imported before schema build, some definition mutations can disappear without a TypeScript error.

### Risk 2: Hidden compatibility drift

`mutations/index.ts` imports `./definition.js` today. A structural split should not force broad import churn across the mutation registration surface.

### Risk 3: Shared helper creep

It will be tempting to move too much logic into one helper file while splitting this module. That would reduce line count but not mental overhead. This PR should prefer small, local grouping over a new catch-all.

### Risk 4: Test coverage gaps

`definition.test.ts` already covers many behavior paths, but implementation may still need one focused smoke test to prove full mutation registration after the split.

## Acceptance Criteria

1. `definition.ts` is no longer the main 800-line implementation file.
2. The old `cloud/apps/api/src/graphql/mutations/definition.ts` path still works as a compatibility shim.
3. The same definition mutations still register in GraphQL.
4. Mutation names, args, input types, result types, and behavior do not change.
5. Existing definition mutation tests stay green without changing expected behavior.
6. If current tests do not already prove field registration well enough, the implementation adds one focused schema or mutation smoke test.
7. The PR does not move scenario-service logic into new service files.
8. The PR does not mix in order-effect work, frontend work, or naming migration.

## Verification

Minimum verification for implementation later:

```bash
cd /private/tmp/valuerank-definition-mutation-split
rg -n "import './definition\\.js'|createDefinition|forkDefinition|updateDefinition|updateDefinitionContent|unforkDefinition|deleteDefinition|regenerateScenarios|cancelScenarioExpansion" cloud/apps/api/src/graphql
```

```bash
cd /private/tmp/valuerank-definition-mutation-split/cloud
npm test --workspace=@valuerank/api -- --run tests/graphql/mutations/definition.test.ts
npm run typecheck --workspace=@valuerank/api
```

If the current suite still leaves registration uncertainty after the split, add one focused GraphQL smoke test for the definition mutation surface in the implementation PR.
