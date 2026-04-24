---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/plan.md"
artifact_sha256: "a260b8ebd806f71193a11b024ab25896b974da30fb8a754b3a8529e3b695a142"
repo_root: "."
git_head_sha: "221e9cffa80ea251479986bcb2240237ef841a57"
git_base_ref: "origin/claude/friendly-aryabhata-9efbf7"
git_base_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Evidence |
| --- | --- | --- |
| MEDIUM | **Contradictory Specification for Invariant Output:** The plan is internally inconsistent about where invariant warnings are emitted. `Slice 2` states warnings go to `stderr` in JSON mode and `stdout` otherwise. `Risk P3` states warnings go to `stderr` *always*. This ambiguity prevents the creation of a definitive test case for the tool's output streams, as the expected behavior is defined in two conflicting ways. An engineer implementing this would have to choose one, leaving the other part of the plan untested. | [UNVERIFIED] |
| MEDIUM | **Incomplete Integration Test Specification:** The integration test described for the `run-033` fixture only requires asserting the final `recommended_next_action`. This is insufficient as it fails to verify the critical side-effects of `Fix 1`. A complete test would also assert that the artifact manifest has been resealed and that a drift annotation `{type, old_sha, new_sha, ...}` has been correctly appended to the stage's `annotations` array, as described in `Slice 3`. Without this, a bug in state mutation could be missed. | [UNVERIFIED] |
| MEDIUM | **Untested "Unresolved Concerns" Blocking Logic:** `Slice 3` introduces a critical new blocking condition: a checkpoint fails if a prior stage has unresolved concerns. However, the `Testing approach` section proposes no test case for this specific scenario. The existing regression test verifies the `advance` path, not this new `blocked` path, leaving a key piece of error-handling logic untested. | [UNVERIFIED] |
| LOW | **Over-reliance on Self-Hosted Test Data for Regex:** The plan to test the `Fix 2` severity-parsing regex uses review files generated for the feature itself. This approach is brittle; it only confirms that the regex works for the specific findings formats used in those few documents. It does not guarantee coverage for all seven new patterns described in `Slice 1`, creating a blind spot for any patterns not present in that specific review set. | [UNVERIFIED] |

## Residual Risks

- **Reactive Failure Detection:** The plan's primary defense against future regex drift (`Risk P1`) is the `Fix 8` invariant, which detects a problem *after* an invalid review has already been accepted. The testing strategy lacks proactive measures, such as generative or fuzz tests, to discover regex weaknesses before they can cause a failure in a live run.

- **Impaired Bisection by Co-mingling Fixes:** The delivery strategy of "One PR containing all three fixes" contradicts the architectural claim that the fixes are "independently mergeable." While pragmatic, this approach introduces a long-term testability risk by making it harder to use tools like `git bisect` to identify which of the three fixes caused a future regression.

## Token Stats

- total_input=16012
- total_output=619
- total_tokens=19640
- `gemini-2.5-pro`: input=16012, output=619, total=19640

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
