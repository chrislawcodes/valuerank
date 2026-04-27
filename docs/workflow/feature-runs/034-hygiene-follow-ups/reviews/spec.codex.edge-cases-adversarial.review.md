---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/034-hygiene-follow-ups/spec.md"
artifact_sha256: "bd099523508989de3adde43e86bcae06c9f0cf3a2c19e1fa426c98e17baaf753"
repo_root: "."
git_head_sha: "42b7bb726d5992b7810c0346673e7f795365c4c9"
git_base_ref: "origin/main"
git_base_sha: "42b7bb726d5992b7810c0346673e7f795365c4c9"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/034-hygiene-follow-ups/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- HIGH: US-1 does not actually make the reconciliation window tunable end-to-end. `scheduler.ts` still uses the fixed `RECENT_COMPLETED_RUN_WINDOW_DAYS` cutoff inside `enqueueRunStateReconcileJobs()`, so widening `RUN_RECONCILE_WINDOW_DAYS` in `hasRecoveryActivity()` would not enqueue `run_state_reconcile` jobs for older completed runs. The feature would still miss the exact runs it claims to recover. `[CODE-CONFIRMED]`
- MEDIUM: US-4 only caps reconstruction, not visibility of the skipped backlog. `run-state-reconcile.ts` currently turns orphan failures into an `ORPHAN_TRANSCRIPT` draft from `failedIds` only, and this path has no separate call that would surface the overflowed orphans you intentionally left untouched. That means a capped sweep can silently leave uncovered orphans without the anomaly signal the spec promises. `[CODE-CONFIRMED]`

## Residual Risks

- The provided code does not show any consumers of `ORPHAN_TRANSCRIPT` details, so changing the payload from `transcriptIds` to `failedIds` may require a coordinated reader update.
- The env-var change is startup-only by design. If operators expect `RUN_RECONCILE_WINDOW_DAYS` to take effect without restart, this spec does not cover that.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 