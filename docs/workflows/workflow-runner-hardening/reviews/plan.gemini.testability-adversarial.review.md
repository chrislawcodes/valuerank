---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflows/workflow-runner-hardening/plan.md"
artifact_sha256: "5450ff7b0e93e369ccff3b05b6d9eb6d735205fae01006ff69c72d18bc501e8c"
repo_root: "."
git_head_sha: "c526eec446cdaf814b7c52e69e385dd4fe47894f"
git_base_ref: "origin/main"
git_base_sha: "d5d05171abe1c55f411c5ca826872b49c50849cd"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "F1 (no automated guardrail for hardcoded model strings): REJECTED — adding regex-based tests scanning source for model strings is beyond scope; the constant + test_default_codex_model_constant_exists is sufficient. F2 (Patch 3 assumption not tested): REJECTED — test_repair_skips_closeout_when_not_checkpointed already covers not-checkpointed; stub-artifact/missing-artifact follow same skip logic. F3 (Patch 2 base_ref already None edge): REJECTED — trivial; the outer guard 'if marker_count > 0 and not args.base_ref' means base_ref cannot be None when entering reset branches without user-supplied value."
raw_output_path: "docs/workflows/workflow-runner-hardening/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1.  **Patch 1 Test Scope Is Too Narrow:** The plan proposes adding a `DEFAULT_CODEX_MODEL` constant and replacing one hardcoded value in `required_reviews()` for the `"diff"` stage. The manual instruction to "Grep the entire file" is untestable and insufficient. The proposed tests only validate that the `"diff"` stage uses the constant. If other stages (e.g., `"plan"`, `"tasks"`) have hardcoded model strings, they will be missed by both the implementation and the tests, negating the benefit of the new constant.

2.  **Patch 3 Skip Logic Is Brittle:** The proposed `command_repair` logic for the closeout stage skips repair for a hardcoded list of drift states (`"not-checkpointed"`, `"missing-artifact"`, `"stub-artifact"`). This is a "blacklist" approach. If a new, non-repairable drift state is introduced in the future, this logic will fail open, silently skipping the stage and potentially reporting a successful repair incorrectly. A "whitelist" approach (explicitly handling only `unhealthy-manifest`) would be more robust.

3.  **Patch 2 Tests Verify Mocks, Not Outcomes:** The first three proposed tests for `BaseRefResetTests` (`test_index_overflow_clears_base_ref`, etc.) verify that a mock (`preferred_diff_base_ref`) is called with `None`. This is a test of implementation detail. These tests would be significantly stronger if they followed the pattern of the fourth test: initialize `args.base_ref` with a stale SHA, trigger the reset condition, and assert that the *final calculated base ref* is the correct one from the diff metadata, not the initial stale one.

4.  **Patch 3 Test Plan Misses a Failure Case:** The implementation correctly handles the case where `command_checkpoint` returns a success code (`0`) but the manifest remains unhealthy. However, the test plan for `RepairCloseoutTests` does not include a test for this specific scenario. Without a dedicated test, this important check could be broken by a future regression.

## Residual Risks

1.  **Mock Drift in Base-Ref Tests:** The tests for Patch 2 rely heavily on mocking core workflow components like `parse_checkpoint_markers` and `update_workflow_state`. If the behavior or return contracts of these real functions change, the tests may continue to pass while the actual `command_checkpoint` function breaks, as the mocks will not have been updated to reflect the new reality.

2.  **Coupling of Repair and Recommendation Logic:** The rationale for Patch 3 notes that certain drift states are "not reachable via the repair flow" because the `recommended_next_action` function that triggers `repair` doesn't produce them. This creates a tight, implicit coupling between the two functions. If `recommended_next_action` is changed in the future to recommend repair for a `missing-artifact`, the `command_repair` function will silently fail to perform the action, as it's designed to skip that state.

## Token Stats

- total_input=2539
- total_output=658
- total_tokens=16529
- `gemini-2.5-pro`: input=2539, output=658, total=16529

## Resolution
- status: accepted
- note: F1 (no automated guardrail for hardcoded model strings): REJECTED — adding regex-based tests scanning source for model strings is beyond scope; the constant + test_default_codex_model_constant_exists is sufficient. F2 (Patch 3 assumption not tested): REJECTED — test_repair_skips_closeout_when_not_checkpointed already covers not-checkpointed; stub-artifact/missing-artifact follow same skip logic. F3 (Patch 2 base_ref already None edge): REJECTED — trivial; the outer guard 'if marker_count > 0 and not args.base_ref' means base_ref cannot be None when entering reset branches without user-supplied value.
