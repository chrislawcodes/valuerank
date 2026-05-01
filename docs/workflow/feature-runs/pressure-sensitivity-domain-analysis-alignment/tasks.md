# Tasks: Pressure Sensitivity Domain Analysis Alignment

**Feature slug:** pressure-sensitivity-domain-analysis-alignment  
**Status:** draft  
**Path:** Feature Factory (`docs/workflow/feature-runs/pressure-sensitivity-domain-analysis-alignment/`)

---

## Slice 1 - Shared pressure math and API rollups [CHECKPOINT]

**Estimated diff:** ~240 lines  
**Depends on:** none

**Files**
- `cloud/packages/shared/src/pressure-sensitivity.ts`
- `cloud/packages/shared/src/index.ts`
- `cloud/packages/shared/src/__tests__/pressure-sensitivity.test.ts`
- `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts`
- `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts`
- `cloud/apps/api/tests/services/pressure-sensitivity/aggregation.test.ts`

**Work**
- Move the pressure band predicates and the equal-weight pooling helpers into the shared package.
- Make the pooled condition result the atomic unit for pressure rollups.
- Keep the API on direct side rates instead of mirrored fallback math.
- Make `successes` and `opponentSuccesses` display-only counts, not a hidden weight source.
- Keep `transcriptCapHit`, `pressureConditionExcludedCount`, and `pressureConditionExclusionBreakdown` visible in the API response.
- Make empty pooled summaries stay `null` instead of becoming zeros.

**Verification**
- Run the shared pressure helper tests.
- Run the API pressure aggregation tests.
- Run a codebase search to confirm pressure consumers use the shared helper or a clearly documented equivalent, and that no remaining pressure path silently reintroduces trial-count weighting.

## Slice 2 - Web consumers and copy [CHECKPOINT]

**Estimated diff:** ~260 lines  
**Depends on:** Slice 1

**Files**
- `cloud/apps/web/src/components/models/PressureResponseByValueTable.tsx`
- `cloud/apps/web/src/components/models/PressureResponseByValueTable.test.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivitySummary.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivitySummary.test.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityDetail.test.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityCrossValueMap.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityCrossValueMap.test.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.test.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityLimitations.tsx`
- `cloud/apps/web/src/components/models/pressureSensitivityFormatting.ts`

**Work**
- Keep the direct API rates direct in the UI; do not synthesize a missing side from the other side.
- Remove any remaining trial-count weighting from the value-row summaries.
- Update the page copy so it explains pooled conditions, equal-weight rollups, and the different missing-data states honestly.
- Make the summary, detail, cross-value map, sanity check, and limitations text all tell the same story.
- Keep dashes for truly missing values, but do not let the UI hide a hard exclusion or transcript cap.

**Verification**
- Run the focused web tests for the pressure components.
- Run the web build.

## Slice 3 - Fixed-fixture regression coverage [CHECKPOINT]

**Estimated diff:** ~160 lines  
**Depends on:** Slices 1 and 2

**Files**
- `cloud/packages/shared/src/__tests__/pressure-sensitivity.test.ts`
- `cloud/apps/api/tests/services/pressure-sensitivity/aggregation.test.ts`
- `cloud/apps/web/src/components/models/PressureResponseByValueTable.test.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityDetail.test.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivityCrossValueMap.test.tsx`
- `cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.test.tsx`

**Work**
- Add a fixed-fixture integration test that proves the pressure-by-value rollups are equal-weight across conditions, not weighted by trial count.
- Add explicit coverage for transcript-cap hits, condition exclusions, and empty pooled summaries.
- Assert the direct-rate behavior stays direct on both sides.

**Verification**
- Run the shared, API, and focused web tests together for the pressure feature.
- Confirm the fixed fixture produces the same kind of equal-weight behavior we expect from Domain Analysis-style rollups.

## Slice 4 - Validation and handoff prep [CHECKPOINT]

**Estimated diff:** ~80 lines  
**Depends on:** Slice 3

**Files**
- `STATUS.md`
- `docs/workflow/feature-runs/pressure-sensitivity-domain-analysis-alignment/closeout.md`
- `docs/workflow/feature-runs/pressure-sensitivity-domain-analysis-alignment/postmortem.md`

**Work**
- Run the final API and web builds.
- Record the completed work in `STATUS.md`.
- Write closeout notes that summarize the equal-weight pressure methodology and the remaining caveats, if any.
- Write the postmortem after the implementation is done.

**Verification**
- Re-run the final targeted test set after the last code slice.
- Confirm the workflow is ready for diff checkpoint and PR delivery.
