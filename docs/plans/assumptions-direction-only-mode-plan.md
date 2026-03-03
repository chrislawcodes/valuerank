# Direction-Only Mode for Assumptions Tab

## 1. Bucketing Function

### What changes

Add a small helper that converts raw `decisionCode` into a direction bucket:
- `4` / `5` -> `A`
- `3` -> `NEUTRAL`
- `1` / `2` -> `B`
- anything else / `null` -> `null`

### Where

- Primary location: `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/assumptions.ts`
- Add it near the existing local helpers, around lines `100–149`, next to:
  - `VALID_DECISIONS`
  - `normalizeModelSet`
  - `signatureMatches`
  - `buildConditionKey`

### Why API-local

- This logic only affects the `assumptionsTempZero` resolver right now.
- The resolver is where `isMatch` is computed.
- Putting it in a shared package is unnecessary unless the same bucketing will be reused outside Assumptions soon.
- The web UI does not need to compute this bucket itself; it should consume the server’s `isMatch`.

### Suggested name

- `bucketDecisionDirection(decision: string | null): 'A' | 'B' | 'NEUTRAL' | null`

### Exact logic

Pseudocode:

```ts
if decision === '4' || decision === '5': return 'A'
if decision === '1' || decision === '2': return 'B'
if decision === '3': return 'NEUTRAL'
return null
```

### How it is used

Add a second helper:
- `decisionsMatch(batch1, batch2, batch3, directionOnly)`

Pseudocode:

```ts
if any batch is null: return false

if directionOnly is false:
  return batch1 === batch2 && batch2 === batch3

return bucketDecisionDirection(batch1) === bucketDecisionDirection(batch2)
  && bucketDecisionDirection(batch2) === bucketDecisionDirection(batch3)
```

## 2. API Changes

### What changes

- Thread a `directionOnly: boolean` argument into the `assumptionsTempZero` resolver.
- Use it only in the row-level `isMatch` calculation.
- Keep all existing row shape and summary shape intact.

### Where

- File: `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/assumptions.ts`
- Main resolver block: lines `265–573`

### Specific line ranges

#### Resolver signature

- Current:
  - lines `265–268`
- Change:
  - add query args, then read `args.directionOnly ?? false`

#### Row match logic

- Current exact-match logic is here:
  - lines `415–420`

```ts
const comparable = group.length >= 3;
const isMatch = comparable
  ? batch1 === batch2 && batch2 === batch3
  : false;
const mismatchType: TempZeroMismatchType = comparable ? (isMatch ? null : 'decision_flip') : 'missing_trial';
```

- Replace only the `isMatch` expression so it becomes:

```ts
const comparable = group.length >= 3;
const isMatch = comparable
  ? decisionsMatch(batch1, batch2, batch3, directionOnly)
  : false;
const mismatchType = comparable ? (isMatch ? null : 'decision_flip') : 'missing_trial';
```

#### No other summary logic needs structural change

- Summary is derived from `row.isMatch` later at:
  - lines `486–567`
- Because `matchedRows` is computed from `row.isMatch`, the summary will automatically reflect direction-only mode once row calculation changes.

### What should not change in the resolver

- Do not change:
  - run selection
  - transcript grouping
  - latest-3 selection
  - `mismatchType` semantics
- `decision_flip` remains the right mismatch marker; only the definition of “flip” changes under the flag.

## 3. GraphQL Schema Change

### What changes

Add a `directionOnly` Boolean argument to the `assumptionsTempZero` query field.

### Where

- There is no checked-in `schema.graphql` file in this repo.
- The schema is built in code via Pothos:
  - `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/index.ts:104`
  - `export const schema = builder.toSchema();`

### Actual place to change

- File: `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/assumptions.ts`
- At the query field definition:
  - lines `265–267`

### Planned change

- Add `args` to `t.field({...})`

Pseudocode:

```ts
builder.queryField('assumptionsTempZero', (t) =>
  t.field({
    type: AssumptionsTempZeroResultRef,
    args: {
      directionOnly: t.arg.boolean({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const directionOnly = args.directionOnly ?? false;
      ...
    },
  })
)
```

### Schema result

The runtime GraphQL schema becomes:

```graphql
assumptionsTempZero(directionOnly: Boolean): AssumptionsTempZeroResult!
```

## 4. GQL Operation Update

### What changes

- Convert the web query from a no-arg query to a variableized query.
- Pass `$directionOnly` into `assumptionsTempZero(directionOnly: $directionOnly)`.

### Where

- File: `/Users/chrislaw/valuerank/cloud/apps/web/src/api/operations/assumptions.ts`
- Query block: lines `91–152`

### Planned change

#### Add a variables type

- Near line `77` after `AssumptionsTempZeroQueryResult`

```ts
export type AssumptionsTempZeroQueryVariables = {
  directionOnly?: boolean;
};
```

