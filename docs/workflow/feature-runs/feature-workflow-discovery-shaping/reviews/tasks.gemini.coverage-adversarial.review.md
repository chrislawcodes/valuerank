---
reviewer: "gemini"
lens: "coverage-adversarial"
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
raw_output_path: "docs/workflow/feature-runs/feature-workflow-discovery-shaping/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

1.  **Identity Collision Vulnerability:** The plan defines item identity as "normalized item text" but fails to specify the normalization logic (e.g., case, whitespace, punctuation). More critically, the verification matrix includes no tests for identity collisions. If two distinct items normalize to the same string, resolving one could unintentionally resolve the other, leading to missed requirements or defects. This is the most severe flaw in the plan.
2.  **Untested Destructive Escape Hatch:** The plan notes that `discover --clear` is an escape hatch for "irrecoverable" state but provides zero verification for it. Its behavior is undefined and untested. This creates a high risk of misuse, allowing the entire enforcement gate to be bypassed without guardrails, audit trails, or confirmation.
3.  **Incomplete State Transition Coverage:** The verification matrix only covers transitions from `unresolved` to `resolved` or `deferred`. It completely omits tests for invalid or redundant state transitions, such as attempting to resolve an already-resolved item, deferring a deferred item, or resolving a deferred item. This leaves the state machine's robustness unverified.
4.  **Misplaced Verification Suite:** The specified test file, `test_run_factory_repair.py`, appears unrelated to the core commands being modified (`discover`, `status`, `checkpoint`). Placing the primary verification for a new enforcement gate in a "repair" utility's test suite is illogical and suggests a potential misunderstanding of the codebase's testing structure. This will make the tests difficult to maintain and discover.

## Residual Risks

1.  **State Corruption via Race Conditions:** The plan relies on a "pure helper" but doesn't address the persistence layer where discovery state is stored. Without concurrency controls or transactionality, simultaneous operations by different agents (e.g., two agents running `discover --resolve` on different items) could lead to race conditions that corrupt the state file, causing lost updates or an inconsistent state.
2.  **Incomplete Enforcement Scope:** The gate is only specified for `checkpoint --stage spec`. If discovery items can be generated or are relevant at other stages (e.g., planning, implementation), this enforcement point is too narrow. Unresolved issues could still leak past the spec stage and infect later parts of the development process.
3.  **Workflow Deadlocks:** The binary `unresolved` (blocking) vs. `deferred` (debt) model creates a risk of "unwinnable" states. If a discovery item proves to be impossible or undesirable to implement, the only way out is the destructive `--clear` command. The lack of a less-drastic "won't fix" or "obsolete" state forces a choice between carrying perpetual debt or wiping the slate clean, both of which are undesirable.

## Token Stats

- total_input=1054
- total_output=584
- total_tokens=15236
- `gemini-2.5-pro`: input=1054, output=584, total=15236

## Resolution
- status: accepted
- note: Accepted after tightening the verification matrix to cover discover, status, checkpoint gating, next-action, and the canonical blocking helper; discover --clear remains the break-glass recovery path.
