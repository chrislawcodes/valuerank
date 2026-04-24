---
reviewer: "gpt-5"
lens: "restatement-judge"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/033-run-state-reconciliation/spec.md"
artifact_sha256: "32613ca457104617746d439d696403206c0d704d3d3391d4cf3414a4c4dcd282"
repo_root: "."
git_head_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "judge-panel"
resolution_status: "open"
resolution_note: "All latest-round findings are NEW because the record explicitly says there were no earlier rounds to restate: \"No prior findings yet.\" That means none of the latest findings can satisfy the restatement test, which requires an earlier fin..."
raw_output_path: "docs/workflow/feature-runs/033-run-state-reconciliation/reviews/judge.restatement.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec restatement-judge

## Findings

All latest-round findings are NEW because the record explicitly says there were no earlier rounds to restate: "No prior findings yet." That means none of the latest findings can satisfy the restatement test, which requires an earlier finding plus an orchestrator response that substantively addressed it. The latest round surfaces multiple distinct failure modes not previously covered, including stale side effects after late transcript repair, stale stalled-model metadata after CAS completion, deprecated percent-complete drift risk, brittle backfill logic for summarize failures, missing composite indexing on a critical query path, inconsistent PAUSED-state reconciliation coverage, unsafe direct completion writes in recovery logic, a summarize-failure livelock loop, and reliance on launch-time totals as a single point of failure. Because 0% of the latest findings are restatements, the loop is still producing signal rather than noise, so the correct decision is to block.

## Residual Risks

- earlier-rounds :: prior-findings - No prior findings yet.
- spec.codex.edge-cases-adversarial.review.md :: high-1 - The late-transcript repair path only reruns `triggerBasicAnalysis(runId)` for a `COMPLETED` run... the spec does not rerun those two side effects after a late transcript is summarized, a run can be published with stale token stats and stale balance accounting forever.
- spec.codex.edge-cases-adversarial.review.md :: medium-2 - The proposed CAS SQL drops the existing `stalled_models` reset... completed runs will retain stale stalled-model metadata and any downstream UI or alerting that reads it will be wrong.
- spec.codex.edge-cases-adversarial.review.md :: low-3 - `progress.ts` still exposes `calculatePercentComplete(progress)` from the deprecated JSONB counters. If any resolver or UI path keeps calling that helper after cutover, the new derived progress numbers and the displayed percentage will diverge.
- spec.gemini.requirements-adversarial.review.md :: high-1 - The proposed data backfill to populate the new `summarizeFailedAt` column relies on a `LIKE 'Summary failed%'` string match against `decisionText`. This is brittle.
- spec.gemini.requirements-adversarial.review.md :: high-2 - The provided `schema.prisma` shows separate indexes on `runId` and `status`, but lacks a composite index on `(runId, status)`.
- spec.gemini.requirements-adversarial.review.md :: medium-3 - Several other parts of the design described in the spec omit `PAUSED`... a run that becomes stuck while `PAUSED` would not be picked up by the reconciliation sweep.
- spec.gemini.requirements-adversarial.review.md :: medium-4 - This file contains logic to directly update a run's status to `COMPLETED` (`data: { status: 'COMPLETED' }`). This is a significant issue because it represents a backdoor that bypasses the entire new system of derived-count checks and atomic CAS updates.
- spec.gemini.requirements-adversarial.review.md :: medium-5 - A transcript with `summarizeFailedAt` set would appear "pending" to the handler... creating a persistent, useless job-queueing loop and wasting resources.
- spec.gemini.requirements-adversarial.review.md :: low-6 - The `RUNNING -> SUMMARIZING` completion logic correctly uses a derived count for `completed` and `failed` probes but continues to trust `Run.progress.total` as the authoritative denominator.

## Verdict (structured)

