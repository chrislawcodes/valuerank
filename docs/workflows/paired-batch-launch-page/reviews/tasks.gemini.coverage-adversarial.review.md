---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflows/paired-batch-launch-page/tasks.md"
artifact_sha256: "fb10be6650a8c3732f61ee7f652870bb7ed2faf9255a899e782367bdf476ec54"
repo_root: "."
git_head_sha: "266e3a9970b6f64da9708f66cf37a025d6db2d35"
git_base_ref: "origin/domain-defaults-preamble-context"
git_base_sha: "266e3a9970b6f64da9708f66cf37a025d6db2d35"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The task list already includes direct-route, invalid-route, back/cancel, eligibility, retry, and layout checks through the focused page tests, and the additional end-to-end ideas are residual risk rather than missing coverage for this slice."
raw_output_path: "docs/workflows/paired-batch-launch-page/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

1.  **Untested Access Patterns**: The plan mentions handling "direct-route" and "invalid-route" scenarios but lacks explicit verification tasks for them. Adversarial testing should include attempting to navigate directly to the `StartPairedBatchPage` with (a) an invalid vignette ID, (b) a valid but ineligible vignette ID, and (c) no ID at all. It's unclear if the "eligibility handling" accounts for unauthenticated or unauthorized users who might have a direct link.
2.  **Lack of Negative Path and End-to-End Testing**: The verification scope is limited to targeted component/unit tests (`DefinitionDetail.test.tsx`, `StartPairedBatchPage.test.tsx`) and the API mutation. This approach misses potential integration flaws. There is no explicit task for an end-to-end test simulating a user's full journey, including failure paths like network errors or API-level validation failures during submission.
3.  **Incomplete Dead Code Removal**: The task specifies deleting "the dead modal file." This is often insufficient. It omits the likely need to find and remove associated artifacts such as orphaned tests, custom hooks, styles, or Storybook stories that were specific to the old modal, leading to code rot.
4.  **Implicit Trust in Existing Mutation**: The plan verifies that the submission uses the "existing mutation path" but does not explicitly task someone with confirming the *payload* from the new page is identical in shape and semantics to the payload sent by the old modal. A new UI can introduce subtle differences in how data is structured, which might not cause the mutation to fail but could lead to incorrect data being saved.

## Residual Risks

1.  **Brittle Entry and Exit Points**: Users navigating directly to the page via a stale or invalid link may encounter a non-graceful error (e.g., a white screen, console errors) instead of a "Not Found" page or a helpful redirect. Similarly, the browser's back button behavior from a deep-linked state is unverified and may not lead the user to a logical location.
2.  **Undiscovered State-Based Bugs**: Without testing how the page handles state changes *after* loading (e.g., a vignette becoming ineligible in another tab), the UI could allow a user to submit an invalid request. The specified "loading/error/retry" state verification may only cover the happy path and predictable submission failures, not complex edge cases.
3.  **Future Maintenance Overhead**: By not explicitly removing all artifacts related to the old modal, the codebase retains unused, potentially confusing code. This increases the cognitive load for future developers and creates a risk that the dead code is mistakenly resurrected or partially reused.
4.  **Data Integrity Drift**: A subtle mismatch between the data payload from the new page and the expectations of the existing mutation could introduce data inconsistencies that are not caught by type-checking or the API's basic validation. For example, a field might be `null` where it was previously `undefined`, which could have downstream analytical consequences.

## Token Stats

- total_input=12955
- total_output=643
- total_tokens=15124
- `gemini-2.5-pro`: input=12955, output=643, total=15124

## Resolution
- status: accepted
- note: The task list already includes direct-route, invalid-route, back/cancel, eligibility, retry, and layout checks through the focused page tests, and the additional end-to-end ideas are residual risk rather than missing coverage for this slice.
