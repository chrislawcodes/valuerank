---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/032-queue-depth-governor/spec.md"
artifact_sha256: "445c9e64992206c60ba02538552aa946c628d04b48928edcbdfa556f15402041"
repo_root: "."
git_head_sha: "e6bddd46b1313e99af81c3846a8ae8e741473024"
git_base_ref: "origin/main"
git_base_sha: "9c52998e5757f86c358d3d4be2a2e8febdce3118"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH RUN_INIT_FAILED: already addressed. HIGH queue-pattern mismatch: fixed — recovery-jobs.ts and stall-detection.ts added to scope. MEDIUM top_up_probes visibility: LOW priority, not blocking."
raw_output_path: "docs/workflow/feature-runs/032-queue-depth-governor/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "context files narrowed; spec artifact fully covered"
---

# Review: spec edge-cases-adversarial

## Findings

1. **HIGH** [CODE-CONFIRMED] The spec tells the new top-up path to rebuild work from `models`, `scenarioIds`, and `samplesPerScenario`, but that is not enough to recover the real job set for percentage-based runs or preserve the original probe payload. `start.ts` persists the chosen scenarios in `runScenarioSelection`, and it writes `config.scenarioIds = null` when the run was not started with an explicit scenario list. It also stores `temperature` in the probe job config. A config-only rebuild will mis-enqueue or drop work for those runs. See [`start.ts`](/Users/chrislaw/valuerank/.claude/worktrees/festive-albattani-ec5e5e/cloud/apps/api/src/services/run/start.ts) and [`coverage-completeness.ts`](/Users/chrislaw/valuerank/.claude/worktrees/festive-albattani-ec5e5e/cloud/apps/api/src/services/run/coverage-completeness.ts).

2. **MEDIUM** [CODE-CONFIRMED] The spec does not account for cancellation or delete flows leaving the new provider queues untouched. Existing cancel logic only clears jobs named `probe_scenario`, while the governor routes jobs to provider queues via `probe_${provider}`. That means a canceled or deleted run can keep occupying provider queue depth for the full TTL, which is exactly the saturation problem this feature is trying to prevent. See [`control.ts`](/Users/chrislaw/valuerank/.claude/worktrees/festive-albattani-ec5e5e/cloud/apps/api/src/services/run/control.ts) and [`delete-run.ts`](/Users/chrislaw/valuerank/.claude/worktrees/festive-albattani-ec5e5e/cloud/apps/api/src/mcp/tools/delete-run.ts).

3. **MEDIUM** [CODE-CONFIRMED] The new backstop is tied to the existing recovery scheduler, but that scheduler self-stops after `RECOVERY_ACTIVITY_WINDOW_MS = 60 * 60 * 1000`. `signalRunActivity()` is only used to start or refresh that window. So long-running runs can outlive the scheduler and lose the backstop entirely, which is a weak assumption for a queue-depth governor meant to protect long floods. See [`scheduler.ts`](/Users/chrislaw/valuerank/.claude/worktrees/festive-albattani-ec5e5e/cloud/apps/api/src/services/run/scheduler.ts).

4. **LOW** [CODE-CONFIRMED] The spec adds a new job type but does not update queue-status reporting, which is hard-coded to a fixed set of types. `getQueueStatus()` and its GraphQL wrapper only know about `probe_scenario`, `summarize_transcript`, `analyze_basic`, and `expand_scenarios`, so `top_up_probes` will be invisible in queue health totals and diagnostics. See [`status.ts`](/Users/chrislaw/valuerank/.claude/worktrees/festive-albattani-ec5e5e/cloud/apps/api/src/services/queue/status.ts) and [`queue-status.ts`](/Users/chrislaw/valuerank/.claude/worktrees/festive-albattani-ec5e5e/cloud/apps/api/src/graphql/types/queue-status.ts).

## Residual Risks

- I could not verify the exact SQL and singleton settings for the new `top_up_probes` handler because that file is not provided.
- The provided slice does not show whether any other operational paths, such as ad hoc recovery tools or queue cleanup jobs, also need to learn the new provider queue names.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH RUN_INIT_FAILED: already addressed. HIGH queue-pattern mismatch: fixed — recovery-jobs.ts and stall-detection.ts added to scope. MEDIUM top_up_probes visibility: LOW priority, not blocking.
