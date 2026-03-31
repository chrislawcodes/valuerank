# Feature Spec: Top-up to Target Batch Count on Domain Evaluation

**Feature slug:** target-batch-topup
**Date:** 2026-03-31
**Author:** Claude (factory pipeline)

---

## Problem Statement

Currently the Domain Evaluation launch flow always launches exactly 1 new batch per vignette regardless of how many completed batches already exist. If a user wants 5 total batches for statistical power, they must manually launch 5 separate evaluations, track progress themselves, and stop when they reach their target. This is error-prone and tedious.

---

## User Stories (prioritized)

### US-1 (Must Have): Set a target batch count
As a researcher, I want to specify a **target total batch count** (e.g. 5) when launching a domain evaluation, so that the system automatically computes and launches only the top-up batches I need rather than always launching 1.

**Acceptance criteria:**
- LaunchControlsPanel shows a "Target batch count" number input
- Input accepts positive integers ≥ 1
- When omitted or set to 1, behavior is identical to current (backward compatible)
- Input is shown alongside existing scope/budget controls, not hidden in Advanced

### US-2 (Must Have): Per-vignette top-up computation
As a researcher, I want the system to automatically compute per-vignette top-up counts, so I don't have to manually track which vignettes have enough batches.

**Acceptance criteria:**
- Backend counts completed batches + in-flight (PENDING/RUNNING/SUMMARIZING/PAUSED) batches per vignette with the same signature
- Top-up = max(0, targetBatchCount − existingCount)
- Vignettes already at or above target are skipped (no new batch launched)
- For paired vignettes: existing count = min(countA, countB); both vignettes top up to the same amount (paired asymmetry rule)

### US-3 (Must Have): Grid shows existing count when target mode active
As a researcher, I want the Planned Batches grid to show "have X / need Y more" for each vignette when target mode is active, so I can verify the launch plan before confirming.

**Acceptance criteria:**
- TrialGridTable gains optional `targetBatchCount` and `existingBatchCountByDefinitionId` props
- When `targetBatchCount` is provided, "Batches" column shows "have X, launching Y" instead of raw model count
- When target mode is off, grid renders exactly as today (no regression)

### US-4 (Should Have): LaunchConfirmModal reflects target mode
As a researcher, I want the confirmation modal to mention the target count, so I have a final check before spending money.

**Acceptance criteria:**
- LaunchConfirmModal shows target batch count when provided
- "Projected evaluation cost" is calculated by summing `topUpCount × per-batch cost` across all vignettes. The frontend uses existing batch counts (from the `domainTrialsPlan` query) plus the configured target to derive this before launching.

---

## Out of Scope

- Changing the `samplesPerScenario` param (the existing 1-batch-per-launch default stays)
- Modifying `StartPairedBatchPage`
- Modifying `DomainCoverage.tsx`
- Changing the paired-batch grouping logic (`groupDefinitionsByPairKey`)
- Changing the budget cap logic (still applies on top of target logic)
- CLAUDE.md, AGENTS.md, MEMORY.md, .gitignore

---

## Design Decisions

### What counts as "existing"
Completed batches only have produced data. In-flight batches (PENDING/RUNNING/SUMMARIZING/PAUSED) have been committed to and should count to avoid over-launching. Status: **both completed and in-flight count**.

### Signature matching
Only batches with matching signature (same model set, temperature, samplesPerScenario) count toward the target. This mirrors the existing `runMatchesSignature` logic already in `domain-coverage.ts`.

### Paired asymmetry
A paired batch is an A+B unit. `existingCount(pair) = min(existingA, existingB)`. Both vignettes in the pair are topped up equally. If A has 3 and B has 2 → existing = 2 → topUp = max(0, target − 2) for both.

