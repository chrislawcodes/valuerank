---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/analysis-reports-decision-score-phase1/spec.md"
artifact_sha256: "c4fe4650f1f8e7f27df8983f3f5098ed35d0d5ba9b27d325f0b4fe95894738cc"
repo_root: "."
git_head_sha: "b3e2d63328dccb036ae789ac1f04a3ce39404f32"
git_base_ref: "origin/main"
git_base_sha: "345d03f7eff71bacc8cef3a464cd4024ce6fa092"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Resolved by adding explicit rules for empty cells, unknown transcripts, mixed cells, and strict-majority canonical headlines, plus by scoping visible report output to canonical labels only."
raw_output_path: "docs/feature-runs/analysis-reports-decision-score-phase1/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

1.  **Critical Ambiguity in `<value>` Placeholder for Condition Detail:** The spec for `AnalysisConditionDetail.tsx` requires replacing a numeric mean with buckets like `Strongly favors <value>`. However, a condition inherently involves a trade-off between *two* values (e.g., Security vs. Freedom). The spec fails to define which value's name should be used as `<value>`, especially in cases of neutrality or when decisions are split between favoring one value and the other. This makes the primary requirement for this page un-implementable as written.

2.  **Undefined and Contradictory States: "Unknown" vs. "Unrenderable":** The spec for `SurveyResults.tsx` builds logic on the concepts of "unknown" and "unrenderable" transcripts but never defines them. It's unclear what data state (e.g., `decisionCode: 0`, `null`, a missing field) maps to these conditions. This is exacerbated by a contradiction between the main rule (`only unknown or unrenderable... -> 'Unknown'`) and a closing note (`Unknown is only used when there are no renderable canonical transcripts`), which presents a different condition. This ambiguity makes the logic for the survey matrix impossible to implement correctly.

3.  **Ambiguous "Strict Majority" Calculation for `Mixed` State:** The rule for the `SurveyResults.tsx` matrix states that a cell becomes `Mixed` if no single headline has a "strict majority." It does not clarify if `Neutral` is considered a "headline" for this calculation. For a set of transcripts containing mostly `Neutral` decisions, it's unclear if the cell should display `Neutral` (as the majority headline) or `Mixed` (if `Neutral` is excluded from being a majority-winning headline).

4.  **Incomplete Empty-State Specification:** The spec lists "explicit empty-state...handling" as in-scope but does not define what the empty state for the `AnalysisConditionDetail.tsx` summary table should be. If a condition has zero transcripts, it's unclear if the component should render nothing, render a table with all-zero counts, or display a specific message.

## Residual Risks

1.  **Data Quality Assumptions:** The proposed logic assumes that `decisionCode` values are well-formed (e.g., integers in a predictable range). The system may behave unexpectedly if it encounters `null`, `0`, or other non-standard values from legacy data that don't map cleanly to the new canonical buckets. The spec does not include handling or sanitization for malformed data.

2.  **Incomplete UI Coverage:** The requirement to update all "visible" text, including `aria-label` and helper text, is at risk of being incomplete. Without a systematic audit of every component on the three pages, it's possible a less obvious element (e.g., a `title` attribute on a hover element, a screen-reader-only `span`) will be missed, continuing to expose the legacy numeric score.

3.  **Fragility of Label-to-Value Mapping in Filters:** The spec allows filter controls to continue using `decisionCode` as the stored value while displaying a canonical label. This creates a dependency on a perfect, bug-free mapping between the human-readable label and the backing numeric code. Any discrepancy in this mapping logic could cause filters to silently fail or return incorrect data.

4.  **External Dependencies on Scraped UI Text:** While out of scope for this change, there is a risk that an external tool or a developer's local script relies on scraping the user-facing text (e.g., "Decision: 1") from these pages. The change will break such dependencies, which are invisible to the development team.

## Token Stats

- total_input=13923
- total_output=796
- total_tokens=17236
- `gemini-2.5-pro`: input=13923, output=796, total=17236

## Resolution
- status: accepted
- note: Resolved by adding explicit rules for empty cells, unknown transcripts, mixed cells, and strict-majority canonical headlines, plus by scoping visible report output to canonical labels only.
