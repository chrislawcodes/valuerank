---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/models-consistency-report/spec.md"
artifact_sha256: "6a3b404bac10d1453d4c02522eaa090b89c13bc64f7ce9139005d8ebe8fa58b7"
repo_root: "."
git_head_sha: "a450f809c2b386ed7e089c87a5d4e83845aa4a68"
git_base_ref: "origin/main"
git_base_sha: "a450f809c2b386ed7e089c87a5d4e83845aa4a68"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/models-consistency-report/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | Finding | Evidence |
| --- | --- | --- |
| HIGH | **Flawed Drill-down Implementation Plan** | `[CODE-CONFIRMED]` |
| MEDIUM | **"Net Pressure" Calculation Rests on Unverified Assumptions** | `[UNVERIFIED]` |
| MEDIUM | **Critical UI Pattern is Underspecified** | `[UNVERIFIED]` |
| LOW | **Ambiguous Drill-down Interaction Model** | `[UNVERIFIED]` |

### HIGH: Flawed Drill-down Implementation Plan
The spec's requirement (US-4, FR-008) to link from the new report to existing `ConditionMatrix` and `PairedStabilityView` components is not feasible as described. The plan assumes a simple hyperlink can open these components in a useful state.

However, the provided code confirms these components are not self-sufficient pages that fetch their own data. They are presentation components that expect complex data structures (e.g., `conditions: MatrixCondition[]`, `primaryTranscripts: Transcript[]`) to be passed as props. A simple URL cannot carry this data payload.

This means the drill-down feature is unimplementable without either:
1.  A significant refactoring of the target components/pages to fetch data based on URL parameters.
2.  Changing the interaction from a "link out" to an embedded view or modal, which directly contradicts the spec's non-goal ("Modifying or embedding `ConditionMatrix` or `PairedStabilityView`").

This is a fundamental contradiction between the spec's requirements and the existing architecture. `[CODE-CONFIRMED]`

### MEDIUM: "Net Pressure" Calculation Rests on Unverified Assumptions
The `Coherence` metric is entirely dependent on converting a vignette's condition dimensions into a 1D "net pressure" scale (FR-003). The spec assumes that dimension labels like `strongly / somewhat / neutral` can always be mapped to a numeric scale (e.g., `+2 / +1 / 0`).

The provided `ConditionMatrix.tsx` code shows that dimensions are sorted (`compareConditionLevels`) but provides no evidence that they are always ordinal, let alone mappable to a consistent numeric "pressure" value. The feature may encounter categorical dimensions (e.g., `location: urban/rural`) or dimensions where the "pressure" is not obvious, making the `Coherence` metric impossible to calculate or potentially misleading. The spec acknowledges this as an open question (Open Question 4) but treats it as a minor detail to be resolved in planning, whereas it is a foundational risk to a headline metric. `[UNVERIFIED]`

### MEDIUM: Critical UI Pattern is Underspecified
The spec mandates an elaborate, 4-level progressive disclosure mechanism for all summary numbers (US-2, FR-015, SC-003), which is critical for the report's credibility with its target audience. However, the UI for this is vaguely described as a "tooltip/panel stack".

This leaves a complex and high-effort UI component almost entirely undefined. The feasibility and usability of tracing a number back to its raw counts "within three clicks" depends entirely on this unspecified design. The provided code context contains no existing patterns that could be reused for this level of nested disclosure, indicating it is a novel and high-risk piece of implementation. `[UNVERIFIED]`

### LOW: Ambiguous Drill-down Interaction Model
The spec contains minor contradictions in the user interaction design for the drill-down view (US-4). It first states the drill-down provides "links out" to other tools. But it later specifies that "when I click or hover" on a chip *within* the drill-down, it reveals *more* information (the win-rate progression) before showing the final "View condition matrix ->" link.

This suggests the drill-down is not a simple summary with links but an interactive component with its own progressive disclosure, mixing `click` and `hover` gestures. This ambiguity complicates implementation and risks a confusing user experience. `[UNVERIFIED]`

## Residual Risks

Even if the findings above are addressed, the following risks will remain:

1.  **Data Pipeline Dependency:** The report is entirely dependent on the quality, correctness, and timeliness of the `AGGREGATE`-analysis pipeline. While the spec accounts for empty states, it cannot account for subtle data corruption or semantic drift in the upstream pipeline, which could lead to silently incorrect metrics.
2.  **Metric Interpretation:** The chosen statistical metrics and thresholds (Repeatability > 0.85, Coherence > 0.80) are conventions. There is a risk that users, particularly secondary audiences, will over-interpret these thresholds and quadrant labels as hard pass/fail criteria rather than characterizations.
3.  **Statistical Power for Coherence:** The `Coherence` metric relies on Spearman correlation's p-value to determine if a value pair is `determinate`. For vignettes with a small number of conditions (e.g., a 2x2 grid where n=4), statistical power is very low, which may result in a large fraction of pairs being classified as `indeterminate`, reducing the utility of the Coherence score.

## Token Stats

- total_input=20378
- total_output=1115
- total_tokens=24131
- `gemini-2.5-pro`: input=20378, output=1115, total=24131

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
