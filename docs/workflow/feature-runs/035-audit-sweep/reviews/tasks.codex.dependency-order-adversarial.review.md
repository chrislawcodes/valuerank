---
reviewer: "codex"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/035-audit-sweep/tasks.md"
artifact_sha256: "e0926ae18cb87801403abc7ab4051452c067c89923050eb5fa49fd1c53f145b0"
repo_root: "."
git_head_sha: "67082dc3d4eeede3775a50ee4769cb22d2cb7e09"
git_base_ref: "origin/main"
git_base_sha: "67082dc3d4eeede3775a50ee4769cb22d2cb7e09"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/035-audit-sweep/reviews/tasks.codex.dependency-order-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

- **High**: `T1-2` is not rollout-safe. It drops `run_anomalies_run_id_type_subject_key` in the same migration that introduces the new `(runId, type, subject, source)` key. Any old API worker, queue consumer, or partially deployed instance still using the legacy upsert shape will start failing as soon as that index is removed. This needs a compatibility window or a two-step deploy, not a hard cutover.
- **High**: The audit SQL in `T5-2` is written with `NOW() - INTERVAL $windowDays`, which is not valid PostgreSQL bind syntax as written. That query will likely fail at runtime unless it is rewritten to use a proper parameterized interval expression.
- **Medium [UNVERIFIED]**: `T5-4` schedules `run_state_audit` on startup without any explicit leader-election or singleton guard. If this API runs on more than one instance, each boot can unschedule/reschedule the same job and create duplicate or unstable daily audit execution. If `boss` already serializes this across instances, fine; otherwise the plan is missing a protection step.

## Residual Risks

- The new tests around `run { anomalies { ... } }` should assert on a set or explicit sort order; otherwise mixed `default`/`audit` rows can make the GraphQL test flaky.
- `T2-4` should verify the true re-detection path by resolving a row first, then upserting it again. As written, the test idea does not fully prove that `resolvedAt` is cleared after a prior resolution.
- The migration and audit sweep may still be lock-heavy on a large `run_anomalies` table, even if the SQL itself is corrected.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 