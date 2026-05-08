---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/model-agreement-on-tradeoffs/plan.md"
artifact_sha256: "5629c6ee8540c3f61306b6c010c58d74a8a44d76c0eeca860309a797df48bd6b"
repo_root: "."
git_head_sha: "9c48754bdcf18289e4acbb9d6a4d74de0a47187e"
git_base_ref: "origin/main"
git_base_sha: "9c48754bdcf18289e4acbb9d6a4d74de0a47187e"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/model-agreement-on-tradeoffs/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding |
| :--- | :--- |
| **HIGH** | The verification for the `noisy` badge (Residual Risk #8) contradicts the plan's own logic. The plan rejects a previous finding that the heuristic is untestable by stating it's a deterministic rule (`meanTrialConsistency < 0.7 AND cellsObserved >= 5`). However, the proposed verification is a "manual sanity check" instead of a deterministic unit or integration test. A deterministic rule should have a deterministic test; relying on a manual check makes the implementation untestable in an automated way and risks regressions. |
| **MEDIUM** | **[UNVERIFIED]** The logic in A2 relies on a "Sanity invariant" (`aCell.wins == bCell.losses`) for its correctness, but there is no test proposed to validate this invariant on the input `cellMap`. If upstream data is malformed and breaks this invariant, the new `cellLevelOutcomes` will contain incorrect data without any warning. This creates a silent failure risk that is difficult to debug. |
| **MEDIUM** | The verification for the default drilldown selection (A6c) is incomplete. While it specifies a snapshot test for the primary heuristic (highest divergence on a high-support row), it omits explicit tests for the fallback cases: 1) when no row meets the support threshold and it must select the row with the most `totalCells`, and 2) when the matrix is empty and no drilldown should be rendered. |
| **MEDIUM** | The algorithm in A2 specifies skipping non-binary value pairs (`if size of byValueKey != 2: skip`), but the plan lacks a mechanism to test or observe this behavior. There is no mention of logging, metrics, or a test case to confirm that these cells are indeed skipped and don't cause downstream errors. This could mask underlying data quality issues. |
| **LOW** | **[UNVERIFIED]** The plan relies on manual developer action (`npm run codegen`) to keep GraphQL types in sync (Wave 4), with a manual `git diff` as the only verification (Residual Risk #6). This process is brittle and prone to human error. An automated CI check that fails if generated files are not up-to-date would be a more robust and testable solution. |

## Residual Risks

| Severity | Risk |
| :--- | :--- |
| **MEDIUM** | The integration test for async job failure (Wave 3) correctly verifies graceful degradation (`pending: true`), but the recovery path is not tested. The plan assumes "the job is retried by the queue's normal retry policy," but this behavior is outside the scope of the proposed tests. A failure in the separate retry mechanism would lead to a permanently stuck "pending" state that would not be caught by the current test plan. |
| **LOW** | The dual-write strategy (A3) creates a small risk of the legacy `valuePairModelVotes` field becoming inconsistent with what the original logic would have produced. The plan is to remove the field in a follow-up PR, which mitigates this long-term. However, there is no test proposed to compare the dual-written data against the output of the original calculation, creating a short-term gap where a regression in the legacy path could go undetected. |

## Token Stats

- total_input=17940
- total_output=708
- total_tokens=21439
- `gemini-2.5-pro`: input=17940, output=708, total=21439

## Resolution
- status: open
- note: