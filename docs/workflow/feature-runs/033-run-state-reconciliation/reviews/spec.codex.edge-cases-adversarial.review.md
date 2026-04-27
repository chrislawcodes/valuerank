---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/033-run-state-reconciliation/spec.md"
artifact_sha256: "32613ca457104617746d439d696403206c0d704d3d3391d4cf3414a4c4dcd282"
repo_root: "."
git_head_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Judge panel voted advance (2 proceed, 1 block); HIGH findings addressed in spec rev 4 — see spec Design section and Files in Scope; remaining items deferred to plan phase via Open Questions"
raw_output_path: "docs/workflow/feature-runs/033-run-state-reconciliation/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- HIGH [CODE-CONFIRMED] The late-transcript repair path only reruns `triggerBasicAnalysis(runId)` for a `COMPLETED` run, but current completion logic also performs `queueComputeTokenStats(runId)` and `deductActualProviderBalancesForRun(runId)` on the winner path. Because the spec does not rerun those two side effects after a late transcript is summarized, a run can be published with stale token stats and stale balance accounting forever. Evidence: [`summarize-persistence.ts`](/Users/chrislaw/valuerank/.claude/worktrees/distracted-noyce-64917e/cloud/apps/api/src/queue/handlers/summarize-persistence.ts).
- MEDIUM [CODE-CONFIRMED] The proposed CAS SQL drops the existing `stalled_models` reset. Today both `transitionStatus()` and the summarize-completion update clear `stalledModels` when a run leaves `RUNNING` or `SUMMARIZING`. The spec’s `UPDATE runs ...` snippets only set `status` and `completed_at`, so completed runs will retain stale stalled-model metadata and any downstream UI or alerting that reads it will be wrong. Evidence: [`progress.ts`](/Users/chrislaw/valuerank/.claude/worktrees/distracted-noyce-64917e/cloud/apps/api/src/services/run/progress.ts) and [`summarize-persistence.ts`](/Users/chrislaw/valuerank/.claude/worktrees/distracted-noyce-64917e/cloud/apps/api/src/queue/handlers/summarize-persistence.ts).
- LOW [UNVERIFIED] [`progress.ts`](/Users/chrislaw/valuerank/.claude/worktrees/distracted-noyce-64917e/cloud/apps/api/src/services/run/progress.ts) still exposes `calculatePercentComplete(progress)` from the deprecated JSONB counters. If any resolver or UI path keeps calling that helper after cutover, the new derived progress numbers and the displayed percentage will diverge. I could not verify the call sites from the provided context.

## Residual Risks

- I did not verify every caller of `calculatePercentComplete()`, so there may be additional stale-progress display paths beyond the one helper.
- The sweep scheduler still has to be reconciled with the existing recovery idle-shutdown behavior; if that activation logic is not changed exactly as planned, `run_state_reconcile` can still stop running while stranded transcripts exist.
- The spec assumes the late-transcript rescue job is idempotent at the queue layer, but the provided code does not show the singleton or dedup key for that new job type.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Judge panel voted advance (2 proceed, 1 block); HIGH findings addressed in spec rev 4 — see spec Design section and Files in Scope; remaining items deferred to plan phase via Open Questions
