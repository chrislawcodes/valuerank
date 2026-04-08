# 032 — Deduplicate Definition Lineage Functions

**Status**: Draft
**Created**: 2026-04-08
**Motivation**: Four lineage-resolution functions are copy-pasted across three files. A bug fix to lineage logic must be applied in three places today. This is the highest-risk code duplication in the API codebase.

---

## Background

Definition versioning uses a parent-child tree. To find the "latest version" of each vignette, callers walk the ancestry chain to a root, then pick the newest node per lineage. Four functions implement this:

| Function | Purpose |
|----------|---------|
| `getLineageRootId` | Walk parent pointers to find the tree root |
| `isNewerDefinition` | Compare two definitions by version, then updatedAt, then createdAt |
| `selectLatestDefinitionPerLineage` | Group definitions by lineage root, keep newest per group |
| `hydrateDefinitionAncestors` | Batch-fetch missing parent rows from DB so the tree is complete |

These four functions are duplicated verbatim in three locations:

| Location | Lines | Visibility | Extra DB fields selected |
|----------|-------|------------|--------------------------|
| `graphql/queries/domain/shared.ts` (600-680) | ~80 | Exported; used by `analysis.ts`, `planning.ts` | `id, parentId, version, createdAt, updatedAt` |
| `graphql/mutations/domain/launch.ts` (27-100) | ~85 | Private; used locally | + `name, content, createdByUserId` |
| `services/domain.ts` (21-90) | ~77 | Private; used locally | `id, parentId, version, createdAt, updatedAt` |

Each copy also defines its own `DefinitionRow` type with slightly different fields.

---

## User Stories

### US-1: Single source of truth for lineage logic (P1)

A developer fixing a bug in `getLineageRootId` or `isNewerDefinition` should only need to change one file. Today they must find and update three copies, with no compiler error if they miss one.

**Acceptance**:
- All four lineage functions exist in exactly one file: `services/definition-lineage.ts`
- The three original locations import from the new module instead of defining their own copies
- Zero logic changes — the extracted code must be byte-for-byte identical in behavior
- `npm run build --workspace @valuerank/api` succeeds
- `npm run test --workspace @valuerank/api` passes with no new failures

### US-2: Generic typing preserves caller ergonomics (P1)

`launch.ts` works with rows that have extra fields (`name`, `content`, `createdByUserId`). After extraction, callers must still get back their richer row types — not a stripped-down base type.

**Acceptance**:
- `selectLatestDefinitionPerLineage<T>` and `hydrateDefinitionAncestors` accept and return `T extends LineageDefinitionRow`
- `launch.ts` continues to use its `DefinitionRow` type (which extends `LineageDefinitionRow`) and gets typed results with `name`, `content`, etc.
- No type assertions (`as`) or `any` casts needed at call sites

### US-3: Backward-compatible re-exports (P2)

Callers in `analysis.ts` and `planning.ts` currently import from `domain/shared.ts`. These imports should continue to work without changes.

**Acceptance**:
- `shared.ts` re-exports `selectLatestDefinitionPerLineage` and `hydrateDefinitionAncestors` from the new module
- No import changes needed in `analysis.ts` or `planning.ts`

---

## Edge Cases

- **Circular parent chains**: `getLineageRootId` already guards against cycles via a `visited` set — this must be preserved exactly
- **Missing parents in DB**: `hydrateDefinitionAncestors` gracefully stops when a parent is not found — this must be preserved
- **Empty input**: All functions handle empty arrays correctly today — no regression

---

## Requirements

- **FR-001**: New module `services/definition-lineage.ts` MUST export `LineageDefinitionRow` type, `selectLatestDefinitionPerLineage`, and `hydrateDefinitionAncestors`
- **FR-002**: `getLineageRootId` and `isNewerDefinition` MUST remain private (not exported) — they are implementation details
- **FR-003**: `hydrateDefinitionAncestors` MUST accept an optional `select` parameter so `launch.ts` can fetch additional columns
- **FR-004**: Zero behavioral changes — this is a pure refactor with no logic modifications
- **FR-005**: File MUST stay under 100 lines (lineage logic is ~80 lines today)

---

## Success Criteria

- **SC-001**: Three files lose ~80 lines each of duplicated code (~240 lines removed total)
- **SC-002**: One new file of ~80-100 lines is the single source of truth
- **SC-003**: All existing tests pass without modification
- **SC-004**: `npm run lint && npm run test && npm run build` all pass for `@valuerank/api`

---

## Non-Goals

- Renaming `DefinitionRow` across the codebase (each caller keeps its own extended type)
- Adding new tests for lineage logic (it's already tested via integration tests on analysis/planning/launch)
- Refactoring callers beyond swapping the import source
- Changing the `domain/shared.ts` re-export pattern (analysis.ts and planning.ts keep their current imports)

---

## Assumptions

- The three implementations are functionally identical (verified by reading all three)
- The only meaningful difference is which DB fields `hydrateDefinitionAncestors` selects — this is handled by the `select` parameter
- No other files outside the three identified locations contain copies of these functions