```json
{
  "confidence": 5,
  "evidence": [
    {
      "artifact": "earlier-rounds",
      "quote": "No prior findings yet.",
      "section": "prior-findings"
    },
    {
      "artifact": "spec.codex.edge-cases-adversarial.review.md",
      "quote": "The late-transcript repair path only reruns `triggerBasicAnalysis(runId)` for a `COMPLETED` run... the spec does not rerun those two side effects after a late transcript is summarized, a run can be published with stale token stats and stale balance accounting forever.",
      "section": "high-1"
    },
    {
      "artifact": "spec.codex.edge-cases-adversarial.review.md",
      "quote": "The proposed CAS SQL drops the existing `stalled_models` reset... completed runs will retain stale stalled-model metadata and any downstream UI or alerting that reads it will be wrong.",
      "section": "medium-2"
    },
    {
      "artifact": "spec.codex.edge-cases-adversarial.review.md",
      "quote": "`progress.ts` still exposes `calculatePercentComplete(progress)` from the deprecated JSONB counters. If any resolver or UI path keeps calling that helper after cutover, the new derived progress numbers and the displayed percentage will diverge.",
      "section": "low-3"
    },
    {
      "artifact": "spec.gemini.requirements-adversarial.review.md",
      "quote": "The proposed data backfill to populate the new `summarizeFailedAt` column relies on a `LIKE 'Summary failed%'` string match against `decisionText`. This is brittle.",
      "section": "high-1"
    },
    {
      "artifact": "spec.gemini.requirements-adversarial.review.md",
      "quote": "The provided `schema.prisma` shows separate indexes on `runId` and `status`, but lacks a composite index on `(runId, status)`.",
      "section": "high-2"
    },
    {
      "artifact": "spec.gemini.requirements-adversarial.review.md",
      "quote": "Several other parts of the design described in the spec omit `PAUSED`... a run that becomes stuck while `PAUSED` would not be picked up by the reconciliation sweep.",
      "section": "medium-3"
    },
    {
      "artifact": "spec.gemini.requirements-adversarial.review.md",
      "quote": "This file contains logic to directly update a run's status to `COMPLETED` (`data: { status: 'COMPLETED' }`). This is a significant issue because it represents a backdoor that bypasses the entire new system of derived-count checks and atomic CAS updates.",
      "section": "medium-4"
    },
    {
      "artifact": "spec.gemini.requirements-adversarial.review.md",
      "quote": "A transcript with `summarizeFailedAt` set would appear \"pending\" to the handler... creating a persistent, useless job-queueing loop and wasting resources.",
      "section": "medium-5"
    },
    {
      "artifact": "spec.gemini.requirements-adversarial.review.md",
      "quote": "The `RUNNING -> SUMMARIZING` completion logic correctly uses a derived count for `completed` and `failed` probes but continues to trust `Run.progress.total` as the authoritative denominator.",
      "section": "low-6"
    }
  ],
  "judge": "restatement",
  "model": "gpt-5",
  "reasoning": "All latest-round findings are NEW because the record explicitly says there were no earlier rounds to restate: \"No prior findings yet.\" That means none of the latest findings can satisfy the restatement test, which requires an earlier finding plus an orchestrator response that substantively addressed it. The latest round surfaces multiple distinct failure modes not previously covered, including stale side effects after late transcript repair, stale stalled-model metadata after CAS completion, deprecated percent-complete drift risk, brittle backfill logic for summarize failures, missing composite indexing on a critical query path, inconsistent PAUSED-state reconciliation coverage, unsafe direct completion writes in recovery logic, a summarize-failure livelock loop, and reliance on launch-time totals as a single point of failure. Because 0% of the latest findings are restatements, the loop is still producing signal rather than noise, so the correct decision is to block.",
  "timestamp": "2026-04-23T00:00:00-07:00",
  "verdict": "block"
}
```

## Resolution
- status: open
- note: All latest-round findings are NEW because the record explicitly says there were no earlier rounds to restate: "No prior findings yet." That means none of the latest findings can satisfy the restatement test, which requires an earlier fin...
