---
reviewer: "gemini"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/domain-evaluation-model-backfill/reviews/implementation.diff.patch"
artifact_sha256: "1f93f5931d0a45cc50d90104d8f6fbb8b487c745b7eb46102ab45f752cd49ee4"
repo_root: "."
git_head_sha: "1a04471af003607a5a1370a7422196137daa0b94"
git_base_ref: "origin/main"
git_base_sha: "0686463ebe2c3308d4ab925f8083dc711148ab84"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/domain-evaluation-model-backfill/reviews/diff.gemini.regression-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

| Severity | Finding |
| :--- | :--- |
| **MEDIUM** | **[UNVERIFIED] Race Condition Vulnerability in Concurrent Operations** |
| **MEDIUM** | **[UNVERIFIED] Hidden Breaking Change in Unrelated Module** |
| **LOW** | **Brittle Dependency on Unversioned Snapshot** |
| **LOW** | **Incomplete Test Coverage for New Failure Paths** |

---

### **[UNVERIFIED] Race Condition Vulnerability in Concurrent Operations**
**Severity: MEDIUM**

The new backfill mechanism uses a `pg_advisory_xact_lock` on the `domainEvaluationId`, while the original launch mechanism uses a lock on the `domainId`. These are different locking keys, which allows a new evaluation launch and a backfill operation to run concurrently for the same domain.

Due to standard `READ COMMITTED` transaction isolation, the backfill process's check for existing active runs (`hasActiveEquivalentRun`) may not see runs created by a concurrent launch transaction that has not yet committed. This can lead to both processes deciding to launch runs for the same `(definition, model)` pair, resulting in duplicated work, unnecessary cost, and potential data analysis complications. While the check is a good preventative measure, its effectiveness is undermined by the race condition.

**Recommendation:**
Use a consistent advisory lock key (e.g., based on `domainId`) for all operations that could launch runs within a domain to ensure they are serialized. Alternatively, enforce a `UNIQUE` constraint at the database level on active runs to prevent duplicates programmatically, or ensure the `startRunService` is fully idempotent.

### **[UNVERIFIED] Hidden Breaking Change in Unrelated Module**
**Severity: MEDIUM**

The patch includes a significant refactoring of the `decision-model.ts` module, which appears unrelated to the main backfill feature. This change removes the exported `legacy` object from the `DecisionModelResult` type and all associated helper functions (`resolveLegacyDecisionCompat`, `canonicalDecisionToLegacyScore`, etc.).

This constitutes a breaking API change for any internal consumer of the `resolveDecisionModel` function that might have been relying on the `legacy` property. Bundling an undocumented breaking change inside a feature patch is a risky practice that hinders code review and future maintenance.

**Recommendation:**
Revert the `decision-model.ts` changes from this patch and submit them as a separate pull request. This allows the breaking change to be reviewed, documented, and merged independently, following the project's standard process for such changes.

### **Brittle Dependency on Unversioned Snapshot**
**Severity: LOW**

The backfill feature's logic is critically dependent on the structure and content of the `configSnapshot` JSON blob stored on each `DomainEvaluation` record. The patch updates the launch endpoint to correctly save the necessary fields (`launchableDefinitionIds`, `samplePercentage`, etc.) for future evaluations.

However, this creates a brittle, implicit contract between the code that writes the snapshot and the code that reads it. If the snapshot schema changes in the future, the backfill functionality may fail for older evaluations that have a different snapshot structure.

**Recommendation:**
Introduce a version number into the `configSnapshot` (e.g., `"snapshotVersion": 2`). This would allow the `getBackfillSnapshot` function to be more robust, either by handling different versions explicitly or by safely failing when it encounters an unsupported version.

### **Incomplete Test Coverage for New Failure Paths**
**Severity: LOW**

The new `backfillDomainEvaluationModels` function adds several important server-side validations and error paths:
- Rejecting models that are inactive.
- Rejecting models that were not part of the original evaluation.
- Rejecting requests for evaluations with a missing/invalid configuration snapshot.
- Rejecting requests that would result in an incomplete pair.

While the backend integration tests (`domain.test.ts`) cover the happy path and one validation case, they do not cover these other failure conditions. While the implementation appears to handle them, the lack of automated tests makes this logic vulnerable to future regressions.

**Recommendation:**
Add integration tests that specifically target each of the new server-side validation rules to ensure they behave as expected and are protected against future changes.

---

## Residual Risks

- **Concurrency Defects:** The identified race condition highlights the difficulty of managing concurrency. The ultimate solution lies in database constraints (`UNIQUE` indexes on active runs) or fully idempotent services, which may be a larger refactoring effort. Without this, the risk of creating duplicate work under concurrent load remains.
- **Data Schema Evolution:** The feature's reliance on a loosely-structured `configSnapshot` JSON blob is a source of fragility. This pattern, while common, carries an inherent risk that a feature may not work on older data records if the schema assumed by the code drifts from the schema written in the past. More structured and versioned data contracts are the primary mitigation.

## Token Stats

- total_input=40693
- total_output=1053
- total_tokens=47451
- `gemini-2.5-pro`: input=40693, output=1053, total=47451

## Resolution
- status: open
- note: