# Domain Query Split Spec

## Goal

Break up `cloud/apps/api/src/graphql/queries/domain.ts` into smaller files without changing GraphQL behavior.

This is a structural compaction slice, not a domain-analysis redesign. Query names, field names, output shapes, and current import paths must keep working.

## Why This Should Be Next

`domain.ts` is now the biggest live source file in the repo at 2,123 lines. It mixes too many jobs in one place:

1. local TypeScript shapes and constants
2. Pothos object refs and type registration
3. small shared helpers
4. database-heavy query resolvers
5. domain-analysis orchestration

That makes the file hard to review and hard to change safely.

This should come before lower-value UI splits like `DominanceSection.tsx` or `RunForm.tsx` because it removes more mental overhead from a central backend surface. It should also come before GraphQL codegen for `domainAnalysis.ts` because codegen adds tooling and still would not solve the biggest problem here: the API file itself is still oversized and mixes schema registration with resolver logic.

This should not continue the aggregate split. The aggregate refactor is already in flight in PR #336, so the next compaction slice should avoid the same service area. `domain.ts` is a separate surface with much lower merge overlap.

## Assumptions

- PR #336 stays separate. This slice does not touch aggregate service files.
- Existing helper files `domain-shape.ts` and `domain-clustering.ts` stay where they are in this PR.
- The safest first pass keeps `cloud/apps/api/src/graphql/queries/domain.ts` as a thin compatibility shim so current side-effect imports keep working.
- `DOMAIN_ANALYSIS_VALUE_KEYS` must stay available from the old `./domain.js` path because `domain-coverage.ts` imports it today.
- This PR should prefer a few meaningful files over many tiny files.

## In Scope

- `cloud/apps/api/src/graphql/queries/domain.ts`
- new files under `cloud/apps/api/src/graphql/queries/domain/`
- any query index imports needed to keep schema registration working
- tests that prove the domain GraphQL schema and query behavior did not change
- preserving the old `DOMAIN_ANALYSIS_VALUE_KEYS` export path

## Out Of Scope

- aggregate service work from PR #336
- changing GraphQL field names or response shapes
- moving `domain-shape.ts` or `domain-clustering.ts`
- GraphQL codegen setup for the web app
- UI component splits
- broad terminology renames
- changing `definition` storage or schema names

## Current File Shape

`domain.ts` currently holds:

- 23 `builder.objectType(...)` registrations
- 8 `builder.queryField(...)` registrations
- shared domain-analysis constants such as `DOMAIN_ANALYSIS_VALUE_KEYS`
- helper logic used across multiple domain queries

The main safe seam is between:

- GraphQL type registration
- shared helper logic
- catalog and planning queries
- analysis-heavy queries

## Proposed File Layout

Create this folder:

```text
cloud/apps/api/src/graphql/queries/domain/
├── index.ts
├── shared.ts
├── types.ts
├── catalog.ts
├── planning.ts
└── analysis.ts
```

Keep `cloud/apps/api/src/graphql/queries/domain.ts` as a compatibility file in this first PR:

```ts
import './domain/index.js';
export { DOMAIN_ANALYSIS_VALUE_KEYS } from './domain/shared.js';
```

This keeps current side-effect imports and the live constant export stable while we reduce the large file.

## Responsibilities By File

### `index.ts`

- imports the leaf files for side effects
- keeps the registration order explicit
- does not hold query logic

### `shared.ts`

- `DOMAIN_ANALYSIS_VALUE_KEYS`
- local TypeScript shapes shared across domain query modules
- small helper functions used by more than one domain query

Do not move heavy database resolver bodies here.

### `types.ts`

- `builder.objectRef(...)` declarations
- `builder.objectType(...)` registrations for domain query result shapes

This file owns type registration only. It should not fetch from the database or run analysis logic.

### `catalog.ts`

- `domains`
- `domain`

Keep this file focused on the simple domain listing and lookup queries.

### `planning.ts`

- `domainTrialsPlan`
- `domainTrialRunsStatus`
- `domainAvailableSignatures`

These queries share the planning and signature-selection space and fit together cleanly.

### `analysis.ts`

- `domainAnalysis`
- `domainAnalysisValueDetail`
- `domainAnalysisConditionTranscripts`

This file holds the heavy analysis resolvers and imports from `domain-shape.ts` and `domain-clustering.ts`.

## Compatibility Rules

- Preserve `cloud/apps/api/src/graphql/queries/domain.ts` as the old entry path in this PR.
- Preserve `DOMAIN_ANALYSIS_VALUE_KEYS` from that old path.
- Do not make `queries/index.ts`, `mutations/index.ts`, or `types/index.ts` responsible for knowing every new leaf file. They should keep depending on the old `domain.ts` shim or on `domain/index.ts` through one clear import path, not many.
- Do not add a barrel that re-exports everything for normal runtime imports.

## Behavior That Must Not Change

- GraphQL query names and arguments
- GraphQL type names and field names
- schema registration side effects
- the current `DOMAIN_ANALYSIS_VALUE_KEYS` list
- domain analysis score-method behavior
- domain trial planning behavior
- domain available signature behavior
- transcript lookup behavior
- existing imports that rely on the old `domain.ts` path

## Edge Cases To Keep Safe

- schema fields silently disappearing because a new type file was not imported
- `DOMAIN_ANALYSIS_VALUE_KEYS` no longer resolving for `domain-coverage.ts`
- circular imports between `types.ts`, `shared.ts`, and resolver files
- accidental changes to JSON-backed GraphQL fields such as `centroid` and `faultLinesByPair`
- mixing helper moves with this split and making rollback harder

## Risks

### Risk 1: Pothos side-effect registration

Pothos type registration depends on importing the files that call `builder.objectType(...)`. If a new file is not imported before schema build, fields can vanish without a TypeScript error.

### Risk 2: Compatibility drift at the old path

`domain.ts` is not only a side-effect module today. It also exports `DOMAIN_ANALYSIS_VALUE_KEYS`, and other files import it from there. A structural split cannot quietly break that path.

### Risk 3: Too much movement in one PR

If this slice also moves helper files, adds codegen, or starts renaming terms, review cost will spike and rollback will get worse.

## Acceptance Criteria

1. `domain.ts` is no longer the main 2,000-line implementation file.
2. The old `cloud/apps/api/src/graphql/queries/domain.ts` path still works as a compatibility shim.
3. `DOMAIN_ANALYSIS_VALUE_KEYS` still resolves from the old path for current consumers.
4. GraphQL schema registration still exposes the same domain query fields and domain result types.
5. Existing domain helper tests stay green without changing their expected behavior.
6. The implementation adds one focused schema or query test that proves the same domain GraphQL fields still register after the split.
7. The PR does not move `domain-shape.ts` or `domain-clustering.ts`.
8. The PR does not add GraphQL codegen or UI refactors.

## Verification

Minimum verification for implementation later:

```bash
cd /Users/chrislaw/valuerank/cloud
npm test --workspace=@valuerank/api -- --run tests/graphql/queries/domain.test.ts
npm test --workspace=@valuerank/api -- --run tests/graphql/queries/domain-clustering.test.ts
npm test --workspace=@valuerank/api -- --run tests/graphql/queries/domain-shape.test.ts
npm run typecheck --workspace=@valuerank/api
```

Before implementation, confirm the live old-path consumers:

```bash
cd /Users/chrislaw/valuerank
rg -n "queries/domain\\.js|DOMAIN_ANALYSIS_VALUE_KEYS" cloud/apps/api/src
```

If the current test suite does not directly prove that the same domain GraphQL fields are still registered after the split, add one focused schema or query test in the implementation PR.
