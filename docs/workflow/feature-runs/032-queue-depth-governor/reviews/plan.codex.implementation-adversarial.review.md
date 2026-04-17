---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/032-queue-depth-governor/plan.md"
artifact_sha256: "dabf22ee43c904507da0361ccb0680a9b907e1d4ddad34612e7badd987a30841"
repo_root: "."
git_head_sha: "e6bddd46b1313e99af81c3846a8ae8e741473024"
git_base_ref: "origin/main"
git_base_sha: "9c52998e5757f86c358d3d4be2a2e8febdce3118"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH dead-letter pattern: fixed — query now excludes probe_dead_letter. MEDIUM requeueMissingProbes bypass: pre-existing issue, not in scope. MEDIUM sampleIndex: clarified in plan — buildRunJobPlan emits individual job tuples with sampleIndex, not reconstructed from counts. MEDIUM scheduler timeout: lightweight backstop; accepted residual."
raw_output_path: "docs/workflow/feature-runs/032-queue-depth-governor/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "context files narrowed; plan artifact fully covered"
---

# Review: plan implementation-adversarial

## Findings

- HIGH [CODE-CONFIRMED] Step 2 in `start-queue.ts` uses `min(PROBE_QUEUE_DEPTH_PER_PROVIDER, jobs.length)` for every provider queue. That uses the total run size, not the current queue size. Because `buildRunJobPlan()` and `getQueueNameForModel()` can produce provider queues with fewer than 15 jobs, this math is invalid for normal uneven runs and can break launch integrity.
- MEDIUM [CODE-CONFIRMED] Step 6 broadens the recovery/stall SQL filter to `probe_%`, but the codebase has a real `probe_dead_letter` queue that intentionally holds failed probe jobs. That filter will count dead-letter jobs as live probe work, which can keep recovery and stall detection from clearing a run.
- MEDIUM [CODE-CONFIRMED] The recovery path still bypasses the new cap. `requeueMissingProbes()` in `recovery-jobs.ts` sends probe jobs directly with the standard probe options and no per-provider depth limit, so recovered runs can refill a queue well past the planned 15-job ceiling.
- MEDIUM [CODE-CONFIRMED] Step 3 does not define how the top-up handler reconstructs `sampleIndex`. The code treats `(runId, scenarioId, modelId, sampleIndex)` as the unique probe key, while `buildRunJobPlan()` only returns `samples` counts. Without explicit expansion to sample indices, top-up can duplicate a sample or leave a hole.
- MEDIUM [CODE-CONFIRMED] The scheduler backstop is time-limited. `scheduler.ts` only refreshes activity at run start and when stalls persist, and `startRecoveryScheduler()` stops the interval after a 1-hour activity window. Long healthy runs can therefore lose the refill sweep before they finish.

## Residual Risks

- The plan still does not define a fairness rule for the first capped batch. Because `buildRunJobPlan()` is model-major, the first wave will favor earlier models within each provider queue unless the implementation adds round-robin selection.
- `top_up_probes` is explicitly non-retrying. A transient DB or PgBoss failure can leave the queue underfilled until another terminal probe or the scheduler sweep retriggers it.
- The plan does not require regression tests for dead-letter exclusion or `sampleIndex` reconstruction, which are the two most likely silent failure points.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH dead-letter pattern: fixed — query now excludes probe_dead_letter. MEDIUM requeueMissingProbes bypass: pre-existing issue, not in scope. MEDIUM sampleIndex: clarified in plan — buildRunJobPlan emits individual job tuples with sampleIndex, not reconstructed from counts. MEDIUM scheduler timeout: lightweight backstop; accepted residual.
