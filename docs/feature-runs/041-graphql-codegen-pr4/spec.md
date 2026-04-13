# 041 — GraphQL Codegen Migration PR 4/4 (Final)

**Status**: Draft
**Created**: 2026-04-12
**Motivation**: Complete the codegen migration. Convert last 7 unmigrated files + handle the domains.ts backfill gql.

---

## Files to convert

| File | Lines | gql ops | Consumers |
|------|-------|---------|-----------|
| `assumptions.ts` | 176 | 2 | check |
| `domain-contexts.ts` | 62 | 4 | check |
| `domainAnalysis.ts` | 461 | 6 | check |
| `domainCoverage.ts` | 93 | 2 | check |
| `order-invariance.ts` | 478 | 7 | check |
| `paired-vignette.ts` | 71 | 2 | check |
| `value-statements.ts` | 58 | 4 | check |

Plus: domains.ts has 1 remaining gql template (backfill mutation) — try to add to schema.graphql or keep manual.

## Acceptance criteria

- All 7 files converted to .graphql + .ts shim
- `npm run codegen` succeeds
- `npm run lint --workspace @valuerank/web` — 0 errors
- `npx tsc --noEmit` — 0 new errors
- Zero `gql` template literals in any operation .ts file (except domains.ts backfill if schema still missing)
- 24/24 files migrated (100%)
