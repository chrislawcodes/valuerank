---
reviewer: "gemini"
lens: "testability"
stage: "plan"
artifact_path: "/Users/chrislaw/valuerank-run-form-split/docs/workflows/run-form-split/plan.md"
artifact_sha256: "c8a692c024e245ec455ed2e6d052740cef416efca7c24f2e49a0b841831195e9"
repo_root: "/Users/chrislaw/valuerank-run-form-split"
git_head_sha: "878a4ba0184013c98215f1cb3df1d9e6b99e0956"
git_base_ref: "upstream/main"
git_base_sha: "878a4ba0184013c98215f1cb3df1d9e6b99e0956"
resolution_status: "accepted"
resolution_note: "Keep RunForm as the integration shell, keep new boundaries narrow, and add only a targeted test if the split exposes a coverage gap."
raw_output_path: "/Users/chrislaw/valuerank-run-form-split/docs/workflows/run-form-split/reviews/plan.gemini.testability.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability

## Findings

*   **Stable External Interface:** The commitment to not changing the prop contract of `RunForm.tsx` is excellent for testability, as it ensures existing consumer tests remain valid and require minimal to no updates.
*   **Leveraging Existing Test Suite:** The plan correctly identifies existing tests (`RunForm.test.tsx`, `RerunDialog.test.tsx`) and aims to keep them green, providing a solid foundation.
*   **Modular Extraction for Unit Testing:** The proposed extraction of form state into `useRunForm.ts` and UI blocks into `DefinitionPicker.tsx` and `RunConfigPanel.tsx` directly supports unit testing these new logical units independently.
*   **Pragmatic Test Addition Strategy:** The plan to add "only one focused test" if a new boundary is "weakly covered" is a balanced approach to ensure critical integration points are verified without unnecessary test proliferation.
*   **Clear Verification Protocol:** The inclusion of specific commands for running tests, linting, and type-checking ensures a robust verification process is followed.

## Residual Risks

1.  **Potential Coupling in `useRunForm.ts`:** The extracted `useRunForm.ts` hook could inadvertently become coupled to rendering concerns if not carefully implemented, reducing its independent unit testability. The plan's success hinges on this hook staying focused on state management and logic.
2.  **Definitional Gaps at New Boundaries:** The plan acknowledges the need for a new test if a boundary is "weakly covered." However, identifying, defining, and testing these new internal boundaries (e.g., between `RunForm.tsx` shell and its extracted components/hook) accurately and comprehensively might be challenging.
3.  **Subtleties of State Transitions:** Given that `RunForm.tsx` is a "high-traffic user flow" with "two consumers," the complexity of its state transitions might not be fully captured by existing tests or a single new test, especially concerning interactions across the newly split components.
4.  **Completeness of Existing Test Coverage:** While existing tests are identified, their ability to catch subtle issues introduced by structural changes, particularly those related to new internal boundaries, may be limited if they were not designed with such splits in mind.

## Token Stats

- total_input=12911
- total_output=474
- total_tokens=15681
- `gemini-2.5-flash-lite`: input=12911, output=474, total=15681

## Resolution
- status: accepted
- note: Keep RunForm as the integration shell, keep new boundaries narrow, and add only a targeted test if the split exposes a coverage gap.
