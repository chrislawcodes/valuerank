---
reviewer: "gemini"
lens: "ambiguity-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/vignette-analysis-domain-overview-ui/spec.md"
artifact_sha256: "fe2ad6922b65673e5f1ac1eecdf78293c00939d3e07bfe275af912a6c882ec11"
repo_root: "."
git_head_sha: "aaaa4c47420fdbc7860af1b291f1f3ca99f101be"
git_base_ref: "origin/codex/job-choice-v2-neutral-fix"
git_base_sha: "aaaa4c47420fdbc7860af1b291f1f3ca99f101be"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/feature-runs/vignette-analysis-domain-overview-ui/reviews/spec.gemini.ambiguity-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec ambiguity-adversarial

## Findings

1.  **Confusing Heading Hierarchy:** The spec requires `ValuePrioritiesSection.tsx` to render both the `Model Groups` and `Value Priorities` blocks. It mandates an `h2` of `Value Priorities` for the component root, with `Model Groups` and `Value Priorities` as nested `h3` subsections. Because `Model Groups` must appear first visually, this creates a nonsensical document outline where the first heading a user sees (`h3: Model Groups`) is inside a section named after the second heading (`h2: Value Priorities`). This violates semantic structure and will be confusing for users of assistive technology and future developers.
2.  **Undefined Subtitle Styling:** In the `Similarities and Differences` section, the spec requires adding a subtitle (`Pairwise similarity matrix.`) but fails to specify its HTML element, styling, or relationship to the `h2` title. This omission will force the developer to guess at the intended design, likely leading to visual inconsistency with other subtitles in the application.
3.  **Poor UX for Fully Empty State:** The spec explicitly forbids a page-level empty state, instead requiring each section to show its own "no-data" message. A page with four or more consecutive "no-data" blocks looks more like a broken page than an intentionally empty one. This decision assumes that preserving the section layout is more important than communicating the overall status of the report, which is a weak assumption for user experience.
4.  **Missing Acceptance Criteria:** The acceptance criteria fail to validate several new requirements, creating a gap in verification:
    *   There is no check to ensure the new `h3` heading structure for `Model Groups` and `Value Priorities` is implemented correctly.
    *   There is no check for the presence or content of the new `Pairwise similarity matrix.` subtitle in the similarities section.
5.  **Brittle Fallback for Malformed Scope Data:** The spec handles a missing `eligible` field and a failed query for the evidence scope. However, it is not robust against other malformed data. The instruction to "show...any raw reason text that is present" does not account for cases where the `reasons` field might be an object or a non-string value, which could cause a runtime error when rendering the fallback UI. The spec should define behavior for invalid data types, not just missing data.

## Residual Risks

1.  **Layout Instability from Disclosure:** The spec mandates that the evidence-scope disclosure should not cause layout shift. However, it also requires the report content to remain visible if the eligibility query fails. If the query is slow, the main report content may render first, and the subsequent rendering of the error chip could still cause a layout jump. The implementation must ensure the chip's container reserves space *before* the async query resolves.
2.  **Inconsistent Disclosure Styling:** The instruction to "Use the same badge and disclosure styling patterns already used elsewhere in the app" assumes that a clear, consistent, and accessible pattern already exists. If multiple patterns are in use, or if the existing patterns are flawed, this instruction is ambiguous and could result in the new component inheriting existing design debt or looking out of place.
3.  **Hidden Performance Dependencies:** The spec correctly forbids creating new *data* dependencies between the reordered sections. However, it doesn't address potential *rendering* dependencies. Combining `Model Groups` and `Value Priorities` into `ValuePrioritiesSection.tsx` could mean the `Value Priorities` table is delayed from rendering until the (potentially slow) cluster analysis visualization for `Model Groups` is ready, even if their data sources are independent. The spec should explicitly state that the value table must render immediately, without waiting for the cluster visualization.

## Token Stats

- total_input=2779
- total_output=788
- total_tokens=17197
- `gemini-2.5-pro`: input=2779, output=788, total=17197

## Resolution
- status: open
- note: