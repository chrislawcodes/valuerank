# Codex Adversarial Review — Plan

**Model**: gpt-5.4-mini | **Date**: 2026-04-08

## Findings

1. **FAIL** — The three copies are not truly identical. `launch.ts` hydrates extra columns (`name`, `content`, `createdByUserId`), while `shared.ts` and `domain.ts` only hydrate the lineage base fields. `domain.ts` also requires `definitionsById` explicitly (no default map param), while the other two give `selectLatestDefinitionPerLineage` a default map.

2. **FAIL** — The generic plan does not preserve launch's richer row type as written. If `hydrateDefinitionAncestors` returns `Map<string, LineageDefinitionRow>`, then `selectLatestDefinitionPerLineage` will infer the base type from that map and `launch.ts` will lose `name`, `content`, and `createdByUserId`.

3. **FAIL** — Yes, this causes type problems at rich call sites. `launch.ts` depends on the hydrated/latest definitions still being `DefinitionRow[]`. A base-typed hydrated map forces either type loss or a cast.

4. **FAIL** — There are additional callers beyond the three implementation files. `analysis.ts` and `planning.ts` both import and use `hydrateDefinitionAncestors` and `selectLatestDefinitionPerLineage` through `shared.ts`. (Note: the spec already accounts for this via re-exports — this is a documentation gap, not a missing caller.)

5. **PASS** — Re-exporting from `shared.ts` does preserve the existing import path for `analysis.ts` and `planning.ts`.

6. **FAIL** — The main break is in `launch.ts`. Its downstream logic still expects rich `DefinitionRow` objects, but the proposed shared API only returns `LineageDefinitionRow`.

7. **FAIL** — Prisma can accept a dynamic `select` object at runtime, but `Record<string, boolean>` is too broad and does not preserve the richer payload shape launch needs. A `Prisma.DefinitionSelect`-typed object or a `satisfies` pattern is the safer route.
