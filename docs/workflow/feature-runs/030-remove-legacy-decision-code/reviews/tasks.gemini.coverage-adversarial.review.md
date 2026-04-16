---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/tasks.md"
artifact_sha256: "4a1db078166b7144f0c2dbca35554e46c9e35d0871cf8b5b5a2cca232bc65b2a"
repo_root: "."
git_head_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
git_base_ref: "origin/fix/audit-mode-no-legacy-fallback"
git_base_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

### HIGH: Missing Database Schema Migration
The plan meticulously outlines the removal of legacy code from the TypeScript API, Python workers, and frontend. However, it completely omits any task related to database schema changes. The artifact is titled "Remove Legacy Decision Code," which implies removing the data itself, not just the code that reads it.

-   **Flaw:** The plan does not include a database migration to drop the legacy `decisionCode` column or any other database artifacts related to the old scoring model.
-   **Impact:** This leaves orphaned, dead data in the production database. It creates technical debt, risks confusion for future developers and data analysts, and means the "removal" is incomplete. Any tool that connects directly to the database will still see the old, now-unused data.

### HIGH: Breaking API Changes Without a Deprecation or Communication Plan
The tasks in Wave 2 and Wave 4 directly remove fields from the public-facing GraphQL API (`legacy` field on `decisionModelV2`) and alter the structure of data exports.

-   **Flaw:** These are breaking changes for any external consumer of the API or data exports. The plan has no steps to identify these consumers, communicate the breaking changes, or implement a versioning or deprecation strategy.
-   **Impact:** Any external system, client, or user relying on the `legacy` GraphQL field or the old export format will break immediately upon deployment.

### MEDIUM: No End-to-End (E2E) Verification Strategy
The plan relies on build checks and unit/integration tests (`npm run test`). While Slice 5.1 commendably adds regression tests for specific logic, there is no mention of E2E testing.

-   **Flaw:** A refactor of this scale, touching the data model, services, API, and multiple UI components, is highly susceptible to integration bugs that unit tests cannot catch. For example, a unit test for `ConditionMatrix` won't verify that the data it receives from the GraphQL hook is correctly shaped after the upstream API changes.
-   **Impact:** [UNVERIFIED] There is a significant risk of UI components either crashing or silently failing to render data correctly due to receiving an unexpected data shape from the API. The `OverviewTab` has a "shape normalizer," acknowledging this risk, but this defensive pattern is not planned for other UI components.

### MEDIUM: Potential Data Quality Degradation in Core UI
Slice 1.1 allows for a low-quality fallback in the `ConditionMatrix` component, where it will "compute an approximate strength from the win-rate ratio" if 5-bucket data is not available.

-   **Flaw:** The task is to "document the limitation" but not to treat the data gap as a bug to be fixed. It accepts a permanent state of reduced data fidelity in a core UI component. The plan does not require an investigation into whether the parent component *can* be updated to provide the higher-fidelity data.
-   **Impact:** [UNVERIFIED] Users may see a simplified, less accurate representation of the scoring strength in this matrix without understanding the underlying approximation, leading to incorrect interpretations of the analysis.

### LOW: Incomplete Verification for Stored Aggregates
Slice 3.2 includes a task to add a "shape normalizer" if the `OverviewTab` receives old `scoreCounts` data.

-   **Flaw:** This correctly identifies the risk of stale, stored data. However, it only addresses one component. The plan does not include a broader task to audit or create migrations for other places where aggregated data might be stored (e.g., in other analysis results, cached values).
-   **Impact:** [UNVERIFIED] Other parts of the application could still be vulnerable to failures when encountering old data shapes stored in the database or caches. The fix is localized, not systemic.

## Residual Risks

Even if all tasks are completed as written, the following risks will remain:

1.  **Database State Mismatch:** The application code will believe the legacy model is gone, but the database schema will still contain the `decisionCode` column. This creates a high risk for future database maintenance, ad-hoc analysis, and developer confusion.
2.  **Silent Regressions in UI:** Without an E2E testing strategy, regressions may occur where data is passed incorrectly between the API and UI layers, causing components to fail silently or display incorrect information. The changes to sorting logic (`getTranscriptDecisionSortValue`) and statistical tests (`ks-test`) are particularly vulnerable to this.
3.  **Broken External Integrations:** Any external consumer of the GraphQL API or data exports will be broken by the changes planned in Waves 2 and 4. The project will have shipped breaking changes without warning.
4.  **Inconsistent Data Fidelity:** The `ConditionMatrix` may permanently display lower-fidelity data depending on its context, creating an inconsistent user experience where the same type of data is presented with different levels of precision in different parts of the UI.

## Token Stats

- total_input=1057
- total_output=1055
- total_tokens=18765
- `gemini-2.5-pro`: input=1057, output=1055, total=18765

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
