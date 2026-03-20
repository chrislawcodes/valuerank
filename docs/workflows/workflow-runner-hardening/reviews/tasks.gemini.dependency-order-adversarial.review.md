---
reviewer: "gemini"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflows/workflow-runner-hardening/tasks.md"
artifact_sha256: "a27116d7fdcf8d298511038c9ac6e0ee5de9ac6a1b643cbae8ad3040c6b2e116"
repo_root: "."
git_head_sha: "c526eec446cdaf814b7c52e69e385dd4fe47894f"
git_base_ref: "origin/main"
git_base_sha: "d5d05171abe1c55f411c5ca826872b49c50849cd"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "F1 (repaired appended optimistically): REJECTED — wrong reading; repaired.append is inside 'else' of 'if not refreshed[healthy]' so only fires when healthy. F2 (grep only run_feature_workflow.py): REJECTED — spec explicitly limits scope to this file. F3 (indirect base-ref test): REJECTED — behavioral correctness test is appropriate; direct call-with-None tests also exist."
raw_output_path: "docs/workflows/workflow-runner-hardening/reviews/tasks.gemini.dependency-order-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

1.  **(High Severity) Incorrect State in `command_repair`:** In Story 1 (T1.2), the proposed logic adds `"closeout"` to the `repaired` list optimistically, before the repair is fully validated. If the subsequent `if not refreshed["healthy"]:` check fails, the function blocks as intended, but it returns with a state where `"closeout"` is incorrectly listed as `repaired`. This provides a misleading success signal to any downstream consumer of the `repaired` list. The append should only happen *after* the `healthy` check passes.

2.  **(Medium Severity) Narrow Scope of Model Constant Refactoring:** In Story 3 (T3.3), the `grep` for hardcoded model names is scoped only to the `run_feature_workflow.py` file. The problem of magic strings for model names is unlikely to be confined to a single file. Other scripts or configuration files within the `docs/operations/codex-skills/feature-workflow/` directory could contain the same hardcoded values. The task as written risks creating a false sense of security by only partially eliminating the hardcoded strings, leading to inconsistent model usage across different entry points of the workflow.

3.  **(Low Severity) Brittle and Indirect Test in `BaseRefResetTests`:** In Story 2 (T2.3), the final test case (`test_reset_uses_recorded_base_not_stale_head`) does not directly test the specified change (`args.base_ref = None`). Instead, it tests the downstream consequences of that change within a separate, complex helper function (`preferred_diff_base_ref`). This couples the test to an unrelated implementation. If the logic of `preferred_diff_base_ref` changes in the future, this test could fail, even if the `base_ref` reset logic in `command_checkpoint` remains correct. The test suite is missing a simpler, more direct test that asserts `args.base_ref` is `None` after the reset branches are taken.

## Residual Risks

1.  **Flawed Workflow Resumption:** The incorrect state from Finding #1 could cause a calling process to believe the `closeout` stage is fixed when it is not. This could lead it to incorrectly attempt to proceed in a workflow that should remain blocked, potentially causing data corruption or failed execution in a later step that depends on a healthy `closeout` artifact.

2.  **Inconsistent System Behavior:** Due to the narrow scope in Finding #2, the system's behavior may become dependent on which script is executed. Running `run_feature_workflow.py` might use the new `DEFAULT_CODEX_MODEL`, while another forgotten script could still be using the old hardcoded `gpt-5.4-mini`, leading to subtle, hard-to-debug inconsistencies in output, performance, and cost.

3.  **Increased Test Maintenance Overhead:** The indirect test design in Finding #3 makes the test suite more brittle. Future refactoring of helper functions may trigger unrelated test failures, increasing the effort required to maintain and evolve the codebase and obscuring the true source of regressions.

## Token Stats

- total_input=2351
- total_output=668
- total_tokens=16561
- `gemini-2.5-pro`: input=2351, output=668, total=16561

## Resolution
- status: accepted
- note: F1 (repaired appended optimistically): REJECTED — wrong reading; repaired.append is inside 'else' of 'if not refreshed[healthy]' so only fires when healthy. F2 (grep only run_feature_workflow.py): REJECTED — spec explicitly limits scope to this file. F3 (indirect base-ref test): REJECTED — behavioral correctness test is appropriate; direct call-with-None tests also exist.
