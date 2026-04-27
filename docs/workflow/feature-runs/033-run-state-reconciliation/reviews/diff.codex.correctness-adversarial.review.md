---
reviewer: "codex"
lens: "correctness-adversarial"
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
raw_output_path: "docs/workflow/feature-runs/033-run-state-reconciliation/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: "docs/workflow/feature-runs/033-run-state-reconciliation/reviews/diff.codex.correctness-adversarial.review.md.narrowed.txt"
narrowed_artifact_sha256: "de4aa25cf4a3bb733fc17a56d4c6fc5a36c4cb0064359a3baea3f31ca29a7700"
coverage_status: "partial"
coverage_note: "artifact exceeded max_artifact_chars and was narrowed"
---

# Review: diff correctness-adversarial

## Findings

- Medium [UNVERIFIED]: `cloud/apps/api/src/services/run/summarization.ts` no longer retries legacy transcripts that are already `summarizedAt != null` but still have `decisionMetadata` missing/`DbNull`. The old branch explicitly picked those up; the new `force: false` path only selects `summarizedAt: null` and `summarizeFailedAt: null`, so a non-force restart can now leave those records permanently unrepaired.
- Medium [UNVERIFIED]: `cloud/apps/api/src/queue/handlers/probe-scenario/retry.ts` removed the pre-check of the existing probe result before recording a terminal failure. That means a late failure from an older attempt can now be written after a success for the same `(runId, scenarioId, modelId, sampleIndex)` key, which can flip the canonical probe state back to failed or otherwise create conflicting state if `recordProbeFailure` is not strictly idempotent.
- Medium [UNVERIFIED]: `cloud/apps/api/src/queue/handlers/run-state-reconcile.ts` repairs orphan transcripts by calling `recordProbeSuccess`, but it never queues `summarize_transcript` jobs for those repaired transcripts. If the run is already `COMPLETED` when the reconcile job runs, the code also skips the final `maybeAdvanceRunStatus` path, so the repair can finish without making the transcript summarizeable or summarized.

## Residual Risks

- The new `maybeAdvanceRunStatus` helper is a hidden dependency in several paths. I could not verify from this artifact whether it also queues summarize jobs and clears stalled state, so any call site that now relies on that side effect may still be wrong.
- I could not verify whether `recordProbeFailure` and `recordProbeSuccess` enforce the unique probe key as a true state machine. If they already guard against stale overwrites, the probe-failure regression risk above is reduced, but that is not visible here.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 