# Implementation Plan: Pressure Sensitivity Domain Analysis Alignment

**Feature slug:** pressure-sensitivity-domain-analysis-alignment  
**Status:** draft  
**Path:** Feature Factory (`docs/workflow/feature-runs/pressure-sensitivity-domain-analysis-alignment/`)

---

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Accepted. The implementation and plan now use equal-weight pooled condition summaries, preserve direct side rates, and keep missing-data handling explicit in the table and follow-on views.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Accepted. The plan now replaces the manual sanity check with an automated fixed-fixture table assertion, adds explicit tests for transcript cap and pressure-condition exclusions, and keeps the shared-helper adoption check in verification.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Accepted. The plan now states that raw transcripts contribute one trial to exactly one pressure cell, that cell pooling is condition-equal rather than transcript-weighted, that empty pair or row summaries stay null instead of becoming zeros, and that direct API side rates beat any derived fallback.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Accepted. The plan now includes a fixed-fixture verification for equal-weight row roll-ups, explicit tests for transcript-cap and condition-exclusion cases, and a search step to confirm consumers use the shared helper or a documented equivalent.

## Summary

The Pressure Sensitivity page already exists. This feature changes the math so the page follows the same unit-of-analysis rule as Domain Analysis:

- trials add evidence
- conditions are pooled first
- pooled condition results count once in the final roll-up

The biggest implementation risk is accidental reintroduction of trial-count weighting in either the API or the web table. The plan therefore makes the pooled-condition rule explicit in shared helpers, API aggregation, and web rollups.

---

## Key Decisions

### 1. Use pooled condition results as the atomic unit for roll-ups

The API will still bucket raw transcripts into 5x5 pressure cells. That part does not change.

What changes is the next step:

- each raw transcript contributes one trial to exactly one pressure cell
- the cell pool is condition-equal, not transcript-weighted
- each cell is pooled first from those condition-level results
- each pooled cell result counts once when building a pair summary
- each pair summary counts once when building a value-row summary

No final summary may multiply a pooled result by the number of trials that produced it.
If a pooled cell has no finite rate, it is skipped deterministically and does not get a substitute zero.
If every pooled cell in a pair or value row is skipped, that summary stays `null` and the UI must show a coverage or empty-state message instead of inventing a zero or hiding the row silently.

### 2. Preserve direct side-specific rates

The report will keep using the direct first-side and second-side rates exposed by the API.

The web table must not infer the second-side number from the first-side number when the API already provides the direct value.
If the API returns a direct rate for a side, that value wins over any derived fallback.
If one side is missing, that side stays `null`; the other side still renders its own direct number. No mirrored fallback is allowed.

### 3. Keep coverage signals separate from ordinary nulls

The existing pressure API already knows about three different kinds of missingness:

- `transcriptCapHit`
- `pressureConditionExcludedCount`
- `pressureConditionExclusionBreakdown`

Those signals need to stay visible in copy and validation states. A generic `—` is fine for a missing cell, but report-level coverage messaging must still call out hard failures such as a cap or condition exclusion.

### 4. Keep the math shared where it matters

The pressure page has repeated logic in the API and web table. The plan is to move the pressure band predicates and pair/row pooling helpers into `cloud/packages/shared/src/pressure-sensitivity.ts`, then use that helper from both sides.

That keeps the equal-weight rule in one place and lowers the chance of drift later.
The shared helper will return counts for display only. Consumers must not use those counts to rebuild a weighted average.

---

## Architecture

### Shared helper layer

Add a shared pressure helper module with:

- pressure band predicates
- direct-rate pair summary helpers
- equal-weight row aggregation helpers
- small utility predicates for `null` and non-finite rate handling

Export the helper from `cloud/packages/shared/src/index.ts`.

### API layer

Update `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts` and `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts` so that:

- cell metrics still come from pooled condition data
- `successes` and `opponentSuccesses` remain integer counts
- `pooledDirectionalReduction()` uses equal-weight pooled condition results, not `cell.n` weighting
- the resolver keeps direct per-side rates and exposes the existing coverage signals

### Web layer

Update the pressure table and supporting views so that:

- value rows average pair summaries equally
- direct per-side rates stay direct
- copy explains that conditions are pooled first
- coverage copy distinguishes thin data from transcript caps and condition exclusions
- missing or insufficient cells are shown as `—` or a reasoned empty state, not a silent zero

### Tests

Add or update focused tests in:

- shared pressure helper tests
- API pressure aggregation tests
- pressure-by-value table tests
- detail / cross-value / sanity check consumer tests

---

## Implementation Slices

### Slice 1 - Shared pressure math

Files:

- `cloud/packages/shared/src/pressure-sensitivity.ts`
- `cloud/packages/shared/src/index.ts`
- `cloud/packages/shared/src/__tests__/pressure-sensitivity.test.ts`
- `cloud/packages/shared/src/pressure-sensitivity.test-fixtures.ts`

Work:

- add shared band predicates
- add equal-weight pair summary helpers
- add row aggregation helpers
- add fixtures and tests for thin cells, malformed levels, missing rates, and direct-rate behavior
- add a codebase search step during verification to confirm every pressure consumer uses the shared helper or a documented equivalent

### Slice 2 - API aggregation

Files:

- `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts`
- `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts`
- `cloud/apps/api/src/graphql/types/pressure-sensitivity.ts`
- `cloud/apps/api/tests/services/pressure-sensitivity/aggregation.test.ts`

Work:

- switch pair pooling to equal-weight pooled condition results
- keep `successes` / `opponentSuccesses` as integer counts
- preserve direct first-side / second-side rates
- keep coverage breakdown and transcript cap signals visible
- update API tests for equal-weight and direct-rate behavior
- add explicit tests for transcript cap, excluded-condition counts, and the no-double-count rule for pooled rows

### Slice 3 - Web consumers and copy

Files:

- `cloud/apps/web/src/components/models/PressureResponseByValueTable.tsx`
- `cloud/apps/web/src/components/models/PressureResponseByValueTable.test.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityDetail.test.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityCrossValueMap.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityCrossValueMap.test.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.test.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityLimitations.tsx`
- `cloud/apps/web/src/components/models/pressureSensitivityFormatting.ts`

Work:

- remove trial-count weighting from the table roll-ups
- keep direct rates direct
- update header and limitation copy to explain pooled conditions
- make missing coverage and empty states explicit
- add focused tests for transcriptCapHit, pressure-condition exclusions, and thin pooled cells

### Slice 4 - Validation and closeout prep

Files:

- `STATUS.md`
- `docs/workflow/feature-runs/pressure-sensitivity-domain-analysis-alignment/closeout.md`
- `docs/workflow/feature-runs/pressure-sensitivity-domain-analysis-alignment/postmortem.md`

Work:

- run focused API and web tests
- run API and web builds
- run a focused integration test that renders the pressure-by-value table with a fixed fixture and asserts the equal-weight roll-up values
- verify the pressure page still matches the intended Domain Analysis-style weighting rule
- update `STATUS.md`

---

## Verification Plan

1. Run the shared pressure helper tests.
2. Run the API pressure aggregation tests.
3. Run the focused web pressure tests.
4. Run the API and web builds.
5. Sanity-check the pressure-by-value table against a fixed fixture so the row values are no longer trial-weighted.

---

## Risks

1. It is easy to fix one table and leave another one still using trial-count weighting.
2. The API already exposes several coverage paths, so generic “no data” copy can hide the difference between thin data and a hard exclusion.
3. The current report has a few places where missingness is flattened into `—`; those need to stay honest without becoming noisy.
