# 039 — GraphQL Codegen Migration PR 2/4

**Status**: Draft
**Created**: 2026-04-12
**Motivation**: Continue incremental codegen migration. Convert 7 operation files (medium complexity — fragments, cross-file deps, JSON scalar fields).

---

## Files to convert

| File | Lines | Consumers | Key challenge |
|------|-------|-----------|---------------|
| `health.ts` | 121 | 4 | JSON fields: `packages: Record<string, string>`, `apiKeys: Record<string, boolean>` |
| `scenarios.ts` | 106 | 5 | JSON field: `content: ScenarioContent` |
| `level-presets.ts` | 88 | 3 | Simple — no JSON, no fragments |
| `surveys.ts` | 148 | 2 | Simple — no JSON, no fragments |
| `llm.ts` | 316 | 9 | 4 fragments, many queries/mutations |
| `analysis.ts` | 302 | 29 | 2 fragments (ANALYSIS_RESULT_FRAGMENT exported to comparison.ts), JSON hints |
| `comparison.ts` | 186 | 5 | Imports ANALYSIS_RESULT_FRAGMENT from analysis.ts — must convert together |

**No preambles.ts exists** — dropped from scope.

## Key challenges

1. **Cross-file fragment**: `comparison.ts` imports `ANALYSIS_RESULT_FRAGMENT` from `analysis.ts`. In .graphql world, fragments resolve by name across files. Both must convert in this PR.

2. **JSON scalar fields**: health.ts and scenarios.ts have typed JSON fields. Shims must use `Omit<Generated, 'field'> & { field: ManualType }` pattern.

3. **Fragment-heavy files**: llm.ts has 4 fragments and 14 gql operations. analysis.ts has 2 fragments and 3 operations.

## Acceptance criteria

- All 7 files converted to .graphql + .ts shim
- `npm run codegen` succeeds
- `npm run lint --workspace @valuerank/web` — 0 errors
- `npx tsc --noEmit` — 0 new errors
- Zero `gql` template literals in the 7 shim files
- All consumer imports verified present in shims
