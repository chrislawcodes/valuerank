---
reviewer: "gemini"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/feature-workflow-discovery-shaping/plan.md"
artifact_sha256: "3ab646a54a85269378ab2bdcbc0e751b03773aeb35771ab86fb8de476685ecc3"
repo_root: "."
git_head_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted after defining a single normalized discovery item identity, keeping all gates on one helper, and using discover --clear only for malformed or irrecoverable state."
raw_output_path: "docs/feature-runs/feature-workflow-discovery-shaping/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

1.  **Race Conditions in State Management:** The plan relies on "atomic JSON writes" but fails to address read-modify-write race conditions. Multiple concurrent commands (e.g., `discover --resolve`, `discover --defer`, checkpointing) could read the same `state.json`, leading to one process overwriting the changes of another. This architecture is missing a necessary file-based locking mechanism to ensure safe, sequential state modifications.

2.  **Undefined Normalization:** The entire enforcement model hinges on "normalized item text" as a canonical identifier, yet the plan never defines the normalization rules. This ambiguity is a critical flaw. It leaves the system vulnerable to inconsistencies from whitespace, case sensitivity, or special characters, potentially allowing blocking items to be bypassed or making valid items impossible to resolve.

3.  **Destructive and Incomplete Recovery Path:** The designated "break-glass" recovery path, `discover --clear`, is excessively destructive. It offers no targeted way to remove a single malformed or erroneous entry, forcing users to wipe all discovery history to fix one mistake. Furthermore, the plan omits a mechanism to reverse a `discover --defer` operation, making deferrals effectively permanent and leaving `discover --clear` as the only, damaging, recourse for a simple user error.

4.  **Brittle "Grandfathering" Logic:** The strategy for handling legacy discovery blobs is fragile. By keying off the mere presence of an `unresolved[]` array, the system is susceptible to misinterpretation. A new tool interacting with an old state file could add an empty `unresolved: []` key, incorrectly promoting the state to the "new" format and potentially blocking a previously valid workflow. This creates a sharp, unforgiving boundary instead of a robust transition path.

## Residual Risks

1.  **Unforeseen Cross-Component Impact:** The plan modifies a shared helper, `factory_state.py`, but only considers its impact on the `discover`, `status`, and checkpointing commands. It assumes no other components consume this part of `state.json`. Any other tool or process that reads this state may fail or behave unexpectedly after the change, as its interactions have not been accounted for.

2.  **Inflexible Enforcement Model:** The plan implements a rigid, binary block/no-block system. It assumes all unresolved discovery items have equal, critical severity. This precludes future nuance, such as different levels of blockers (e.g., warnings vs. hard stops), making the architecture less adaptable to more complex workflow requirements down the line.

3.  **Lack of State Validation:** The plan does not specify a schema or validation mechanism for `state.json`. Without it, a malformed entry (e.g., a typo in a key, an incorrect data type) written by a buggy tool or manual edit could crash the runner entirely, rather than being gracefully handled as an invalid entry.

## Token Stats

- total_input=1219
- total_output=607
- total_tokens=14604
- `gemini-2.5-pro`: input=1219, output=607, total=14604

## Resolution
- status: accepted
- note: Accepted after defining a single normalized discovery item identity, keeping all gates on one helper, and using discover --clear only for malformed or irrecoverable state.
