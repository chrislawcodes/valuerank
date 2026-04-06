---
reviewer: "gemini"
lens: "risk-boundary-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/vignette-analysis-domain-overview-ui/plan.md"
artifact_sha256: "f1dcf17cbf9989bc77156765b733b367acb9114043cf019404f5db348cf44a74"
repo_root: "."
git_head_sha: "aaaa4c47420fdbc7860af1b291f1f3ca99f101be"
git_base_ref: "origin/codex/job-choice-v2-neutral-fix"
git_base_sha: "aaaa4c47420fdbc7860af1b291f1f3ca99f101be"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/vignette-analysis-domain-overview-ui/reviews/plan.gemini.risk-boundary-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan risk-boundary-adversarial

## Findings

1.  **High Risk of Technical Debt in `ValuePrioritiesSection.tsx`:** The plan to reorder `Model Groups` and `Value Priorities` by modifying the existing shared component is a significant flaw. The rationale to "keep the diff small" prioritizes a trivial metric over component cohesion. This approach entangles two distinct report sections, creating a component with a confusing internal structure that is harder to maintain. The proposed mitigation—"Keep the component shared"—is not a mitigation but a restatement of the flawed decision. It fails to address what happens if the data dependencies or error states of the two sections diverge in the future.

2.  **Incomplete Testing Specification for Disclosure States:** Slice 1 defines four distinct states for the evidence-scope disclosure (loading, eligible, unavailable, query failure). However, the testing plan is vague, calling only for tests on "the new disclosure behavior." It does not explicitly mandate that all four states and their corresponding UI variations (chip color, content, expanded panel behavior) must be covered with specific assertions. This creates a high probability that the "unhappy paths," particularly the `query failure` state, will be insufficiently tested, potentially allowing UI bugs or layout shifts to go unnoticed.

3.  **Redundant and Confusing Accessibility Implementation for Similarity Matrix:** Slice 3's plan to add a visible subtitle `Pairwise similarity matrix.` while simultaneously using a visually hidden `<caption>` with the exact same text is a design flaw. This creates a redundant announcement for screen reader users, who will hear the same descriptive title twice in immediate succession (once for the subtitle, once for the table caption). This does not improve accessibility; it adds noise and degrades the user experience for those relying on assistive technology.

## Residual Risks

1.  **Partial Data Failures May Break the UI:** The plan to keep `ValuePrioritiesSection` as a single component creates a residual risk of unpredictable rendering behavior in mixed-data scenarios. The plan considers when cluster analysis is unavailable but not the inverse. If the `Model Groups` data fails or is loading while the `Value Priorities` data is ready (or vice-versa), the "shared loading and error behavior" could incorrectly hide valid content or show a persistent loading state for the entire component, as the logic was not designed to handle partial states for two distinct visual blocks.

2.  **CSV Export Functionality May Be Inadvertently Broken:** The testing plan confirms the CSV *content* is unchanged but overlooks the UI interaction that triggers the export. If the export button is located within a component being refactored (e.g., `DomainAnalysis.tsx`), its state or visibility could become tied to new dependencies like the `domainFindingsEligibility` query. The plan does not require verifying the export button remains visible and functional across all four disclosure states, leaving a risk that it could disappear or become disabled when, for instance, eligibility data fails to load.

3.  **Manual Responsive Checks Are Unreliable:** The testing plan's reliance on manual "smoke checks" for narrow viewports and the disclosure panel's scroll-capping behavior is insufficient. These checks are prone to human error and are unlikely to be performed consistently across all states of the report. Without automated visual regression tests or specific DOM assertions to verify the CSS `max-height` and `overflow` properties of the expanded panel, there is a tangible risk of introducing layout bugs, such as content overflow or an unstable page scroll, on smaller screen sizes.

## Token Stats

- total_input=1879
- total_output=722
- total_tokens=15824
- `gemini-2.5-pro`: input=1879, output=722, total=15824

## Resolution
- status: open
- note: