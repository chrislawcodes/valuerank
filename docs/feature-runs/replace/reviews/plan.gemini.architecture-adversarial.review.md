---
reviewer: "gemini"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/replace/plan.md"
artifact_sha256: "283bdbc45edcf7ac811cbbde4d21a5eda0dd4028191f63e2008906e46e7ccc98"
repo_root: "."
git_head_sha: "10bf94660675d2780d47c779703b906d451a9b22"
git_base_ref: "origin/main"
git_base_sha: "345d03f7eff71bacc8cef3a464cd4024ce6fa092"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/feature-runs/replace/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

1.  **Introduces Deliberate Data Inconsistency:** The plan's "two-wave strategy" is a significant architectural flaw. By knowingly shipping a state where the top-level domain analysis grid uses a legacy aggregation (`decisionCode`) while the detail page (`DomainAnalysisValueDetail`) uses a new, incompatible aggregation (`canonical decision resolution`), the plan guarantees the application will display conflicting data to the user. A summary metric on one page will not be derivable from the detailed data on the next. This erodes user trust in the platform's results and creates a confusing user experience. This is not a "medium" risk; it is a high-risk decision to intentionally ship a broken, inconsistent data narrative.

2.  **Lacks Performance Impact Analysis:** The plan replaces a simple integer summation (`decisionSum`) with a more complex, per-transcript resolution logic in `decision-model.ts`. There is no consideration of the performance impact. For domains with a large number of transcripts (e.g., tens of thousands), executing this logic in a synchronous, blocking loop within the API resolver could lead to significant latency increases, potentially causing API timeouts and a degraded user experience. The plan lacks any performance budgeting, load testing, or analysis of the new logic's complexity.

3.  **Insufficient Verification Plan:** The verification steps are limited to `lint`, `test`, and `build` at the package level. This is inadequate for a cross-cutting change involving an API contract. The plan is missing:
    *   **Integration Testing:** There are no steps to verify that the frontend and backend work together *after* the breaking GraphQL schema change. The build might pass, but the application could fail at runtime.
    *   **Data Validation:** There is no "golden" test case to ensure the new aggregation logic produces the correct numerical results. The change could introduce subtle calculation errors that unit tests might not catch.
    *   **End-to-End (E2E) UI Testing:** There is no check to confirm the `DomainAnalysisValueDetail.tsx` component correctly interprets the new data fields (`meanPreferenceScore`, `opponentMeanPreferenceScore`) to render all UI states (selected value wins, opponent wins, ties) correctly.

4.  **Brittle Assumption of a Single API Client:** The plan assumes that `@valuerank/web` is the only consumer of the `domainAnalysis` GraphQL query. It proceeds to make breaking changes (removing `meanDecisionScore`) without verifying if other clients exist. Any internal scripts, data-auditing tools, or undocumented consumers would be broken. A robust architectural plan would involve a period of schema deprecation or a versioned API to handle such changes safely.

## Residual Risks

1.  **Masking Upstream Data Regressions:** Shifting transcripts with resolution failures into a visible `unknownCount` is an improvement, but it introduces a new risk. It allows upstream systems (e.g., Python workers) to have significant data quality regressions without causing a hard failure in the analysis system. A bug causing `decisionMetadata` to be consistently null would not trigger an alert; it would just silently skew the analysis by moving a large portion of data into the "unknown" bucket, potentially leading users to draw incorrect conclusions from the remaining, biased dataset.

2.  **Permanent Architectural Debt:** The plan accepts the "two-wave" inconsistency with the intention of a "follow-up wave". This is a classic pattern for incurring architectural debt. There is a significant risk that business priorities will shift and the follow-up work will be delayed or de-prioritized, leaving the application in a permanently inconsistent state. A better architecture would find a way to update both the summary and detail views simultaneously, even if it required more effort in a single wave.

3.  **Historical Data Incompatibility:** The assumption that "All current production batches are job-choice-v2" is a weak point. The architecture should be resilient to processing older data formats. If an analyst ever needs to re-run an analysis on a historical batch that uses `standard-parser` without `orientationFlipped`, that data will be silently discarded from the core analysis. This is a form of silent data loss that can corrupt historical comparisons.

## Token Stats

- total_input=1794
- total_output=882
- total_tokens=15839
- `gemini-2.5-pro`: input=1794, output=882, total=15839

## Resolution
- status: open
- note: