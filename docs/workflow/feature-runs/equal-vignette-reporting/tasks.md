# Tasks: Equal-Vignette Reporting

## Slice A — Canonical reporting math and report assembly [CHECKPOINT]

- [x] A1. Update `cloud/apps/api/src/graphql/queries/models-analysis.ts`
  - Replace the current equal-domain `computePooledWinRate` helper with a vignette-aware weighted mean:
    - use each domain contribution's `evidenceWeight` as the vignette count weight
    - return `null` when there are no eligible weighted contributions
  - Keep `computeStabilityScore` as an unweighted MAD across eligible domain win rates
  - Tighten `buildValueResult(...)` so only contributions with `evidenceWeight > 0` are considered canonical input
  - Remove the legacy raw-count fallback contribution path for snapshots that do not have both `valueWinRates` and `vignetteCount`
  - Result: `pooledWinRate` means equal-vignette across domains, and legacy snapshots without vignette-aware fields do not silently contribute count-based values

- [x] A2. Update `cloud/apps/web/src/pages/Models.tsx`
  - Stop recomputing `winRates` for the `All domains value priorities` table from pooled `prioritized / (prioritized + deprioritized + neutral)` counts
  - Build a `pooledWinRatesByModel` lookup from `modelsAnalysisData`
  - Feed `ValuePrioritiesSection` the shared `pooledWinRate` values when present
  - Fail closed for missing canonical values: show `null` rather than falling back to pooled counts
  - Keep the existing stability-score lookup from `modelsAnalysisData`

- [x] A3. Update `cloud/apps/web/src/pages/DomainAnalysis.tsx`
  - Remove the count-based fallback inside the `winRateMap`
  - Use `modelsAnalysis.pooledWinRate` only for the in-scope value-priorities report
  - If a `model × value` does not have canonical reporting data, pass `null`

- [x] A4. Add targeted API and page tests for Slice A
  - Add an API test for `models-analysis.ts` that proves cross-domain `pooledWinRate` is vignette-weighted when domain vignette counts differ
  - Add or update a `/models` page test that proves the first table now uses `modelsAnalysis.pooledWinRate` instead of pooled counts
  - Tighten the `DomainAnalysis` page test so missing canonical data stays `null` rather than falling back to count-based math

- [x] A5. Verify Slice A
  - Run targeted tests for the changed API and web paths
  - Confirm one regression fixture where pooled counts and equal-vignette math differ now resolves to the canonical value in both reports
  - Commit target: `fix(reporting): standardize equal-vignette win rates`

**[CHECKPOINT]**

---

## Slice B — Explanatory copy, docs, and closeout [CHECKPOINT]

- [x] B1. Update `cloud/apps/web/src/components/models/ModelValueDetailDrawer.tsx`
  - Rewrite the pooled-win-rate explanation so it matches the canonical methodology:
    - average runs equally within each vignette
    - each vignette counts once
    - the cross-domain summary is vignette-weighted across contributing domains
  - Remove wording that defines the metric as pooled raw counts within a domain
  - Keep the vignette-count explanation aligned with the same rule

- [x] B2. Update `docs/canonical-glossary.md`
  - Add or revise the reporting-metric definition so new docs can point to one canonical equal-vignette explanation
  - Make clear that pooled raw outcome counts are not the canonical cross-vignette reporting metric

- [x] B3. Update `STATUS.md`
  - Record the methodology alignment work under Recently Completed
  - Update Next based on what this PR unblocks

- [x] B4. Final verification for PR readiness
  - From `cloud/`, run the preflight checks required for touched workspaces
  - Capture exact commands and pass/fail status for the PR `Validation` section
  - Sanity-check that no in-scope UI copy still describes the old count-based methodology

- [ ] B5. Prepare the PR
  - Review the diff for scope discipline
  - Draft a PR summary that explains the mismatch, the canonical metric, and the legacy fallback decision

**[CHECKPOINT]**
