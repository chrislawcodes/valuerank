---
reviewer: "gemini"
lens: "testability"
stage: "plan"
artifact_path: "/Users/chrislaw/valuerank/docs/workflows/domain-query-split/plan.md"
artifact_sha256: "70748391385a753552695fbe29ac4b1b958a67e33b4d08108168f95881522d43"
repo_root: "/Users/chrislaw/valuerank"
git_head_sha: "3aa0478c59137277c911bea998522cfd86ec9934"
git_base_ref: "origin/main"
git_base_sha: "3aa0478c59137277c911bea998522cfd86ec9934"
resolution_status: "accepted"
resolution_note: "Start by confirming current consumers and add the focused top-level domain schema or query test because helper tests alone are not enough."
raw_output_path: "/Users/chrislaw/valuerank/docs/workflows/domain-query-split/reviews/plan.gemini.testability.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability

## Findings

*   The plan directly addresses a testability gap by identifying the "lack of a direct top-level domain query/schema test" and proposing to add "one focused schema or query test" (Step 11).
*   The plan includes a robust verification suite that leverages existing tests (`npm test` for specific query files) and type checking (`npm run typecheck`), which is crucial for confirming that the refactoring maintains the existing GraphQL behavior.
*   Constraints such as "No GraphQL field or argument changes" and "No UI refactors" are well-defined, limiting the scope of potential regressions and simplifying the testing focus.
*   The creation of a dedicated `domain/index.ts` as a single side-effect entrypoint (Step 9) is a good practice for modularity and can simplify import management, which indirectly aids testability by providing clear boundaries.

## Residual Risks

*   **Potential for Inadequate Unit Test Coverage:** While the plan details steps for moving code and ensures existing integration tests are run, it only explicitly calls for adding "one focused schema or query test." The split creates several new files (`shared.ts`, `types.ts`, `catalog.ts`, `planning.ts`, `analysis.ts`), each potentially containing logic that could benefit from dedicated unit tests. The plan does not guarantee coverage for these individual modules, which could lead to missed bugs in isolated components.
*   **Unspecified Baseline Test Coverage:** Step 2 mentions "helper tests that already exist" and a "lack of a direct top-level domain query/schema test." The plan would be stronger if it provided more detail on the current state and coverage of existing tests for `domain.ts`, to ensure the split doesn't accidentally remove implicit test coverage for functionality that isn't explicitly covered by the proposed new tests.
*   **Limited Scope of New Test:** The commitment to adding only "one focused schema or query test" might be insufficient to thoroughly validate the complex split of the `domain.ts` file into multiple new modules. The effectiveness of this single test in covering all aspects of the split needs careful evaluation.

## Token Stats

- total_input=820
- total_output=445
- total_tokens=13854
- `gemini-2.5-flash-lite`: input=820, output=445, total=13854

## Resolution
- status: accepted
- note: Start by confirming current consumers and add the focused top-level domain schema or query test because helper tests alone are not enough.
