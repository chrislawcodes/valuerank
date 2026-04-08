# Implementation Plan: Deduplicate Definition Lineage Functions

**Branch**: `claude/brave-williamson` | **Date**: 2026-04-08 | **Spec**: [spec.md](./spec.md)

## Summary

Extract four duplicated lineage functions from three files into a single `services/definition-lineage.ts` module with generic types. Pure refactor — zero behavior changes.

---

## Technical Context

**Language**: TypeScript 5.x (strict mode, no `any`)
**Testing**: Vitest (`npm run test --workspace @valuerank/api`)
**Build**: `npm run build --workspace @valuerank/api`
**Constitution**: `cloud/CLAUDE.md` — max 400 lines per file, no `any`, strict null checks

---

## Architecture Decision

### Single shared service module

**Chosen**: Create `cloud/apps/api/src/services/definition-lineage.ts`

**Rationale**: The `services/` directory already holds shared business logic (e.g., `services/domain.ts`). Lineage resolution is business logic, not GraphQL-specific — it belongs in services.

**Alternative considered**: Put it in `utils/` — rejected because it makes DB calls (`hydrateDefinitionAncestors` calls `db.definition.findMany`), which makes it a service, not a utility.

---

## Files In Scope

| File | Action | Notes |
|------|--------|-------|
| `cloud/apps/api/src/services/definition-lineage.ts` | **Create** | Single source of truth (~90 lines) |
| `cloud/apps/api/src/graphql/queries/domain/shared.ts` | **Modify** | Remove ~80 lines, add import + re-export |
| `cloud/apps/api/src/graphql/mutations/domain/launch.ts` | **Modify** | Remove ~85 lines, add import |
| `cloud/apps/api/src/services/domain.ts` | **Modify** | Remove ~77 lines, add import |

No other files need changes. `analysis.ts` and `planning.ts` import from `shared.ts` which will re-export.

---

## Key Design: Generic Typing (revised after adversarial review)

The three copies work with slightly different `DefinitionRow` types:

| Location | Extra fields beyond base |
|----------|-------------------------|
| `shared.ts` | `name?: string` |
| `launch.ts` | `name: string`, `content: unknown`, `createdByUserId?: string \| null` |
| `domain.ts` | (none — base fields only) |

**Solution**: Define a base type and use generics. Key insight from adversarial review: `hydrateDefinitionAncestors` only fetches parents for ancestry traversal — the parent rows are never returned to callers. So it only needs base fields and returns `Map<string, LineageDefinitionRow>`. Rich types are preserved because `selectLatestDefinitionPerLineage` returns items from the original `definitions` array, not from the hydrated map.

```typescript
export type LineageDefinitionRow = {
  id: string;
  parentId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export function selectLatestDefinitionPerLineage<T extends LineageDefinitionRow>(
  definitions: T[],
  definitionsById?: Map<string, LineageDefinitionRow>,
): T[]

export async function hydrateDefinitionAncestors(
  definitions: LineageDefinitionRow[],
): Promise<Map<string, LineageDefinitionRow>>
```

**Why no `selectFields` parameter**: The adversarial review correctly flagged that `Record<string, boolean>` is too broad for Prisma and doesn't preserve type safety. But we don't need it at all — `launch.ts`'s extra fields (`name`, `content`) come from its initial query, not from hydration. Hydrated parents only need the 5 base fields for ancestry walking.

**Why `definitionsById` is `Map<string, LineageDefinitionRow>` not `Map<string, T>`**: The map is only used inside `getLineageRootId` for parent-pointer traversal. It never needs the rich fields. This also avoids TypeScript variance issues with mutable `Map` types.

---

## Key Constraint

`getLineageRootId` and `isNewerDefinition` are private implementation details — they must NOT be exported. Only `selectLatestDefinitionPerLineage`, `hydrateDefinitionAncestors`, and `LineageDefinitionRow` are public.

---

## Verification

1. `npm run lint --workspace @valuerank/api` — no new lint errors
2. `npm run test --workspace @valuerank/api` — all existing tests pass
3. `npm run build --workspace @valuerank/api` — compiles cleanly
4. Grep confirms no remaining copies: `grep -r "function getLineageRootId" cloud/apps/api/src/` returns exactly one hit
