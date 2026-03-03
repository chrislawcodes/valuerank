# Codebase Compaction Plan

> **Created**: 2026-02-26
> **Goal**: Eliminate sprawl, reduce duplication, and bring oversized files under the 400-line constitution limit.

---

## What We Found

| Category | Count | Health |
|----------|-------|--------|
| Files exceeding 400-line limit | 14 significant violators | Needs attention |
| Frontend types that manually mirror backend types | 7+ | Poor — any backend change requires manual frontend sync |
| Duplicate algorithm implementations (cosine similarity) | 2 | Poor — bug fix requires change in two places |
| Shared utility logic split across API/web | 2 (trial-signature, temperature normalization) | Needs consolidation |
| Backup/dead files | 2 | Safe to delete |

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

**Files to change**: `domain-clustering.ts`, `SimilaritySection.tsx`, possibly `domainAnalysis.ts` (GQL query + type).

---

### T1-B: Move `formatTrialSignature` to shared

Identical utility defined in two places with slightly different null handling:

- `cloud/apps/api/src/utils/trial-signature.ts`
- `cloud/apps/web/src/utils/trial-signature.ts`

Move to `cloud/packages/shared/src/trial-signature.ts`, export from `@valuerank/shared`, delete both originals.

Also consolidate `vnew-signature.ts` in the API utils — it has a `normalizeTemperatureToken()` function that overlaps with `trial-signature.ts`. Merge them into one shared utility.

**Files to change**: both `trial-signature.ts` files, `vnew-signature.ts`, `packages/shared/src/index.ts`.

---

### T1-C: Delete dead files

- `cloud/nixpacks.toml.bak` — editor backup, safe to delete
- Confirm `specs/020-integrated-chat/` and `specs/023-multi-sample-variance/` have no corresponding cloud code, then archive to `specs/_archive/`

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
| `ValueStabilityResult` | `domain-intensity.ts:22` | `domainAnalysis.ts` |
| `ModelIntensityStability` | `domain-intensity.ts:34` | `domainAnalysis.ts` |
| `IntensityStabilityAnalysis` | `domain-intensity.ts:45` | `domainAnalysis.ts` |

**The fix**: Set up `@graphql-codegen/cli` to generate TypeScript types from the GraphQL schema into `cloud/apps/web/src/api/generated/`. Replace manual type declarations in `domainAnalysis.ts` with imports from generated types.

**Outcome**: Adding or changing a backend GraphQL field automatically updates frontend types on next codegen run. No manual sync required.

**Files affected**: `domainAnalysis.ts` (heavy reduction), `package.json` (web), new `codegen.ts` config.

---

### T2-B: Decompose `domain.ts` (currently ~2,230 lines)

This is the largest single file violation. It acts as both an orchestrator and a container for inline GraphQL type registration for all domain analysis features. The helper logic (BT scoring, shape analysis, clustering, intensity) has already been extracted to `domain-*.ts` modules — but the GraphQL type registration code for each feature is still inline in `domain.ts`.

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
    ├── domain-clustering.ts
    └── domain-intensity.ts
```

The resolver function itself (`resolver.ts`) should stay focused on orchestrating the four passes and returning the result — not registering GQL types.

**Risk**: This is a significant structural move. It should be done in a single PR with no behavior change. Start with a green test run before and after.

---

### T2-C: Split `aggregate.ts` (~955 lines)

`cloud/apps/api/src/services/analysis/aggregate.ts` mixes Zod schema definitions, normalization helpers, and aggregation logic. Proposed split:

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

Extract into:
- `ModelSelector.tsx` — multi-model checkbox list
- `DefinitionPicker.tsx` — vignette/definition selection
- `RunConfigPanel.tsx` — temperature, sample %, advanced settings
- `useRunForm.ts` — form state and validation logic

---

### T3-C: Oversized pages

`Survey.tsx` (~680 lines) and `SurveyResults.tsx` (~619 lines) likely have rendering logic that can be moved into dedicated components. Lower priority since pages are allowed to be slightly larger than components.

---

## Execution Order

```
Phase 1 (quick wins, no architecture change):
  T1-A option 2 (shared cosine similarity)
  T1-B (shared trial-signature)
  T1-C (dead files)

Phase 2 (type generation):
  T2-A (GraphQL codegen) — do this before T2-B to reduce the type surface in domain.ts

Phase 3 (structural):
  T2-B (decompose domain.ts)
  T2-C (split aggregate.ts)

Phase 4 (component cleanup):
  T3-A, T3-B, T3-C — can be parallelized
```

Phases 3 and 4 should not be done at the same time as active feature work in the same files.

---

## What Not to Do

- **Don't extract sub-functions for their own sake**. A 500-line file with one well-structured function per feature is better than 5 files with tangled cross-imports.
- **Don't introduce new abstractions**. The goal is deletion and consolidation, not new utility layers.
- **Don't touch test files**. Test verbosity is acceptable and expected; test files are explicitly excluded from the 400-line limit.
- **Don't do Phase 3 and feature work in parallel**. Decomposing `domain.ts` while another feature is being built in it guarantees merge conflicts.
