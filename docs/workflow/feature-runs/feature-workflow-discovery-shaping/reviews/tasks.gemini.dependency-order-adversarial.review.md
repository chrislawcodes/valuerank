---
reviewer: "gemini"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/feature-workflow-discovery-shaping/tasks.md"
artifact_sha256: "2fb1aaf7c861ca27fe305cc48d8673e77f69a604e5cf45f53acb9282be29ebb8"
repo_root: "."
git_head_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted after tightening the verification matrix to cover discover, status, checkpoint gating, next-action, and the canonical blocking helper; discover --clear remains the break-glass recovery path."
raw_output_path: "docs/workflow/feature-runs/feature-workflow-discovery-shaping/reviews/tasks.gemini.dependency-order-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

1.  **Undefined "Normalization" Creates Ambiguity:** The plan hinges on "normalized item text" to uniquely identify discovery items for blocking and resolution. However, the specific normalization rules (e.g., case, whitespace, punctuation) are not defined. This is a critical flaw, as different commands (`discover`, `status`, `checkpoint`) could implement normalization differently, leading to a state where an item is considered "resolved" by one command but still "blocking" by another. The verification matrix lacks a test case for a near-duplicate item that *should* be resolved by a single action (e.g., "Fix the typo" vs. "fix the typo.").

2.  **Unstated Dependency on a "Repair" Workflow:** The verification matrix points to a test file named `test_run_factory_repair.py`. This implies that resolving a discovery item may trigger a secondary, more complex "repair" workflow that is not described in the scope. This creates a significant blind spot. If this repair workflow fails, the discovery item may not be correctly resolved, even if the `discover` command appears to succeed, leading to confusing and persistent blockers.

3.  **No Handling for Duplicate Items:** The plan does not specify how the system should behave if the exact same discovery item is created multiple times. If a user adds two identical unresolved items, will resolving one clear both? The concept of a "canonical item identity" implies it should, but this behavior is not explicitly defined or tested for, creating a potential source of user friction.

4.  **Assumed Atomic State Transitions:** The plan doesn't address the risk of race conditions or partial writes when modifying the discovery state on disk. If a command fails mid-operation after reading the state but before writing the changes, or if two commands run concurrently, the state file could be corrupted. This could force a user to perform a destructive reset (`discover --clear`).

## Residual Risks

1.  **Permanent Blockers from Inconsistent State:** The highest-severity risk is that a user could encounter a blocker that is impossible to clear. This could happen if the normalization logic is inconsistent across tools or if the unstated "repair" dependency fails silently, leaving the system in a state where a discovery item is marked resolved in one context but remains a blocker in another, preventing any future `checkpoint`.

2.  **State Corruption Requires Manual Intervention:** Without guaranteeing atomic file writes, there is a risk that the discovery state file becomes corrupted. This would break all dependent commands (`discover`, `status`, `checkpoint`) and force the user to manually delete or clear the state, losing any existing resolved or deferred items.

3.  **Weak Assumption on `--force-complete`:** The plan tests that `--force-complete` on the `discover` command doesn't bypass unresolved blockers. This is good, but it assumes this is the only escalation path. A key adversarial question is whether a similar force flag exists on `checkpoint` itself. If `checkpoint --force` is allowed to bypass this gate, the entire enforcement mechanism is undermined. The scope is limited to discovery enforcement, but its interaction with other commands' escalations is a weak point.

## Token Stats

- total_input=1056
- total_output=661
- total_tokens=14866
- `gemini-2.5-pro`: input=1056, output=661, total=14866

## Resolution
- status: accepted
- note: Accepted after tightening the verification matrix to cover discover, status, checkpoint gating, next-action, and the canonical blocking helper; discover --clear remains the break-glass recovery path.
