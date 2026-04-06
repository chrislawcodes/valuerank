---
reviewer: "gemini"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/analysis-reports-decision-score-phase1/plan.md"
artifact_sha256: "b7c7f948b8eaa3a61690e32ff10840ee7800f867433f354d0dab68feb1dc1856"
repo_root: "."
git_head_sha: "b3e2d63328dccb036ae789ac1f04a3ce39404f32"
git_base_ref: "origin/main"
git_base_sha: "345d03f7eff71bacc8cef3a464cd4024ce6fa092"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Resolved by defining hasRenderableTranscriptDecisionModelV2 as the renderable source of truth, keeping decisionModelV2.canonical as the visible-label source, and specifying strict-majority plus explicit Unknown/Mixed/empty handling for aggregate cells."
raw_output_path: "docs/workflow/feature-runs/analysis-reports-decision-score-phase1/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

1.  **The strict-majority aggregation rule misrepresents uncertainty and can be misleading.** The plan specifies that unknown/unrenderable transcripts are *excluded* from the strict-majority calculation. This leads to a critical flaw: a label derived from a small minority of transcripts can represent the entire group. For example, if a cell contains ten transcripts—nine `Unknown` and one `Strongly favors <value>`—the aggregate rule as written would display `Strongly favors <value>`. This hides the overwhelming uncertainty (90%) and presents a minority opinion as the definitive summary. The primary label should reflect the state of the entire dataset, not just the "renderable" subset.
2.  **The plan proposes inconsistent handling of `Unknown` states across different pages.** For the `AnalysisConditionDetail` page, the proposed rule is to "render the canonical bucket counts plus an explicit `Unknown` bucket." This is transparent and informative. However, for the `SurveyResults` aggregate matrix, `Unknown` transcripts are hidden from the primary display and only revealed in a tooltip. This inconsistency creates a confusing user experience and forces users to learn two different models for how reports handle uncertainty. The more transparent approach used for `AnalysisConditionDetail` should be the standard for all aggregate views.
3.  **The definition of `Mixed` is insufficiently specified for tied majorities.** The rule states that `Mixed` is used when no single headline has a strict majority. This does not account for a scenario where, for example, 50% of transcripts are `Strongly favors <value>` and 50% are `Somewhat favors <value>`. While both support the same value, they are different canonical headlines. The current rule would label this `Mixed`, which is correct, but the same rule would apply to a 50/50 split between `Favors <value A>` and `Favors <value B>`. The plan relies on the tooltip to resolve this ambiguity, but the primary `Mixed` label loses significant signal in the former case.

## Residual Risks

1.  **Users will misinterpret data at a glance.** Even with tooltips, the primary user interface for aggregate cells will be displaying misleading information. A user scanning the `SurveyResults` matrix will incorrectly believe a consensus exists where there is none. Relying on users to proactively drill into every single cell to check for hidden uncertainty negates the purpose of a summary view.
2.  **The `decisionCode` plumbing creates a "leaky abstraction" that invites future bugs.** The plan retains `decisionCode` for filtering while removing it from the display. This creates a risk of divergence. If the mapping between a `decisionCode` and its canonical headline representation changes, the filter controls could fetch a different set of transcripts than what the user's display-based selection implies, leading to subtle and confusing bugs.
3.  **Future feature development will be inconsistent.** By establishing two different patterns for handling uncertainty (`AnalysisConditionDetail` vs. `SurveyResults`), the plan provides no clear architectural precedent. Future developers building new report pages will have to choose between two conflicting models, leading to further fragmentation of the user experience.

## Token Stats

- total_input=2094
- total_output=661
- total_tokens=17212
- `gemini-2.5-pro`: input=2094, output=661, total=17212

## Resolution
- status: accepted
- note: Resolved by defining hasRenderableTranscriptDecisionModelV2 as the renderable source of truth, keeping decisionModelV2.canonical as the visible-label source, and specifying strict-majority plus explicit Unknown/Mixed/empty handling for aggregate cells.
