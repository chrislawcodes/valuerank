---
reviewer: "gemini"
lens: "quality-adversarial"
stage: "diff"
artifact_path: "docs/workflows/run-status-visualization/reviews/implementation.diff.patch"
artifact_sha256: "24db86d2c069136af35cd918304bf5757b9ba6f39363051c7106218f6bebd6f3"
repo_root: "."
git_head_sha: "aa599ef1dfd54d82d3d0fb6dd7ef4fdfeb32f2fe"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "F1 rejected: byModel already implemented server-side. F2 accepted: panel is live monitoring only; post-completion display is out of spec scope. F3 rejected: spec explicitly says 'Any other unrecognized status → Probe active (safe default)'. F4 accepted: Analyse has no granular progress data; progress=null is correct per spec."
raw_output_path: "docs/workflows/run-status-visualization/reviews/diff.gemini.quality-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff quality-adversarial

## Findings

Ordered by severity:

1.  **Missing Backend Implementation for `byModel` Progress**:
    -   **Flaw**: The frontend is updated to query for per-model completion counts (`runProgress.byModel`), and the `ProviderCard` component is redesigned around displaying this data. However, the corresponding backend change to the `runProgress` resolver to calculate and return this data is absent from the provided diff. The changes to `cloud/apps/api/src/graphql/types/run.ts` only account for `executionMetrics.totalRetries`.
    -   **Impact**: This will likely cause the `byModel` field in the GraphQL response to be null. While the UI is defensively coded to prevent a crash, the per-model "done" counts will always display as `0`. This makes a core feature of the new UI non-functional and unable to display the intended progress breakdown.

2.  **Execution Summary Disappears on Run Completion**:
    -   **Flaw**: The new `ExecutionProgress` component is designed to show a final summary of the probe stage, including per-model statistics and total retries. However, its parent component (`RunProgress.tsx`) is explicitly coded to unmount it as soon as the run's status becomes `COMPLETED`, `FAILED`, or `CANCELLED`.
    -   **Impact**: The user loses access to this valuable summary information at the exact moment the run finishes, which is precisely when they would want to review it. The component's final state is discarded instead of being preserved as a final report.

3.  **Ambiguous `RunStatus` Handling**:
    -   **Flaw**: The `activeStage` helper function in `ExecutionProgress.tsx` assumes that any run status that is not `SUMMARIZING` or a terminal state (like `COMPLETED`) must be `probe`.
    -   **Impact**: If other statuses exist (e.g., `PENDING`, `INITIALIZING`, `CANCEL_REQUESTED`), the UI will incorrectly represent them as being in the 'Probe' stage. This could be misleading to the user about the run's actual state.

4.  **Misleading Progress Bar for "Analyse" Stage**:
    -   **Flaw**: The UI for the "Analyse" stage renders a progress bar element. However, this stage appears to lack granular progress data, as its `progress` prop is hardcoded to `null`, meaning the bar will always show 0% completion.
    -   **Impact**: This can confuse the user, who sees a progress bar that never progresses. A UI element that more accurately reflects a binary or status-based state (e.g., a spinner or status text) would be less misleading than a zero-filled progress bar.

## Residual Risks

1.  **Potential Frontend Performance Degradation**:
    -   The `computeRate` function iterates over a `recentCompletions` array multiple times to calculate per-provider and per-model rates. The performance of this logic is dependent on the size of that array. If the backend does not limit the array to a small, recent time window (e.g., the last 60-120 seconds), the frontend could experience performance issues on runs with high model counts and completion rates.

2.  **`totalRetries` Data Integrity**:
    -   The `totalRetries` metric is calculated by summing a `retryCount` field in the database. There is a theoretical risk that a catastrophic failure in the probe worker could prevent it from updating this `retryCount`, leading to an undercounting of retries on the dashboard. This risk is likely low but represents a minor gap in data integrity.

## Token Stats

- total_input=8437
- total_output=785
- total_tokens=26440
- `gemini-2.5-pro`: input=8437, output=785, total=26440

## Resolution
- status: accepted
- note: F1 rejected: byModel already implemented server-side. F2 accepted: panel is live monitoring only; post-completion display is out of spec scope. F3 rejected: spec explicitly says 'Any other unrecognized status → Probe active (safe default)'. F4 accepted: Analyse has no granular progress data; progress=null is correct per spec.
