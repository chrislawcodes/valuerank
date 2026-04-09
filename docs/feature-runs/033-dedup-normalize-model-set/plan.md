# Implementation Plan: Deduplicate normalizeModelSet

**Branch**: `claude/brave-williamson` | **Date**: 2026-04-09 | **Spec**: [spec.md](./spec.md)

## Summary

Add `.trim() !== ''` to the exported `normalizeModelSet` in `types.ts`, then delete the private copy in `assumptions.ts` and import from `types.ts`.

---

## Files In Scope

| File | Action | Notes |
|------|--------|-------|
| `cloud/apps/api/src/graphql/mutations/domain/types.ts` | **Modify** | Add `.trim() !== ''` to filter |
| `cloud/apps/api/src/graphql/mutations/assumptions.ts` | **Modify** | Delete private function, add import |

No other files change — all other callers already import from `types.ts`.

---

## The Change

**types.ts** — before:
```typescript
export function normalizeModelSet(models: unknown): string[] {
  if (!Array.isArray(models)) return [];
  return models
    .filter((model): model is string => typeof model === 'string')
    .sort((left, right) => left.localeCompare(right));
}
```

**types.ts** — after:
```typescript
export function normalizeModelSet(models: unknown): string[] {
  if (!Array.isArray(models)) return [];
  return models
    .filter((model): model is string => typeof model === 'string' && model.trim() !== '')
    .sort((left, right) => left.localeCompare(right));
}
```

**assumptions.ts** — delete the private function (lines 43-49), add import at top.

---

## Verification

1. `npm run lint --workspace @valuerank/api`
2. `npm run test --workspace @valuerank/api`
3. `npm run build --workspace @valuerank/api`
4. Grep confirms exactly one `normalizeModelSet` definition