#### Update the GraphQL document

- Current:

```graphql
query AssumptionsTempZero {
  assumptionsTempZero {
```

- New:

```graphql
query AssumptionsTempZero($directionOnly: Boolean) {
  assumptionsTempZero(directionOnly: $directionOnly) {
```

#### No response type changes

- The response payload shape stays the same.
- `isMatch` semantics change, but the type does not.

## 5. UI Toggle

### What changes

- Add local React state for the toggle.
- Pass it as a query variable to `useQuery`.
- Place the toggle next to the existing model filter section in the preflight card.

### Where

- File: `/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainAssumptions.tsx`
- Existing model-filter state and query setup:
  - lines `221–266`
- Existing “Models Covered” card:
  - lines `385–410`

### Planned change

#### Add state

- Near lines `229–232`

```ts
const [directionOnly, setDirectionOnly] = useState(false);
```

#### Pass query variables into `useQuery`

- Current:

```ts
useQuery({
  query: ASSUMPTIONS_TEMP_ZERO_QUERY,
  requestPolicy: 'cache-and-network',
});
```

- New:

```ts
useQuery({
  query: ASSUMPTIONS_TEMP_ZERO_QUERY,
  variables: { directionOnly },
  requestPolicy: 'cache-and-network',
});
```

#### Add the toggle UI

- Best placement: in the same preflight two-card grid as model controls, likely in the right-side card or as a third card directly below the model chips.
- Minimal UI:
  - label: `Direction Only`
  - helper text: `Treat 4/5 as picked A, 1/2 as picked B, and 3 as neutral.`
- Stateless:
  - plain React state only
  - no persistence to URL, localStorage, or backend

### How it re-triggers the query

- `useQuery` will re-execute automatically when `variables.directionOnly` changes.
- No manual `reexecuteTempZeroQuery()` call is needed for the toggle.
- The launch mutation still uses the existing manual refresh path and should stay unchanged.

## 6. Summary Stats Impact

### What changes

- No additional summary logic changes are required on the API.
- No additional summary logic changes are required on the client.

### Why

- Server summary:
  - lines `486–567` in `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/assumptions.ts`
- It computes:
  - `matchedRows = comparableRows.filter((row) => row.isMatch)`
  - `matchRate = matchedRows.length / comparableRows.length`
  - `differenceRate = 1 - (matchedRows.length / comparableRows.length)`

Once `isMatch` is recalculated using direction buckets, these numbers automatically follow.

### Client summary

- The page recomputes filtered summary from `filteredRows` using `row.isMatch`:
  - `computeDisplaySummary(...)` in `/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainAssumptions.tsx`
- That logic also updates automatically because it already depends on `row.isMatch`.

### One thing to verify

- `getMismatchSummary(...)` currently uses `!row.isMatch` for mismatches, so it should also update correctly with no extra change.

## 7. What NOT to Change

Do not change any of the following:

### Locked vignette package

- Leave `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/assumptions-constants.ts` untouched
- No changes to the 5 locked professional-domain vignettes

### Preflight structure

- Keep the existing preflight payload shape and cards
- Only add the UI toggle nearby; do not alter launch planning logic

### Mutation

- Leave `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/mutations/assumptions.ts` unchanged
- Direction-only affects readback interpretation only, not run launch

### Transcript schema

- Do not change `TempZeroDecision`
- Do not change transcript modal data shape

### Run / Scenario schema

- Do not change database schema
- Do not change run config shape
- Do not change scenario structure

### Type restructuring

- Do not rename existing result types unless strictly needed
- This should fit as:
  - one new API helper
  - one new query arg
  - one new web query variable type
  - one new React state toggle

## Summary of Files Touched

1. `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/assumptions.ts`
- Add `bucketDecisionDirection(...)`
- Add `decisionsMatch(...)`
- Add `directionOnly` query arg
- Thread `args.directionOnly ?? false` into resolver
- Replace exact-match comparison at lines `415–418`

2. `/Users/chrislaw/valuerank/cloud/apps/web/src/api/operations/assumptions.ts`
- Add `AssumptionsTempZeroQueryVariables`
- Update `ASSUMPTIONS_TEMP_ZERO_QUERY` to accept `$directionOnly`
- Pass `directionOnly` into the GraphQL field call

3. `/Users/chrislaw/valuerank/cloud/apps/web/src/pages/DomainAssumptions.tsx`
- Add `directionOnly` React state
- Pass `variables: { directionOnly }` into `useQuery`
- Add a `Direction Only` toggle near the existing model filter controls

4. No checked-in `schema.graphql` file
- Runtime schema is generated from:
  - `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/index.ts`
- No direct schema file edit is expected in this repo layout

## Validation After Implementation

Run:

```bash
cd /Users/chrislaw/valuerank/cloud && npm run typecheck
cd /Users/chrislaw/valuerank/cloud && npm test
```
