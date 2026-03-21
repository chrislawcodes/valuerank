# Implementation Plan: Coverage Matrix Pair Orientation

**Branch**: `coverage-matrix-pair-orientation` (branch after PR #379 merges)
**Date**: 2026-03-20
**Spec**: [spec.md](./spec.md)

## Summary

Three targeted bug fixes in two files. The backend stops sorting the pair key so each definition maps to its own directional cell; the frontend stops sorting its lookup key so it retrieves the correct orientation; and `extractValuePair` normalizes dimension names to PascalCase before lookup so job-choice cells are no longer silently empty.

No schema changes. No migrations. No new GraphQL fields.

---

## Technical Context

**Language**: TypeScript 5.x (strict mode)
**Stack**: Node.js API (Pothos GraphQL) + React frontend (Vite)
**Storage**: No DB changes
**Testing**: Vitest (API + Web)
**Build**: Turborepo (`npx turbo build`)
**Performance Goals**: No change — O(1) cell lookup preserved
**Constraints**: Must not regress standard vignette domain pages

---

## Constitution Check

**Status**: PASS

- No `any` types introduced — `unknown` already used in `extractValuePair`
- File size: `domain-coverage.ts` is 349 lines; changes add ~6 lines — within 400-line limit
- `DomainCoverage.tsx` is ~720 lines; change is 1 line — within limit
- No new database queries
- Logging: existing `ctx.log.debug` calls unchanged

---

## Architecture Decisions

### Decision 1: Unsorted pair key (no canonical ordering)

**Chosen**: Use natural dimension order from `resolvedContent.dimensions` as the pair key — `${pair.valueA}::${pair.valueB}` — without sorting.

**Rationale**: For job-choice, presentation order IS the data. Sorting destroys it. For standard vignettes, only one cell is populated (per the design decision in the spec), which is more truthful than artificial mirroring.

**Alternatives Considered**:
- Domain-level `isDirectional` flag: More flexible but adds schema/DB churn for a behavioral decision that's already encoded in the data.
- Keep sorted, add a separate `presentationOrder` field: Requires GraphQL schema change and more complex cell rendering.

**Tradeoffs**:
- Pros: Minimal change, naturally correct, no new concepts introduced
- Cons: Standard vignette domains lose matrix symmetry (one cell per pair instead of two) — accepted per design decision

---

### Decision 2: Normalize dimension names to PascalCase on read

**Chosen**: In `extractValuePair`, convert each dimension name via a `toPascalCase` helper before the `isCoverageValueKey` check.

**Rationale**: Smallest possible fix. Job-choice definitions store names as `achievement`; the key list uses `Achievement`. One helper function, no downstream changes.

**Alternative Considered**: Change `DOMAIN_ANALYSIS_VALUE_KEYS` to lowercase — correct in principle, but touches analysis queries, frontend data files, and test fixtures. Deferred to a follow-up wave.

---

### Decision 3: Frontend lookup uses `colVal::rowVal` (column first, no sort)

**Chosen**: Change line 672 of `DomainCoverage.tsx` from `[rowVal, colVal].sort().join('::')` to `` `${colVal}::${rowVal}` ``.

**Rationale**: The outer loop is rows, inner is columns. Convention: column = X axis = presented first = `valueA`. So the key must be `colVal::rowVal`.

---

## Project Structure

### Files Changed

```
cloud/apps/api/src/graphql/queries/
└── domain-coverage.ts        ← 3 targeted changes (see below)

cloud/apps/web/src/pages/
└── DomainCoverage.tsx         ← 1 targeted change (line 672)
```

### No files added or removed.

---

## Exact Changes

### 1. `domain-coverage.ts` — `extractValuePair`: add PascalCase normalization

**Where**: Lines 88–105 (the `extractValuePair` function)

**What**: Add a `toPascalCaseKey` helper and call it on `nameA`/`nameB` before the `isCoverageValueKey` check.

```typescript
// Add above extractValuePair:
function toPascalCaseKey(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('_');
}

// In extractValuePair, replace:
if (!isCoverageValueKey(nameA) || !isCoverageValueKey(nameB)) return null;
return { valueA: nameA, valueB: nameB };

// With:
const normalizedA = toPascalCaseKey(nameA);
const normalizedB = toPascalCaseKey(nameB);
if (!isCoverageValueKey(normalizedA) || !isCoverageValueKey(normalizedB)) return null;
return { valueA: normalizedA, valueB: normalizedB };
```

---

### 2. `domain-coverage.ts` — `definitionsByPairKey` key building: remove sort

**Where**: Line 194

**What**:
```typescript
// Before:
const key = [pair.valueA, pair.valueB].sort().join('::');

// After:
const key = `${pair.valueA}::${pair.valueB}`;
```

---

### 3. `domain-coverage.ts` — matrix cell building: remove sort

**Where**: Line 305

**What**:
```typescript
// Before:
const key = [valueA, valueB].sort().join('::');

// After:
const key = `${valueA}::${valueB}`;
```

Also update the JSDoc description on the query field (line 143) — remove the sentence "The matrix is symmetric (valueA × valueB = valueB × valueA)." and replace with: "The matrix is directional: cell (col=X, row=Y) shows runs where X was presented first."

---

### 4. `DomainCoverage.tsx` — cell lookup: use column-first unsorted key

**Where**: Line 672

**What**:
```typescript
// Before:
const keyA = [rowVal, colVal].sort().join('::');

// After:
const keyA = `${colVal}::${rowVal}`;
```

Also remove the stale comment on line 671: `// Lookup cell prioritizing alphabetical sorting to match backend key format`

---

## Test Impact

- `cloud/apps/web/tests/pages/DomainCoverage.test.tsx` — Check whether any test stubs mock `domainValueCoverage` cells with sorted keys. If so, update mock data to use unsorted keys matching the new backend behavior.
- No API-level test changes expected (coverage query has no dedicated API test; it's covered via the frontend integration).

---

## Preflight

Run from `cloud/` after implementing:

```bash
npm run lint --workspace @valuerank/api
npm run build --workspace @valuerank/api
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web
```
