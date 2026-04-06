# Codebase Compaction Plan

> **Created**: 2026-02-26
> **Goal**: Eliminate sprawl, reduce duplication, remove dead code paths, and bring oversized files under the 400-line constitution limit.

---

## What We Found

| Category | Count | Health |
|----------|-------|--------|
| Files exceeding 400-line limit | 14 significant violators | Needs attention |
| Frontend types that manually mirror backend types | 7+ | Poor — any backend change requires manual frontend sync |
| Duplicate algorithm implementations (cosine similarity) | 2 | Poor — bug fix requires change in two places |
| Shared utility logic split across API/web | 2 (trial-signature, temperature normalization) | Needs consolidation |
| Backup/dead files | 2 | Safe to delete |
| Mixed terminology for the same concepts | Ongoing | Poor — increases cognitive load and rename churn |
| Legacy/dead code paths kept alive past usefulness | Ongoing | Poor — obscures the canonical implementation |

---

## Dependency: Terminology Pass

Terminology normalization should be handled in a separate, lightweight pass before structural compaction work starts. Compaction should consume those naming decisions; it should not be the place where naming policy is debated.

Reference: [terminology-normalization.md](/Users/chrislaw/valuerank/docs/plans/terminology-normalization.md)

The terminology pass should produce:

- A short terminology glossary for the compaction scope
- A canonical term chosen for each high-churn concept
- Explicit compatibility notes where old names must remain temporarily
- A rule that newly extracted modules, shared utilities, GraphQL fields, and UI labels follow the glossary

### Planned direction for terminology

- `vignette` should become the official term after the terminology pass
- `scenario` vs `condition` where current naming blurs the distinction
- `order effect` vs `order invariance`
- `trial signature` / `vnew signature` naming
- domain-analysis type names that currently drift between backend, frontend, and UI copy

### Compaction rule

- Prefer a canonical name plus temporary compatibility aliasing over indefinite mixed usage.
- Do not perform broad repo-wide renames without a scoped spec and safety checks.
- Compaction PRs should follow the terminology glossary once it exists.

---

## Cross-Cutting Requirement: Dead Code Path Removal

Compaction should not only split files. It should also remove code paths that are obsolete, shadowed, or preserved only by inertia.

### Required outputs

- Inventory of dead files, dead helpers, compatibility shims, stale route aliases, and unused fallback branches within the compaction scope
- A per-item decision: delete, fold into canonical path, or keep with justification
- Verification that the remaining path is the single supported implementation

### In scope

- backup files and abandoned artifacts
- duplicate frontend/backend implementations where only one should survive
- stale compatibility code that no longer protects an active migration
- old code paths kept alive only because naming or ownership was never finalized

### Out of scope

- speculative deletion of code that lacks call-site evidence
- removing compatibility layers that still protect active UI routes, APIs, or in-flight migrations
- deleting tests solely because production code moved

---


## Tier 1 — High Impact, Low Risk

These are targeted removals of obvious duplication with no architectural change required.

### T1-A: Deduplicate `cosine similarity`

The algorithm is implemented twice with slightly different zero-vector handling:

- `cloud/apps/api/src/graphql/queries/domain-clustering.ts` (lines 72–86) — source of truth
- `cloud/apps/web/src/components/domains/SimilaritySection.tsx` (lines 15–28) — duplicate

The frontend doesn't need to compute this — similarity scores are already computed by the API and returned in the `clusterAnalysis` payload. The frontend `cosineSimilarity()` in `SimilaritySection.tsx` is only used to build the pairwise similarity matrix that the UI renders. Two options:

1. **Preferred**: Have the API return the precomputed pairwise similarity matrix in `clusterAnalysis` and delete the frontend calculation entirely.
2. **Acceptable**: Move to `@valuerank/shared` and import from both. Fixes the dual-maintenance problem without requiring an API change.

**⚠️ Zero-vector behavior must be decided before consolidating.** The two implementations differ:
- API (`domain-clustering.ts:83`): `if (aNorm === 0 && bNorm === 0) return 1` — two zero vectors are treated as identical
- Web (`SimilaritySection.tsx:26`): `if (aNorm === 0 || bNorm === 0) return 0` — any zero vector returns 0

Sharing without choosing a behavior silently changes either clustering math or the UI similarity matrix. Decide which is correct first, then use that behavior in the shared function.

**Files to change**: `domain-clustering.ts`, `SimilaritySection.tsx`, possibly `domainAnalysis.ts` (GQL query + type).

---

### T1-B: Move `formatTrialSignature` to shared

Identical utility defined in two places with slightly different null handling:

