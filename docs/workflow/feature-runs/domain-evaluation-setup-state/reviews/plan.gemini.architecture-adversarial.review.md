---
reviewer: "gemini"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/domain-evaluation-setup-state/plan.md"
artifact_sha256: "ca5c316c89d58bba0993f4edaaa0a4175dd153cdec2fb5ead3271cbb77b09311"
repo_root: "."
git_head_sha: "97662ecffedb936831ed31b60c6d66186679077d"
git_base_ref: "origin/claude/parallel-reviews-validated-v2"
git_base_sha: "97662ecffedb936831ed31b60c6d66186679077d"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Resolved by making the backend mutation authoritative for launch readiness, summing provider spend before the compare, surfacing queued work in the header, and grounding the row drawer in the existing run query."
raw_output_path: "docs/workflow/feature-runs/domain-evaluation-setup-state/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

| Severity | Finding |
| :--- | :--- |
| **CRITICAL** | The plan creates a significant observability gap by only showing "live" or "failed" batches in tables. A batch that is accepted by the `startDomainEvaluation` mutation but fails to get picked up from the queue (e.g., due to a misconfiguration or a silent failure in the queuing system) will never appear in the live table or the exceptions table. It will only exist as part of the "pending/queued" header count, giving the user no indication that a specific part of their launch is stuck in a pre-execution state and will never run. This defeats the core purpose of a live monitoring view. |
| **HIGH** | The transition from "live status" to a final, historical report is not defined. The plan states that completed rows "fall off the live list," but it omits what happens after an evaluation is fully complete. This leaves a gap in the user journey, as there is no specified mechanism to view the results, aggregates, or exceptions of a finished launch once it is no longer "live." |
| **HIGH** | The plan introduces a hardcoded 10-minute threshold for budget "freshness," which is a brittle and arbitrary constraint. It assumes that provider budget data cannot be legitimately delayed by more than 10 minutes. This could block valid launches if a provider's API is slow to respond or if the budget update process is delayed for any reason. The system will fail closed, but it will be a false-negative failure that generates user friction and support load, without a clear justification for this specific duration. |
| **MEDIUM** | `[UNVERIFIED]` The utility of the entire exceptions-handling flow is contingent on an "existing no-progress threshold" that is not defined in the plan. The plan defers the critical logic of what constitutes a "stalled" batch to an assumed, pre-existing mechanism. If this existing mechanism is not sufficiently sensitive, is flawed, or does not exist, the "Exceptions" table will be ineffective, and stalled batches will not be correctly reported. |
| **MEDIUM** | `[UNVERIFIED]` The row detail drawer's functionality is wholly dependent on the data richness of an existing, undefined `RUN_QUERY`. The plan notes this as a risk but doesn't specify a fallback or verification step. If the existing query cannot provide meaningful "progress, stage, recent task/log-style data," this feature will either be useless or will require unplanned backend work to augment the query, expanding the project's scope. |
| **MEDIUM** | The proposed set of structured error codes for launch failures (`INSUFFICIENT_BUDGET`, `STALE_BUDGET`, `PROVIDER_DISABLED`) is incomplete. It does not account for other foreseeable server-side failures, such as race conditions with concurrent launches, invalid input parameters not caught by the client, or transient backend errors (e.g., database unavailability). Without a comprehensive set of failure codes, the client will be forced to handle generic errors, leading to a less informative and less resilient user experience. |
| **LOW** | The design appears scoped to a single "current launch" for the entire status view. The plan does not address the scenario where a user might have multiple domain evaluations running concurrently. This could be a limiting design if users need to monitor parallel launches, as it's unclear how they would switch context between them. |

## Residual Risks

- **Silent Pre-Execution Failures:** Even if implemented as written, the plan carries the risk that parts of a launch can fail before becoming "live" without any specific alert or visibility to the user. The aggregate "pending" count will decrease, but the corresponding work item will never appear, creating a "lost work" scenario that is difficult to debug from the UI alone.
- **Race Condition Frustration:** While the plan correctly identifies and handles the race condition between the client-side budget preview and the server-side launch confirmation, it doesn't address the user experience if this happens frequently. In a volatile budget environment, users may be repeatedly blocked from launching, leading to frustration. The system is safe, but not necessarily usable.
- **Inherited Blind Spots:** The plan's heavy reliance on unverified, existing components for stall detection (`no-progress threshold`) and status detail (`RUN_QUERY`) means it will inherit any flaws or blind spots in those systems. The new UI may provide a false sense of comprehensive monitoring if the underlying data sources are incomplete or inaccurate.
- **Polling Under Duress:** The 5-second polling interval is a simple solution but may prove fragile under load. If the backend experiences issues, the repeated polling from all active clients could exacerbate the problem (a thundering herd), and the UI will lack a clear way to indicate to the user that the data they are seeing is stale because a poll request failed.

## Token Stats

- total_input=13194
- total_output=1031
- total_tokens=16700
- `gemini-2.5-pro`: input=13194, output=1031, total=16700

## Resolution
- status: accepted
- note: Resolved by making the backend mutation authoritative for launch readiness, summing provider spend before the compare, surfacing queued work in the header, and grounding the row drawer in the existing run query.
