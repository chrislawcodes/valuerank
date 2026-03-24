---
reviewer: "gemini"
lens: "quality-adversarial"
stage: "diff"
artifact_path: "docs/feature-runs/vignette-analysis-decision-model/reviews/implementation.diff.patch"
artifact_sha256: "9704d12332dfcd72279479f2c1a67ce8f1dd72e08947f46f39febaccb339e45f"
repo_root: "."
git_head_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
generation_method: "gemini-cli"
resolution_status: "deferred"
resolution_note: "Deferred as transitional report-surface debt. Empty/error/fetching coverage and the all-or-nothing display choice can be revisited after the V2 report backfill is complete, but they are acceptable for this bounded migration slice."
raw_output_path: "docs/feature-runs/vignette-analysis-decision-model/reviews/diff.gemini.quality-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff quality-adversarial

## Findings

### 1. **Degraded UX in Mixed-Data Scenarios**
The implementation uses an `every()` check to determine the display mode. If a set of transcripts contains even a single record without the `decisionModelV2` field, the entire table falls back to the legacy display mode. This "all or nothing" approach forces a downgrade of the user experience, hiding the richer canonical decision format for all other transcripts in the set that *do* support it. For a list of 100 transcripts where 99 have the new data model, the user is only shown the old format for all 100, which is a significant loss of information. A row-by-row determination would provide a better and more accurate presentation of the available data.

### 2. **Incomplete Test Coverage for Data Fetching States**
The new test suite (`DomainAnalysisValueDetail.test.tsx`) exclusively covers the happy path where the `useQuery` hook successfully returns data. It does not validate the component's behavior during `fetching` or `error` states for the transcript query. This leaves the component's resilience unverified; it's unclear if it correctly displays loading indicators or handles API errors gracefully without crashing.

### 3. **Brittle Test Mock Implementation**
The mock for `useQuery` in the tests uses conditional logic based on `definitionId` to return different datasets for the "all V2" and "mixed" test cases. However, the second test case does not explicitly set up a scenario to trigger the mixed data path; it works only because the mock data is hardcoded that way. This makes the tests less explicit and more brittle. A better approach would be to use `mockImplementationOnce` for each test to provide a clean, isolated mock that precisely matches the test's intent.

## Residual Risks

### 1. **Presentation-Layer Data Obfuscation**
The "all or nothing" display logic creates a significant risk of user confusion. As data is progressively migrated to `decisionModelV2`, the UI will appear to flip between 'legacy' and 'audit' modes based on which data slice the user selects. A user might see the rich view for one condition, click another, and see the legacy view, incorrectly assuming the underlying data is universally sparse, when in fact only one record was missing. This degrades the tool's perceived reliability and analytical power.

### 2. **Dependency on Unguarded Utility Functions**
The component's rendering logic unconditionally calls `formatCanonicalDecisionHeadline(transcript)` when in `audit` mode. This assumes the `reportDecisionDisplayMode` check is a perfect guard and that any transcript in that context will have a valid `decisionModelV2` object. If there is any logic error that allows a transcript without this object to be rendered in `audit` mode, the `formatCanonicalDecisionHeadline` function could throw a runtime error, as its own robustness against malformed input is not demonstrated or tested here.

## Token Stats

- total_input=4316
- total_output=626
- total_tokens=18997
- `gemini-2.5-pro`: input=4316, output=626, total=18997

## Resolution
- status: deferred
- note: Deferred as transitional report-surface debt. Empty/error/fetching coverage and the all-or-nothing display choice can be revisited after the V2 report backfill is complete, but they are acceptable for this bounded migration slice.
