# Closeout: Pressure Sensitivity Report

**Slug:** pressure-sensitivity-report
**PR:** [chrislawcodes/valuerank#770](https://github.com/chrislawcodes/valuerank/pull/770) — merged 2026-04-28T15:51:02Z
**Squash SHA:** `08ca3662` on `origin/main`
**Branch:** `claude/great-noyce-ed9f59` (deleted on merge)

## What shipped

A new **Pressure Sensitivity** report at `/models/pressure-sensitivity` (third sub-tab under the Models nav, alongside Matrix and Consistency) that answers four questions about each model's response to pressure:

1. Which models are most sensitive to pressure overall? (cross-model summary)
2. For a given model, which value pairs move under pressure? (per-model detail)
3. Is sensitivity a model trait or value-specific? (model × value-pair heat map)
4. Is the pressure manipulation working as designed? (directional sanity check)

Three Δ metrics are reported per (model, value pair), all computed across the 2D pressure grid (own pressure level × opponent pressure level):

- **Direction Δ** — change in win rate from low- to high-pressure cells
- **Conviction Δ** — change in mean decision strength among picks
- **netScore Δ** — combined view via the existing 2:1 weighting

### API additions

- `Query.pressureSensitivity(domainId: ID, providerId: ID, signature: String!)` GraphQL query
- New service module `cloud/apps/api/src/services/pressure-sensitivity/`:
  - `aggregation.ts` — pure cell metrics, band reduction, baseline + ceiling/floor, aggregate sensitivity
  - `value-pair.ts` — canonical pair key + own/opponent direction remap
  - `definition-validation.ts` — raw-content validation pass via `resolveDefinitionContent`
- Adapter exported from `scenarios-utils.ts`: `buildSafeLevelLookup` with collision detection (label/score/cross), 1–5 score range validation, and trim/lowercase/numeric normalization
- `toComparableNumber` exported from `scenario-metadata.ts` for the adapter
- Pothos types and SDL regenerated

### Web additions

- New page `/models/pressure-sensitivity` with empty / partial-coverage / loading / error states and URL-search-param `domainId` + `signature` carrying through (matches `ModelsConsistency.tsx`)
- Six new components: `PressureSensitivitySummary`, `PressureSensitivityDetail`, `PressureGrid`, `PressureSensitivityCrossValueMap`, `PressureSensitivitySanityCheck`, `PressureSensitivityLimitations`, `PressureSensitivityFilters`
- Nav entries added in BOTH surfaces: `NavTabs.tsx` (desktop) and `MobileNav.tsx` (mobile)
- New GraphQL operation `pressureSensitivity.graphql` + codegen output

### Tests

38 unit tests added across three files, covering:
- Three collision sub-cases on `buildSafeLevelLookup` (label-vs-label, score-vs-score, label-vs-score)
- Three out-of-range sub-cases (0, 6, 1.5)
- Empty band / coverage edge cases on `applyBandReduction`
- Conviction-undefined-when-no-picks rule
- Ceiling/floor flag thresholds
- Direction remap on mirrored Definitions (`assignOwnOpponent`)
- Self-pair / missing-token rejection on `canonicalValuePairKey`

## What remains open (acknowledged residual risks)

| Risk | Mitigation in place | Residual |
|---|---|---|
| Resolver mis-reads production data | Plan validated against prod Definition shapes during planning; 38 unit tests on the wired pure functions; same data-source pattern as `models-consistency.ts` | Smoke-test post-deploy required (see comment on PR #770). If every model lands in `insufficient` with `no-coverage`, hotfix needed. |
| Resolver integration test absent | Unit coverage exercises every wired primitive | Documented as Gemini Slice A MEDIUM follow-up |
| Cross-vignette pressure-level calibration not validated | Limitations panel calls this out prominently; cross-value heat map shows the warning inline | Acknowledged measurement limitation |
| Sycophancy / instruction-following can mimic sensitivity | Limitations panel calls this out | Acknowledged; no detection layer |
| Provider filter accepts both ID and name | Inherited from `models-consistency.ts` pattern | Defer cleanup with sibling report |
| Signature on domain-switch back to "All domains" can become invalid | Inherited from `models-consistency.ts` pattern | Defer cleanup with sibling report |
| Prisma `as` casts instead of `Prisma.XGetPayload` | Matches existing pattern | Defer with sibling report |

## Where the workflow artifacts live

- `docs/workflow/feature-runs/pressure-sensitivity-report/`
  - `spec.md` — 4 review rounds, FR-001 through FR-024
  - `plan.md` — 13 architecture decisions, residual-risks-with-verification
  - `tasks.md` — 4 slices (A, B, C, D) with [CHECKPOINT] boundaries
  - `closeout.md` — this file
  - `postmortem.md` — workflow retrospective
  - `reviews/` — all spec/plan/diff review artifacts (Codex + Gemini), judge panel outputs, manifest checkpoints

## Verification commands (post-deploy)

After Railway redeploys, run via the valuerank MCP `graphql_query` tool:

```graphql
query SmokeTest {
  pressureSensitivity(signature: "vnewtd") {
    models {
      modelId
      label
      aggregateSensitivity { value valuePairsMeasured }
      valuePairs {
        pairKey
        directionDelta { value }
        n
      }
    }
    insufficient { modelId reason }
    excludedDefinitions { definitionId reason }
    excludedScenariosCount
    directionalSanityCheck { positivePct measuredCount unmeasurableCount }
  }
}
```

Expected: at least one model in `models[]` with non-empty `valuePairs`. If all models land in `insufficient[]` and `excludedDefinitions[]` is empty, the resolver is mis-reading data — see plan.md "Residual Risks → AGGREGATE-pipeline coverage prerequisite" for the verification protocol.
