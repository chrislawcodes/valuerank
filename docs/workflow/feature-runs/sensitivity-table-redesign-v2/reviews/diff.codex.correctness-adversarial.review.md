---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign-v2/reviews/implementation.diff.patch"
artifact_sha256: "5110e22f8e30e8a0cb731f6cea64c94b8ba5b3f5fffec20bcb4bd42629579845"
repo_root: "."
git_head_sha: "4c90615ad63ca86a30ebf33722251fe2f98235da"
git_base_ref: "origin/main"
git_base_sha: "4e5839c03cf40e17c19de8b044e840b7447457b0"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH (unreachable exclusion buckets) accepted as defense-in-depth; MEDIUM (surviving pool rate dropped) fixed in Slice A amendment; LOW findings noted."
raw_output_path: ""
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

- **HIGH** [CODE-CONFIRMED] `pressureConditionExclusionBreakdown.sourceRunMapping` and `.definitionMetadata` are structurally unreachable at runtime. `buildSourceRunToDefIdMap()` only adds entries for runs where `definitionMeta.has(defId)` is true. Transcripts are then fetched exclusively from `sourceRunToDefId.keys()`. So in the transcript loop (`pressure-sensitivity.ts` lines ~454–154), `sourceRunToDefId.get(tx.runId)` can never return null and `definitionMeta.get(defId)` can never return null for any fetched transcript. Both buckets will always be zero in production. More importantly, runs dropped upstream by `buildSourceRunToDefIdMap` (because their definition isn't in `definitionMeta`) are not counted by any bucket — meaning the total `pressureConditionExcludedCount` undercounts real exclusions for those runs. This contradicts FR-031c's intent and makes SC-010's required tests for `sourceRunMapping`/`definitionMetadata` meaningless except as defense-in-depth for data bugs.

- **MEDIUM** [CODE-CONFIRMED] In `pooledDirectionalReduction()` (aggregation.ts), the `thin` guard sets `pushTowardFirstRate: null` and `pushTowardSecondRate: null` even when only one pool is thin and the other has data. For the `'directional-thin'` case (mirror pool has data, directional pool is empty), `pushTowardSecondRate` could be computed but is discarded. For the `'inverted-thin'` case, `pushTowardFirstRate` could be computed but is discarded. The spec does not explicitly require nulling both rates when only one pool is thin; if the UI is expected to show the surviving pool's rate separately, this silently drops it.

- **LOW** [CODE-CONFIRMED] In `value-pair.ts`, `assignOwnOpponent` renames the local variable from `valueFirstIsOwn` to `valueFirstIsFirst`, but the return values remain `'own_picked'` and `'opponent_picked'`. These return values propagate to `buildCellMetrics` and the cell grid where `ownLevel`/`opponentLevel` still use the old naming convention. The rename is partial and internally inconsistent, though TypeScript keeps it type-safe. No runtime error, but could confuse future readers.

- **LOW** [CODE-CONFIRMED] In `aggregation.ts`, `summarizePressureResponse` uses a simple arithmetic mean instead of the t-based `tBasedMeanCI` used by the old `summarizeWinRateDeltas`. This is correct per FR-005 (equal-weight mean), but the loss of per-model confidence intervals means the summary no longer bounds the mean estimate. The spec explicitly chose equal-weight mean; this is noted as residual risk, not a defect.

## Residual Risks

- Type consistency between `PressureResponseReason` in `aggregation.ts` and the `reason` field in `types/pressure-sensitivity.ts` is enforced by TypeScript. API build passed, so these are aligned.
- The web GraphQL schema diff removes `WinRateDelta` and `WinRateDeltaSummary` types. Any web operation still requesting those fields will break. Slice B must update the operation before the schema deployment.
- The schema change from `excludedScenariosCount` to `pressureConditionExcludedCount` is a breaking rename. No backwards compatibility shim. Existing consumers outside this repo must be updated.

## Resolution
- status: accepted
- note: HIGH (unreachable exclusion buckets) accepted as defense-in-depth; MEDIUM (surviving pool rate dropped) fixed in Slice A amendment; LOW findings noted.