### Where top-up logic lives
The top-up computation belongs in `launchDomainEvaluation` on the backend. The frontend passes `targetBatchCount` as a new optional argument. The backend:
1. Queries completed + inflight run counts per definition (grouped as pairs where applicable)
2. Computes `topUpCount = max(0, targetBatchCount − existingCount)` per group
3. For each group where `topUpCount > 0`, initiates `topUpCount` new, separate batch runs (one run per top-up unit)
4. Skips groups where `topUpCount == 0` (already at or above target)

The "batch" unit = 1 run. `samplesPerScenario` remains unchanged at its default value.

### New GraphQL argument
`startDomainEvaluation` gets a new optional `targetBatchCount: Int` argument. When null/absent, behavior is unchanged (each definition gets 1 batch).

### Frontend data for existing batch counts
The `DomainTrialsDashboard` needs existing batch counts per vignette to:
- Display "have X / launching Y" in TrialGridTable
- Compute accurate projected cost (only top-up batches)

The existing `DOMAIN_TRIALS_PLAN_QUERY` already returns vignette metadata. The backend `launchDomainEvaluation` handler will also return `topUpCountByDefinitionId` in its response so the confirmation modal can show accurate numbers. The frontend computes the display data from this response on the success path.

For the pre-launch grid preview, the `domainTrialsPlan` query will be extended to accept `targetBatchCount` and return per-vignette `existingBatchCount` and `topUpCount` in its vignette rows.

### Batch signature definition
A batch's signature is defined by the unique combination of: `models` (sorted), `temperature`, `samplesPerScenario`, and `scopeCategory`. Batches must match all of these to count as "existing" toward the target. This mirrors `runMatchesSignature` in `domain-coverage-utils.ts`.

### Input validation
The target batch count input must:
- Accept only positive integers ≥ 1
- Show an inline error message for invalid values (e.g. "Must be a whole number ≥ 1")
- Disable the launch button when the value is present but invalid

### Grid display states (when target mode active)
- `topUpCount > 0`: Show `X existing, launching Y`
- `topUpCount == 0` and `existing >= target`: Show `X existing (target met)`
- `existing > target` (over-coverage): Show `X existing (over target)`

---

## Files in Scope

**Backend:**
- `cloud/apps/api/src/graphql/mutations/domain.ts` — add `targetBatchCount` arg, add per-definition inflight+completed count query, skip/top-up loop logic
- `cloud/apps/api/src/graphql/queries/domain.ts` — extend `domainTrialsPlan` to accept `targetBatchCount` and return `existingBatchCount` + `topUpCount` per vignette (or add a new field to the existing `DomainTrialPlan` type)

**Frontend:**
- `cloud/apps/web/src/api/operations/domains.ts` — add `targetBatchCount` to mutation variables and GQL string; update `DOMAIN_TRIALS_PLAN_QUERY` to include existing count fields
- `cloud/apps/web/src/components/domains/domainTrials/LaunchControlsPanel.tsx` — new target batch count input with validation
- `cloud/apps/web/src/components/domains/domainTrials/TrialGridTable.tsx` — show existing count when target active
- `cloud/apps/web/src/components/domains/domainTrials/LaunchConfirmModal.tsx` — show target count
- `cloud/apps/web/src/pages/DomainTrialsDashboard.tsx` — wire target batch count state through; pass existing counts to grid

---

## Risks

1. **Over-launching**: If two users click "launch" simultaneously at the same target, they could double-launch. The existing `hasActiveEquivalentRun` guard already prevents identical active runs from being duplicated; the top-up logic also re-checks inflight counts at query time, so this risk is low but noted.

2. **LaunchConfirmModal prop change**: This component may have tests that need updating — check before shipping.

3. **Domain mutations file is already 1103 lines** (exceeds 400-line soft limit). New top-up query must be minimal and extracted cleanly.

---

## Non-Goals / Explicitly Not Changing

- `groupDefinitionsByPairKey` function — reuse verbatim
- Budget cap logic — still applies on top of target logic
- `StartPairedBatchPage`
- `DomainCoverage.tsx`
