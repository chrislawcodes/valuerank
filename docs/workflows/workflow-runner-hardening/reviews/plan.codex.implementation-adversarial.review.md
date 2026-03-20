---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflows/workflow-runner-hardening/plan.md"
artifact_sha256: "385e6f25e4b1421e889a0627fcc8c4b297aa034af333f08aeec0f37d9505bb04"
repo_root: "."
git_head_sha: "e38b1c0df568c1a8c86cfafa9f505060741e65a5"
git_base_ref: "origin/main"
git_base_sha: "b44a76cad358741fabfa4776f45752606980d56a"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "F1 (update_workflow_state reads args.base_ref): REJECTED — update_workflow_state takes slug and lambda, doesn't accept or read args.base_ref. F2 (stages[closeout] might not exist): REJECTED — stages is populated by {stage: stage_manifest_state for stage in CHECKPOINT_STAGES} and CHECKPOINT_STAGES includes closeout, so always present. F3 (grep instruction too broad): REJECTED — already addressed; instruction says be conservative and not modify prompt text. F4 (partial-success test missing): ACCEPTED — same as gemini testability F2; test added."
raw_output_path: "docs/workflows/workflow-runner-hardening/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- High: In Patch 2, `args.base_ref = None` is set only after `update_workflow_state(...)`. If that helper reads or persists `args.base_ref` or the derived ref before the reset, the stale `recorded_head_sha` is still baked into state and the proposed fix does not actually remove the bad base selection.
- High: Patch 3 assumes `stages["closeout"]` always exists in `command_repair`. The new block adds an unconditional map lookup with no fallback, so any workflow variant that omits closeout from `stages` will raise instead of repairing or reporting a clean failure.
- Medium: Patch 1's "grep the entire file" instruction is too broad and under-specified. Rewriting every string that looks like a model name can accidentally touch fixtures, logging, or other provider defaults outside `required_reviews`, and the plan does not define a precise allowlist to prevent that.
- Medium: The closeout test plan misses the partial-success case where `command_checkpoint` returns `0` but the refreshed closeout manifest is still unhealthy. That is the exact failure mode the new block is meant to defend against, so the suite can still pass while shipping a broken repair path.

## Residual Risks

- The plan still depends on the exact semantics of `preferred_diff_base_ref` and `stage_drift_class`; if either treats missing metadata differently than assumed, the new branches may choose the wrong base or skip repair.
- There is no end-to-end coverage showing that the model constant change, base-ref reset, and closeout repair all work together in one workflow run, so interaction bugs can still slip through.
- If `codex-5.4-mini` is not accepted by the surrounding tooling or provider allowlist, Patch 1 will fail at runtime even if the code edits are syntactically correct.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: F1 (update_workflow_state reads args.base_ref): REJECTED — update_workflow_state takes slug and lambda, doesn't accept or read args.base_ref. F2 (stages[closeout] might not exist): REJECTED — stages is populated by {stage: stage_manifest_state for stage in CHECKPOINT_STAGES} and CHECKPOINT_STAGES includes closeout, so always present. F3 (grep instruction too broad): REJECTED — already addressed; instruction says be conservative and not modify prompt text. F4 (partial-success test missing): ACCEPTED — same as gemini testability F2; test added.
