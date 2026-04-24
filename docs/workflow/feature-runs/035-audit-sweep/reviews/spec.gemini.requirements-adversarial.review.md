---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/035-audit-sweep/spec.md"
artifact_sha256: "b557df51cab17301aa8f7ad3143eb33bd88598783db0f36c557cceec039a17f6"
repo_root: "."
git_head_sha: "67082dc3d4eeede3775a50ee4769cb22d2cb7e09"
git_base_ref: "origin/main"
git_base_sha: "67082dc3d4eeede3775a50ee4769cb22d2cb7e09"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/035-audit-sweep/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

1.  **Severity:** HIGH
    **Description:** The spec's proposed implementation for `upsertAnomaly` introduces a critical regression. It omits `resolvedAt: null` from the `update` block of the `upsert`. This means if an anomaly is resolved and then re-detected in a subsequent sweep, the `upsert` would update its `details` and `lastSeenAt` but would fail to set `resolvedAt` back to `null`. The anomaly would remain in a resolved state in the database, rendering it invisible to operators and making the detection system unreliable.
    **Evidence Tag:** `[CODE-CONFIRMED]`
    **Evidence:**
    *   The existing, correct implementation in `cloud/apps/api/src/services/run/anomaly-persistence.ts` explicitly includes `resolvedAt: null` in the `update` operation to handle this exact case.
    *   The provided `spec.md` shows a code snippet for the new `upsertAnomaly` that is missing `resolvedAt: null`.

2.  **Severity:** HIGH
    **Description:** The specification's design for how the audit sweep and default sweep resolve anomalies creates a risk of data corruption. The `syncAnomalies` function in `run-state-reconcile.ts` is responsible for resolving anomalies that are no longer detected. It does this by reading all anomalies of a certain `type` for a `runId` and deleting any not in the current set of detected `drafts`. The spec mandates extending this to be scoped by `source`, but if this is implemented incorrectly, the audit sweep could accidentally resolve active anomalies from the default sweep. For example, if the audit sweep runs and finds no "pair asymmetry" anomalies (because the delta is below its zeroed threshold but above the default's), a faulty implementation could resolve a real "pair asymmetry" anomaly the default sweep is tracking.
    **Evidence Tag:** `[CODE-CONFIRMED]`
    **Evidence:**
    *   The file `cloud/apps/api/src/queue/handlers/run-state-reconcile.ts` shows the `syncAnomalies` function being used to both persist new anomalies and resolve stale ones. This pattern, when applied to two different sources (`default` and `audit`), requires strict data partitioning in the implementation to avoid cross-source side effects. The potential for error is significant.

3.  **Severity:** MEDIUM
    **Description:** The function signatures proposed in the spec for persistence helpers are inconsistent with the existing codebase. The spec suggests `upsertAnomaly` should take a `draft` object containing `runId`. However, the `AnomalyDraft` type defined in `cloud/apps/api/src/services/run/anomaly-detection.ts` does not include `runId`. The existing function signature in `cloud/apps/api/src/services/run/anomaly-persistence.ts` is `upsertAnomaly(runId: string, draft: AnomalyDraft)`, which correctly separates the `runId` from the anomaly details. Adhering to the spec as written would require refactoring multiple files and would deviate from the established pattern.
    **Evidence Tag:** `[CODE-CONFIRMED]`
    **Evidence:**
    *   The function signature `upsertAnomaly(runId: string, draft: AnomalyDraft)` in `cloud/apps/api/src/services/run/anomaly-persistence.ts` confirms `runId` is passed as a separate argument.
    *   The `AnomalyDraft` type in `cloud/apps/api/src/services/run/anomaly-detection.ts` confirms `runId` is not part of the type.
    *   The spec's design section proposes a signature `upsertAnomaly(draft: AnomalyDraft & { source: RunAnomalySource })` and implies `draft` contains `runId`.

4.  **Severity:** LOW
    **Description:** The spec's description of the database migration is slightly contradictory. It states the migration will use an `UPDATE` command to backfill the `source` column, but also mentions that using `ADD COLUMN ... NOT NULL DEFAULT 'default'` will handle it automatically. While the `DEFAULT` clause is the correct and more efficient method, the conflicting description could cause a moment of confusion for the developer implementing the migration.
    **Evidence Tag:** `[UNVERIFIED]`
    **Evidence:**
    *   The `spec.md` under "Migration steps" describes two different approaches for the same backfill task. This is a logical inconsistency within the artifact itself.

## Residual Risks

-   **Unbounded Table Growth:** The spec correctly identifies but defers the risk that the `run_anomalies` table will grow indefinitely because the audit sweep adds new rows daily. While scoped out of this feature, this accumulating data could lead to future performance degradation on anomaly queries and reporting if a cleanup strategy is not implemented in a timely manner.
-   **GraphQL Enum Value Mismatch:** The spec astutely notes the potential for a mismatch between Prisma's lowercase enum values (e.g., `default`) and Pothos's convention of creating uppercase GraphQL enum values (e.g., `DEFAULT`). This requires a manual mapping in the GraphQL layer (`cloud/apps/api/src/graphql/types/run-anomaly.ts`). If missed, this will cause runtime errors when querying the new `source` field.
-   **Scheduler Job Registration Failure:** The proposed audit sweep relies on `boss.schedule` being called once at server startup. If this call fails or is missed due to a startup race condition, the audit sweep will silently not run. This would undermine the feature's core purpose as an independent verification signal.
-   **Concurrent Sweep Interference:** The default reconciliation sweep and the new audit sweep are separate, asynchronous jobs. While the `source` column is intended to isolate their data, there is a risk of them running concurrently on the same run, which could lead to database-level contention (e.g., locking, deadlocks) on the `run_anomalies` table.

## Token Stats

- total_input=58140
- total_output=1303
- total_tokens=63346
- `gemini-2.5-pro`: input=58140, output=1303, total=63346

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
