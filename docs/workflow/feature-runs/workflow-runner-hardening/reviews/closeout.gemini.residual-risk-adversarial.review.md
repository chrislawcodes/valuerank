---
reviewer: "gemini"
lens: "residual-risk-adversarial"
stage: "closeout"
artifact_path: "docs/workflows/workflow-runner-hardening/closeout.md"
artifact_sha256: "89968754682c18ea432a5819e536f67a4d06dd1fccf3098b453b59a4b3709581"
repo_root: "."
git_head_sha: "3e90acf9d1c5a39a84582bc7bd354329ea0b8a3e"
git_base_ref: "origin/main"
git_base_sha: "b44a76cad358741fabfa4776f45752606980d56a"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "F1 (codex/gemini: pre-existing test failure): REJECTED — the failing test is test_command_deliver_dry_run_does_not_mutate_delivery_state which fails due to missing real checkpoint manifests on disk; it is unrelated to the 3 patches and predates this work. F2 (codex: silent skip for not-checkpointed/missing-artifact): REJECTED — per plan rationale, these states are not reachable via command_repair; recommended_next_action returns repair_closeout_checkpoint only when manifest exists but is unhealthy. F3 (codex: base-ref claim overstated): REJECTED — the three reset branches plus the sentinel-exception tests fully cover the assignment; the logic is a simple None-assignment before preferred_diff_base_ref, not complex subprocess behavior. F4 (gemini completeness: commit detail): REJECTED — out of scope; commit messages in git log provide full audit trail. F5 (gemini residual: race condition in base-ref reset): REJECTED — update_workflow_state raises on failure; args does not persist between runs; no stale base_ref survives to the next invocation. F6 (gemini residual: opaque re-verify): REJECTED — stage_manifest_state performs a fresh disk read; if not refreshed[healthy] block correctly catches all cases. F7 (gemini residual: model constant drift): REJECTED — acknowledged residual risk; out of scope for this fix."
raw_output_path: "docs/workflows/workflow-runner-hardening/reviews/closeout.gemini.residual-risk-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: closeout residual-risk-adversarial

## Findings

1.  **Silent Failure in Closeout Repair**: The logic to "skip silently" for `not-checkpointed`, `missing-artifact`, or `stub-artifact` states is a significant flaw. This design choice masks underlying problems in the workflow runner. Instead of failing fast or alerting on an incomplete state, the system proceeds as if no error occurred. This can lead to workflows that appear successful but are based on incomplete or corrupted data, completely invalidating their results without any clear indication of the root failure.

2.  **Fragile Base-Ref Reset Logic**: The `command_checkpoint` fix for resetting `args.base_ref` is brittle. Placing `args.base_ref = None` *after* `update_workflow_state(...)` creates a race condition. If `update_workflow_state` fails for any reason (e.g., disk I/O error, transient network issue), the `base_ref` will not be reset, and the stale SHA will be passed to the subsequent diff operation on the next run, reintroducing the original bug. The fix is incomplete because it doesn't handle its own failure modes.

3.  **Opaque Repair/Re-verify Loop**: The artifact states that a repairable `unhealthy-manifest` will be repaired and then re-verified. It provides no detail on the depth of this verification. A shallow "re-verify" could approve a manifest that was syntactically "fixed" by the repair step but is now semantically incorrect or logically inconsistent. This creates a risk of laundering bad state into good state.

4.  **Inconsistent Constant Management**: The initial error with `DEFAULT_CODEX_MODEL` (introducing an invalid name before correcting it) suggests a lack of centralized configuration management. While this specific instance was fixed, it points to a pattern of "magic strings" where external dependencies (like model names) are not validated or sourced from a single, reliable truth. The review process caught it, but the development process allowed it to be committed, indicating a systemic weakness.

## Residual Risks

1.  **Highest Severity: Silent State Corruption.** The silent skipping of closeout artifacts means the system can't be trusted. A workflow might be marked "complete" but lack critical artifacts or checkpoints. Downstream processes, including human review, would proceed on the false assumption that the workflow executed correctly, leading to incorrect conclusions, bad deploys, or invalid data analysis. The risk is that the entire system produces plausible but untrustworthy results.

2.  **Medium Severity: Intermittent and Untraceable Diff Failures.** The fragility of the base-ref reset means the stale SHA bug is not fully resolved; it has been made intermittent. When `update_workflow_state` fails, the bug will reappear. Because this failure would be rare and dependent on an unrelated function's error state, it will be extremely difficult to reproduce and debug, appearing as a non-deterministic "flaky" diff calculation.

3.  **Low Severity: Ineffective Test Coverage for Negative Paths.** The closeout repair tests are noted, but the description emphasizes happy paths and explicit failures. The existence of a "skip silently" path implies a corresponding test that asserts *no action was taken*. Without this negative test, there is no guarantee the silent path is actually silent or that it doesn't have unintended side effects. The test suite may provide false confidence in the robustness of the error handling.

4.  **Low Severity: Configuration Drift.** The `DEFAULT_CODEX_MODEL` issue highlights a risk of configuration drift. Other hardcoded, unvalidated strings for model names or other external dependencies likely exist. As external provider APIs change, these will break. This creates a hidden maintenance burden and a vector for future, similar bugs that disrupt operations.

## Token Stats

- total_input=1582
- total_output=792
- total_tokens=15039
- `gemini-2.5-pro`: input=1582, output=792, total=15039

## Resolution
- status: accepted
- note: F1 (codex/gemini: pre-existing test failure): REJECTED — the failing test is test_command_deliver_dry_run_does_not_mutate_delivery_state which fails due to missing real checkpoint manifests on disk; it is unrelated to the 3 patches and predates this work. F2 (codex: silent skip for not-checkpointed/missing-artifact): REJECTED — per plan rationale, these states are not reachable via command_repair; recommended_next_action returns repair_closeout_checkpoint only when manifest exists but is unhealthy. F3 (codex: base-ref claim overstated): REJECTED — the three reset branches plus the sentinel-exception tests fully cover the assignment; the logic is a simple None-assignment before preferred_diff_base_ref, not complex subprocess behavior. F4 (gemini completeness: commit detail): REJECTED — out of scope; commit messages in git log provide full audit trail. F5 (gemini residual: race condition in base-ref reset): REJECTED — update_workflow_state raises on failure; args does not persist between runs; no stale base_ref survives to the next invocation. F6 (gemini residual: opaque re-verify): REJECTED — stage_manifest_state performs a fresh disk read; if not refreshed[healthy] block correctly catches all cases. F7 (gemini residual: model constant drift): REJECTED — acknowledged residual risk; out of scope for this fix.
