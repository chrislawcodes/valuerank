---
reviewer: "claude-sonnet-4-5"
lens: "implementation-risk-judge"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/033-run-state-reconciliation/spec.md"
artifact_sha256: "32613ca457104617746d439d696403206c0d704d3d3391d4cf3414a4c4dcd282"
repo_root: "."
git_head_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "judge-panel"
resolution_status: "open"
resolution_note: "Two load-bearing decisions are explicitly deferred to 'plan phase' but the plan's Tasks section is empty, leaving them unresolved. First: whether `deductActualProviderBalancesForRun` is safe to re-invoke on a COMPLETED run. The spec name..."
raw_output_path: "docs/workflow/feature-runs/033-run-state-reconciliation/reviews/judge.implementation-risk.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec implementation-risk-judge

## Findings

Two load-bearing decisions are explicitly deferred to 'plan phase' but the plan's Tasks section is empty, leaving them unresolved. First: whether `deductActualProviderBalancesForRun` is safe to re-invoke on a COMPLETED run. The spec names this as a financial correctness risk and says 'plan phase verifies this', but no verification or resolution appears anywhere in the artifact chain. An implementer who calls this function again for a late transcript risks double-debiting user balances with no guidance on the correct fix (full-run re-deduction vs. delta vs. idempotency guard). Second: how the reconciliation sweep integrates with the scheduler. The spec gives two structurally different options — extend the existing `runRecoveryJob` activity logic or build a separate ticker — and explicitly says 'plan phase decides', but the plan Tasks section is empty. These two options produce materially different code in `scheduler.ts` and the worker registration layer; an implementer would have to guess. Two additional risks are real but lower severity: `maybeAdvanceRunStatus` is a service-layer helper that the spec says must enqueue PgBoss jobs, but the spec does not address how the queue client reaches the service layer (the existing `progress.ts` may not have a queue dependency, and adding one may conflict with project patterns). And the migration backfill relies on the assertion that 'all success paths write a non-null `decisionMetadata`' — this is stated but not evidenced in the artifacts; a single historical transcript that is a success but has NULL `decisionMetadata` would be silently corrupted by the UPDATE.

## Residual Risks

- spec :: Design — Re-triggering post-completion side effects when a late transcript is summarized on a COMPLETED run - Each must be idempotent on its own side — plan phase verifies this, with special attention to `deductActualProviderBalancesForRun` which debits a balance and must either check 'already deducted for this transcript' or operate on a delta basis rather than re-deducting the full run.
- plan :: Tasks - --- TASKS ---
# Tasks
- spec :: Design — Reconciliation sweep scheduling - Plan phase decides whether this is a change to `scheduler.ts`'s existing activity logic, or a separate ticker dedicated to reconciliation.
- spec :: Design — Summarize job fan-out at the RUNNING → SUMMARIZING transition - When the first CAS wins, the caller enqueues a `summarize_transcript` job (singleton on `transcriptId`) for every `Transcript` row belonging to the run with `summarizedAt IS NULL AND summarizeFailedAt IS NULL AND deletedAt IS NULL`. This replaces the old 5-second settle + `queueSummarizeJobs()` path
- spec :: Files in Scope — migration.sql - the failure-row backfill: `UPDATE transcripts SET summarize_failed_at = summarized_at, summarized_at = NULL WHERE decision_text LIKE 'Summary failed%' AND decision_metadata IS NULL AND summarize_failed_at IS NULL` — the combined `decision_text LIKE` + `decision_metadata IS NULL` guard distinguishes failure rows from unusual-but-valid summaries

## Verdict (structured)

```json
{
  "confidence": 4,
  "evidence": [
    {
      "artifact": "spec",
      "quote": "Each must be idempotent on its own side \u2014 plan phase verifies this, with special attention to `deductActualProviderBalancesForRun` which debits a balance and must either check 'already deducted for this transcript' or operate on a delta basis rather than re-deducting the full run.",
      "section": "Design \u2014 Re-triggering post-completion side effects when a late transcript is summarized on a COMPLETED run"
    },
    {
      "artifact": "plan",
      "quote": "--- TASKS ---\n# Tasks",
      "section": "Tasks"
    },
    {
      "artifact": "spec",
      "quote": "Plan phase decides whether this is a change to `scheduler.ts`'s existing activity logic, or a separate ticker dedicated to reconciliation.",
      "section": "Design \u2014 Reconciliation sweep scheduling"
    },
    {
      "artifact": "spec",
      "quote": "When the first CAS wins, the caller enqueues a `summarize_transcript` job (singleton on `transcriptId`) for every `Transcript` row belonging to the run with `summarizedAt IS NULL AND summarizeFailedAt IS NULL AND deletedAt IS NULL`. This replaces the old 5-second settle + `queueSummarizeJobs()` path",
      "section": "Design \u2014 Summarize job fan-out at the RUNNING \u2192 SUMMARIZING transition"
    },
    {
      "artifact": "spec",
      "quote": "the failure-row backfill: `UPDATE transcripts SET summarize_failed_at = summarized_at, summarized_at = NULL WHERE decision_text LIKE 'Summary failed%' AND decision_metadata IS NULL AND summarize_failed_at IS NULL` \u2014 the combined `decision_text LIKE` + `decision_metadata IS NULL` guard distinguishes failure rows from unusual-but-valid summaries",
      "section": "Files in Scope \u2014 migration.sql"
    }
  ],
  "judge": "implementation-risk",
  "model": "claude-sonnet-4-5",
  "reasoning": "Two load-bearing decisions are explicitly deferred to 'plan phase' but the plan's Tasks section is empty, leaving them unresolved. First: whether `deductActualProviderBalancesForRun` is safe to re-invoke on a COMPLETED run. The spec names this as a financial correctness risk and says 'plan phase verifies this', but no verification or resolution appears anywhere in the artifact chain. An implementer who calls this function again for a late transcript risks double-debiting user balances with no guidance on the correct fix (full-run re-deduction vs. delta vs. idempotency guard). Second: how the reconciliation sweep integrates with the scheduler. The spec gives two structurally different options \u2014 extend the existing `runRecoveryJob` activity logic or build a separate ticker \u2014 and explicitly says 'plan phase decides', but the plan Tasks section is empty. These two options produce materially different code in `scheduler.ts` and the worker registration layer; an implementer would have to guess. Two additional risks are real but lower severity: `maybeAdvanceRunStatus` is a service-layer helper that the spec says must enqueue PgBoss jobs, but the spec does not address how the queue client reaches the service layer (the existing `progress.ts` may not have a queue dependency, and adding one may conflict with project patterns). And the migration backfill relies on the assertion that 'all success paths write a non-null `decisionMetadata`' \u2014 this is stated but not evidenced in the artifacts; a single historical transcript that is a success but has NULL `decisionMetadata` would be silently corrupted by the UPDATE.",
  "timestamp": "2026-04-23T12:00:00Z",
  "verdict": "block"
}
```

## Resolution
- status: open
- note: Two load-bearing decisions are explicitly deferred to 'plan phase' but the plan's Tasks section is empty, leaving them unresolved. First: whether `deductActualProviderBalancesForRun` is safe to re-invoke on a COMPLETED run. The spec name...
