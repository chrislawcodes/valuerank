---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/034-hygiene-follow-ups/plan.md"
artifact_sha256: "dc3059aa4677c705270bdfa8b17ed1cfa78427dad71dd2d811079a71d1363479"
repo_root: "."
git_head_sha: "42b7bb726d5992b7810c0346673e7f795365c4c9"
git_base_ref: "origin/main"
git_base_sha: "42b7bb726d5992b7810c0346673e7f795365c4c9"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/034-hygiene-follow-ups/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

- **HIGH [CODE-CONFIRMED]** Wave 4’s orphan-activity predicate is keyed on `summarizedAt IS NOT NULL`, but the actual orphan detector in [`anomaly-detection.ts`](/Users/chrislaw/valuerank/.claude/worktrees/distracted-noyce-64917e/cloud/apps/api/src/services/run/anomaly-detection.ts) only checks for aged transcripts with no matching `probe_results`. It does not require any summary state. As written, the scheduler would stay asleep for the orphan backlog this wave is supposed to cover.

- **HIGH [CODE-CONFIRMED]** The plan only extends scheduler activity tracking, but the only enqueue path for `run_state_reconcile` jobs in [`scheduler.ts`](/Users/chrislaw/valuerank/.claude/worktrees/distracted-noyce-64917e/cloud/apps/api/src/services/run/scheduler.ts) still selects completed runs only when they have at least one transcript with `summarized_at IS NULL` and `summarize_failed_at IS NULL`. A completed run whose only remaining problem is orphaned probe results, with all transcripts already summarized, would never be queued by this path, so the backlog can remain undrained even if the scheduler stays alive.

## Residual Risks

- The new orphan-activity query is likely to be one of the hottest scheduler-path queries, but the artifact does not prove the needed index coverage or query shape. If the join or subquery is not well supported, recovery tick latency can become the bottleneck.

- Wave 2 changes `extractTranscriptTokenUsage` from a permissive fallback to a malformed/fail path. That is directionally sound, but the plan does not spell out how many historical or partially malformed transcripts will now be treated as failures, so behavior may change more than expected.

- The env-var window helper makes reconcile behavior deployment-config driven, but the plan does not make the restart requirement explicit in the implementation contract. If operators expect live reload of `RUN_RECONCILE_WINDOW_DAYS`, they will not get it.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
