---
reviewer: "gemini"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflows/run-status-visualization/reviews/implementation.diff.patch"
artifact_sha256: "59d7e7bd18ad4ea9f46a620d308c0bbd44d0facfcce42f69d77e7947aed74af2"
repo_root: "."
git_head_sha: "561692d24c350ea911a7ed269197e5e9673dae82"
git_base_ref: "aa599ef1dfd54d82d3d0fb6dd7ef4fdfeb32f2fe"
git_base_sha: "aa599ef1dfd54d82d3d0fb6dd7ef4fdfeb32f2fe"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "F1 accepted as known limitation: completed models with no recent activity are not shown. Panel is for live monitoring. F2 rejected: spec specifies done count and throughput only, not per-model failure counts in UI. F3 rejected: throttling heuristic is out of spec scope. Residual risk byModel backend: already implemented."
raw_output_path: "docs/workflows/run-status-visualization/reviews/diff.gemini.regression-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

1.  **High Severity: Potentially Misleading UI State.** The `isActiveRun` function is used to determine if a run should show "expanded metrics." The existing active states, `PENDING` and `RUNNING`, describe a run that is queued or actively generating transcripts. The `RunProgress` component likely shows progress related to this generation (e.g., "X of Y scenarios complete"). By adding `SUMMARIZING`, the same progress indicator will now be displayed for a completely different phase of the process. If the metrics shown are for transcript generation, the progress bar would likely show 100% throughout the entire `SUMMARIZING` phase, giving the user the false impression that the process is complete when it is still actively working. This creates a confusing and misleading user experience.

2.  **Medium Severity: Weak Assumption of State Equivalence.** The change assumes that the UI representation for an "active" run is appropriate for the `SUMMARIZING` state. However, the work being performed during `SUMMARIZING` (analyzing results) is fundamentally different from `RUNNING` (generating results). A better user experience would involve a distinct progress indicator that specifically tracks summarization progress (e.g., "Summarized X of Y models") rather than reusing a generic "active" state that was clearly designed for the execution phase.

## Residual Risks

1.  **Data Inconsistency:** The `RunProgress` component receives a `run` object. The data structure and values within this object may differ between the `RUNNING` and `SUMMARIZING` states. The component might attempt to render metrics based on fields that are only populated during the `RUNNING` phase (like per-scenario progress), leading to either a crash, incorrect zeros, or stale data being displayed during summarization.

2.  **Ambiguous Function Responsibility:** The purpose of `isActiveRun` is now blurred. It's no longer just for "runs that are running" but for "runs that are not in a terminal state." This ambiguity increases the risk that other components might misuse this function in the future, showing UI elements during the `SUMMARIZING` phase that are only intended for `PENDING` or `RUNNING` states. This could lead to a brittle frontend where seemingly unrelated changes have unintended consequences.

## Token Stats

- total_input=1346
- total_output=482
- total_tokens=14783
- `gemini-2.5-pro`: input=1346, output=482, total=14783

## Resolution
- status: accepted
- note: F1 accepted as known limitation: completed models with no recent activity are not shown. Panel is for live monitoring. F2 rejected: spec specifies done count and throughput only, not per-model failure counts in UI. F3 rejected: throttling heuristic is out of spec scope. Residual risk byModel backend: already implemented.
