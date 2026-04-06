---
reviewer: "gemini"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/replace/tasks.md"
artifact_sha256: "1186dbd6136f668c820c84f1fe593b6afd519e8b7e86025f96b94d40e70a5f4a"
repo_root: "."
git_head_sha: "10bf94660675d2780d47c779703b906d451a9b22"
git_base_ref: "origin/main"
git_base_sha: "345d03f7eff71bacc8cef3a464cd4024ce6fa092"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/replace/reviews/tasks.gemini.dependency-order-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

1.  **Implicit Backend-Frontend Dependency:** The task list presents Backend and Frontend workstreams as parallel. However, the entire Frontend work is strictly dependent on the completion of the Backend tasks. The frontend GraphQL queries in `domainAnalysis.ts` cannot be updated until the API's schema is changed, deployed, and available for introspection. This sequential dependency is not represented, creating a false impression of parallelizable work.

2.  **Missing API Schema Generation Step:** There is no explicit task for regenerating the GraphQL schema and related TypeScript types after the backend changes are made. This is a critical step (`npm run codegen`, `npx prisma generate`, etc.) that must occur between the backend work and the frontend work. Without this, the frontend developer is blocked.

3.  **No Data Migration or Backfill Strategy:** The most significant flaw is the complete omission of a data migration plan. The tasks remove logic that relies on `decisionCode` and introduce a new classification system via `resolveCanonicalDecision`. This assumes that all historical data will either work automatically or does not need to be preserved. It's unclear how existing records, which presumably have the legacy `decisionCode` or lack the new `decisionMetadata`, will be handled. This could lead to runtime errors, incorrect analysis for all historical data, or silent data corruption.

4.  **Insufficient Verification Plan:** The verification section only lists running existing test and lint suites. It does not include tasks to write *new* tests for the new, critical business logic. Specifically, there are no tasks for:
    *   Writing targeted unit tests for `resolveCanonicalDecision` to validate the new five-bucket classification logic against all edge cases.
    *   Writing integration tests for the `domainAnalysisValueDetail` GraphQL endpoint to verify the correctness of the newly added aggregation fields (`meanPreferenceScore`, `selectedValueWinRate`, etc.).

5.  **Ambiguous Core Logic Hand-off:** The task "rewrite per-transcript loop to use `resolveCanonicalDecision`" assumes the logic in `resolveCanonicalDecision` is complete and correct. However, the only task associated with that function is to move a guard clause. This creates ambiguity about where the primary classification logic is being implemented and tested, and it assumes the function is ready for this new, central role without explicitly tasking its refactoring or validation.

## Residual Risks

1.  **Data Integrity Failure:** The lack of a data migration strategy poses the highest risk. When this change is deployed, it's highly probable that all previously existing domain analysis results will become inaccessible or display incorrect, nonsensical data. The system may fail when encountering old records that the new logic cannot process.

2.  **Implementation Deadlock:** A developer attempting to follow this plan will immediately hit a wall. A frontend developer will be blocked waiting for the backend. A backend developer might complete their work, but the project will not build or run correctly without the unlisted schema generation step, leading to confusion and delays.

3.  **Undetected Bugs in Business Logic:** By not explicitly requiring new unit tests for the core `resolveCanonicalDecision` function, there is a high risk of introducing subtle misclassification bugs. The existing test suite is unlikely to cover the nuances of the new five-bucket system, allowing regressions or incorrect calculations to ship to production.

4.  **Performance Regression:** The new logic computes several new metrics on the fly inside the `domainAnalysisValueDetail` resolver. Without a task to analyze the performance impact, this could introduce significant latency for a core API endpoint, especially when analyzing domains with many transcripts. The solution might require caching or database-level changes that are not considered in this plan.

## Token Stats

- total_input=1259
- total_output=765
- total_tokens=15586
- `gemini-2.5-pro`: input=1259, output=765, total=15586

## Resolution
- status: open
- note: