---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/models-tab/plan.md"
artifact_sha256: "167c8bec94d08def378e596cc8063c75732c130985ea5e43874e91517d43fdac"
repo_root: "."
git_head_sha: "b26923fbe83c2c0ec86c80180073de00a4461626"
git_base_ref: "origin/main"
git_base_sha: "b26923fbe83c2c0ec86c80180073de00a4461626"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/models-tab/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

### HIGH

1.  **Manual Schema Drift:** The plan's Decision 4 to manually update `cloud/apps/web/schema.graphql` creates a significant, untestable gap between the API's implementation (Pothos types) and its contract (SDL). A developer could change a Pothos type without updating the SDL, or vice-versa. This would break `npm run codegen` on the web side, but would not be caught by any API-side verification (`lint` or `build`). This makes integration fragile and relies solely on developer discipline. A test that compares the generated schema from Pothos against the checked-in SDL is necessary to prevent this.
2.  **Ambiguous "Latest" Snapshot Selection:** The resolver logic in Slice A specifies querying for snapshots and then to "Deduplicate per-domain: keep only the most recent snapshot per assumptionKey". This is ambiguous. If two snapshots for the same `assumptionKey` have identical `createdAt` timestamps, the selection is non-deterministic. This will lead to flaky tests and unpredictable behavior in production. The query or the deduplication logic must include a deterministic tie-breaker, such as the snapshot's primary key (`id`).
3.  **Insufficient Verification Plan:** The verification step for all three slices is limited to `lint` and `build`. This is insufficient for catching anything beyond type errors and syntax.
    *   **API (Slice A):** The complex, state-dependent logic of the resolver (snapshot parsing, data aggregation, weighted means, MAD calculation) will be completely untested. Unit tests for the computation helpers and an integration test for the `modelsAnalysis` query field are required.
    *   **Web (Slice C):** The UI has numerous states (loading, error, empty, single-domain, filtered, sorted, drawer-open) and complex client-side utility functions (`computeDots`, `formatStabilityTooltip`) that will be untested. This requires component-level unit tests.

### MEDIUM

1.  **Missing Error Handling Strategy for UI:** The plan for Slice C (`Models.tsx`) accounts for the `loading` state from the API query but omits any mention of the `error` state. If the `modelsAnalysis` query fails, the UI has no defined behavior. This will likely result in a crash or a confusing, non-functional page. Test plans must include asserting on UI behavior during an API error.
2.  **Unspecified UI Behavior for Missing Data:**
    *   The UI plan for `ModelsMatrix.tsx` uses a hardcoded `VALUE_SHORT_LABELS` map. If the API returns a `valueKey` not present in this map, the component's behavior is undefined. It may fail to render a column header or even crash. The component needs a graceful fallback, such as using the raw `valueKey`.
    *   The `ModelValueDetailDrawer.tsx` is designed to be opened with a `model` and `valueKey`. If the provided `valueKey` does not exist within the `model.values` array, its behavior is undefined. It should handle this case gracefully, perhaps by displaying an error or closing itself.
3.  **[UNVERIFIED] Fragile Dependency on Snapshot Parsing:** The resolver logic in Slice A depends on `parseSnapshotOutput` from an existing file. The plan does not account for what happens if the `output` JSON from a snapshot is malformed, has a different schema than expected, or contains non-numeric/missing values for `prioritized` and `deprioritized`. This can lead to runtime errors in the resolver. The parsing and aggregation logic must be robust against unexpected data shapes.

### LOW

1.  **Untested Stability Filter Thresholds:** The `ModelsMatrix.tsx` component is specified to have a `stabilityFilter` prop, but the plan does not define the score thresholds for what constitutes `'stable'` or `'low'` stability. This makes the feature untestable and incomplete. The thresholds should be defined as constants and used in filtering logic that can be unit-tested.
2.  **Ambiguous Null Handling in Calculations:** The resolver plan for Slice A specifies that `computeWinRate` returns `null` if its denominator is zero. However, it doesn't explicitly state how the downstream `computePooledWinRate` and `computeStabilityScore` functions will handle receiving a domain with a `null` win rate. The logic implies they are filtered out by the "eligible" check, but this should be made explicit and unit-tested to prevent `NaN` or runtime errors.
3.  **Missing Test for Single-Domain Stability Muting:** The `ModelsMatrix.tsx` is passed a `singleDomainActive` prop, which is intended to mute the stability dots via a `muted` prop on `ModelsMatrixCell.tsx`. This interaction between the page, the matrix, and the cell is a specific UI state that is not called out for testing and could easily be missed.

## Residual Risks

1.  **Data Consistency Risk:** The entire feature relies on `assumptionAnalysisSnapshot` data being correct and up-to-date. The plan does not include any mechanism to verify that the snapshots are a faithful representation of the source-of-truth data (transcripts). An underlying bug in the snapshot generation process would lead to incorrect data being displayed in the new Models tab, which would not be caught by this feature's tests.
2.  **Performance Risk at Scale:** The plan explicitly defers performance considerations, stating the workload is "trivial at current scale". The resolver's in-memory aggregation will degrade linearly with the number of domains and snapshots. This creates a risk that the feature will become unacceptably slow as data grows, requiring a future refactor (e.g., to add caching or move aggregation into the database).
3.  **Configuration Management Risk:** The plan introduces a new, hardcoded map of `VALUE_SHORT_LABELS` in the UI. This is now the third place where value keys are mapped to display names (along with the canonical value definitions and potentially other UI components). This increases the risk of inconsistency and the maintenance burden when values are added or changed.

## Token Stats

- total_input=16694
- total_output=1302
- total_tokens=19903
- `gemini-2.5-pro`: input=16694, output=1302, total=19903

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
