---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/domain-evaluation-setup-state/spec.md"
artifact_sha256: "443bdd887c0e025aab9f72c52991c4402e160badafe6d076d0e92f069b82b799"
repo_root: "."
git_head_sha: "97662ecffedb936831ed31b60c6d66186679077d"
git_base_ref: "origin/claude/parallel-reviews-validated-v2"
git_base_sha: "97662ecffedb936831ed31b60c6d66186679077d"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The spec now defines paired-batch completion, backend-authoritative stall handling, launch diagnostics after rows fall off the live table, and budget freshness behavior."
raw_output_path: "docs/feature-runs/domain-evaluation-setup-state/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

### CRITICAL

1.  **Missing Error Handling for Invalid Domain**
    The spec does not define behavior for the case where the `domainId` in the URL is invalid, deleted, or inaccessible to the user. Loading the page for a non-existent domain could result in a crashed-looking UI, an infinite loading state, or an empty page with no context. This is a fundamental missing error state. The application should display a clear "Domain not found" or "Access denied" message and provide a path for the user to navigate back to a valid part of the application.

### HIGH

1.  **Brittle Liveness and Stall Detection**
    The spec dictates that the UI must not "invent a stall diagnosis" and must rely on an explicit backend signal. This creates a critical single point of failure. If the backend process responsible for marking stalls is delayed, hung, or has crashed, the UI will continue to display stale data, misleading the user that an effectively dead batch is still "in progress". A simple "freshness warning" is insufficient for a total loss of signal. The system should treat a sufficiently stale status snapshot (e.g., missing several polling cycles) as a page-level error, clearly indicating the status is unreliable.

2.  **Post-Launch User Experience Gap**
    The spec requires that pending or queued work is not shown in the live status table. This means that after a user clicks "Launch," the primary status view will be empty, potentially for a significant amount of time. This can lead the user to believe the launch failed and encourage them to click "Launch" again, risking duplicate runs. The UI must provide immediate feedback after the launch mutation succeeds, such as an "Launch initiated, awaiting batch processing..." message, to bridge this experiential gap.

### MEDIUM

1.  **Ambiguous Budget and Cost Failure Modes**
    The provider readiness check (US-3) is not fully defined for all edge cases. It's unclear how the UI should behave if:
    *   The cost estimate for a required provider fails or is unavailable.
    *   The available budget is exactly equal to the estimated cost, offering no buffer for minor fluctuations.
    *   The budget signal is present but extremely old (e.g., days).
    In all these cases, the launch should be blocked, and the specific reason made clear to the user. Relying on the user to notice a stale timestamp is not a robust enough safeguard.

2.  **[UNVERIFIED] Race Condition on Launch Confirmation**
    The user can modify launch parameters like the paired-batch count while cost estimation or provider readiness checks are in flight. The final pre-launch validation is good, but doesn't prevent the user from seeing a stale cost estimate and making a decision based on it, only to be blocked at the last second. To mitigate this, UI controls affecting the launch (`samplesPerScenario`, model selection) should be disabled or show a loading state while their dependent data (cost, readiness) is being calculated, ensuring the user always sees a consistent state.

3.  **[UNVERIFIED] Brittle Definition of "Done"**
    A paired batch is considered "done" when both legs complete all pipeline stages (generation, summarization, analysis). This definition is brittle and assumes a fixed, linear pipeline. If a future, optional post-processing step (e.g., `export`, `advanced-analysis`) is added, a batch could be "done" with its primary work but fail this subsequent step. The "done" state would become ambiguous. A more robust state machine model (`analysisComplete`, `exportFailed`, etc.) would prevent this future ambiguity.

### LOW

1.  **Unspecified High-Count Confirmation Behavior**
    The confirmation for a high batch count (>20) should trigger every time the user attempts to launch with that count, not just the first time. The current spec could be interpreted as a one-time check. If a high-cost launch fails for an unrelated reason (e.g., temporary budget issue), the user fixes it, and tries again, they should be re-warned about the cost.

2.  **Missing Dirty State Confirmation on Navigation**
    If a user adjusts launch parameters (like the batch depth) and then tries to navigate away without launching, their setup is lost without warning. The application should detect this "dirty" state and prompt the user to confirm that they want to discard their changes before navigating away.

3.  **Vague "Log-like" Detail View**
    US-5 asks for a "log-style" detail view while reusing existing run data. This is dangerously vague and risks an unhelpful implementation. To be useful for diagnostics, this should be specified as a concrete view of state transitions with timestamps and associated metadata (e.g., `QUEUED @ 12:05:01`, `PROBING @ 12:05:03`, `PROBE_FAILED @ 12:05:05 with error: '...''`).

## Residual Risks

-   **Misleading Backend Aggregates**: The UI is designed to trust the backend's aggregate counts (`done`, `failed`, `percent complete`) without an independent client-side check. A bug in the backend's aggregation logic would cause the UI to faithfully display incorrect information, which the user would have no way of verifying.
-   **User Misinterpretation of "Current Launch"**: The feature is strictly scoped to the current launch only and does not "top up" prior runs. While this is an explicit non-goal, it may violate the user's mental model. Users might assume the system is intelligently filling out a domain to a target sample count, not just running a discrete new set of trials. This could lead to confusion and perceived data discrepancies. The UI copy and explanatory text must be exceptionally clear about this limitation.
-   **Polling Performance**: The spec requires a polling mechanism to keep the status view live. This creates a risk of performance degradation on the backend if many users have the page open simultaneously. The implementation will need to consider an intelligent polling strategy (e.g., back-off, ETags, reducing frequency for out-of-focus tabs) to prevent overwhelming the server.

## Token Stats

- total_input=2664
- total_output=1321
- total_tokens=19364
- `gemini-2.5-pro`: input=2664, output=1321, total=19364

## Resolution
- status: accepted
- note: The spec now defines paired-batch completion, backend-authoritative stall handling, launch diagnostics after rows fall off the live table, and budget freshness behavior.
