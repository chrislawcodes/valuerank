---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ff-housekeeping/plan.md"
artifact_sha256: "02f370d43be53e5ea6d8c15ad54a398eedbeafa93456d7a62fe342777c140fb3"
repo_root: "."
git_head_sha: "abe37af6980410617bc8583fba79f3603ad9b221"
git_base_ref: "origin/main"
git_base_sha: "85a91778b3c3de491fd6b326879d29fa5dc6d0fa"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/ff-housekeeping/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Slice |
| :--- | :--- | :--- |
| **[HIGH]** | **Brittle Override Mechanism:** Tying the `implementation_rule_override` to a specific `HEAD` SHA is user-hostile. A common action like `git commit --amend` or an interactive rebase will change the SHA, invalidating the override. This forces the developer to repeat the override process for trivial commit modifications, adding friction to the workflow. A branch-based or timestamp-based override would be more robust. | 3 |
| **[HIGH]** | **Fragile Quota Classifier:** The `_is_codex_quota_exhaustion` helper relies exclusively on substring matching against `stdout` and `stderr`. This is brittle and likely to fail if the API provider changes its error message formatting, or if the error is returned in a structured format like JSON or HTML which is then printed to the console. It will miss many real-world failure modes. | 1 |
| **[MEDIUM]** | **Concurrency Not Tested in Reconciler:** The plan correctly notes that the 3-way reconcile is not a transaction and relies on an idempotent re-run for recovery. However, the testing approach includes no test for concurrent executions. Without simulating a race condition, it's impossible to verify what state is left behind or to prove that the re-run can reliably recover from it. | 2 |
| **[MEDIUM]** | **Underspecified Smoke Test Assertions:** The plan for the `validation-only` smoke test states it will assert that "all 3 review SHAs updated, annotation appended". This is insufficient. A robust test must assert that the SHAs are updated to the *correct, expected* values and that the appended annotation contains the *correct* content and metadata, not just that a change occurred. | 4 |
| **[MEDIUM]**| **Missed Quota Error Path:** The logic is specified as "when subprocess fails AND classifier returns True". This creates a blind spot. A tool could encounter a quota exhaustion error, print the details to `stdout`, and still exit with code 0. In this scenario, the failure would be missed entirely because the subprocess did not "fail". | 1 |
| **[MEDIUM]** | **[UNVERIFIED] Naive Line Count for Implementation Rule:** The `git diff` command to calculate added lines for the implementation rule is simplistic. By only filtering for a few code extensions, it will incorrectly count lines from checked-in generated code, large configuration files (e.g., JSON, YAML), or documentation, leading to frequent false-positive warnings. | 3 |
| **[LOW]** | **[UNVERIFIED] Brittle `plan.md` Deduplication:** The plan to "replace any existing line matching `review: reviews/<basename>`" is likely too simple. This approach is sensitive to minor variations in whitespace or formatting and may fail to update the line or, worse, add a duplicate line if the existing entry doesn't match the expected string exactly. | 2 |
| **[LOW]** | **Overly Broad Suppression for Implementation Rule:** The condition to suppress the warning if `state["codex_dispatches"]` is non-empty is too general. This could create a false negative, where the warning is silenced because of an old or unrelated dispatch, defeating the purpose of the check. | 3 |

## Residual Risks

Even if the findings above are addressed, the following risks remain inherent to the design:

1.  **API Error Drift:** The quota classifier (Risk P1) will remain fundamentally reactive. Even with improved pattern matching, it will always be chasing changes made by the upstream API provider. A future change in error reporting could cause quota-related failures to be miscategorized as `failed` instead of `deferred` until the classifier is updated.
2.  **Reconciler Race Conditions:** The decision to not make the 3-way reconcile transactional (Risk P3) means that a mid-write failure (e.g., due to disk full, permissions change, or process kill) will leave the feature-run files in an inconsistent state. While the idempotent re-run is the designed recovery path, its success depends on the operator correctly identifying the issue and re-triggering the action. There is no automated rollback or recovery.
3.  **Heuristic-Based Warnings:** The implementation rule check (Risk P2) is a heuristic, not a guarantee. It will be prone to both false positives (as noted in the findings) and false negatives (e.g., a large change made across many small files might fly under the radar). The override mechanism is a necessary escape hatch but introduces a manual step that relies on developer judgment.

## Token Stats

- total_input=13830
- total_output=1013
- total_tokens=17062
- `gemini-2.5-pro`: input=13830, output=1013, total=17062

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
