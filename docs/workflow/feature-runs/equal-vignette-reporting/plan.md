# Implementation Plan: Equal-Vignette Reporting

**Branch:** `codex/equal-vignette-reporting` | **Date:** 2026-04-30 | **Spec:** `docs/workflow/feature-runs/equal-vignette-reporting/spec.md`

## Summary

Standardize the in-scope model-reporting surfaces on the equal-vignette methodology that already exists in the domain-analysis snapshot pipeline:

1. average runs equally within each vignette
2. average vignette win rates equally within each domain
3. report cross-domain values without silently falling back to pooled counts

The main product fix is to stop recomputing report values from pooled `prioritized / (prioritized + deprioritized + neutral)` counts in the UI and compatibility layer.

## Technical Context

| Aspect | Detail |
|---|---|
| Language | TypeScript (strict) |
| API framework | Pothos + Prisma |
| Web framework | React + urql + Vite |
| Existing source of truth | `domain-analysis-snapshot-aggregator.ts` computes `valueWinRates` and `vignetteCount` |
| Key compatibility path | `models-analysis.ts` still falls back to pooled counts for older snapshots |
| Main user-visible mismatch | `/models` first table vs `/models` second table |
| Testing | Vitest (web), Vitest/API tests where needed |
| Data sensitivity | Medium — affects reporting semantics and legacy snapshot compatibility |

## Architecture Decisions

### Decision 1: Keep the snapshot aggregator as the methodological source of truth

**Chosen:** Treat `valueWinRates` + `vignetteCount` from `domain-analysis-snapshot-aggregator.ts` as the canonical equal-vignette source.

**Rationale:**
- the aggregator already averages runs equally within each vignette
- it already emits per-value equal-vignette win rates
- replacing this with new client-side math would duplicate logic and invite drift

### Decision 2: Remove count-based recomputation from in-scope report displays

**Chosen:** The UI should not recompute report win rates from pooled `prioritized`, `deprioritized`, and `neutral` counts when equal-vignette data is available.

**Rationale:**
- this recomputation is the direct cause of the mismatch on `/models`
- pooled counts can overweight vignettes with more trials
- a shared source of truth is simpler to explain and test

### Decision 3: Prefer fail-closed legacy behavior over silent mixed methodology

**Chosen:** If equal-vignette data is unavailable for a value, prefer returning `null` / `n/a` for the reporting metric rather than silently mixing count-based and equal-vignette values in the same report.

**Rationale:**
- silent mixed-method rows are harder to detect than explicit missing data
- this keeps the reporting meaning honest
- if we later decide to keep a temporary fallback, it must be deliberate and tested

### Decision 4: Encode cross-domain reporting in equal-vignette terms, not as a domain-balance assumption

**Chosen:** The implementation should follow the equal-vignette rule even though current domains have equal vignette counts.

**Rationale:**
- today's equality makes simple domain averaging numerically equivalent, but that is a data fact, not the product rule
- encoding the rule guards against future domain drift

## Change Areas

### A. API compatibility layer

Files:
- `cloud/apps/api/src/graphql/queries/models-analysis.ts`

Work:
- inspect how `pooledWinRate` is built from per-domain contributions
- remove or constrain the raw-count fallback path for legacy snapshots
- ensure the resolver does not silently mix equal-vignette and count-based values in one row
- if needed, compute cross-domain reporting from vignette-aware evidence rather than relying on domain equality as an unstated assumption

### B. Web report assembly

Files:
- `cloud/apps/web/src/pages/Models.tsx`
- `cloud/apps/web/src/pages/DomainAnalysis.tsx`

Work:
- replace pooled-count recomputation in `/models` first table with the equal-vignette metric
- remove or constrain the fallback path in `DomainAnalysis.tsx`
- keep formatting changes separate from methodology changes where possible

### C. Explanatory copy and docs

Files:
- `cloud/apps/web/src/components/models/ModelValueDetailDrawer.tsx`
- `docs/canonical-glossary.md`

Work:
- explain the reporting methodology as equal-run within vignette, then equal-vignette
- remove wording that implies pooled counts are the report definition for the in-scope surfaces

### D. Regression coverage

Files:
- `cloud/apps/web/tests/pages/Models.test.tsx`
- `cloud/apps/web/tests/pages/DomainAnalysis.test.tsx`
- API tests if `models-analysis.ts` behavior changes materially

Work:
- add a `/models` regression test where pooled counts and equal-vignette values differ
- assert that the first and second `/models` tables use the same methodology
- cover legacy behavior explicitly if any fallback remains

## Slice Plan

### Slice A — Standardize the reporting source of truth [CHECKPOINT]

Estimated diff: ~150–220 lines

Files:
- `cloud/apps/api/src/graphql/queries/models-analysis.ts`
- `cloud/apps/web/src/pages/Models.tsx`
- `cloud/apps/web/src/pages/DomainAnalysis.tsx`

Goals:
- eliminate in-scope count-based recomputation
- define legacy behavior clearly
- ensure both `/models` tables and domain value priorities use the same methodology

Verification:
- targeted web tests for `/models` and `DomainAnalysis`
- API/unit tests if resolver logic changes

### Slice B — Explain and lock in the methodology [CHECKPOINT]

Estimated diff: ~80–160 lines

Files:
- `cloud/apps/web/src/components/models/ModelValueDetailDrawer.tsx`
- `docs/canonical-glossary.md`
- test files updated in slice A if needed

Goals:
- align tooltip/help text and glossary language
- add regression coverage that proves extra trials within one vignette do not change the displayed methodology

Verification:
- targeted tests
- grep/sanity check on updated wording

## Verification Plan

Run from `cloud/` as appropriate for touched workspaces:

```bash
npm run test --workspace=@valuerank/web -- tests/pages/Models.test.tsx tests/pages/DomainAnalysis.test.tsx
npm run test --workspace=@valuerank/web -- tests/components/models/ModelValueDetailDrawer.test.tsx
npm run lint --workspace=@valuerank/web
```

If API logic changes materially:

```bash
npm run test --workspace=@valuerank/api -- models-analysis
npm run lint --workspace=@valuerank/api
```

## Residual Risks

1. Legacy snapshots may still lack `valueWinRates` or `vignetteCount`, and removing the fallback could surface more `n/a` cells than expected.  
verification: inspect the affected `/models` and `/domains/analysis` test fixtures and run the targeted page tests with one legacy-style fixture before merge.

2. Cross-domain `pooledWinRate` may still be implemented as a simple mean of domain values, which only matches the desired rule while domain vignette counts remain equal.  
verification: add or run a focused resolver/unit test with unequal synthetic domain vignette counts and confirm the result still follows the equal-vignette rule.

3. User-facing wording may stay partially count-based even after the math is fixed.  
verification: grep touched docs/UI copy for `prioritized / (` and review every surviving hit in the in-scope files before merge.