- `cloud/apps/api/src/utils/trial-signature.ts`
- `cloud/apps/web/src/utils/trial-signature.ts`

Move to `cloud/packages/shared/src/trial-signature.ts`, export from `@valuerank/shared`, delete both originals.

Also consolidate `vnew-signature.ts` in the API utils — it has a `normalizeTemperatureToken()` function that overlaps with `trial-signature.ts`. Merge them into one shared utility.

Verification for this item should include:

- build `@valuerank/shared`
- run shared tests for the moved helper
- run API and web typechecks after the shared build so downstream packages resolve the updated exports

**Files to change**: both `trial-signature.ts` files, `vnew-signature.ts`, `packages/shared/src/index.ts`.

---

### T1-C: Delete dead files

- `cloud/nixpacks.toml.bak` — editor backup, safe to delete
- ~~`specs/020-integrated-chat/`~~ — already deleted
- ~~`specs/023-multi-sample-variance/`~~ — already deleted

---

### T1-D: Inventory and remove dead code paths in touched areas

Before structural refactors, inventory dead or compatibility-only paths in the files already being compacted.

Examples:

- duplicate calculations that should be replaced by a single canonical helper
- stale aliases or branches that no longer serve an active migration
- internal helpers that are no longer called after consolidation

Each deletion should name the surviving path and the proof that the removed path is unused or obsolete.

---

## Tier 2 — High Impact, Medium Risk

These eliminate the largest category of sprawl: manually mirrored types between backend and frontend.

### T2-A: Auto-generate frontend GraphQL types

**The problem**: Every type in `cloud/apps/web/src/api/operations/domainAnalysis.ts` is a hand-typed mirror of the backend GraphQL schema. Currently duplicated:

| Type | Backend location | Frontend location |
|------|-----------------|-------------------|
| `ClusterAnalysis` | `domain-clustering.ts:49` | `domainAnalysis.ts:343` |
| `ClusterMember` | `domain-clustering.ts:15` | `domainAnalysis.ts:309` |
| `DomainCluster` | `domain-clustering.ts:41` | `domainAnalysis.ts:318` |
| `ValueFaultLine` | `domain-clustering.ts:24` | `domainAnalysis.ts:326` |
| `RankingShape` | `domain-shape.ts:18` | `domainAnalysis.ts:280` |
| `RankingShapeBenchmarks` | `domain-shape.ts:28` | `domainAnalysis.ts:290` |
| Intensity types | inline in `domain.ts` (no separate `domain-intensity.ts`) | `domainAnalysis.ts` |

**The fix**: Set up `@graphql-codegen/cli` to generate TypeScript types from the GraphQL schema into `cloud/apps/web/src/api/generated/`. Replace manual type declarations in `domainAnalysis.ts` with imports from generated types.

**Outcome**: Adding or changing a backend GraphQL field automatically updates frontend types on next codegen run. No manual sync required.

**⚠️ Codegen limitation**: Several domain-analysis fields are exposed as `type: 'JSON'` on the backend — specifically `centroid` (line 305) and `faultLinesByPair` (line 340) in `domain.ts`. Codegen will emit `unknown` or `Record<string, unknown>` for those fields, not the richer shapes currently hand-typed in `domainAnalysis.ts`. Codegen alone will not fix that gap. Either tighten the backend schema to expose these as proper GQL object types first, or accept that some types will remain manually annotated after codegen is set up.

**Files affected**: `domainAnalysis.ts` (heavy reduction on fully-typed fields), `package.json` (web), new `codegen.ts` config.

---

### T2-B: Decompose `domain.ts` (currently ~2,124 lines)

This is the largest single file violation. It acts as both an orchestrator and a container for inline GraphQL type registration for all domain analysis features. The helper logic for shape analysis and clustering has been extracted to `domain-shape.ts` and `domain-clustering.ts` — but intensity/BT scoring logic and all GraphQL type registration code remain inline in `domain.ts`. There is no `domain-intensity.ts` — that logic has not been extracted yet.

**Proposed structure**:

```
cloud/apps/api/src/graphql/queries/domain/
├── index.ts              # Re-exports the query, ~100 lines
├── resolver.ts           # Main resolver function, ~400 lines
├── types/
│   ├── base.ts           # DomainAnalysisResult, model/value types
│   ├── shape.ts          # RankingShape, Benchmarks GQL registration
│   ├── clustering.ts     # Cluster, FaultLine GQL registration
│   └── intensity.ts      # StratumBT, ValueStability GQL registration
└── helpers/
    ├── domain-shape.ts   # (move existing file here)
    ├── domain-clustering.ts  # (move existing file here)
    └── domain-intensity.ts   # (new — extract from domain.ts)
```

