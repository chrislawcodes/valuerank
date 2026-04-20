---
reviewer: "gemini"
lens: "quality-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/aggregate-consistency-data/reviews/implementation.diff.patch"
artifact_sha256: "b4f4360c48c32d306fe8423fadafebfe8f08fed7b4cde7dfe39f02e9aeb03c75"
repo_root: "."
git_head_sha: "b3aceda3817c90a8aa89e55c83957b990b11ee1d"
git_base_ref: "1ea4d9fb"
git_base_sha: "1ea4d9fb384b6e587924d977f53c10820546f58b"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/aggregate-consistency-data/reviews/diff.gemini.quality-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff quality-adversarial

## Findings

### High Severity

-   **[HIGH] Backfill Performs Full Re-calculation on Live Data, Not a Consistency Patch**: The script `backfill-aggregate-consistency.ts` is named as if it's patching a data format for consistency. However, its core operation is calling `updateAggregateRun(...)` with parameters derived from an old run. This function (not provided, but implied by its name and arguments) likely re-triggers a full aggregation. This means the backfill is not just changing the *shape* of the output; it is re-calculating the entire analysis using the *current* state of the underlying data (transcripts, etc.). This can lead to silent data drift, where analysis results change unexpectedly, not because of a format migration, but because the underlying source data has changed since the original analysis was run. This is a significant risk to data integrity and reproducibility if the intent was merely to update the output format.

### Medium Severity

-   **[MEDIUM] [UNVERIFIED] Fragile Detection of Upgraded Rows**: The `hasUpgradedReliabilityShape` function in the backfill script performs a shallow check for the presence of `output.reliabilitySummary.perModel[...].perPair`. It does not validate the structure against the new Zod schemas defined in `contracts.ts`. This creates a risk where a partially failed or malformed backfill could produce an object that passes this weak check but is invalid according to the schema. The script would then incorrectly `skip` this invalid row in subsequent runs, leaving corrupted data in the database. The check should use `zReliabilitySummary.safeParse()` for robustness.

-   **[MEDIUM] [UNVERIFIED] Un-schematized `companionRunId` Bypasses Validation**: In `aggregate-preparation.ts`, the `companionRunId` is extracted from `templateRun.config` using a type assertion (`... as { companionRunId?: unknown }`). This property is not part of the `zRunConfig` schema that is used to parse the config object just a few lines above. This practice bypasses schema validation, creating a brittle dependency on an undeclared property. If the way `companionRunId` is set in the config changes, this code will fail silently by setting `targetCompanionRunId` to `null`. This property should be formally added as an optional field to `zRunConfig`.

-   **[MEDIUM] Backfill Can Overwhelm System Resources**: The backfill script iterates through database rows and calls `updateAggregateRun` for each one that needs upgrading. There is no throttling or delay in the loop. If `updateAggregateRun` enqueues an expensive background job, this script could flood the job queue and overwhelm workers. If `updateAggregateRun` is a synchronous, blocking operation, the script may run for a very long time, but still poses a risk of overloading the database with repeated, heavy queries in a tight loop.

### Low Severity

-   **[LOW] [UNVERIFIED] Misleading `dryRun` Confidence**: The `--dry-run` mode confirms that a run's config can be parsed and that it's eligible for an upgrade. However, it does not validate that the subsequent call to `updateAggregateRun` would succeed. The actual operation could fail for many reasons not checked by the dry run (e.g., referential integrity issues, missing child data needed for the aggregation). This can give a false sense of security, as a successful dry run does not guarantee a successful real run.

-   **[LOW] Inconsistent Preamble/Version Parsing**: In `backfill-aggregate-consistency.ts`, the `parseSelection` function correctly handles cases where `definitionVersion` might be a `string` or `number`. However, it only checks if `preambleVersionId` is a non-empty `string`. This seems inconsistent. While `preambleVersionId` is likely always a string, the robust, type-aware parsing applied to `definitionVersion` is not applied here, making it slightly more brittle.

## Residual Risks

-   **Data Temporality**: Even if all findings are fixed, the fundamental design of the backfill re-calculates historical analysis using current data. This is an explicit choice that trades historical accuracy for data consistency in the new format. This risk is inherent to the chosen backfill strategy. If the business logic requires preserving the original analysis based on point-in-time data, the entire strategy would need to be changed to one that transforms the existing `output` object rather than re-calculating it.
-   **Configuration Drift**: The backfill relies on `run.config` to trigger the re-aggregation. If the structure or meaning of fields in `run.config` has changed over time, re-running an old config against the newest `updateAggregateRun` logic might produce nonsensical or erroneous results that are not caught by type validation alone.

## Token Stats

- total_input=16145
- total_output=1035
- total_tokens=21732
- `gemini-2.5-pro`: input=16145, output=1035, total=21732

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
