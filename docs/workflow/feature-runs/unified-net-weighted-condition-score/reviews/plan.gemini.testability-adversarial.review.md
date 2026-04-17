---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/unified-net-weighted-condition-score/plan.md"
artifact_sha256: "7a35ef03c46f1c04a2f1fa8c7b609f4eda9d677b24d5905d811504a9c4ea4139"
repo_root: "."
git_head_sha: "6bb16c97a0d101ee6d86aabaa5765d61fa877208"
git_base_ref: "origin/main"
git_base_sha: "6bb16c97a0d101ee6d86aabaa5765d61fa877208"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Round-6 final: all findings documented in plan.md Review Reconciliation block. Codex runner failed twice; architecture and implementation lenses were covered in Rounds 3 and 4 respectively."
raw_output_path: "docs/workflow/feature-runs/unified-net-weighted-condition-score/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Evidence |
| --- | --- | --- |
| MEDIUM | Mismatch between Spec's Type-Safety and Plan's Runtime-Safety Testing | [UNVERIFIED] |

The plan specifies a "Subset-input defense" test for the new `summarizeCanonicalConditionCounts` function. This test asserts that the function handles `undefined` or missing count fields gracefully by treating them as 0. However, the feature spec's functional requirement (FR-011) defines the `CanonicalConditionCounts` type with five required, non-optional `number` fields, relying on TypeScript's static type checking for enforcement.

This creates a testability gap: an implementation could be written that is not defensive (e.g., simple addition like `counts.strongly + counts.somewhat`), which would satisfy the static type contract of FR-011. Such an implementation would pass compile-time checks but would fail at runtime if it ever received a malformed object (e.g., cast from `any`), resulting in `NaN` values.

The plan correctly identifies the need for a runtime safety test, but the spec itself does not explicitly mandate the defensive implementation this test requires. The test specified in the plan is testing for a level of robustness that is not formally required by the spec it's supposed to be implementing.

## Residual Risks

| Risk | Description | Evidence |
| --- | --- | --- |
| Test Flakiness Due to Host Locale | Both the spec and plan correctly identify that `getCanonicalBucket` in `canonicalConditionSummary.ts` uses `localeCompare` to determine the "first" side of a value pair. This makes its output dependent on the locale of the environment where the code is executed. While this is documented as a pre-existing and deferred issue, it poses a direct risk to testability. Tests that assert a specific directional outcome (e.g., which value is 'self' vs 'opponent' for a given pair) may be unstable, passing in one environment (e.g., CI with a US-English locale) and failing on a developer machine with a different locale setting. This can lead to brittle tests that are difficult to diagnose. | [CODE-CONFIRMED] |

## Token Stats

- total_input=2806
- total_output=473
- total_tokens=34638
- `gemini-2.5-pro`: input=2806, output=473, total=34638

## Resolution
- status: accepted
- note: Round-6 final: all findings documented in plan.md Review Reconciliation block. Codex runner failed twice; architecture and implementation lenses were covered in Rounds 3 and 4 respectively.
