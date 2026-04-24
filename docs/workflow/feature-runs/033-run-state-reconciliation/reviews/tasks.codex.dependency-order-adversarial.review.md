---
reviewer: "codex"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/033-run-state-reconciliation/tasks.md"
artifact_sha256: "32129082d2a1ada79e77b2873e32c01e1b229fd8122f65ca42efe4c0472a8231"
repo_root: "."
git_head_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/033-run-state-reconciliation/reviews/tasks.codex.dependency-order-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

- **High**: `T5-4` makes the sweep scheduler only keep `COMPLETED` runs with unsummarized transcripts if they were updated in the last 30 days. That creates a hard stop for late-arriving transcripts on older completed runs, even though `T5-2` says the sweep is the place that rescues stranded transcripts. After day 30, those runs can become permanently unreconciled.

- **High**: `T5-2` depends on anomaly detection and repair functions that are only defined in Wave 6 (`detect*`, `repairScheduledCount`, `upsertAnomaly`, `resolveAnomaly`), so Wave 5 is not actually self-contained. The handler cannot be completed and checked in dependency order as written because the repair/anomaly layer does not exist yet.

- **Medium**: The plan defines `resolveAnomaly()` in `T6-3`, but no wave ever calls it during normal reconciliation. `T5-2` only says to scan anomalies and `T6-3` only defines the resolver. Without an explicit resolution pass, transient anomalies will never get `resolvedAt` set and the anomaly table will drift toward permanent false positives.

- **Medium**: `T5-2` explicitly skips `SCHEDULED_COUNT_MISMATCH` for `COMPLETED` runs, but `T5-2` step 4 says repair happens only when that detector fires. That means a completed run with a bad scheduled total can be detected in theory but will never be repaired by the sweep path that is supposed to fix it.

- **[UNVERIFIED] Medium**: `T1-2` backfills only rows where `decision_text LIKE 'Summary failed%'` and `decision_metadata IS NULL`. If the existing database has any failure rows recorded with a different metadata shape or slightly different text, they will be missed and the new `summarizeFailedAt` logic will misclassify old data.

## Residual Risks

- The plan assumes queue deduplication and Prisma transactions are enough to prevent duplicate transcript debits and duplicate summarize jobs, but that is not proven in the artifact.
- The plan assumes the new indexes and JSON-path queries line up with the existing schema naming and query patterns; that is not validated here.
- The zero-probe short-circuit in `T3-2` may still race with run persistence or transcript creation depending on existing startup ordering, but that depends on code not provided.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 