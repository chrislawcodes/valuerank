---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/033-run-state-reconciliation/plan.md"
artifact_sha256: "6da747265f6061859ed54e5cd6a18050cfb411d95a83c6e84ebf1d2b021579ed"
repo_root: "."
git_head_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/033-run-state-reconciliation/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1.  **HIGH - Unhandled side-effects of re-triggering analysis on COMPLETED runs.** The plan's Wave 4 proposes that a late-arriving summary on an already `COMPLETED` run will re-trigger `triggerBasicAnalysis`. The existing logic in `summarize-persistence.ts` shows analysis is normally triggered only once when a run first completes. The plan does not address the idempotency or potential side-effects of re-running this analysis, which could lead to duplicated or inconsistent `AnalysisResult` records. This introduces a significant risk of data corruption in analysis outputs. [CODE-CONFIRMED]

2.  **MEDIUM - Monolithic and untestable sweep handler design.** The proposed `run-state-reconcile` handler in Waves 5 and 6 combines multiple distinct responsibilities: rescuing late transcripts, advancing run status, and detecting/repairing several types of anomalies. This monolithic design makes the component difficult to test in isolation and less resilient. A failure in one sub-task (e.g., repairing `PAIR_ASYMMETRY`) could prevent another critical task (e.g., advancing a run to `COMPLETED`) from executing within the same job. This violates the principle of separation of concerns and makes the system harder to debug and maintain. [UNVERIFIED]

3.  **MEDIUM - Brittle backfill logic for failed summaries.** The Wave 1 migration plan proposes backfilling the new `summarize_failed_at` field based on a `LIKE 'Summary failed%'` query on the `decision_text` column. While `summarize-persistence.ts` confirms this text is currently used for failures, this approach is brittle. It assumes this text pattern has been used consistently throughout the application's history and never manually altered. Any historical failures that do not match this exact pattern will be missed by the backfill, leaving them in a state where the new reconciliation logic will perpetually and incorrectly try to re-summarize them. [CODE-CONFIRMED]

4.  **LOW - Imprecise plan for updating progress calculation logic.** The plan's Wave 3 states that `calculatePercentComplete` will be "rewritten". However, the provided `progress.ts` shows this is a pure function that takes progress data as input. The function itself does not need a rewrite; rather, its *callers* must be updated to feed it data derived from the new `computeRunProgress` service. This imprecision could lead a developer to miss updating a call site, resulting in parts of the application (e.g., UI components) continuing to display stale progress data from the old `Run.progress` JSON blob. [CODE-CONFIRMED]

## Residual Risks

1.  **Risk: `deductSingleTranscriptBalance` introduces rounding errors.** The plan correctly identifies that `Transcript.estimatedCost` is a `Float` while provider balances are `Decimal`, and that per-transcript debits could accumulate rounding "dust". While accepted in the plan, this is a testability gap. The verification step only suggests a simulation. A more robust test would be an integration test that creates thousands of mock transcripts, debits them individually, and asserts the final provider balance matches an aggregate calculation to quantify the maximum potential drift.

2.  **Risk: Anomaly detector for `ScheduledCountMismatch` could cause cascading failures.** The plan's Wave 6 moves the auto-repair for `ScheduledCountMismatch` into the sweep handler. The verification calls for testing that the repair is a no-op on the second run. However, it does not test what happens if the *detection* logic is flawed and repeatedly reports a mismatch that has already been repaired. This could cause the sweep to perform unnecessary writes on every execution, creating database churn and potentially masking other issues.

3.  **Risk: Concurrency test for CAS updates may be insufficient.** The plan's verification for the `maybeAdvanceRunStatus` CAS logic (Wave 3) is to launch two parallel calls and assert only one succeeds. This is a good start, but it doesn't cover more complex race conditions, such as a probe handler and a reconciliation sweep attempting to advance the status of the same run simultaneously. The test should be designed to simulate contention between different *types* of callers, not just two identical ones.

## Token Stats

- total_input=68909
- total_output=903
- total_tokens=73735
- `gemini-2.5-pro`: input=68909, output=903, total=73735

## Resolution
- status: open
- note: