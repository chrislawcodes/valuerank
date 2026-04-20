---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/aggregate-consistency-data/spec.md"
artifact_sha256: "c4141e49974003afd222470b1c781346b2c56b69258c241629963e7834b52aa4"
repo_root: "."
git_head_sha: "8edda6e6bea3bf9235b54f8991650f5c8bf673f5"
git_base_ref: "origin/main"
git_base_sha: "8edda6e6bea3bf9235b54f8991650f5c8bf673f5"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/aggregate-consistency-data/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- High [CODE-CONFIRMED]: The spec assumes the new repeatability/coherence math can be derived from the existing aggregate payload, but the current worker only emits `favor_first_lean/strong`, `favor_second_lean/strong`, and `neutral` buckets and it drops `refusal`/`unknown` transcripts entirely. That means the spec’s canonical `strongly/somewhat/opponentSomewhat/opponentStrongly` counting model is not present in the current shape, so the claimed “no raw transcript re-examination” path is not actually supported by the code. See [variance.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/analysis/aggregate/variance.ts#L16) and [variance.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/analysis/aggregate/variance.ts#L173), plus [contracts.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/analysis/aggregate/contracts.ts#L49).

- High [CODE-CONFIRMED]: FR-008’s idempotency shortcut is too weak for the staged rollout the spec describes. The current consumer treats `perScenario` and `perPair` as separate parsed sections, so using `perScenario[...].matches` as the only “already upgraded” marker would make PR2 skip rows that were only upgraded for PR1. Those rows would never get the new `perPair` payload. See [modelsConsistencyData.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/consistency/modelsConsistencyData.ts#L57) and [modelsConsistencyData.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/consistency/modelsConsistencyData.ts#L122).

- Medium [CODE-CONFIRMED]: The spec uses `sd` as a preserved existing field, but the current aggregate contract and implementation use `stdDev` everywhere. A literal implementation of the spec would either rename a public field or introduce a second one, which conflicts with FR-003 and FR-011’s “no shape change” promise. See [variance.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/analysis/aggregate/variance.ts#L94) and [contracts.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/analysis/aggregate/contracts.ts#L49).

- Medium [CODE-CONFIRMED]: The “non-canonical condition labels” edge case will not survive the current parser path. `parsePairConditions` rejects any condition whose `netPressureRank` is null, so emitting `netPressureRank: null` will not render as an indeterminate condition; it will be dropped entirely. See [modelsConsistencyData.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/consistency/modelsConsistencyData.ts#L102) and [modelsConsistencyData.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/consistency/modelsConsistencyData.ts#L111).

- Medium [CODE-CONFIRMED]: The single-trial edge case is backwards relative to the current consumer behavior. `parseScenario` accepts any row with `trials > 0`, and `computeRepeatability` pools every parsed scenario. Omitting `sampleCount = 1` rows, as the spec requires, would change current coverage behavior rather than preserve it. See [modelsConsistencyData.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/consistency/modelsConsistencyData.ts#L70) and [modelsConsistencyData.ts](/Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/api/src/services/consistency/modelsConsistencyData.ts#L164).

## Residual Risks

- The spec still leaves `trials` ambiguous between `sampleCount` and pair count. That needs one canonical definition before implementation, or the repeatability CI math will be inconsistent.
- I could not verify the backfill CLI, DB supersede semantics, or the exact `reliabilitySummary` write path from the provided code, so those parts remain lower-confidence until the worker/CLI code is reviewed.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
