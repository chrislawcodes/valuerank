---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflows/workflow-runner-hardening/plan.md"
artifact_sha256: "5450ff7b0e93e369ccff3b05b6d9eb6d735205fae01006ff69c72d18bc501e8c"
repo_root: "."
git_head_sha: "c526eec446cdaf814b7c52e69e385dd4fe47894f"
git_base_ref: "origin/main"
git_base_sha: "d5d05171abe1c55f411c5ca826872b49c50849cd"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "F1 (unhealthy-manifest not repairable): ACCEPTED — when closeout_drift==unhealthy-manifest but stage_repairable returns False, plan falls through to elif which just prints, never setting blocked_reason; repair returns success with broken closeout. Fix: add elif closeout_drift == unhealthy-manifest branch setting blocked_reason. F2 (args mutation): REJECTED — consistent with existing codebase pattern, bounded by function scope. F3 (grep sweep): REJECTED — implementer guidance, acceptable risk for targeted fix."
raw_output_path: "docs/workflows/workflow-runner-hardening/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- High: Patch 2 may not actually clear the stale base ref from persisted state. The plan mutates `args.base_ref` only after `update_workflow_state(...)`; if that helper snapshots `args` or writes the checkpoint before the mutation is observed, the bad value survives and the same wrong base can be restored on the next run. The plan needs to prove the persistence layer never sees the old ref, or clear it in the persisted state explicitly.
- Medium: Patch 3 relies on an unproven reachability assumption: that `command_repair` only ever sees closeout through the `recommended_next_action` path. If that assumption is wrong, `missing-artifact`, `stub-artifact`, and `not-checkpointed` will be silently skipped and the command can still report success while closeout remains broken. The plan should define behavior for those states instead of assuming they cannot occur.
- Medium: Patch 1 changes a model literal without validating consumer compatibility, and the proposed file-wide grep is too blunt. It can over-replace intentional literals or comments, and it still will not catch dynamically constructed model names. That makes the change both risky and likely incomplete unless the exact call sites and allowed model families are enumerated.

## Residual Risks

- The base-ref fix still depends on `recorded_base_ref` being accurate in the diff metadata; if that metadata is stale or malformed, the fallback can still choose the wrong ancestor.
- The new tests cover the targeted reset and closeout repair paths, but they do not prove the normal no-reset diff path or other `command_repair` stage interactions remain unchanged.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: F1 (unhealthy-manifest not repairable): ACCEPTED — when closeout_drift==unhealthy-manifest but stage_repairable returns False, plan falls through to elif which just prints, never setting blocked_reason; repair returns success with broken closeout. Fix: add elif closeout_drift == unhealthy-manifest branch setting blocked_reason. F2 (args mutation): REJECTED — consistent with existing codebase pattern, bounded by function scope. F3 (grep sweep): REJECTED — implementer guidance, acceptable risk for targeted fix.