The resolver function itself (`resolver.ts`) should stay focused on orchestrating the four passes and returning the result — not registering GQL types.

**⚠️ Pothos side-effect import risk**: Pothos registers GraphQL types as a side effect of importing the file that calls `builder.objectType(...)` / `builder.simpleObject(...)`. This is explicit in `queries/index.ts`: "Queries are registered as a side effect of importing." When `types/*.ts` files are extracted, each one must be explicitly imported — either from within `domain/index.ts` or by adding it to `queries/index.ts`. If any extracted type file is not imported before the schema is built, the fields it registers will silently disappear from the schema with no TypeScript error. **Verification step**: run the schema build and execute a domain analysis query against a test DB before and after the split to confirm field parity.

**Risk**: This is a significant structural move. It should be done in a single PR with no behavior change. Start with a green test run before and after.

**Terminology dependency**: Any extracted type/module names should follow the terminology glossary rather than preserving accidental drift.

---

### T2-C: Split `aggregate.ts` (~955 lines)

`cloud/apps/api/src/services/analysis/aggregate.ts` mixes Zod schema definitions, normalization helpers, and aggregation logic. Currently ~1,035 lines (grown since this plan was written). Proposed split:

```
cloud/apps/api/src/services/analysis/
├── aggregate/
│   ├── index.ts       # Re-exports public surface
│   ├── schemas.ts     # Zod schemas only
│   ├── normalize.ts   # Score/value normalization helpers
│   └── aggregate.ts   # Core aggregation logic (~300 lines)
```

---

## Tier 3 — Medium Impact, Low Risk

These are targeted component decompositions that are self-contained and low-risk.

### T3-A: Decompose `DominanceSection.tsx` (~712 lines)

Extract into:
- `DominanceSectionChart.tsx` — SVG rendering logic
- `DominanceSectionControls.tsx` — filter/focus state
- `useDominanceGraph.ts` — hook for graph computation (edge weights, colors, layout)

The outer `DominanceSection.tsx` becomes a thin composition shell.

---

### T3-B: Decompose `RunForm.tsx` (~686 lines)

`ModelSelector.tsx` has already been extracted (323 lines, `cloud/apps/web/src/components/runs/`). Remaining extractions:
- `DefinitionPicker.tsx` — vignette/definition selection
- `RunConfigPanel.tsx` — temperature, sample %, advanced settings
- `useRunForm.ts` — form state and validation logic

---

### T3-C: Oversized pages

`Survey.tsx` (~680 lines) and `SurveyResults.tsx` (~619 lines) likely have rendering logic that can be moved into dedicated components. Lower priority since pages are allowed to be slightly larger than components.

---

## Execution Order

```
Phase 0 (decision baseline — required before T2+ structural work, not before T1-B/T1-C):
  terminology glossary for the compaction scope
  dead-code-path inventory for touched areas
  refresh the file/type inventory against the current repo

Phase 1 (quick wins, no architecture change):
  T1-A option 2 (shared cosine similarity)
  T1-B (shared trial-signature)
  T1-C (dead files)
  T1-D (dead code path removal in touched areas)

Phase 2 (type generation and structural — independent, can be sequenced or parallelized):
  T2-A (GraphQL codegen) — affects web operations file only; confirm schema-tightening needs first
  T2-B (decompose domain.ts) — API-only, independent of T2-A
  T2-C (split aggregate.ts) — API-only, independent of T2-A and T2-B

Phase 3 (component cleanup):
  T3-A, T3-B, T3-C — can be parallelized
```

Phase 2 and Phase 3 should not be done at the same time as active feature work in the same files.

---

## What Not to Do

- **Don't extract sub-functions for their own sake**. A 500-line file with one well-structured function per feature is better than 5 files with tangled cross-imports.
- **Don't introduce new abstractions**. The goal is deletion and consolidation, not new utility layers.
- **Don't do broad rename churn inside compaction PRs**. Naming changes should follow the separate terminology pass and stay within the touched scope.
- **Don't preserve dead compatibility paths by default**. If a path no longer protects a real user or migration, delete it.
- **Update test imports when moving utilities**. Moving `formatTrialSignature` or `cosineSimilarity` to shared will break existing tests that import from the old path. Fix the import paths — don't leave tests broken. New shared utilities should have tests in `packages/shared/`.
- **Don't do Phase 2 or Phase 3 work in parallel with active feature work in the same files**. Decomposing `domain.ts` while another feature is being built in it guarantees merge conflicts.
