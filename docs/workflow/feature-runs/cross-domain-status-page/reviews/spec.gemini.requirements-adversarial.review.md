---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/cross-domain-status-page/spec.md"
artifact_sha256: "d4b8c700653ba3f3758969f2325021f48034bfb085c83644ef5e68586961a1ab"
repo_root: "."
git_head_sha: "728da7d111003c5b052de4afad7f33501fbe10ba"
git_base_ref: "origin/main"
git_base_sha: "ee49253d6dd9ce8c0dfd6789aad31716b74634e8"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "CRITICAL cross-domain authorization — clarified by Decision 3 (ValueRank has a flat user model; all 6 users already see all 4 domains; mutations require authentication but no per-domain check is added in v1). HIGH manual Resolve flapping — accepted by design (per spec assumption: detector re-fire is the desired behavior, not a UX flaw; if the empty keeps coming back, that's signal). HIGH re-probe atomicity — addressed by Decision 2 (transaction). HIGH hard route removal user-hostile — rejected; user explicitly chose break-loudly per Story 4. MEDIUM circuit breaker — addressed by Decision 7 (cap at 3 re-probes per slot). MEDIUM ETA volatility — addressed by Decision 5 (≥3 completions floor; below floor, ETA is empty cell, not synthetic fallback). MEDIUM detection brittleness — accepted with verification; spec residual risk #2 already specifies a unit-test guard against `transcript.content` shape changes."
raw_output_path: "docs/workflow/feature-runs/cross-domain-status-page/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### **CRITICAL**

1.  **Authorization Model Is Dangerously Underspecified.** The spec states the page requires authentication but not an admin role (Assumption #1, FR-022), but it fails to address resource-based authorization. A malicious or curious user could likely craft GraphQL requests to access information or perform actions on domains they are not assigned to. The mutations `reprobeAnomalySlot` and `resolveRunAnomaly` accept an `anomalyId` but there is no mention of checking if the authenticated user has rights to that anomaly's run or domain. This could lead to cross-tenant data leakage or unauthorized actions (e.g., user from Domain A re-probing and spending budget on behalf of Domain B).

### **HIGH**

1.  **Manual `[Resolve]` Creates a "Flapping Anomaly" State.** User Story 7, Acceptance Scenario 3 explicitly states that if a manually resolved anomaly's underlying condition persists, a new anomaly will be created. This is a significant UX flaw. A user who clicks `[Resolve]` believes they have handled the issue. Seeing it reappear on the next cycle will cause confusion and frustration, eroding trust in the system. The system lacks a true "ignore this specific instance" or "won't fix" state, making manual resolution a temporary and misleading action.
2.  **Re-probe Mutation Is Not Atomic, Risking Data Inconsistency.** Per FR-011 and Assumption #9, the re-probe action is a complex sequence: verify, soft-delete transcript, *hard-delete* `probe_results` row, then enqueue. This is not described as being wrapped in a transaction. If the `probe_results` deletion fails after the transcript is soft-deleted, the slot will be stuck in a broken, non-re-probe-able state because the idempotency guard row still exists. This creates a new, more complex anomaly that requires manual database intervention to fix.
3.  **Hard Route Removal is User-Hostile and Unnecessary.** User Story 4 mandates removing the old `/domains/status/:domainId` route to "fail loudly." While the user base is small, this is a disruptive and developer-centric choice. It breaks existing bookmarks, links shared in Slack/email, and browser history. A more user-centric approach would be a permanent redirect to the new `/status` page, perhaps with a one-time banner explaining the change. The current plan prioritizes developer convenience (finding old call sites) over user workflow continuity.

### **MEDIUM**

1.  **Re-probe Mechanism Lacks a Circuit Breaker, Risking Budget Overruns. [UNVERIFIED]** A user can repeatedly click `[Re-probe]` on a failing slot (Edge Cases: "Re-probe failure" just leaves the anomaly open). This could be an expensive model that fails for a persistent reason (e.g., a toxic prompt). The system lacks a circuit breaker (e.g., "This slot has failed re-probe 3 times and is now locked") or cost-based confirmation ("Re-probing this slot will cost an estimated $X.xx. Continue?"). This exposes the system to potential budget waste on unresolvable slots.
2.  **ETA Calculation Logic Is Prone to Volatility.** Per Assumption #5 and User Story 6, the ETA calculation relies on a rolling 5-minute throughput and only uses this after 3 completions. For new or slow models, this will cause the ETA to be highly volatile and jumpy (e.g., swinging from "2 hours" to "15 minutes" on the third completion). This erodes user trust in the displayed ETA, making the feature less useful.
3.  **`EMPTY_TARGET_RESPONSE` Detection is Brittle. [UNVERIFIED]** Assumption #10 ties detection to `computeTranscriptResponseSha256(content)` returning `null`. This is a proxy for emptiness. If the underlying `content` structure changes in the future, or if a different kind of empty (e.g., `{ "response": "" }`) is possible, the detector will silently fail. The logic should be defined against a semantic "is empty" helper function, not a specific cryptographic hash implementation detail returning null.

## Residual Risks

1.  **Concurrent Actions Create Race Conditions.** The spec acknowledges concurrent re-probes but not other races. What happens if a user clicks `[Resolve]` while an automatic `syncAnomalies()` process is resolving the same anomaly? Or if one user re-probes while another resolves? Without transactional locks or robust state validation (e.g., passing a `version` number), these race conditions could lead to inconsistent states or failed updates.
2.  **Polling Becomes a Performance Bottleneck.** The spec acknowledges this risk but the mitigation (`p95 < 1s at 1000 rows`) may be insufficient. The cost is not just DB time, but also server processing and network transfer for all active browser tabs. A more scalable solution like WebSockets or Server-Sent Events should be considered for the v2 design, as the polling approach will not scale with user growth or data volume.
3.  **Soft-Deleting Transcripts Obscures History.** The re-probe process soft-deletes the original transcript (Assumption #9). While this preserves it in the database, it is hidden from the user. There is no UI path described to view the "original" anomalous transcript after a re-probe is initiated. This makes it difficult to debug *why* the anomaly occurred in the first place, as the evidence is hidden.
4.  **"Stalled" Flag Exacerbates a Known Data Quality Issue.** Surfacing the binary `Run.stalledModels[]` flag (per the spec's own risk assessment) in this new high-visibility UI will amplify user confusion and false positives. Users will now see the `stalled` flag more prominently and frequently, leading to support requests and a loss of confidence in the status indicators, even though it is a known issue. The new UI makes an existing problem more visible and therefore more urgent to fix.

## Token Stats

- total_input=20716
- total_output=1298
- total_tokens=24014
- `gemini-2.5-pro`: input=20716, output=1298, total=24014

## Resolution
- status: accepted
- note: CRITICAL cross-domain authorization — clarified by Decision 3 (ValueRank has a flat user model; all 6 users already see all 4 domains; mutations require authentication but no per-domain check is added in v1). HIGH manual Resolve flapping — accepted by design (per spec assumption: detector re-fire is the desired behavior, not a UX flaw; if the empty keeps coming back, that's signal). HIGH re-probe atomicity — addressed by Decision 2 (transaction). HIGH hard route removal user-hostile — rejected; user explicitly chose break-loudly per Story 4. MEDIUM circuit breaker — addressed by Decision 7 (cap at 3 re-probes per slot). MEDIUM ETA volatility — addressed by Decision 5 (≥3 completions floor; below floor, ETA is empty cell, not synthetic fallback). MEDIUM detection brittleness — accepted with verification; spec residual risk #2 already specifies a unit-test guard against `transcript.content` shape changes.
