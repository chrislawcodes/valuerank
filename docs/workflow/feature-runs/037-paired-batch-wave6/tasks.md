# Tasks — Feature 037: Paired-Batch Wave 6

The authoritative task list with file paths, line numbers, fixture details, and grep checks lives in [`docs/tech-debt/wave6-spec.md`](../../../tech-debt/wave6-spec.md) under "Implementation tasks". This file is the FF checkpoint structure.

---

## Wave 1 — Methodology guard test

### T1-1 — Write the direction-balanced invariant test (Task 1.5 in spec)

**File**: `cloud/apps/api/tests/services/pressure-sensitivity/direction-balanced-invariant.test.ts` (new)

- [ ] Build a fixture with two definitions in a mirrored pair, with deliberately lopsided trial counts (e.g., 100 vs 10).
- [ ] Assert direction-balanced win rates equal `(rateA + rateB) / 2` exactly, not the trial-weighted mean.
- [ ] Assert pressure response is computed from per-direction averages.
- [ ] Smoke test: when trial counts are equal, direction-balanced equals trial-weighted.
- [ ] Run the test; confirm it passes against current resolver state.

[CHECKPOINT]

---

## Wave 2 — New card

### T2-1 — Build `PooledVignetteMetricsCard` component (Task 1)

**File**: `cloud/apps/web/src/components/analysis/PooledVignetteMetricsCard.tsx` (new)

- [ ] Implement visibility rule: paired AND not aggregate AND API returns non-empty `models`.
- [ ] Header with title, vignette name, and N/M count line.
- [ ] N from `useRuns({ definitionId, status: 'COMPLETED' })` filtered by signature.
- [ ] M from `run.mirroredRuns.length`.
- [ ] Per-model table: A%, B%, Pressure response (with tooltip on null), Trials.
- [ ] Pressure-response tooltip mapping per the `reason` table in spec.
- [ ] Loading / error / collision states per spec.

### T2-2 — Component tests

**File**: `cloud/apps/web/tests/components/analysis/PooledVignetteMetricsCard.test.tsx` (new)

- [ ] 11 test cases per spec § Tests.

### T2-3 — Wire into `OverviewSummaryTable`

**Files**:
- `cloud/apps/web/src/components/analysis/tabs/OverviewSummaryTable.tsx`
- `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx`
- `cloud/apps/web/src/components/analysis/AnalysisPanel.tsx`

- [ ] Plumb `currentRun` through `AnalysisPanel` → `OverviewTab` → `OverviewSummaryTable`.
- [ ] Mount `<PooledVignetteMetricsCard>` after the per-model summary table inside the existing `border-t border-gray-200 pt-4` slot.

[CHECKPOINT]

---

## Wave 3 — Deletions and doc cleanup

### T3-1 — Delete the bridge report script (Task 2)

- [ ] `cloud/scripts/job-choice-bridge-report.ts` — delete
- [ ] `cloud/scripts/job-choice-bridge-report-lib.ts` — delete
- [ ] `cloud/scripts/__tests__/job-choice-bridge-report.test.ts` — delete

### T3-2 — Delete the run-flow doc (Task 3)

- [ ] `docs/backend/paired-batch-run-flow.md` — delete
- [ ] Verify dangling links exist only in `docs/workflow/feature-runs/` (acceptable historical receipts)

### T3-3 — Glossary + PRD (Task 4)

- [ ] `docs/canonical-glossary.md` — find-and-remove pattern for: paired batch, launch mode, PAIR_ASYMMETRY, companion run.
- [ ] Add "mirrored vignette pair" entry if not present.
- [ ] `docs/valuerank_prd.yaml` — find-and-remove for: paired_batch, launch_mode, PAIR_ASYMMETRY, companion_run_id, paired_batch_topup.

[CHECKPOINT]

---

## Wave 4 — Verify

### T4-1 — Full preflight (Task 5)

- [ ] Lint shared, db, api, web — clean.
- [ ] `DATABASE_URL=... JWT_SECRET=... npm run test --workspace @valuerank/api` (includes new methodology test).
- [ ] `DATABASE_URL=... JWT_SECRET=... npm run test --workspace @valuerank/web` (includes new card tests).
- [ ] `npm run build --workspace @valuerank/api`
- [ ] `npm run build --workspace @valuerank/web`
- [ ] Final greps per spec § "Final greps after Wave 6".

### T4-2 — Open PR + ship

- [ ] Branch off `origin/main`.
- [ ] Single-commit PR titled `paired-batch removal: Wave 6 — pooled vignette metrics card + cleanup`.
- [ ] CI green.
- [ ] Squash-merge.

[CHECKPOINT]
