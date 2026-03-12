---
reviewer: "gemini"
lens: "requirements"
stage: "spec"
artifact_path: "/private/tmp/valuerank-run-mutation-split/docs/workflows/run-mutation-split/spec.md"
artifact_sha256: "097b5f666e6385a4a1b89f4b3d32b29980ec833e5146d368eed18e68502cd6e6"
repo_root: "/private/tmp/valuerank-run-mutation-split"
git_head_sha: "3cb90bd0e543480b1015082514c2aa8dc6b78261"
git_base_ref: "origin/main"
git_base_sha: "3cb90bd0e543480b1015082514c2aa8dc6b78261"
resolution_status: "accepted"
resolution_note: "The spec already keeps the scope narrow, preserves the old entry path, and calls out the main registration risk clearly."
raw_output_path: "/private/tmp/valuerank-run-mutation-split/docs/workflows/run-mutation-split/reviews/spec.gemini.requirements.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements

## Findings

*   The specification clearly defines the goal of structurally refactoring `cloud/apps/api/src/graphql/mutations/run.ts` to improve maintainability and reduce complexity, without altering the GraphQL behavior or service-layer logic.
*   Explicit requirements are provided for preserving mutation names, arguments, return shapes, and ensuring correct side-effect registration for the GraphQL schema.
*   The scope is well-defined, isolating the work to specific files and a new directory (`cloud/apps/api/src/graphql/mutations/run/`), while explicitly excluding changes to service logic, queue behavior, and frontend work.
*   A compatibility shim strategy is detailed, aiming to keep the existing `run.ts` path functional as an entry point to maintain backward compatibility.
*   The specification includes specific risks, such as issues with Pothos side-effect registration and hidden compatibility drift, along with corresponding verification steps and acceptance criteria.

## Residual Risks

*   **Pothos Side-Effect Registration:** The most critical risk is that mutations may disappear from the GraphQL schema if the new split files are not correctly imported or if Pothos's registration mechanism is misunderstood. This could lead to broken API functionality without compile-time errors.
*   **Hidden Compatibility Drift:** Changes to import paths or the structure of `mutations/index.ts` could inadvertently alter how mutations are registered or how other parts of the system import them, leading to subtle breakages.
*   **Over-reach into Service Logic:** Although strictly out of scope, there's a risk that developers might be tempted to refactor or optimize service code during this structural split, complicating rollback and scope management.
*   **Test Coverage Gaps:** While existing tests are to be preserved, there's a noted possibility that current tests may not cover all split mutations comprehensively, potentially leading to undetected regressions.
*   **Shared Helper Creep:** There's a risk of creating a new, large helper file in the split modules, which would negate the goal of reducing mental overhead and code complexity. The preference for small, local groupings needs strict enforcement.

## Token Stats

- total_input=744
- total_output=444
- total_tokens=15963
- `gemini-2.5-flash-lite`: input=744, output=444, total=15963

## Resolution
- status: accepted
- note: The spec already keeps the scope narrow, preserves the old entry path, and calls out the main registration risk clearly.
