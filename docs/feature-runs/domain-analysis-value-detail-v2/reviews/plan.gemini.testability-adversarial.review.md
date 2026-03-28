---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/domain-analysis-value-detail-v2/plan.md"
artifact_sha256: "b8b067495887afee70130ded9763ac08e96d14661fb3836a057a527fade07c5c"
repo_root: "."
git_head_sha: "68c62f1df7559ce9326bc9d7d9779ab267cc1b05"
git_base_ref: "origin/main"
git_base_sha: "582439e4dacd359753f381970c9cd8c7351e393f"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Resolved by adding exact label rules, invalid-count handling, and tests for mixed, tied, zero-data, and malformed-count conditions."
raw_output_path: "docs/feature-runs/domain-analysis-value-detail-v2/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1.  **(High)** The plan's error handling strategy is ambiguous and difficult to test comprehensively. It describes two distinct failure modes: a `CanonicalTranscriptRenderError` for the transcript drilldown and an "explicit error state" for malformed matrix aggregates (e.g., `NaN`, `null`, negative counts). It is not clear if these are the same error or handled by the same UI component. A tester cannot write a coherent test plan without knowing if a malformed aggregate for a single cell should show an error in that cell, or break the entire matrix, or be handled by the same mechanism that catches the drilldown error. This makes it impossible to test the robustness and granularity of the failure states.

2.  **(Medium)** The test approach for the matrix rendering logic is underspecified. The plan mentions a "happy path" test but the logic requires more rigorous, adversarial testing. The rule "Treat `prioritized > deprioritized` as `1`, `deprioritized > prioritized` as `2`, and ties or zero/zero cells as `-`" must be tested against a matrix of conditions. More importantly, the interaction with the "matrix count validator" is a critical, untested assumption. A test suite must prove that the validator *first* catches non-finite/negative/missing counts, preventing the label derivation logic from ever receiving them. The plan does not specify tests for these validation cases, creating a significant gap.

3.  **(Medium)** The goal to "Remove the value-detail page's legacy query branch and any display-mode fallback" is not accompanied by a sufficient test strategy. Testing the *absence* of a behavior is notoriously difficult. The plan lacks a "negative test case" that proves the removal was successful. A robust test would involve creating a data scenario where *only* legacy scores are present and asserting that the component throws the expected error rather than rendering anything, thus confirming no hidden fallback logic remains.

4.  **(Low)** The plan assumes the error localization is free. The note to "Keep the hard failure localized" relies on the existing component architecture having a robust error boundary. This assumption should be explicitly tested. A test case should trigger the `CanonicalTranscriptRenderError` and then assert that other UI elements outside the immediate drilldown area (e.g., the matrix itself, page headers) remain rendered correctly and are not captured by the error boundary.

## Residual Risks

1.  **Data Schema Brittleness:** The plan relies on a "matrix count validator" to catch malformed aggregates. This is a good control, but it creates a new dependency on a fixed data contract. If a future backend change sends a structurally valid response but with an unexpected data type (e.g., `prioritized: "1"` as a string instead of a number), it could bypass the validator's checks for `null` or `NaN` and cause an uncaught runtime error in the label derivation logic. The risk of failures from unanticipated data shapes remains.

2.  **Visual and UX Regression:** The plan focuses entirely on logical correctness and data integrity. By removing GQL fields and "reworking the condition matrix cell rendering," there is a significant risk of unintended visual regressions (styling, alignment, responsive behavior) that are not covered by the proposed testing. The plan mentions keeping row/column order but is silent on all other visual aspects. Without visual snapshot testing, the new implementation could be logically correct but visually broken.

3.  **Performance Degradation:** The rework of the matrix cell rendering introduces new logic. While it appears simpler, there is no plan to measure its performance impact. For large matrices, the new derivation and validation functions could be less efficient or trigger more re-renders than the previous implementation, leading to a perceived performance regression for users. This risk is unmitigated as no performance baselining or testing is mentioned.

## Token Stats

- total_input=11946
- total_output=804
- total_tokens=14817
- `gemini-2.5-pro`: input=11946, output=804, total=14817

## Resolution
- status: accepted
- note: Resolved by adding exact label rules, invalid-count handling, and tests for mixed, tied, zero-data, and malformed-count conditions.
