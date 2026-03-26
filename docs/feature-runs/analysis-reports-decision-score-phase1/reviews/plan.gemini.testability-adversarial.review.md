---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/analysis-reports-decision-score-phase1/plan.md"
artifact_sha256: "b7c7f948b8eaa3a61690e32ff10840ee7800f867433f354d0dab68feb1dc1856"
repo_root: "."
git_head_sha: "b3e2d63328dccb036ae789ac1f04a3ce39404f32"
git_base_ref: "origin/main"
git_base_sha: "345d03f7eff71bacc8cef3a464cd4024ce6fa092"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Resolved by requiring explicit helper coverage for malformed legacy values, renderable-vs-unrenderable boundaries, accessible labels, and backing decisionCode filter/override behavior."
raw_output_path: "docs/feature-runs/analysis-reports-decision-score-phase1/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1.  **Critical Test Gap for Backing Values:** The verification plan focuses exclusively on testing the *new* visible output. It completely omits testing that the *old* `decisionCode` values—which the plan states are being kept for filtering and overrides—still function correctly. This creates a significant risk that the UI will show the correct canonical labels, but all filtering and override functionality will be broken because it's no longer correctly wired to the hidden backing codes. A test must verify that clicking a filter corresponding to "Strongly favors" correctly filters the dataset using the backing `decisionCode: 1`.

2.  **Incomplete Verification for Malformed Data:** The `Acceptance Criteria` section astutely calls for testing the aggregate helper against malformed legacy values like `0`, `6`, and `null`. However, the `Verification Plan` provides no corresponding step to ensure these specific, critical edge cases are actually implemented in the test suite. A plan to "run the shared helper unit test" is too generic; it doesn't guarantee coverage for these specific, high-risk inputs.

3.  **Untested Dependencies:** The plan's foundation is the reuse of existing helpers like `formatCanonicalDecisionHeadline()` and `hasRenderableTranscriptDecisionModelV2()`. It assumes these helpers are robust and fully tested. This is a weak assumption in an adversarial review. The plan should include a specific task to audit and, if necessary, harden the test suites for these foundational helpers *before* building new logic on top of them. Any existing bugs in how they handle edge-case transcripts will be inherited and amplified.

4.  **Missing Accessibility Verification:** The plan mentions `aria-labels` once but includes no specific verification step to ensure they are updated correctly. Automated tests should assert that `aria-labels` and other accessibility attributes match the new canonical text, not the old numeric scores. Without this, the site could become inaccessible, presenting correct visual information but incorrect screen reader output.

## Residual Risks

1.  **Visual Regressions:** The verification plan has no provision for visual or layout testing. The introduction of longer canonical string labels (`Strongly favors <value>`) in place of single digits, and the replacement of a numeric mean with a block of bucketed counts, creates a high risk of CSS/layout failures like text overflow, mis-alignment, or component overflow on smaller viewports. These bugs would not be caught by the proposed unit and functional tests.

2.  **Ambiguity of `Mixed`:** The strict-majority rule is logically sound, but the resulting `Mixed` label can hide critical differences in the underlying data. A 3/2 split between `Strongly favors` and `Somewhat favors` is qualitatively different from a 3/2 split between `Strongly favors` and `Neutral`. While the plan mitigates this by retaining drilldown functionality, it remains a risk that users will misinterpret the top-level `Mixed` summary and not investigate further, leading to flawed analysis.

3.  **Fragile State Distinction:** The plan defines three distinct "empty" states: `—` (no data), `Unknown` (data exists but is un-renderable), and `Mixed` (renderable data with no majority). While unit tests can verify these states in isolation, the distinction is subtle and a common source of bugs. There is a residual risk that developers will misapply the rules in the page-level components, or that tests for those components will not be precise enough to distinguish, for example, a `null` transcript array from an array of `null` transcripts.

## Token Stats

- total_input=2095
- total_output=752
- total_tokens=17556
- `gemini-2.5-pro`: input=2095, output=752, total=17556

## Resolution
- status: accepted
- note: Resolved by requiring explicit helper coverage for malformed legacy values, renderable-vs-unrenderable boundaries, accessible labels, and backing decisionCode filter/override behavior.
