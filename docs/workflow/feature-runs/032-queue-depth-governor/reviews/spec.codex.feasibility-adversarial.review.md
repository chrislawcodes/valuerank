---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/032-queue-depth-governor/spec.md"
artifact_sha256: "445c9e64992206c60ba02538552aa946c628d04b48928edcbdfa556f15402041"
repo_root: "."
git_head_sha: "e6bddd46b1313e99af81c3846a8ae8e741473024"
git_base_ref: "origin/main"
git_base_sha: "9c52998e5757f86c358d3d4be2a2e8febdce3118"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH RUN_INIT_FAILED: fixed in spec — integrity check now compares against capped initial count. MEDIUM findMissingProbes: fixed — spec requires queue-aware helper that checks PgBoss state. MEDIUM scheduler scope: lightweight backstop only; residual risk accepted."
raw_output_path: "docs/workflow/feature-runs/032-queue-depth-governor/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "context files narrowed; spec artifact fully covered"
---

# Review: spec feasibility-adversarial

## Findings

- HIGH [CODE-CONFIRMED] The spec leaves `requeueMissingProbes()` untouched, and the provided code shows that helper still enqueues every missing probe one by one with no cap. That means the recovery/orphan path can still flood provider queues with the full backlog and recreate the exact TTL-expiry failure this feature is meant to prevent. This is a root-cause gap, not just a logging gap.

- MEDIUM [CODE-CONFIRMED] The spec scopes new job registration to `queue/handlers/index.ts`, but the actual bootstrap shown there does not own the job list. It iterates `handlerRegistrations`, which comes from `handler-config.ts`, to create queues and register workers. If `top_up_probes` is not added at that source of truth, the new job type will not be created or worked at all.

- MEDIUM [CODE-CONFIRMED] The spec omits the existing `RUN_PAUSED` deferral path in `probe-scenario/handler.ts`. The current code throws `RUN_PAUSED: Job deferred because run is paused` and leaves the job in the queue. A top-up hook that fires on “any terminal-ish exit” or any thrown error, rather than only true terminal success/final-failure paths, would incorrectly refill capacity while the original job slot is still occupied.

- LOW [UNVERIFIED] The spec assumes the top-up handler can rebuild the full missing probe set from persisted run state, but the provided code only shows `run.config.models`, `samplesPerScenario`, and a scenario count in recovery helpers. It does not show a persisted scenario-id list or another complete plan source. If that data is not stored elsewhere, the queue-aware top-up logic cannot reconstruct missing work reliably after restart.

## Residual Risks

- I could not verify where the full launch plan is persisted, so the “recompute missing probes on demand” design still needs proof against the actual run data model.
- The recovery/backstop logic also depends on the exact provider-queue naming matching the SQL patterns in the stall/recovery helpers; that alignment is not fully visible in the provided code.
- Even if the cap works at launch, the feature still needs careful testing around duplicate completions, paused runs, and recovery re-entry so the singleton top-up does not become a new source of drift.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH RUN_INIT_FAILED: fixed in spec — integrity check now compares against capped initial count. MEDIUM findMissingProbes: fixed — spec requires queue-aware helper that checks PgBoss state. MEDIUM scheduler scope: lightweight backstop only; residual risk accepted.
