---
reviewer: "codex"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/033-run-state-reconciliation/reviews/implementation.diff.patch"
artifact_sha256: "ca11349d52249e5df76e293593a66aa165dff8db4bb5ecceac8e1ad8e739746d"
repo_root: "."
git_head_sha: "6ae16040e5541c3c9c33903a340e3990c38ca262"
git_base_ref: "b734f00a"
git_base_sha: "b734f00ae4b779dc2297c26496285e09ea719e2a"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/033-run-state-reconciliation/reviews/diff.codex.regression-adversarial.review.md.raw.txt"
narrowed_artifact_path: "docs/workflow/feature-runs/033-run-state-reconciliation/reviews/diff.codex.regression-adversarial.review.md.narrowed.txt"
narrowed_artifact_sha256: "de4aa25cf4a3bb733fc17a56d4c6fc5a36c4cb0064359a3baea3f31ca29a7700"
coverage_status: "partial"
coverage_note: "artifact exceeded max_artifact_chars and was narrowed"
---

# Review: diff regression-adversarial

## Findings

- **Medium [UNVERIFIED]** `cloud/apps/api/src/services/run/summarization.ts` now narrows the restart set to `deletedAt: null, summarizedAt: null, summarizeFailedAt: null` and drops the old `decisionMetadata = DbNull` retry branch. That means transcripts that were already marked summarized but still need a rerun because they never got valid decision metadata will now be skipped instead of being re-queued.
- **Medium [UNVERIFIED]** `cloud/apps/api/src/services/run/recovery.ts` stopped explicitly queueing summarize jobs when it detects a run should enter `SUMMARIZING`, and now relies on `maybeAdvanceRunStatus()` to do the right thing. If that helper only updates state and does not enqueue jobs, a recovered run can get stuck in `SUMMARIZING` with no transcript work scheduled. The new `run-state-reconcile.ts` path makes the same assumption for late-arriving transcripts.
- **Medium [UNVERIFIED]** The new reconciliation and late-probe paths call `getBoss().send(...)` without the old null guard. If these jobs run before the boss is initialized, or during shutdown/recovery windows, they will now throw instead of skipping cleanly, which can drop the repair action entirely.

## Residual Risks

- The refactor replaces counter-based progress with derived reads, but the artifact does not show `maybeAdvanceRunStatus()` or `computeRunProgress()`. If either one counts deleted, failed, or legacy rows differently from the old logic, run-state transitions can still drift.
- `updateSummarizeProgress()` in `cloud/apps/api/src/services/run/summarize-progress.ts` is now read-only. Any remaining caller that still expects it to mutate progress will silently stop making forward progress.
- The new recovery scheduler is broader and more opinionated. Even if it is correct, it may add extra queue traffic and more chances for duplicate recovery work when multiple recovery paths overlap.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 