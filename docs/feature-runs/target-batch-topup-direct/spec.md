# Feature Spec: Top-up to Target Batch Count on Domain Evaluation

## Summary

Add a "target batch count" mode to the Domain Evaluation launch flow. Instead of always launching exactly 1 new batch per vignette, the user specifies a target total (e.g. 5), and the system computes per-vignette top-up counts and launches only the delta needed.

---

## User Stories (prioritized)

### US-1 (P0): Set target batch count
**As a** researcher launching domain evaluations,
**I want to** specify a target number of completed batches per vignette,
**so that** I only launch the exact number of additional batches needed to reach my goal.

**Acceptance criteria:**
- LaunchControlsPanel shows a "Target batch count" number input (optional; default = off = 1-batch mode)
- When target = N, each vignette's top-up count = max(0, N - existingCount)
- existingCount = completed runs + in-flight runs (PENDING/RUNNING/SUMMARIZING/PAUSED) with matching signature
- For paired vignettes (A+B), existingCount = min(existingA, existingB); both top up by the same delta
- Vignettes already at or above target are skipped (top-up = 0)
- The per-vignette "batches to launch" column in TrialGridTable updates to show "X existing / Y needed"

### US-2 (P0): Grid shows existing batch count
**As a** researcher reviewing the launch plan,
**I want** TrialGridTable to show how many batches already exist per vignette,
**so that** I can verify the top-up plan before confirming.

**Acceptance criteria:**
- TrialGridTable receives per-vignette `existingBatchCount` (completed + in-flight at this temperature/scope)
- When target mode is active, the existing "Batches" column shows "X existing / Y to launch (target N)" format
- When target mode is off, existing behavior is preserved (Batches column shows model count)

### US-3 (P1): Backend enforces top-up counts
**As a** backend service,
**I want** startDomainEvaluation to accept `targetBatchCount` and compute per-vignette deltas server-side,
**so that** the correct number of runs is started regardless of race conditions between UI query and launch.

**Acceptance criteria:**
- New optional arg `targetBatchCount: Int` on `startDomainEvaluation` mutation
- When provided, backend queries completed + in-flight runs per vignette (matching signature)
- For paired groups: compute pair-level min, top up both sides by the same delta
- "Top-up delta" = number of additional *runs* (batches) to launch; each run already handles `samplesPerScenario` conditions internally
- Skip vignettes where delta = 0
- The existing active-run duplicate guard remains unchanged
- Budget cap still applies on top of target logic

### US-4 (P1): UI passes targetBatchCount to mutation
**As a** frontend,
**I want** DomainTrialsDashboard to pass `targetBatchCount` when the user has enabled target mode,
**so that** the mutation enforces the right count.

**Acceptance criteria:**
- When target input is a valid integer >= 1, the mutation variable `targetBatchCount` is set
- When target mode is off, `targetBatchCount` is omitted (undefined)
- The confirm modal shows the target count (e.g. "Target: 5 batches per vignette")

---

## What is NOT in scope

- Changing `groupDefinitionsByPairKey` logic
- Changing budget cap logic
- Changing `StartPairedBatchPage`
- Changing `DomainCoverage.tsx`
- CLAUDE.md, AGENTS.md, MEMORY.md, .gitignore, or any file not listed in scope

---

## Signature Matching

"Matching signature" for counting existing batches means:
- Same `definitionId` (i.e., latest version in the lineage)
- Same `runCategory` (scopeCategory)
- Run config `temperature` matches the current launch temperature

**Note:** Model set is NOT part of the signature match for top-up counting. The goal is "N batches for this vignette at this temperature" regardless of which models were used. This differs from the `hasActiveEquivalentRun` duplicate-guard (which does match on model set). The top-up counter uses a looser match intentionally: count all runs for this vignette at this temperature/scope.

Specifically, the `formatRunSignature` / `runMatchesSignature` helpers from `domain/planning.ts` encode this: they check definitionVersion + temperature only.

---

## Edge Cases

| Case | Behavior |
|------|----------|
| targetBatchCount = null/0/undefined | Existing behavior (1 batch per vignette) |
| Vignette already at target | Skipped (delta = 0), not counted toward startedRuns |
| Paired vignette: A=3, B=2, target=5 | min=2, both need 3 more; launches 3 A + 3 B |
| Paired vignette: A=5, B=5, target=5 | min=5, delta=0; pair is skipped |
| Budget cap + target mode | Budget evaluated after top-up count is computed; partial pair rejection applies as before |
| targetBatchCount < 0 | Treated as undefined (no-op, fallback to 1-batch mode) |
