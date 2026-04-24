---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/033-run-state-reconciliation/tasks.md"
artifact_sha256: "32129082d2a1ada79e77b2873e32c01e1b229fd8122f65ca42efe4c0472a8231"
repo_root: "."
git_head_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/033-run-state-reconciliation/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

| Severity | ID | Finding | Location |
|---|---|---|---|
| **HIGH** | H-01 | Invalid schema default will fail migration | `T1-1` |
| **MEDIUM** | M-01 | Inconsistent data source for GraphQL `progress` field | `T7-1` |
| **MEDIUM** | M-02 | [UNVERIFIED] Potential race condition in concurrent single-transcript debits | `T4-5` |
| **LOW** | L-01 | [UNVERIFIED] Short orphan-detection window may cause premature flagging | `T6-1` |
| **LOW** | L-02 | [UNVERIFIED] Backfill logic relies on semantic assumption about historical data | `T1-2` |
| **LOW** | L-03 | Missing explicit test for new functional index | `T6-4` |

---

### **HIGH**

#### H-01: Invalid schema default will fail migration
*(Found in task T1-1)*

The `schema.prisma` change for the `RunAnomaly` model specifies a default value for the `subject` field that is not a valid string literal.

```prisma
// T1-1 — Schema additions
model RunAnomaly {
  // ...
  subject String @cloud/apps/api/src/mcp/tools/set-default-llm-model.ts("")
  // ...
}
```

The string `@cloud/apps/api/src/mcp/tools/set-default-llm-model.ts("")` appears to be a file path erroneously pasted into the `@default()` attribute. This is invalid syntax. The Prisma migration command will likely fail. If it were to succeed, it would insert a meaningless and incorrect file path as the default subject for anomalies.

**Recommendation:** Change the default to an empty string: `subject String @default("")`.

### **MEDIUM**

#### M-01: Inconsistent data source for GraphQL `progress` field
*(Found in task T7-1)*

The GraphQL resolver for `run.progress` will compute `completed` and `failed` counts on-the-fly, but will read the `total` count from the persisted `run.progress.total` JSONB field. Other tasks in this plan (T5-2, T6-2) acknowledge that this stored `total` can be incorrect and even implement logic to detect and repair it (`detectScheduledCountMismatch`, `repairScheduledCount`).

This inconsistency can lead to confusing or impossible states being presented to the user, such as `11/10 probes completed`.

**Recommendation:** The resolver should either:
1.  Compute all three values (`total`, `completed`, `failed`) consistently from the `ProbeResult` table for the API response.
2.  Or, if `run.progress.total` is the canonical value, the resolver should cap the reported `completed` value at the stored `total`.

#### M-02: [UNVERIFIED] Potential race condition in concurrent single-transcript debits
*(Found in task T4-5)*

Task T4-3 introduces a path where a late-arriving transcript summary for an already `COMPLETED` run triggers a new helper, `deductSingleTranscriptBalance`. If multiple transcripts for the same run arrive late and concurrently, multiple instances of this helper could run in parallel.

Task T4-5 specifies that this helper runs in a Prisma transaction, but the `atomicDeduct` function it calls likely affects a provider-level balance that is shared across all transcripts. If `atomicDeduct` is not implemented with row-level locking (e.g., `SELECT ... FOR UPDATE`) on the shared balance, a classic read-modify-write race condition could occur, leading to lost updates and an incorrect final balance. The name "atomic" implies safety, but this is a critical, unverified assumption about existing code.

**Recommendation:** Verify that the `atomicDeduct` implementation is concurrency-safe. If not, the transaction in `deductSingleTranscriptBalance` must acquire a lock on the relevant provider balance before performing the deduction.

### **LOW**

#### L-01: [UNVERIFIED] Short orphan-detection window may cause premature flagging
*(Found in tasks T6-1, T6-2)*

Task T6-1 defines `ORPHAN_TRANSCRIPT_MIN_AGE_SECONDS = 60`. An orphan transcript is one that exists without a corresponding `ProbeResult`. Under high database load, the persistence of a `ProbeResult` could be delayed. A 60-second threshold could be too short, causing the anomaly detector to prematurely flag a transcript as an orphan while its `ProbeResult` is still in-flight. This could lead to noisy, flapping anomaly alerts or trigger unnecessary repair logic.

**Recommendation:** Review the existing system's P99 persistence time for `ProbeResult` and consider setting a more conservative threshold (e.g., 5-10 minutes) to prevent false positives.

#### L-02: [UNVERIFIED] Backfill logic relies on semantic assumption about historical data
*(Found in task T1-2)*

The migration script backfills `summarize_failed_at` using the existing `summarized_at` timestamp for transcripts where `decision_text LIKE 'Summary failed%'`. This assumes the timestamp in `summarized_at` for these old failure records accurately reflects the time of failure. While likely correct, this is a semantic interpretation of historical data. If the timestamp was ever used differently (e.g., time of record creation, not failure), the backfilled data will be subtly inaccurate. This is an unverified assumption about legacy behavior.

**Recommendation:** Before running the migration, spot-check a few historical records matching the `WHERE` clause to confirm the meaning of the `summarized_at` timestamp aligns with the assumption.

#### L-03: Missing explicit test for new functional index
*(Found in tasks T6-4, T6-5)*

Task T6-4 correctly anticipates a potential performance issue with the `PAIR_ASYMMETRY` detector and proposes a functional index on a JSONB path. It also specifies using `EXPLAIN` to confirm the need. However, the testing tasks (T6-5, T8) do not explicitly mention a test to confirm that the query plan *uses* this new index after it is created. Relying solely on manual `EXPLAIN ANALYZE` in Wave 8 is brittle.

**Recommendation:** Add a task to Wave 6 to write an automated test that fails if the query plan for the asymmetry detector does not use the `runs_pair_group_idx` index when it is expected to.

## Residual Risks

1.  **Idempotency of Side Effects:** The plan ensures the run status transition is idempotent, but it relies on the downstream side effects (`triggerBasicAnalysis`, `queueComputeTokenStats`) also being idempotent. If, for example, `triggerBasicAnalysis` is not safe to run twice for the same completed run, a race condition where `maybeAdvanceRunStatus` is called twice could lead to duplicate analysis jobs. The risk is that the idempotency of these dependent services is assumed, not explicitly verified.

2.  **Increased State Complexity:** This feature introduces several new state fields (`summarizeFailedAt`, `costDebitedAt`) and a periodic reconciliation job. While the design appears robust, the increased complexity itself is a risk. Subtle bugs in state handling could lead to the very "stuck run" problems this feature aims to solve. The reconciliation job is a good safety net but could also mask underlying root causes by continuously fixing their symptoms.

3.  **Threshold Tuning:** The anomaly detection feature relies on hardcoded constants (e.g., `SUMMARIZING_STALL_MINUTES`). These thresholds are educated guesses and will almost certainly require tuning based on real-world performance in a production environment. There is a risk of either excessive noise (thresholds too tight) or missed detections (thresholds too loose) post-launch, requiring operator intervention.

## Token Stats

- total_input=22818
- total_output=1735
- total_tokens=28834
- `gemini-2.5-pro`: input=22818, output=1735, total=28834

## Resolution
- status: open
- note: