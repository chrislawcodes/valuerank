---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/domain-evaluation-setup-state/plan.md"
artifact_sha256: "ca5c316c89d58bba0993f4edaaa0a4175dd153cdec2fb5ead3271cbb77b09311"
repo_root: "."
git_head_sha: "97662ecffedb936831ed31b60c6d66186679077d"
git_base_ref: "origin/claude/parallel-reviews-validated-v2"
git_base_sha: "97662ecffedb936831ed31b60c6d66186679077d"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Resolved by keeping queued work visible in a header count, using the current launch record for aggregate counts, and basing the drawer on existing run details instead of inferred state."
raw_output_path: "docs/workflow/feature-runs/domain-evaluation-setup-state/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- **Medium**: Polling stops at the wrong time. The plan says the status view refreshes only while there is live or queued work, but stalled and failed batches are moved to a separate exceptions table. That means the UI can stop polling exactly when the only remaining items are exceptions, so a stalled batch that recovers or a failed batch that gets retried may never reappear without a manual refresh.
- **Medium**: The count model is underspecified and likely to drift from what users can inspect. Completed rows are dropped from the live table, failed runs can be replaced by retries, and counts are still sourced from the launch record. The plan never defines tombstones, replacement ordering, or whether retries preserve the original row identity, so header totals can stop matching the visible row set.
- **Medium [UNVERIFIED]**: The detail drawer promises more data than the backend slice guarantees. The plan only adds `updatedAt`, `stalledModels`, and `analysisStatus` to the status query, but the drawer is supposed to show progress, stage, recent task/log-style data, and execution metrics. If `RUN_QUERY` does not already provide all of that for every `runId`, the drawer will be incomplete or fail to meet its contract.
- **Medium [UNVERIFIED]**: The budget gate is too easy to make overly broad. The readiness check blocks launches when any provider is underfunded, missing a budget signal, or has a stale snapshot, but the plan does not state that this is scoped only to providers actually used by the current launch. If the GraphQL data set includes unrelated providers, one stale or disabled provider could block an otherwise valid launch, and there is no refresh or override path for transient telemetry failures.

## Residual Risks

- The design still depends on backend stall detection and retry semantics lining up exactly with the live/exceptions split in the UI.
- The 10-minute freshness threshold is a hard cutoff; if budget telemetry routinely lags longer than that, operators will see avoidable launch blocks.
- Dropping completed rows from the live table reduces auditability, so users may need a separate history view if they need to reconstruct what happened after the launch finishes.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Resolved by keeping queued work visible in a header count, using the current launch record for aggregate counts, and basing the drawer on existing run details instead of inferred state.
