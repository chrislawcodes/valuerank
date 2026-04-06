---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/domain-evaluation-setup-state/plan.md"
artifact_sha256: "ca5c316c89d58bba0993f4edaaa0a4175dd153cdec2fb5ead3271cbb77b09311"
repo_root: "."
git_head_sha: "97662ecffedb936831ed31b60c6d66186679077d"
git_base_ref: "origin/claude/parallel-reviews-validated-v2"
git_base_sha: "97662ecffedb936831ed31b60c6d66186679077d"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Resolved by defining a 10-minute budget freshness threshold, a 5-second polling cadence, snapshot-based counts, and explicit drawer fallback behavior for missing run data."
raw_output_path: "docs/workflow/feature-runs/domain-evaluation-setup-state/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding |
| :--- | :--- |
| **HIGH** | The plan relies on a client-side preflight check for provider readiness and budget, with a separate authoritative check on the server during the `startDomainEvaluation` mutation. This creates a testable but high-risk race condition. A budget could be consumed between the preflight and the mutation, causing a launch failure that might appear as a UI bug to the user. Testing must exhaustively cover the UI's reaction to the specified failure codes (`INSUFFICIENT_BUDGET`, `STALE_BUDGET`) to ensure they are handled gracefully and don't present as a system error. |
| **MEDIUM** | The plan states that the status view refreshes every 5 seconds but does not define the behavior for a failed poll. If the client fails to fetch an update, the user will be looking at stale data with no indication of a problem. This makes the system's "liveness" untestable; a test cannot confirm the data is current if the mechanism for updating it can fail silently. The UI should have a defined, testable state for "stale data" or "connection error." |
| **MEDIUM** | The confirm modal's behavior is gated on "large launches," but this term is not defined with a specific threshold. This makes the feature's trigger non-deterministic and difficult to test. To be testable, this should be an exact number of trials (e.g., `> 1000`). |
| **MEDIUM** | The plan states, "The frontend may warn when a status snapshot is old," but it does not specify the threshold for what constitutes "old." Unlike the budget's explicit 10-minute freshness window, this ambiguity makes the warning untestable. A concrete, testable time threshold is required. |
| **LOW** | **[UNVERIFIED]** The row detail drawer's utility is dependent on an existing `RUN_QUERY` providing "rich enough" data. The plan acknowledges this as a risk. From a testability perspective, scenarios where this query returns sparse or empty data must be explicitly tested. The drawer must render gracefully (e.g., show "No logs available") rather than failing or showing empty sections without context. |
| **LOW** | A batch that completes between two polls will "fall off" the list and never be seen in a terminal "completed" state in the live view. While this may be intended, it's an edge case that could be perceived as a bug where runs disappear without confirmation. Tests should verify this behavior to ensure it matches the explicit design, as it's a non-obvious state transition. |

## Residual Risks

- **User Experience of Race Conditions:** Even if the launch-time failure codes are handled correctly, there is a residual risk that the user experience is poor. A user who sees a "Ready" status but is immediately blocked upon clicking "Launch" may perceive the system as unreliable, even if it is technically behaving as designed. The plan mitigates the technical risk but not the potential user frustration.
- **Opacity of Non-Active Work:** The design choice to hide "pending" and "queued" work from the main table and represent them only as a header count risks user anxiety. If a large number of trials are queued and not yet active, a user might believe the system has lost or dropped work, as there is no row-level detail to confirm acceptance. The correctness of the header copy mentioned in the plan is critical to mitigating this.
- **Stall Recovery Ambiguity:** The plan notes that a stalled batch can recover and move back to the live table. The residual risk is the lack of a defined feedback loop for *why* a batch stalled or recovered. Without this, testing can confirm the state transition occurs but cannot easily validate the conditions that trigger it, making it difficult to distinguish between a transient issue and a systemic flaw.

## Token Stats

- total_input=1619
- total_output=830
- total_tokens=16552
- `gemini-2.5-pro`: input=1619, output=830, total=16552

## Resolution
- status: accepted
- note: Resolved by defining a 10-minute budget freshness threshold, a 5-second polling cadence, snapshot-based counts, and explicit drawer fallback behavior for missing run data.
