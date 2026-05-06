---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/vignette-paired-analysis/plan.md"
artifact_sha256: "63eb1ee4be35af8b02968aa9024e118511c9b0866b3dfd1d98437837a41db28f"
repo_root: "."
git_head_sha: "3cba76c6b06a907df7d2daf6b766e4127962c0f3"
git_base_ref: "origin/main"
git_base_sha: "3cba76c6b06a907df7d2daf6b766e4127962c0f3"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "3-round cap reached."
raw_output_path: "docs/workflow/feature-runs/vignette-paired-analysis/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | ID | Finding |
|---|---|---|
| MEDIUM | F-1 | **Implicit Assumption in Core Metric:** The plan for `snapshot-compute.test.ts` tests that `directionBalancedWinRate` is an unweighted average (`(rateA + rateB) / 2`) even when trial counts are highly imbalanced (e.g., 100 vs. 10). This locks in a product decision that may not be intended. An alternative, and equally plausible, implementation would be to weight the final rate by trial count. The plan lacks a verification step to confirm that "equal weighting" is the desired behavior, making it a strong but untested assumption about the core business logic. |
| LOW | F-2 | **Incomplete URL State Testing:** The test plan for `VignettePairedAnalysis.tsx` (Slice 4) verifies that a missing `?signature` parameter is correctly added to the URL. However, it does not specify testing for the inverse case: ensuring that extraneous or obsolete query parameters are removed from the URL upon page load. This creates a risk of state pollution where unrelated query parameters could persist and cause unintended side effects in other components that read from the URL search parameters. |
| LOW | F-3 | **Untested Alert Content:** In Slice 3, the redirect logic for legacy URLs includes an alert for the case where `pair_key` is present but `definition.id` is missing (branch 'c'). The verification plan in Slice 4 confirms that an alert is rendered, but it does not specify that the *content* of the alert (the text and the "search link") is asserted. This makes the test brittle; it would pass even if the alert were empty or contained a broken link, failing to guide the user as intended. [UNVERIFIED] |
| LOW | F-4 | **Opaque Fallback Logic:** Architecture decision A7 specifies a fallback to `vnewtd` when neither side of a pair has completed runs. This term is not defined and is opaque. While its invocation can be tested, the correctness and complexity of the `vnewtd` logic itself cannot be assessed from the plan. This introduces a minor risk that the fallback behavior is more complex or has more subtle edge cases than is apparent. [UNVERIFIED] |

## Residual Risks

The plan includes a comprehensive list of residual risks. This review identifies one additional risk not captured in the artifact.

| ID | Risk | Proposed Verification/Mitigation |
|---|---|---|
| RR-NEW-1 | **Legacy Logic Drift:** The plan mitigates the removal of legacy code by creating `legacyCompanionPairedRun.ts` and a follow-up ticket (RR-3). However, it misses the risk that this deprecated code will diverge from the new data model over time. A future change could update the primary `pressure-sensitivity` pipeline but neglect the legacy utility, causing the old `AnalysisConditionDetail.tsx` path to silently break or display incorrect data for users on old URLs. | Add a new, temporary test case to the verification slice. This test would feed the same input data (a run with a legacy `companionRunId`) to both the old `legacyCompanionPairedRun` utility and the new `definitionId`-based pipeline. It would assert that the key resulting outputs (e.g., the identified companion) are consistent. This "consistency lock" would fail if one path is updated and the other is not, forcing developers to address the legacy path until it is fully removed. |

## Token Stats

- total_input=4935
- total_output=746
- total_tokens=21514
- `gemini-2.5-pro`: input=4935, output=746, total=21514

## Resolution
- status: accepted
- note: 3-round cap reached.
