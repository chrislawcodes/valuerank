---
reviewer: "gemini"
lens: "testability"
stage: "plan"
artifact_path: "docs/workflows/top-of-response-decision-parser/plan.md"
artifact_sha256: "b7c1fd64631083be021ab0f6b3e1804403a47c5e06f5c41f0e620dee8f24f987"
repo_root: "."
git_head_sha: "624b0f433b3bde215339f6a95d865f7163a2cc2a"
git_base_ref: "origin/codex/job-choice-level-token-backfill-clean"
git_base_sha: "624b0f433b3bde215339f6a95d865f7163a2cc2a"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The plan now names the precedence, contextual-number, and negative-number cases that the worker suite covers."
raw_output_path: "docs/workflows/top-of-response-decision-parser/reviews/plan.gemini.testability.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability

## Findings

1.  **Strong Test Case Specification:** The plan includes a detailed and specific list of test cases to be added under "Expand worker tests to cover." It covers positive cases, negative cases (e.g., "contextual leading numbers that should not be accepted"), precedence rules ("numeric-plus-label... where numeric takes precedence"), and ambiguity handling ("conflicting leading candidates staying unresolved"). This is a significant strength and greatly enhances testability.
2.  **Observable Metadata:** The requirement to record distinct `parsePath` values for leading deterministic wins is excellent. It makes the parser's behavior transparent and allows tests to assert not just the final result, but also *how* that result was obtained. The test plan should be interpreted to include explicit assertions for these new `parsePath` values (e.g., `leading_numeric`, `leading_text_label`).
3.  **Lack of Regression Tests for Reused Logic:** The plan states it will "reuse exact scale-label matching." However, it does not explicitly call for test cases to verify that this reused logic behaves identically in the new, stricter "leading candidate" context. For example, tests should confirm that case-insensitivity and handling of surrounding punctuation/quotes for text labels still work as expected on the first line/sentence.
4.  **Unspecified Behavior for Conflicting Candidates:** The plan requires a test for "conflicting leading candidates staying unresolved." This is good, but it doesn't define what constitutes a conflict. For instance, if the first line is "My answer is 7" and the first sentence (if different) is "My answer is 'Strongly Agree'", what is the expected outcome? The test case for this needs to be precise about the inputs and the expected "unresolved" state.

## Residual Risks

1.  **Dependency on `response_segments`:** The plan correctly treats `response_segments` as a stable contract. However, any latent bugs or unhandled edge cases in the sentence-splitting logic of that utility will be inherited by this new feature. An incorrect split could provide a malformed "first sentence" to the parser, leading to missed judgments. This risk is acceptable as it's outside the direct scope, but it means that a failure in the new logic could have its root cause in this upstream dependency.
2.  **Brittleness of Lead-in Stripping:** The list of deterministic lead-ins to be stripped is finite. While this is by design to maintain precision, it carries the risk that LLMs will produce novel conversational lead-ins not on the list (e.g., "To summarize my position..."). This would cause the leading-judgment parser to fail and fall back to the existing logic, reducing the feature's effectiveness. The tests can only validate the defined list, not anticipate future LLM response variations.
3.  **Ambiguity of "Bare Numeric" Definition:** The plan's distinction between a "bare numeric answer" and a "contextual leading number" (like a scenario number) is the most critical and delicate part of the implementation. An overly aggressive parser might incorrectly extract numbers from phrases like "Regarding point 1...", while an overly conservative one might miss valid answers like "1." or "Choice: 1". The success of the feature hinges on a precise and well-tested implementation of this specific rule.

## Token Stats

- total_input=13411
- total_output=699
- total_tokens=15744
- `gemini-2.5-pro`: input=13411, output=699, total=15744

## Resolution
- status: accepted
- note: The plan now names the precedence, contextual-number, and negative-number cases that the worker suite covers.
