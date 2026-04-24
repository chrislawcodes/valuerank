---
reviewer: "gemini"
lens: "quality-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/implementation.diff.patch"
artifact_sha256: "132c64c0ca7f787053b67da38dfc7c89e02d81e31adfdfeb94a9106408e57a06"
repo_root: "."
git_head_sha: "b4a15a9fb0cba0243fc33620c50b106b0b8970e9"
git_base_ref: "424c0605"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings. 2 LOW residual risks documented (fenced code false-positive, duplicated _concern_id — accepted limitations)."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/diff.gemini.quality-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff quality-adversarial

## Findings

### HIGH: Robust fix for state-contradiction bug (`run-033`)

The patch introduces a multi-layered and robust fix for a critical bug where the workflow could enter an infinite loop due to a state contradiction. The fix is comprehensive:

1.  **State-First Updates:** In `factory_cmd_judge.py`, the judge's verdict (`judge_next_action`) is now written to the state *before* the system's `recommended_next_action` is calculated. This ensures the decision tree always operates on the most current data, directly addressing the root cause of the original bug.
2.  **Judge Verdict Precedence:** The decision tree in `factory_next_action.py` now correctly honors a judge panel's decision to "advance", treating the stage as complete even if the underlying artifact has drifted and is marked "unhealthy" (FR-001). This allows the workflow to progress as intended after minor, post-review edits.
3.  **Invariant Safety Net:** A new module, `factory_invariants.py`, introduces a powerful safety net. After every state-mutating command, it runs checks to detect contradictions, such as the exact one that caused the original bug (FR-010). If a contradiction is found, it logs a persistent warning to the state file and emits a loud warning to `stderr` without crashing the process.
4.  **Drift Annotation:** When the system advances a stage with a drifted artifact (an "unhealthy" but judge-approved stage), it now records an explicit `advance-with-drift` annotation (`factory_stages.py`). This maintains a clear audit trail of why the drift was permitted.
5.  **Regression Testing:** The patch includes a new test fixture (`run-033-state-pre-fix.json`) containing the exact state that caused the original bug, and new tests in `test_factory_next_action.py` confirm the fix resolves the issue. This is excellent practice and provides high confidence in the fix.

### HIGH: Drastically improved review-finding detection

The patch significantly hardens the logic for detecting actionable findings (HIGH/MEDIUM severity) in review files. The regular expression in `factory_review_specs.py` has been massively expanded to recognize a much wider variety of formatting styles used by different reviewers and models. This includes:

*   Bulleted lists with various tags (`- HIGH:`, `- [tag] HIGH:`)
*   Bolded severity markers (`**HIGH**:`)
*   Table-based findings (`| **HIGH** |`)
*   Numbered lists (`1. HIGH:`)
*   Inline fields (`Severity: HIGH`)

This change greatly reduces the risk of the system incorrectly auto-accepting a review that contains critical feedback. The improvement is backed by a new, thorough test suite (`test_factory_review_specs.py`) that includes positive tests for each pattern, negative tests for common false positives (e.g., the phrase "high availability"), and tests against real-world review files from the project's history.

### MEDIUM: Mature concern-lifecycle management

The data model and lifecycle for "judge concerns" have been substantially improved, enhancing traceability and operator experience.

1.  **Stable IDs:** Concerns are now assigned a stable, hash-based ID upon creation (`_concern_id` in `factory_cmd_judge.py`), allowing them to be uniquely identified even if their reasoning is slightly paraphrased (FR-003).
2.  **Explicit Lifecycle State:** Concerns now have a full set of resolution fields (`addressed_at`, `deferred_reason`, `dismissed_reason`), making their state explicit rather than implicit (FR-005a).
3.  **On-the-fly Backfill:** A graceful backfill mechanism (`_backfill_unresolved_concern_ids` in `factory_state.py`) upgrades older state files in memory upon loading, adding the new ID and lifecycle fields. This provides seamless backward compatibility without requiring a manual migration script (FR-011a).
4.  **Improved PR Body:** The PR body rendering (`factory_pr_body.py`) is updated to display unresolved and resolved concerns in separate sections, and prominently features the new concern ID to facilitate operator commands (e.g., `checkpoint --address <id>`).

## Residual Risks

### LOW: Potential for regex false positives in quoted code

The expanded regex in `factory_review_specs.py` is a major improvement but introduces a documented risk of false positives. As confirmed by the new test `test_fenced_code_block_with_literal_severity_line_is_documented_limitation`, if a review quotes a finding from another source inside a markdown code fence (e.g., ```- HIGH: an example```), the regex will detect it as a new, actionable finding in the current review. This could lead to a review being flagged for manual attention when none is needed. The risk is low as this is an uncommon scenario, but it remains a known limitation.

### LOW: [UNVERIFIED] Duplication of stable ID generation logic

To avoid a circular import, the stable concern ID hashing function (`_concern_id`) is duplicated in both `factory_cmd_judge.py` and `factory_state.py` (`_concern_id_stable`). While pragmatically justified in a comment, this code duplication creates a small maintenance risk. If the hashing logic were ever to change, a developer might update one function but forget the other, leading to inconsistent ID generation between new and backfilled concerns. This could cause issues with tracking concern resolution. The risk is minimal as the function is simple, stable, and unlikely to change.

## Token Stats

- total_input=56489
- total_output=1218
- total_tokens=62812
- `gemini-2.5-pro`: input=56489, output=1218, total=62812

## Resolution
- status: accepted
- note: No actionable findings. 2 LOW residual risks documented (fenced code false-positive, duplicated _concern_id — accepted limitations).
