---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ff-token-reliability/plan.md"
artifact_sha256: "1df68a0d20ab0e13108f6e90d5ccb0b98889f352c1aa1f2cd97b3b4639b2afc2"
repo_root: "."
git_head_sha: "be8143e7c054fe5971f8dc54db54f78cb85f6cb2"
git_base_ref: "origin/main"
git_base_sha: "be8143e7c054fe5971f8dc54db54f78cb85f6cb2"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/ff-token-reliability/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Evidence Tag |
| --- | --- | --- |
| HIGH | The test for "self-documenting errors" is insufficient, verifying only the presence of help text, not its functionality. The plan states tests will "grep the message text for the flag string." This only confirms the error message is displayed, not that the suggested flag correctly bypasses the error. A robust test would trigger the error, confirm the message, and then re-run the command with the specified flag to assert that the error is resolved. | [UNVERIFIED] |
| HIGH | The test plan for the auto-commit feature in `dispatch_codex` omits a critical failure case. The implementation plan details behavior for a commit failure (FR-005: "still append the dispatch record; exit 1; print git error"). However, the test plan for `test_dispatch_codex.py` does not include a case to simulate a `git commit` failure and verify this specific recovery behavior. This leaves a key error-handling path untested. | [UNVERIFIED] |
| MEDIUM | The CI implementation plan for `feature-factory-tests` deviates from the repository's established pattern of conditional execution based on path changes. The plan states the new job runs "unconditionally," while the provided `ci.yml` shows that both the `web-tests` and `api-tests` jobs are conditionally executed based on path filters defined in the `changes` job. This unconditional execution adds a small but constant overhead to all builds, creating a risk that the job will be disabled in the future for performance reasons, thus losing its testability benefits. | [CODE-CONFIRMED] |
| LOW | The test plan for parsing `review.md` files in `test_review_extract.py` may not account for complex edge cases. The plan mentions skipping lines inside ` ``` ` blocks by "tracking fence-depth." This is a good start, but adversarial cases like nested code fences, or a `## Findings` header appearing inside a code block, could fool a simple depth counter. The test suite should include checks for these non-standard but possible structures to ensure the extractor is robust. | [UNVERIFIED] |

## Residual Risks

The following risks are related to testability but may be outside the scope of unit testing. They represent gaps where the testing strategy could fail due to environmental assumptions.

1.  **Environmental Brittleness:** The test plan does not account for failures in the underlying environment. For example, the `check_workflow_isolation.py` script requires write access to `/tmp/`, and the `dispatch_codex` auto-commit feature assumes `git` is installed and configured correctly (e.g., user email is set). An environment where these assumptions fail could lead to untestable conditions not covered by the current plan.
2.  **External Dependency Flakiness:** The test for the TTL warning relies on patching `time.perf_counter`. While this is the correct approach for unit testing, it doesn't test how the real-world command timing might be affected by system load, I/O latency, or other processes, which could cause the 270-second threshold to be crossed unexpectedly. This is an inherent limitation of the test environment.

## Token Stats

- total_input=5050
- total_output=694
- total_tokens=19823
- `gemini-2.5-pro`: input=5050, output=694, total=19823

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
