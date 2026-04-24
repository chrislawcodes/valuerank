---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/034-hygiene-follow-ups/plan.md"
artifact_sha256: "dc3059aa4677c705270bdfa8b17ed1cfa78427dad71dd2d811079a71d1363479"
repo_root: "."
git_head_sha: "42b7bb726d5992b7810c0346673e7f795365c4c9"
git_base_ref: "origin/main"
git_base_sha: "42b7bb726d5992b7810c0346673e7f795365c4c9"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/034-hygiene-follow-ups/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Evidence |
| --- | --- | --- |
| HIGH | The query logic proposed in Wave 4 to extend `hasRecoveryActivity()` is flawed. It suggests looking for transcripts where `summarizedAt IS NOT NULL` and a `probe_result` does not exist. This is intended to keep the scheduler active when there is an orphan backlog. However, the goal of the recovery system is to process items that are incomplete. An orphan is a transcript without a probe result, which prevents it from being summarized. The existing `hasRecoveryActivity` correctly looks for active runs or "stranded" transcripts (where `summarizedAt` is `null`). The proposed logic contradicts the established state flow and would likely fail to detect the intended backlog of work. | `[CODE-CONFIRMED]` |
| MEDIUM | The verification plan for the new environment variable `RUN_RECONCILE_WINDOW_DAYS` (Wave 1 & 5) relies on a manual smoke test. A core configuration mechanism like this should have automated tests covering valid, invalid (e.g., non-numeric, negative), and unset values. Manual verification is prone to being skipped and cannot be enforced by CI, creating a gap in regression testing. | `[UNVERIFIED]` |
| MEDIUM | The test plan for the multi-sibling `detectPairAsymmetry` (Wave 3) is underspecified for adversarial cases. It proposes a 3-sibling test but doesn't cover scenarios with more complex distributions (e.g., bimodal clusters of success rates) or how "max delta" is calculated. Furthermore, the associated risk of a growing `details` payload is noted, but no automated test is planned to verify that the payload size remains within reasonable limits for a large number of siblings. | `[CODE-CONFIRMED]` |
| LOW | The `reconstructOrphans` function includes a `try/catch` block around `recordProbeSuccess`, correctly routing failures to a `failedIds` list. However, the test plan for Wave 2 does not include a case to verify this failure path. Without a test, a regression in the error handling logic (e.g., if the `catch` block were removed) would not be detected. | `[CODE-CONFIRMED]` |

## Residual Risks

- **Risk: The proposed query for orphan activity detection (Wave 4) is inefficient.**
  - **Plan's Mitigation:** `EXPLAIN` the query against a production snapshot.
  - **Adversarial Assessment:** This mitigation is sound for addressing performance. However, it does not address the primary finding that the query logic itself appears to be functionally incorrect for its stated purpose. The highest risk is not performance, but that the feature will not work as intended.

- **Risk: Capped orphan backlog draining (Wave 2) could be too slow.**
  - **Plan's Mitigation:** Acknowledged as acceptable at the current scale.
  - **Adversarial Assessment:** The mitigation is a business acceptance. From a testability perspective, the cap value (`ORPHAN_RECONSTRUCTION_CAP_PER_TICK`) should be configurable in the test environment to allow for testing the capping logic without needing a large number of mock records. The plan does not specify this, which could make testing unnecessarily cumbersome.

- **Risk: Environment variable changes for `RUN_RECONCILE_WINDOW_DAYS` require a restart.**
  - **Plan's Mitigation:** Add a code comment and accept the behavior.
  - **Adversarial Assessment:** This is an acceptable operational risk. The lack of an automated test (as noted in Findings) means an operator might change the variable, restart, and still not see the expected behavior due to a code regression, which the manual test might not catch. The risk is less about hot-reloading and more about the correctness of the implementation not being automatically verified.

## Token Stats

- total_input=29473
- total_output=826
- total_tokens=34299
- `gemini-2.5-pro`: input=29473, output=826, total=34299

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
