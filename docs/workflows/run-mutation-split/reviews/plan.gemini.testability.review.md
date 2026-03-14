---
reviewer: "gemini"
lens: "testability"
stage: "plan"
artifact_path: "/private/tmp/valuerank-run-mutation-split/docs/workflows/run-mutation-split/plan.md"
artifact_sha256: "85d10224ed200bb0b27c5c21c5b2cb5a7dc2d8add0c39e3ae07511e5b7303205"
repo_root: "/private/tmp/valuerank-run-mutation-split"
git_head_sha: "3cb90bd0e543480b1015082514c2aa8dc6b78261"
git_base_ref: "origin/main"
git_base_sha: "3cb90bd0e543480b1015082514c2aa8dc6b78261"
resolution_status: "accepted"
resolution_note: "Add a focused run mutation smoke or schema test because recoverRun, triggerRecovery, and updateRun lack direct GraphQL coverage today."
raw_output_path: "/private/tmp/valuerank-run-mutation-split/docs/workflows/run-mutation-split/reviews/plan.gemini.testability.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability

## Findings

1.  **Explicit Test Coverage Gaps:** The plan correctly identifies that the `recoverRun`, `triggerRecovery`, and `updateRun` mutations currently lack direct GraphQL coverage. This is a significant testability gap that the plan acknowledges and proposes to address by adding a focused smoke or schema test.
2.  **Improved Modularity for Testability:** The core of the plan involves splitting the monolithic `run.ts` file into smaller, focused modules. This structural refactoring is expected to significantly improve testability by enabling easier isolation and testing of individual components.
3.  **Robust Verification Suite:** The proposed verification suite is comprehensive, including specific unit tests for mutations (`run.test.ts`, `run-control.test.ts`, etc.), type checking (`npm run typecheck`), and the addition of a new focused GraphQL smoke or schema test to ensure full registration of all mutations.
4.  **Intentional Abstraction Layer:** The introduction of a new entrypoint (`run/index.ts`) and a "thin compatibility shim" for `run.ts` are architectural decisions that abstract the new file structure, which can aid in maintaining a stable testing interface for consumers of the `run` mutations.

## Residual Risks

1.  **"Thin Compatibility Shim" Indirection:** The "thin compatibility shim" replacing `run.ts` introduces a layer of indirection. If not thoroughly tested or maintained, this shim could obscure the root cause of issues or become a maintenance burden, potentially impacting debugging and test analysis.
2.  **Potential for Undetected Regressions:** While the plan aims to cover all mutations, the explicit mention of prior coverage gaps for `recoverRun`, `triggerRecovery`, and `updateRun` suggests a historical risk. If the new verification steps do not capture all edge cases or interaction paths, regressions could still occur and go undetected.
3.  **Test Maintenance Complexity:** The introduction of multiple new files and an entrypoint might lead to a slightly increased complexity in test maintenance over time, requiring careful management to ensure test logic remains DRY and efficient across the new structure.

## Token Stats

- total_input=1647
- total_output=435
- total_tokens=15576
- `gemini-2.5-flash-lite`: input=1647, output=435, total=15576

## Resolution
- status: accepted
- note: Add a focused run mutation smoke or schema test because recoverRun, triggerRecovery, and updateRun lack direct GraphQL coverage today.
