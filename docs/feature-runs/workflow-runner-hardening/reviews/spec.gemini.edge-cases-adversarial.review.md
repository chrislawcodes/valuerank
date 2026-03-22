---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflows/workflow-runner-hardening/spec.md"
artifact_sha256: "802b0426b15ab95e912bc996b13cf0adf3f4178da04e1eb0e6421c89ad63fe6f"
repo_root: "."
git_head_sha: "c526eec446cdaf814b7c52e69e385dd4fe47894f"
git_base_ref: "origin/main"
git_base_sha: "d5d05171abe1c55f411c5ca826872b49c50849cd"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "F1 (closeout loop trap): REJECTED — no loop possible. recommended_next_action returns 'closeout' when artifact is missing, and 'repair_closeout_checkpoint' only when manifest exists but is unhealthy. The repair command correctly skips missing-artifact since that code path is unreachable via repair_closeout_checkpoint. Spec now documents this reasoning. F2 (base-ref assumption): ACCEPTED — added behavioral test requirement for the base-ref verification. F3 (narrow model fix): ACCEPTED — added scan step for other hardcoded model strings."
raw_output_path: "docs/workflows/workflow-runner-hardening/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

1.  **(High) Incomplete Repair Logic for Closeout Stage:** The proposed fix for Story #1 directs `command_repair` to re-run the closeout checkpoint if its manifest is stale. However, the spec makes a weak assumption that this repair action will always succeed. It omits the failure case: if re-running the closeout checkpoint fails, the workflow will likely be stuck in a repair loop, as `recommended_next_action` will continue to return `"repair_closeout_checkpoint"`, leaving the user with no path forward.

2.  **(Medium) Brittle Reliance on Diff Metadata After Reset:** The fix in Story #2 correctly prevents a stale `recorded_head_sha` from being used after a reset. However, it falls back to using the `recorded_base_ref` from the diff's metadata. This assumes the metadata's base reference is still valid. In scenarios involving more complex history rewrites (e.g., rebasing a feature branch onto a different base), this `recorded_base_ref` could itself be stale or incorrect, leading the diff to be generated against a wrong but different base. The fix reduces the likelihood of error but doesn't eliminate it in adversarial git scenarios.

3.  **(Low) Manual Search for Hardcoded Values is Fallible:** The fix in Story #3 to replace a hardcoded model name is correct, but the instruction to "Search the entire file" for other instances is a weak guarantee of correctness. This manual process is error-prone and, more importantly, the same hardcoded string could exist in files outside the stated scope of this fix (`run_feature_workflow.py`), which would be missed. The root issue of hardcoded, project-specific values is not fully addressed.

## Residual Risks

1.  **State Corruption from Concurrency:** The spec explicitly defers file locking on `workflow.json`. This remains the most significant risk. Concurrent execution by different agents or processes could lead to race conditions when reading and writing workflow state, checkpoint manifests, and other artifacts, potentially corrupting the workflow's state file beyond the narrow scope of what the `command_repair` function is designed to fix.

2.  **Unaddressed Git History Brittleness:** The fix in Story #2 addresses a single symptom of git history being rewritten (a dangling commit SHA). The underlying system may still be brittle to other consequences of `git rebase` or `git commit --amend`. For example, other state or SHAs cached in `workflow.json` could become invalid, leading to subtle bugs that are not detected by the existing checkpointing and repair mechanisms. The piecemeal approach to hardening against git history manipulation suggests other, undiscovered edge cases likely exist.

## Token Stats

- total_input=2458
- total_output=574
- total_tokens=16543
- `gemini-2.5-pro`: input=2458, output=574, total=16543

## Resolution
- status: accepted
- note: F1 (closeout loop trap): REJECTED — no loop possible. recommended_next_action returns 'closeout' when artifact is missing, and 'repair_closeout_checkpoint' only when manifest exists but is unhealthy. The repair command correctly skips missing-artifact since that code path is unreachable via repair_closeout_checkpoint. Spec now documents this reasoning. F2 (base-ref assumption): ACCEPTED — added behavioral test requirement for the base-ref verification. F3 (narrow model fix): ACCEPTED — added scan step for other hardcoded model strings.
