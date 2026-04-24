---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ff-safety-net/plan.md"
artifact_sha256: "140b40ba22e7ed7f96aab45ede5563fa9cc63877610aadd497fa30ed0ae5e84c"
repo_root: "."
git_head_sha: "c5f51491f6cd5eaa19dfc5b1605cd47e39238679"
git_base_ref: "origin/main"
git_base_sha: "c07a4283ecdebffa57e8a2cccfa08c23e0f76a36"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/ff-safety-net/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding |
| --- | --- |
| HIGH | **Untested Integration Complexity.** The plan bundles three distinct features into a single PR, justified as "mutually reinforcing." However, it lacks a testing strategy to validate each slice's functionality in isolation before the final, complex integration. A failure in the combined build will be significantly harder to debug than a failure in a standalone slice, as the source of the error could be in any of the three new features or their interactions. |
| MEDIUM | **Asserted, Not Tested, Idempotency.** The plan dismisses the risk of a mid-operation crash during the garbage collection (GC) step by stating it is "idempotent by construction" with "no concern." From an adversarial perspective, this assertion is a testing gap. A robust test plan would include a test case that simulates this failure scenario: partially delete the intermediate files, then re-run the `checkpoint` command, and assert that the final state is correct. This would prove idempotency rather than just claiming it. |
| MEDIUM | **Fragile Test-by-Introspection.** [UNVERIFIED] The test for the command mutation registry (`test_mutating_registry.py`) relies on introspecting the `build_parser()` result. This creates a brittle test that is coupled to the implementation details of Python's `argparse` library and the project's specific parser construction. If the parser's internal structure changes (e.g., in a future Python version or a refactor), the test could break or, worse, silently pass without actually testing all commands. |
| LOW | **Ambiguous Veto Edge Case Coverage.** The test plan for the completeness veto (`test_completeness_veto.py`) covers the primary acceptance scenarios. However, it does not explicitly mention testing for failure modes or edge cases in the judge's response. For example: What happens if `unaddressed_high_finding_ids` contains malformed, non-existent, or duplicate finding IDs? What if it's an empty array? These cases could reveal unexpected behavior in the tally logic. |

## Residual Risks

| Severity | Risk |
| --- | --- |
| HIGH | **Manual, Non-Repeatable LLM Verification.** The plan correctly identifies that the "Completeness judge prompt reliability" is a major risk, but the mitigation is a "live judge run," which is a manual verification step, not an automated test. This creates a significant testability gap. A regression in the LLM's ability to follow the prompt's structured output rules could be missed by the unit tests (which mock this data) and only caught by a human running a specific manual check. The lack of an automated integration test with a suite of canned LLM responses (covering valid, invalid, and empty `unaddressed_high_finding_ids` cases) makes this feature's core logic brittle and subject to unverified LLM drift. |
| MEDIUM | **Incomplete Side-Effect Verification for Bad Override.** [UNVERIFIED] The plan astutely identifies an order-of-operations risk (P3) where an override could be recorded before its reason is validated. The proposed verification is to assert that `state["override"]` is not written. However, this may not be sufficient. An adversarial test would also need to verify that no *other* side effects occurred. It's possible that `_record_override_if_needed` or a function it calls performs other state mutations (e.g., logging, metric emission, writing to other parts of `state.json`) before it is determined the override is invalid. The test should assert that the system state is entirely unchanged after a rejected override attempt. |
| LOW | **Unverified GC Failure Modes.** The test plan for garbage collection (`test_review_gc.py`) focuses on correct deletion and preservation. It omits adversarial scenarios that test the system's resilience to filesystem errors. For example, the plan does not mention testing the behavior when one of the target intermediate files cannot be deleted due to restrictive file permissions. This leaves the system's error handling for filesystem exceptions untested. |

## Token Stats

- total_input=13867
- total_output=872
- total_tokens=17139
- `gemini-2.5-pro`: input=13867, output=872, total=17139

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
