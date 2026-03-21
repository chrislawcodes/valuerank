---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflows/run-status-visualization/reviews/implementation.diff.patch"
artifact_sha256: "24db86d2c069136af35cd918304bf5757b9ba6f39363051c7106218f6bebd6f3"
repo_root: "."
git_head_sha: "aa599ef1dfd54d82d3d0fb6dd7ef4fdfeb32f2fe"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "F1 accepted: totalRetries counts only DB-persisted retries (successful retries not stored). Known limitation per probe-scenario design. F2 accepted: fixed isActiveRun to include SUMMARIZING so panel shows during summarize stage. F3 rejected: returning null when no active providers is existing behavior, not a regression."
raw_output_path: "docs/workflows/run-status-visualization/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

1. **High**: `totalRetries` is not actually counting all retry attempts. The new aggregate in [run.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/types/run.ts:716) sums `probeResult.retryCount`, but retry counts are only persisted on terminal failures in [probe-scenario.ts](/Users/chrislaw/valuerank/cloud/apps/api/src/queue/handlers/probe-scenario.ts:738). Any probe that retries and then succeeds never writes a failure row, so it contributes `0` to this metric. The badge label therefore overstates what is being measured.
2. **High**: The new three-stage progress UI is effectively unreachable in the view that renders it. `ExecutionProgress` is only mounted for `PENDING`/`RUNNING` runs in [RunProgress.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/runs/RunProgress.tsx:143), and `activeStage()` maps both of those statuses to `probe` in [ExecutionProgress.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/runs/ExecutionProgress.tsx:63). As soon as the run becomes `SUMMARIZING`, the whole panel disappears, so the added Summarize/Analyse bars never show during the phases they were introduced for.
3. **Medium**: The provider visibility filter now drops idle-but-configured providers and can blank the entire metrics panel during a live run. In [ExecutionProgress.tsx](/Users/chrislaw/valuerank/cloud/apps/web/src/components/runs/ExecutionProgress.tsx:292), providers are kept only if they have active jobs, queued jobs, or recent completions; the previous `maxParallel > 0` guard is gone. A run with all workers temporarily idle but still active will now render nothing at all, which regresses the old always-on capacity display.

## Residual Risks

- The per-minute rate labels still come from the last 60 seconds of `recentCompletions`, which is capped elsewhere to a small recent window, so bursty runs can still be underreported even after this patch.
- There are no tests here covering the retry aggregate or the new stage-visibility conditions, so regressions in the run lifecycle wiring could slip through again.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: F1 accepted: totalRetries counts only DB-persisted retries (successful retries not stored). Known limitation per probe-scenario design. F2 accepted: fixed isActiveRun to include SUMMARIZING so panel shows during summarize stage. F3 rejected: returning null when no active providers is existing behavior, not a regression.
