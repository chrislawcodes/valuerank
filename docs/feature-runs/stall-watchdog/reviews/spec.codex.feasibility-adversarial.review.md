---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/stall-watchdog/spec.md"
artifact_sha256: "79477542267aef99d74f4bd70cbb53500466ed321dda09406b5214a77a03ec29"
repo_root: "."
git_head_sha: "1bc92c5502d64397cd53f28fed52f4f58ff07934"
git_base_ref: "origin/main"
git_base_sha: "1bc92c5502d64397cd53f28fed52f4f58ff07934"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "FR-001: successful-only completions. FR-011: signalRunActivity keeps scheduler alive. Schema NOT NULL DEFAULT added. Codex#1 rejected: retries-exhausted is orphan detection scope. Threshold risk in Known Limitations."
raw_output_path: "docs/feature-runs/stall-watchdog/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

1. **Critical: models with no prior successful probe are permanently invisible to this detector.** FR-001 and the edge case for “no probes yet” require at least one prior successful `ProbeResult` before a model can ever be marked stalled. That creates a hard blind spot: a provider that fails from the first probe, or a model that never reaches a successful completion, can retry forever and never surface a stall. This is a direct miss for the failure mode the feature is supposed to catch.

2. **High: the keep-alive strategy cannot recover a scheduler that has already gone dormant.** FR-011 only calls `signalRunActivity()` after stall detection runs. If the recovery scheduler has already shut off because no new runs started for an hour, this feature has no stated wake-up path. In that state, a later stall on an existing run will never be detected, so the alerting loop is self-blocking.

3. **High: per-model stall detection is under-specified for paired runs.** The spec assumes PgBoss jobs can be counted by both run and `modelId`, but it does not require a reliable `modelId` on every active/retry/created job or define how paired jobs are split. Without that invariant, the detector can easily misattribute another model’s jobs, producing false positives or false negatives for `stalledModels`.

4. **Medium: multi-model recovery semantics are not defined tightly enough.** FR-003 says a model should be removed when it resumes, but the spec never states whether `stalledModels` must be recomputed as a set difference or updated incrementally. In a run with multiple stalled models, a naive implementation can clear the whole array when one model recovers and hide the remaining stalled models.

## Residual Risks

1. Detection latency is still up to one scheduler cycle beyond the 3-minute threshold, so operators may wait as long as about 8 minutes before seeing the warning.

2. Models that legitimately take longer than 3 minutes per probe will still generate false stall alerts; the spec accepts this, but it remains a real operational risk.

3. If a model hovers around the threshold, stall state can flap between ticks. FR-004 prevents duplicate onset logs, but it does not prevent repeated stall/un-stall cycles.

4. The spec removes the old billing-keyword banner entirely. If there are still provider failures that surface as failed probes rather than stalled progress, this design will not show a separate billing-specific warning anymore.

5. The spec assumes the latest-success probe query and per-model job counts are cheap enough to run every scheduler tick. On large runs, that may become a performance bottleneck unless the underlying queries are indexed and bounded carefully.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: FR-001: successful-only completions. FR-011: signalRunActivity keeps scheduler alive. Schema NOT NULL DEFAULT added. Codex#1 rejected: retries-exhausted is orphan detection scope. Threshold risk in Known Limitations.
