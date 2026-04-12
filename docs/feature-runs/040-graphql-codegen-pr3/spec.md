# 040 — GraphQL Codegen Migration PR 3/4

**Status**: Draft
**Created**: 2026-04-12
**Motivation**: Convert the 3 most complex operation files. This completes the core migration — only cleanup files remain for PR 4.

---

## Files to convert

| File | Lines | Consumers | Key challenge |
|------|-------|-----------|---------------|
| `domains.ts` | 867 | 9 | 3 raw-string queries (not gql-tagged); no JSON fields |
| `definitions.ts` | 598 | 17 | JSON fields: content, resolvedContent, localContent → `DefinitionContent` manual type |
| `runs.ts` | 712 | 48 | JSON fields: config, progress, decisionMetadata, decisionModelV2, dimensionValues, definitionSnapshot; RunStatus enum gap |

## Key decisions

### RunStatus enum gap
Schema has 5 values (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED). Manual type has 7 (adds PAUSED, SUMMARIZING). **Decision: keep RunStatus as manual type in the shim.** Don't modify the schema — PAUSED and SUMMARIZING may be intentionally absent from the GraphQL enum.

### RunCategory not an enum
RunCategory is a plain String in the schema, not an enum. **Keep as manual union type in shim.**

### JSON scalar fields
All JSON-typed fields keep manual types via `Omit<Generated, 'field'> & { field: ManualType }` in shims. The key manual types to preserve:
- `RunConfig` (runs.ts)
- `TranscriptDecisionModelV2` + sub-types (runs.ts)
- `DefinitionContent`, `DefinitionMethodology`, `Dimension`, `DimensionLevel` (definitions.ts)

### Raw-string queries in domains.ts
3 queries use plain template strings instead of `gql` tag. Convert them to .graphql like all others.

## Acceptance criteria

- All 3 files converted to .graphql + .ts shim
- `npm run codegen` succeeds
- `npm run lint --workspace @valuerank/web` — 0 errors
- `npx tsc --noEmit` — 0 new errors
- Zero `gql` template literals in the 3 shim files
- All 74 consumer imports verified present in shims
