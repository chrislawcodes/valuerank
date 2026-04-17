---
reviewer: "codex"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/032-queue-depth-governor/tasks.md"
artifact_sha256: "dcc1d157f0392f6e3eb76a966b85d919960321ee9ab3d8a74eb0121855e2569a"
repo_root: "."
git_head_sha: "e6bddd46b1313e99af81c3846a8ae8e741473024"
git_base_ref: "origin/main"
git_base_sha: "9c52998e5757f86c358d3d4be2a2e8febdce3118"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM integrity check: per-provider grouping prevents cross-provider compensation — each bucket capped independently. MEDIUM terminal states: only SUCCESS/FAILED in schema. MEDIUM naming inconsistency: getQueueNameForModel always returns probe_, consistent with probe_% pattern. MEDIUM concurrent race: accepted residual — singleton key serializes execution."
raw_output_path: "docs/workflow/feature-runs/032-queue-depth-governor/reviews/tasks.codex.dependency-order-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

- Medium [UNVERIFIED]: T2 only checks `jobIds.length` against the capped total. That can still pass if one provider queue is underfilled and another is overfilled, so the launch path can violate the per-provider cap without tripping the integrity check.
- Medium [UNVERIFIED]: T3 assumes the only terminal `ProbeResult` states are `SUCCESS` and `FAILED`. If the schema has any other terminal states, the top-up worker will recreate probes that should stay closed.
- Medium [UNVERIFIED]: The plan does not use one queue-name source of truth across all paths. T3/T5 switch to `getQueueNameForModel(modelId)`, while T6/T7/T8 still reason by `probe_*` prefixes. If the provider queue names do not all share that prefix, recovery, stall detection, cancel, and delete logic will miss live jobs or miscount them.
- Medium [UNVERIFIED]: T9 does not cover concurrent `top_up_probes` executions or a race between probe completion and the scheduler backstop. The handler is read-then-insert, so two invocations can observe the same slack and overfill the same provider queue unless the implementation serializes them.

## Residual Risks

- I could not verify the existing queue-name format, the full terminal-state set for `ProbeResult`, or the singleton semantics of the new top-up job. Those are the main assumptions behind this plan.
- The artifact still leaves room for partial-merge states where launch uses the new per-provider queueing before every consumer path has been updated to match.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM integrity check: per-provider grouping prevents cross-provider compensation — each bucket capped independently. MEDIUM terminal states: only SUCCESS/FAILED in schema. MEDIUM naming inconsistency: getQueueNameForModel always returns probe_, consistent with probe_% pattern. MEDIUM concurrent race: accepted residual — singleton key serializes execution.
