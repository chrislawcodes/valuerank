---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign/tasks.md"
artifact_sha256: "795c180d4cdf013269b43fb492d28a10bb30496a153e4baf1e7e8091d29fc5cf"
repo_root: "."
git_head_sha: "037325feb2617aa96b68cfb204a023144a68c88a"
git_base_ref: "origin/main"
git_base_sha: "4772ae79f8e1580ee31c0f10f32e6d86a842ef68"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "MEDIUM (Incomplete Backend Cleanup) RESOLVED. Task A4 now explicitly deletes applyBandReduction, computeBaselineWinRate, and the orphaned types DeltaTriplet, BaselineWinRate, AggregateSensitivity. MEDIUM (Incomplete GraphQL Type Definition Cleanup) RESOLVED. Task A4 also deletes the orphaned Pothos refs BandStatRef, BaselineWinRateRef, AggregateSensitivityRef. (Ambiguous pairsPositive Threshold) RESOLVED via boundary fixture in resolver tests at values 0.019, 0.021, 0.05 expecting count of 2."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "partial"
coverage_note: "context exceeded max_context_chars and was narrowed"
---

# Review: tasks coverage-adversarial

## Findings

### HIGH

- **Incomplete Backend Cleanup Specified**
  The task list does not ensure the full removal of obsolete logic and types from the backend aggregation module. Task `A4` specifies replacing `applyBandReduction` and removing `computeBaselineWinRate`, but is not explicit about deleting the functions themselves or their associated, now-orphaned, data structures. This creates a risk of future developers re-using incorrect or deprecated business logic primitives.
  - **Evidence:** `[CODE-CONFIRMED]`
    - In `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts`, the types `DeltaTriplet`, `BaselineWinRate`, and `AggregateSensitivity` are defined for and used exclusively by the functions `applyBandReduction`, `computeBaselineWinRate`, and `aggregateSensitivity`.
    - Per spec `FR-014` and plan `Decision 4`, these concepts are being removed entirely. The tasks remove the *fields* from the output, but do not explicitly mandate the removal of the underlying type definitions from `aggregation.ts`, leaving them as dead, misleading code. Task `A4` only says `applyBandReduction` "may be deleted".

### MEDIUM

- **Incomplete GraphQL Type Definition Cleanup**
  Task `A5` requires removing deprecated fields from the Pothos schema, but it omits the removal of the now-unused Pothos object type definitions that support those fields. Leaving these orphaned types in the schema definition file (`pressure-sensitivity.ts`) constitutes dead code, increases schema complexity, and can cause confusion for future development.
  - **Evidence:** `[CODE-CONFIRMED]`
    - In `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts`, the Pothos refs `BandStatRef`, `BaselineWinRateRef`, and `AggregateSensitivityRef` are defined.
    - These refs are used to build the GraphQL types for the fields `directionDelta`, `convictionDelta`, `netScoreDelta`, `baselineWinRate`, and `aggregateSensitivity`.
    - Task `A5` and spec `FR-014` mandate removing these fields. Once the fields are removed from the `PressureSensitivityValuePairRef` and `PressureSensitivityModelRef` types, the underlying `BandStatRef`, `BaselineWinRateRef`, and `AggregateSensitivityRef` definitions become orphaned. The task does not explicitly require their removal.

### LOW

- **Ambiguous Test Coverage for `pairsPositive` Threshold**
  While Task `A7` verifies that the `winRateDeltaSummary` object includes a `pairsPositive` count, it does not explicitly require a test case that confirms the `FLAT_DELTA_THRESHOLD` constant (relocated in Task `A4`) is being correctly applied. A robust test would involve a fixture with pair deltas just above and below the threshold (e.g., `0.019` and `0.021`) to verify the counter increments only for the value exceeding the threshold, confirming both the import and the `>` comparison logic.
  - **Evidence:** `[UNVERIFIED]`
    - The task list confirms the *shape* of the output will be tested, but does not specify a test scenario to verify the *behavior* of the `pairsPositive` counter against its explicit threshold. This represents a minor gap in test coverage specificity for a business rule.

## Residual Risks

The provided `tasks.md` artifact effectively translates the risks identified in `plan.md` into concrete verification tasks and automated tests. No new residual risks have been identified.

## Token Stats

- total_input=61580
- total_output=764
- total_tokens=83121
- `gemini-2.5-pro`: input=61580, output=764, total=83121

## Resolution
- status: accepted
- note: MEDIUM (Incomplete Backend Cleanup) RESOLVED. Task A4 now explicitly deletes applyBandReduction, computeBaselineWinRate, and the orphaned types DeltaTriplet, BaselineWinRate, AggregateSensitivity. MEDIUM (Incomplete GraphQL Type Definition Cleanup) RESOLVED. Task A4 also deletes the orphaned Pothos refs BandStatRef, BaselineWinRateRef, AggregateSensitivityRef. (Ambiguous pairsPositive Threshold) RESOLVED via boundary fixture in resolver tests at values 0.019, 0.021, 0.05 expecting count of 2.
