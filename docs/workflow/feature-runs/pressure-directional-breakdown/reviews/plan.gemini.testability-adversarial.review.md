---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/pressure-directional-breakdown/plan.md"
artifact_sha256: "7c8dd3b8df06fb71a1f94a131846035c444caffaaca2e1119496aa1332e04bde"
repo_root: "."
git_head_sha: "c4ae5bdb840b796e23fd5ea549b6f74fa745764f"
git_base_ref: "origin/main"
git_base_sha: "60c4e4307bf423c0f688341736c7da7f0482a090"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/pressure-directional-breakdown/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding |
| :--- | :--- |
| **HIGH** | **Core calculations are undefined.** The plan states the component will compute `pushedForEffect`, `pushedAgainstEffect`, and `gap`, but omits the formulas. Without these definitions, it is impossible to write tests for correctness or to verify the component's primary function. |
| **HIGH** | **Input data contract is missing.** The component's primary input, `PressureSensitivityModel[]`, is not defined. To write effective tests, the shape of this model object is required, including the specific names and types of the "three rate fields" used for validity filtering and computation. It is impossible to mock test data or validate edge cases (e.g., null vs. undefined fields) without this contract. |
| **MEDIUM** | **[UNVERIFIED] External dependency behavior is assumed.** The plan requires reusing `formatSignedPoints` but does not account for its test coverage or behavior with edge-case inputs (e.g., zero, very large numbers, non-numbers). A bug or unexpected behavior in this dependency will manifest as a failure in the new component, complicating debugging and testing. |
| **MEDIUM**| **[UNVERIFIED] Integration point is fragile.** The plan specifies rendering the new component inside a "non-empty, non-allInsufficient block" in `PressureSensitivity.tsx`. This prose-based description suggests a potentially complex or unstable location in the parent's render logic. This makes placement difficult to verify with a unit test and brittle against unrelated refactoring in the parent component. |
| **LOW** | **Sorting tie-breaker field is ambiguous.** The plan specifies sorting by "label ascending" to break ties. It does not define which property on the model constitutes the "label". While likely the model name, this ambiguity could lead to incorrect test implementation or unexpected sort behavior if the assumption is wrong. |
| **LOW** | **Null-render condition is imprecise.** The component "Returns `null` when ... all pairsUsed = 0". This could be interpreted as "the sum of `pairsUsed` across all models is zero" or "every individual model has `pairsUsed: 0`". The latter is more likely, but the ambiguity could cause a test to miss an edge case where some, but not all, models have zero pairs. |

## Residual Risks

- **Untested Logic Propagation:** The most significant residual risk is that the core business logic—the calculations for `pushedForEffect`, `pushedAgainstEffect`, and `gap`—is not only missing but may also be flawed. Since it's undefined, the planned tests cannot cover it, and a faulty implementation could be shipped.
- **Data Shape Mismatch:** Because the `PressureSensitivityModel` shape is unknown, there is a risk that the live data from the GraphQL API will contain structures or edge cases (e.g., null nested objects, missing arrays) not anticipated by the planned "validity filter," leading to runtime errors in production that were not covered in testing.
- **Brittle Rendering:** The dependency on the parent component's internal structure for rendering placement means that future unrelated code changes in `PressureSensitivity.tsx` could silently cause the `PressureDirectionalBreakdown` component to no longer appear, a class of bug that unit tests are unlikely to catch.

## Token Stats

- total_input=12396
- total_output=709
- total_tokens=15324
- `gemini-2.5-pro`: input=12396, output=709, total=15324

## Resolution
- status: open
- note: