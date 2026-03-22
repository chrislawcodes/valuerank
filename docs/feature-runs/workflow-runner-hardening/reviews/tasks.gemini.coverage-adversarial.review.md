---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflows/workflow-runner-hardening/tasks.md"
artifact_sha256: "cea5100faa6104cb9e92f8351172df7f74b6969eadb5a6cba495c2dc77dcc597"
repo_root: "."
git_head_sha: "e38b1c0df568c1a8c86cfafa9f505060741e65a5"
git_base_ref: "origin/main"
git_base_sha: "b44a76cad358741fabfa4776f45752606980d56a"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "F1 (unknown drift falls through): REJECTED — already rejected; elif-print correctly surfaces unknown states. F2 (missing test for if-not-blocked_reason guard): ACCEPTED — same as dep F2; test added. F3 (no negative test for non-reset happy path): REJECTED — out of scope for this fix. F4 (manual grep): REJECTED — repeated. F5 (no mypy/lint gate): REJECTED — out of scope."
raw_output_path: "docs/workflows/workflow-runner-hardening/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

1.  **High Severity:** The repair logic in Story 1 (T1.2) fails to block execution on unknown unhealthy states. The code explicitly checks for `unhealthy-manifest` to trigger a repair and prints a status for other known non-problematic states. However, if `closeout_drift` were to return a new, unexpected unhealthy state (e.g., `"unhealthy-artifact-corrupt"`), the logic would fall through, print a status line, and proceed without setting `blocked_reason`. This allows the workflow to continue from a known-bad but un-repaired state, risking downstream failures.

2.  **Medium Severity:** The test plan for Story 1 (T1.3) is incomplete. It does not include a test case to verify that the `if not blocked_reason:` guard works as intended. A test should be added where an earlier stage sets `blocked_reason`, and the test asserts that the closeout repair (`command_checkpoint`) is *not* attempted.

3.  **Medium Severity:** The test plan for Story 2 (T2.3) exclusively covers the reset-triggering paths. It lacks a negative test case to confirm that `args.base_ref` is *not* cleared when a reset is not warranted (the happy path). Without this, a future change could make the reset logic overly aggressive, and it would not be caught by the specified tests.

4.  **Low Severity:** The verification step for Story 3 (T3.3) relies on a manual `grep` for hardcoded model strings. This is error-prone, as it can miss variants (e.g., different quoting, dynamic string construction) and may not be exhaustive if new LLM providers are added. The corresponding tests in T3.4 only validate the constant's use in one specific function, they do not validate the absence of hardcoded strings elsewhere.

5.  **Low Severity:** The final quality checklist is insufficient. It specifies running `pytest` but omits other standard quality gates like static type checking (`mypy`) and linting. Modifying a complex script like `run_feature_workflow.py` without these checks introduces a risk of type-related runtime errors or code style regressions.

## Residual Risks

1.  **Silent State Corruption:** If a new type of unhealthy state for the `closeout` artifact is ever introduced, the system will fail open. The workflow will proceed with a corrupted closeout stage, potentially leading to incorrect commit finalization, failed pushes, or invalid state propagation without a clear, immediate error.

2.  **Incomplete Test Coverage:** The lack of negative test cases for Stories 1 and 2 means that the boundaries of the repair/reset logic are not fully secured. A future regression could cause the `closeout` repair to run when it shouldn't or the `base_ref` to be reset too eagerly, which would not be caught by the proposed test suite.

3.  **Technical Debt via Outdated Constants:** The reliance on a manual `grep` in Story 3 means there is a non-trivial risk that other hardcoded model names remain. This undermines the goal of centralization and creates hidden technical debt, requiring future developers to hunt for and refactor them later.

## Token Stats

- total_input=2432
- total_output=692
- total_tokens=17051
- `gemini-2.5-pro`: input=2432, output=692, total=17051

## Resolution
- status: accepted
- note: F1 (unknown drift falls through): REJECTED — already rejected; elif-print correctly surfaces unknown states. F2 (missing test for if-not-blocked_reason guard): ACCEPTED — same as dep F2; test added. F3 (no negative test for non-reset happy path): REJECTED — out of scope for this fix. F4 (manual grep): REJECTED — repeated. F5 (no mypy/lint gate): REJECTED — out of scope.
