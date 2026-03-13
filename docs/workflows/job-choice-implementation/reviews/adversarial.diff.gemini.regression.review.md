---
reviewer: "gemini"
lens: "regression"
stage: "diff"
artifact_path: "docs/workflows/job-choice-implementation/reviews/adversarial.current.diff.patch"
artifact_sha256: "2cb1f7719fc88d4d3144999f6b5af299514dfce398a55c09eab6a64dee88932d"
repo_root: "."
git_head_sha: "35da80309f01f3cfe549e3aa0ac0f8cfd6ac6a25"
git_base_ref: "origin/main"
git_base_sha: "3aa0478c59137277c911bea998522cfd86ec9934"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Addressed the concrete regression risks by restoring the legacy CSV schema as the default export, gating parser metadata columns behind includeDecisionMetadata, tightening deterministic text-label matching to avoid late quoted substrings, and keeping paired-batch coverage in GraphQL tests."
raw_output_path: "docs/workflows/job-choice-implementation/reviews/adversarial.diff.gemini.regression.review.md.json"
narrowed_artifact_path: "docs/workflows/job-choice-implementation/reviews/adversarial.diff.gemini.regression.review.md.narrowed.txt"
narrowed_artifact_sha256: "5e80d594d9e346aa293ce50dcb2a96ab2cab9dc4e9410ea81eae464d30309b73"
coverage_status: "partial"
coverage_note: "artifact exceeded max_artifact_chars and was narrowed"
---

# Review: diff regression

## Findings

*   **Rollout Hazard: `PAIRED_BATCH` Launch Mode and Companion Definition Dependency:**
    The introduction of the `PAIRED_BATCH` launch mode introduces a critical dependency on the existence and correct configuration of companion definitions (e.g., an 'A-first' definition requires a corresponding 'B-first' definition with matching `pair_key`). If a companion definition is missing, deleted, or improperly configured (e.g., missing `pair_key` or `presentation_order` in its content), the `startRun` mutation will fail with a `ValidationError`. This could halt operations for users attempting to launch paired batch jobs if their companion definitions are not yet set up or are in an inconsistent state. While the error message is informative, it may lead to user frustration if the dependency is not easily resolvable.

*   **Potential Breakage/Silent Behavior Change: Introduction of `decisionMetadata`:**
    The `Transcript` model in the database schema has been updated to include a `decisionMetadata` field of type JSONB. Any downstream consumers (APIs, UI components, reporting tools) that directly query or process `Transcript` data without explicitly accounting for this new, potentially complex JSON field risk encountering errors or unexpected behavior. While specific export services (`export.ts`, `csv.ts`) have been updated to extract relevant parts of this metadata for CSV exports, other parts of the system consuming transcript data may be affected by this schema change.

*   **Behavior Change/Rollout Hazard: Enhanced Decision Classification Logic:**
    The `summarize.py` worker now employs a more sophisticated decision classification pipeline. This includes deterministic numeric parsing, deterministic text-label matching, and LLM-based fallbacks. This change can lead to silent behavior changes if decisions are classified differently than in previous versions, potentially impacting downstream analysis and reporting. The introduction of `decision_source` and `parse_class`/`parse_path` fields to track the classification method requires all systems consuming summary data to be updated to handle these new fields correctly. The increased reliance on LLM fallbacks also introduces potential cost and latency implications.

*   **Rollout Hazard: Changes in `startRun` Service Logic and Assumptions:**
    The `startRun` service logic has been modified to accept `launchMode` and `configExtras` for `PAIRED_BATCH` and `AD_HOC_BATCH` modes. Notably, the `methodologySafe: true` flag is hardcoded for `PAIRED_BATCH` runs. This implies a strong assumption about the inherent safety of the `job-choice` methodology for paired launches. If the underlying `startRunService` behavior changes or if this assumption needs to be revisited in the future, it could lead to subtle bugs.

## Residual Risks

*   **User Experience for Missing Companion Definitions:**
    While the `PAIRED_BATCH` launch mode correctly throws a `ValidationError` when companion definitions are missing, the user experience could be improved. More specific UI guidance within the frontend (e.g., `RunFormModal`) before submitting the mutation could proactively inform users about missing companion definitions and guide them toward resolution.

*   **Testing Scope for `decisionMetadata` Consumption:**
    The tests for `summarize.py` adequately cover the new metadata extraction logic. However, it is unclear if all frontend components that interact with transcript data (e.g., `TranscriptRow`, `TranscriptViewer`, `AnalysisTranscripts.tsx`, `DefinitionDetail.tsx`, `RunFormModal.tsx`, `RerunDialog.tsx`, `useRunMutations.ts`) have been updated to gracefully handle or display the new `decisionMetadata` field. If not, they might exhibit silent failures or display incomplete information.

*   **Hardcoded Values in `summarize.py` and `startRunService`:**
    The `PARSER_VERSION` is hardcoded in `summarize.py`, and the `methodologySafe: true` flag is hardcoded within `configExtras` for `PAIRED_BATCH` runs in `startRunService`. While not immediate risks, these represent areas that may require future maintenance updates if the underlying logic or assumptions change, potentially becoming points of failure.

## Token Stats

- total_input=26668
- total_output=878
- total_tokens=32240
- `gemini-2.5-flash-lite`: input=26668, output=878, total=32240

## Resolution
- status: accepted
- note: Addressed the concrete regression risks by restoring the legacy CSV schema as the default export, gating parser metadata columns behind includeDecisionMetadata, tightening deterministic text-label matching to avoid late quoted substrings, and keeping paired-batch coverage in GraphQL tests.
