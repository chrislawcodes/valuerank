---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/033-run-state-reconciliation/plan.md"
artifact_sha256: "6da747265f6061859ed54e5cd6a18050cfb411d95a83c6e84ebf1d2b021579ed"
repo_root: "."
git_head_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/033-run-state-reconciliation/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

- HIGH: Removing the empty-run fast exit will strand zero-probe runs in `PENDING`. The current code in [`progress.ts`](/Users/chrislaw/valuerank/.claude/worktrees/distracted-noyce-64917e/cloud/apps/api/src/services/run/progress.ts) explicitly completes runs with `transcripts.length === 0`, and [`recovery.ts`](/Users/chrislaw/valuerank/.claude/worktrees/distracted-noyce-64917e/cloud/apps/api/src/services/run/recovery.ts) only scans `RUNNING`/`SUMMARIZING` runs. The plan removes the only direct completion path but does not add any creation-time or recovery-time trigger for `PENDING` runs with `total = 0`, so they will never advance on their own. Evidence: `[CODE-CONFIRMED]`

- HIGH: The proposed `costDebitedAt` marker is incompatible with the existing reopen flow. [`reopen-premature-runs.ts`](/Users/chrislaw/valuerank/.claude/worktrees/distracted-noyce-64917e/cloud/apps/api/src/cli/reopen-premature-runs.ts) reopens a run after calling [`reverseDeductionForRun()` in `deduct.ts`](/Users/chrislaw/valuerank/.claude/worktrees/distracted-noyce-64917e/cloud/apps/api/src/services/budget/deduct.ts), but that helper only credits provider balances back. It does not clear any transcript-level debit marker. If the plan adds a durable per-transcript `costDebitedAt` flag and never resets it during reopen, the next completion will skip charging those transcripts again, underbilling every reopened run. Evidence: `[CODE-CONFIRMED]`

- MEDIUM: `summarizeFailedAt` is only partially threaded through the summarize lifecycle, so failed transcripts will still be treated as pending in recovery/restart/operator paths. [`summarization.ts`](/Users/chrislaw/valuerank/.claude/worktrees/distracted-noyce-64917e/cloud/apps/api/src/services/run/summarization.ts) still selects and clears only `summarizedAt`, [`recovery-jobs.ts`](/Users/chrislaw/valuerank/.claude/worktrees/distracted-noyce-64917e/cloud/apps/api/src/services/run/recovery-jobs.ts) still queues transcripts where `summarizedAt: null`, and [`get-unsummarized-transcripts.ts`](/Users/chrislaw/valuerank/.claude/worktrees/distracted-noyce-64917e/cloud/apps/api/src/mcp/tools/get-unsummarized-transcripts.ts) still reports “pending” from the old fields. With the plan’s new terminal failure state, those paths will requeue or misreport failed transcripts unless they are updated too. Evidence: `[CODE-CONFIRMED]`

## Residual Risks

- The new state machine still needs an explicit replacement for the current transcript-settle guard in [`progress.ts`](/Users/chrislaw/valuerank/.claude/worktrees/distracted-noyce-64917e/cloud/apps/api/src/services/run/progress.ts). Without that barrier, the last probe can race in-flight transcript commits and the derived completion check can fire too early.

- The reconcile sweep will need planner verification on large runs. The plan shifts more work to derived reads and counts, and the current code already shows hot paths around transcript counting and recovery scans, so query shape and indexes need to be checked against production-sized data.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 