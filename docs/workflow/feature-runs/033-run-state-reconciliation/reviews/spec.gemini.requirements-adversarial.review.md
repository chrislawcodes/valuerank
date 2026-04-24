---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/033-run-state-reconciliation/spec.md"
artifact_sha256: "32613ca457104617746d439d696403206c0d704d3d3391d4cf3414a4c4dcd282"
repo_root: "."
git_head_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Judge panel voted advance (2 proceed, 1 block); HIGH findings addressed in spec rev 4 — see spec Design section and Files in Scope; remaining items deferred to plan phase via Open Questions"
raw_output_path: "docs/workflow/feature-runs/033-run-state-reconciliation/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

1.  **HIGH: Fragile Data Migration for Summarize Failures.** The proposed data backfill to populate the new `summarizeFailedAt` column relies on a `LIKE 'Summary failed%'` string match against `decisionText`. This is brittle. While the current implementation in `summarize-persistence.ts` uses this string, any past variations, localization, or future changes to this error message format would be missed by the migration. This would leave those failed transcripts in a state where they are neither `summarized` nor `failed`, causing the new completion logic to stall indefinitely for those runs. [CODE-CONFIRMED]

2.  **HIGH: Missing Composite Index for Performance-Critical Query.** The entire feature's performance, especially the event-driven completion checks, hinges on the `computeRunProgress` helper being fast. This helper will frequently query `ProbeResult` with `WHERE run_id = $1 AND status = $2`. The provided `schema.prisma` shows separate indexes on `runId` and `status`, but lacks a composite index on `(runId, status)`. For a table with millions of rows, the database might resort to a less efficient bitmap scan or sequential filtering, making this critical-path query a potential performance bottleneck that could slow down or time out job handlers. [CODE-CONFIRMED]

3.  **MEDIUM: Inconsistent Handling of `PAUSED` State.** The spec's proposed compare-and-swap (CAS) logic for the `RUNNING -> SUMMARIZING` transition correctly includes `PAUSED` runs in its predicate (`WHERE status IN ('RUNNING', 'PAUSED')`). However, several other parts of the design described in the spec omit `PAUSED`. For example, the reconciliation scheduler's activation condition and the sweep handler's main loop description only mention scanning for `RUNNING` and `SUMMARIZING` runs. This inconsistency means that a run that becomes stuck while `PAUSED` would not be picked up by the reconciliation sweep, defeating the purpose of the safety net for that state. [CODE-CONFIRMED]

4.  **MEDIUM: Unsafe Direct Status Updates in Existing Recovery Logic.** The spec correctly identifies that `cloud/apps/api/src/services/run/recovery.ts` was missed in the initial scope. This file contains logic to directly update a run's status to `COMPLETED` (`data: { status: 'COMPLETED' }`). This is a significant issue because it represents a backdoor that bypasses the entire new system of derived-count checks and atomic CAS updates. If this path is not refactored to use the new `maybeAdvanceRunStatus` service, it will continue to create `COMPLETED` runs that are not truly complete, re-introducing the exact silent failure modes this feature aims to solve. [CODE-CONFIRMED]

5.  **MEDIUM: Potential for Summarization Livelock Loop.** The spec proposes a change to `summarize-transcript.ts` to recognize `summarizeFailedAt` as a terminal state. This is critical. As written today, the handler only checks for `summarizedAt !== null` to skip already-processed transcripts. A transcript with `summarizeFailedAt` set would appear "pending" to the handler. The reconciliation sweep would correctly identify this as an un-summarized transcript and re-queue it every five minutes, but the handler would then fail it again, creating a persistent, useless job-queueing loop and wasting resources. The spec identifies the needed change, but the risk of implementation error is high and warrants highlighting. [CODE-CONFIRMED]

6.  **LOW: Implicit Trust in Launch-Time `Run.progress.total`.** The `RUNNING -> SUMMARIZING` completion logic correctly uses a derived count for `completed` and `failed` probes but continues to trust `Run.progress.total` as the authoritative denominator. This value is written once at launch and is susceptible to its own bugs or race conditions. An incorrect `total` will cause runs to either complete prematurely or become permanently stuck in the `RUNNING` state. While the `SCHEDULED_COUNT_MISMATCH` anomaly is designed to detect this, it's a reactive measure; the core completion logic remains vulnerable to this single point of failure. [UNVERIFIED]

## Residual Risks

1.  **Magnified Double-Billing Risk.** The spec correctly identifies that the system lacks provider idempotency keys, creating a risk of double-billing on any retry. This feature's reconciliation sweep automates and increases the frequency of retries for stuck jobs. This directly magnifies the financial risk of the underlying idempotency issue. A single worker crash could now result in repeated, automated re-runs and associated provider costs until the job succeeds or is manually resolved. The proposal to quantify this risk is sound, but it must be understood that this feature actively increases the potential blast radius of the pre-existing flaw.

2.  **Stale Analysis Data for `COMPLETED` Runs.** The design allows the reconciliation sweep to find and summarize a "stranded" transcript for a run that is already marked `COMPLETED`. While it laudably re-triggers analysis, this creates a time window where a run is presented to users as `COMPLETED` but its analytical data is temporarily incorrect. This could lead to users drawing wrong conclusions from analysis results they believe to be final. The `COMPLETED` status loses its meaning as an immutable "finished" state.

3.  **Sweep-Induced Thundering Herd.** The reconciliation sweep is designed to enqueue jobs for every non-terminal run, every tick (5 minutes). In a system with hundreds of active runs, this could create a "thundering herd" problem, flooding the job queue with a burst of thousands of jobs simultaneously. The spec notes this risk and suggests mitigation, but if not handled carefully, the sweep intended to improve stability could itself become a source of instability by overloading the job queue and database.

## Token Stats

- total_input=13663
- total_output=1251
- total_tokens=80831
- `gemini-2.5-pro`: input=13663, output=1251, total=80831

## Resolution
- status: accepted
- note: Judge panel voted advance (2 proceed, 1 block); HIGH findings addressed in spec rev 4 — see spec Design section and Files in Scope; remaining items deferred to plan phase via Open Questions
