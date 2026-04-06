---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/feature-workflow-discovery-shaping/spec.md"
artifact_sha256: "5f3308948f7b5df77c76fcf11a4108f6b7736989715151ab9200a0a6032bbc5e"
repo_root: "."
git_head_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted after clarifying explicit deferral, grandfathered legacy discovery blobs, and discover --clear as the recovery path; remaining status summarization is deferred to a later slice."
raw_output_path: "docs/workflow/feature-runs/feature-workflow-discovery-shaping/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

| Severity | Finding |
| :--- | :--- |
| **High** | **Undefined Item Resolution Path:** The spec defines how to defer an unresolved item (`discover --defer`) but critically omits how an item is meant to be *resolved*. Without a clear `discover --resolve <item>` command or an equivalent mechanism, the entire enforcement loop is incomplete. Users can identify and defer problems, but there is no defined path to mark them as fixed, which is the primary goal of discovery. |
| **Medium** | **Ambiguous "Grandfathering" Logic:** The spec states legacy states are "grandfathered," but it doesn't define how a legacy state is identified. If the check is simply the absence of an `unresolved_items` key in `state.json`, a user could manually edit the file to remove the key, thereby bypassing the new enforcement on any state. This creates an exploitable loophole. |
| **Medium** | **Destructive "Break-Glass" with No Safeguard:** The `discover --clear` command is described as a "break-glass" recovery path. Such destructive actions should require explicit user confirmation (e.g., a `--force` flag or an interactive prompt) to prevent accidental erasure of a valid discovery state, including deferred debt. Furthermore, its exact scope is unclear: does it wipe only unresolved items or deferred ones as well? |
| **Low** | **Undefined State File Handling:** The spec does not describe behavior for cases where `state.json` is missing, corrupt, or unreadable. The system should fail gracefully with a clear error message (e.g., "Discovery state is corrupt. Run `discover --clear` to reset.") rather than crashing or implicitly assuming a valid empty state. |
| **Low** | **Inconsistent `--force-complete` Behavior:** The acceptance criteria specifies that `discover --complete` should fail even with `--force-complete`. Overriding the behavior of a generic "force" command is risky, as it violates the principle of least surprise. This could have unintended consequences if other parts of the system rely on this flag for its expected override behavior. |

## Residual Risks

| Risk | Mitigation |
| :--- | :--- |
| **Race Conditions:** A user or automated process could check the status, see it's clear, and then attempt a checkpoint. In the intervening moments, another process could add a new unresolved discovery item. If the check and the execution are not atomic, the checkpoint could succeed incorrectly. The implementation must ensure the state is re-validated at the moment of execution. |
| **Debt Accumulation through Deferral:** Because the path to "resolve" an item is not defined, users may be conditioned to use `discover --defer` as the only way to unblock themselves. This could lead to a culture of deferring all discovery items, causing a significant buildup of hidden technical or design debt that is never addressed. |

## Token Stats

- total_input=1043
- total_output=617
- total_tokens=14557
- `gemini-2.5-pro`: input=1043, output=617, total=14557

## Resolution
- status: accepted
- note: Accepted after clarifying explicit deferral, grandfathered legacy discovery blobs, and discover --clear as the recovery path; remaining status summarization is deferred to a later slice.
