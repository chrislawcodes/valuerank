---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflows/paired-batch-launch-page/plan.md"
artifact_sha256: "93603d547d0ed4f8ea60f165e3b4f9c976b34a91d5eb644881775a1aa55f9474"
repo_root: "."
git_head_sha: "266e3a9970b6f64da9708f66cf37a025d6db2d35"
git_base_ref: "origin/domain-defaults-preamble-context"
git_base_sha: "266e3a9970b6f64da9708f66cf37a025d6db2d35"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The tasks now spell out the direct-route flow, invalid-route and eligibility handling, dead modal cleanup, and the exact verification commands that were run."
raw_output_path: "docs/workflows/paired-batch-launch-page/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1.  **Undefined In-Flight UI State:** The plan fails to specify the form's state during the submission mutation. It does not mention disabling the submit button or displaying a loading indicator. This omission creates a high risk of race conditions from user double-clicks, which can lead to duplicate run creations. Test suites are unlikely to catch this without specific guidance, as they typically test for success and failure states, not the transitional "in-flight" state.
2.  **Ambiguous Invalid ID Handling:** The plan requires the page to handle "invalid definition IDs" but does not define "invalid." This term could mean a malformed ID (not a UUID), a syntactically valid but non-existent ID (404), or an ID for a resource the user is not authorized to view (403). Each case requires a distinct error state and user feedback, representing a gap in test coverage. The current plan does not prompt the developer to test these separate failure modes.
3.  **Unexplained Test Dependency:** The verification section lists `tests/components/runs/RerunDialog.test.tsx` as a required test. However, the plan provides no architectural context or user flow that connects the new launch page to the rerun dialog. This suggests a hidden dependency that is not documented. Without this explanation, testers cannot validate the interaction, and a future developer might mistakenly break this implicit coupling.
4.  **Vague Responsive Behavior:** The requirement for controls to "sit side by side on wider screens" is not specific. It lacks a defined breakpoint or any specification for behavior on smaller screens (tablet, mobile). This makes the layout difficult to test comprehensively, as automated tests can only assert the single "wider screen" case, leaving other viewports vulnerable to layout bugs.

## Residual Risks

1.  **Implicit `RunForm` Dependencies:** The architecture assumes the shared `RunForm` component can be moved from a modal to a page context without issue. There is a risk that the component has undeclared dependencies on its previous modal container, such as styling from parent CSS selectors or reliance on modal-specific context providers. If so, reusing `RunForm` could introduce subtle UI regressions on other launch surfaces that are not the primary focus of the proposed tests.
2.  **Fragility of Server-Side Default:** The feature's correctness hinges on a server-side default that sets the run category to `PRODUCTION`. While an API test is included to verify this, the client has no awareness of this logic. Any future change to this server-side behavior for any reason will silently break this feature, as the client-side code will not fail, but the created runs will be miscategorized.
3.  **Incomplete Dead Code Analysis:** The plan to delete `RunFormModal.tsx` assumes it is only used in the flow being replaced. There is a risk that the file is referenced elsewhere (e.g., Storybook, internal documentation, or a different feature-flagged workflow). Removing the file without a full repository search for its name could cause a build failure or break another part of the application.

## Token Stats

- total_input=1948
- total_output=650
- total_tokens=16329
- `gemini-2.5-pro`: input=1948, output=650, total=16329

## Resolution
- status: accepted
- note: The tasks now spell out the direct-route flow, invalid-route and eligibility handling, dead modal cleanup, and the exact verification commands that were run.
