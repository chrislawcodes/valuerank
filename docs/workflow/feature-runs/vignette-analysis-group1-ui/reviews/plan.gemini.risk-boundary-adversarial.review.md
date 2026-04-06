---
reviewer: "gemini"
lens: "risk-boundary-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/vignette-analysis-group1-ui/plan.md"
artifact_sha256: "bf95cc9ed9c657ffdddf9e8617b571f208b9685f0a254678a4dbccb2eeb195c4"
repo_root: "."
git_head_sha: "b3095605580880e5884d3d66c6b47cfaa3c8d9e8"
git_base_ref: "origin/main"
git_base_sha: "445c9ab175a57ca54a0094c51078af66a1f61bd0"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The plan now defines the badge precedence, mixed-data fallback rule, stable ordering tie-breaker, and copy map so the presentation rules are explicit."
raw_output_path: "docs/workflow/feature-runs/vignette-analysis-group1-ui/reviews/plan.gemini.risk-boundary-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan risk-boundary-adversarial

## Findings

1.  **Ambiguous Gating Scope on Paginated Data:** The plan's core gating mechanism—"The helper returns audit mode only when every transcript in the current surface has a renderable `decisionModelV2` object"—is ambiguous. It is unclear if "current surface" refers to the visible page of results or the entire filtered dataset. If it's the former, the UI could inconsistently flip between legacy and V2 displays as the user paginates, violating the goal of preventing "mixed-mode tables from drifting."

2.  **Brittle Definition of "V2-Backed":** The gating logic relies on checking for the presence of a few specific fields (e.g., `direction`, `strength`). This creates a brittle, implicit contract with the backend. If a future backend change introduces a new mandatory field for correct V2 rendering, the UI will not be aware of it and may incorrectly switch to the new display mode with incomplete data, leading to rendering errors or user misinterpretation.

3.  **Insufficient Mitigation for Shared Component Risk:** The plan's mitigation for shared component changes ("Keep the wave boundaries small and update the relevant tests") is inadequate. It assumes complete test coverage for all consumers of `TranscriptList`, `TranscriptRow`, and `TranscriptViewer`. It omits a necessary adversarial step: proactively auditing the codebase to identify *all* consuming pages and components (not just those listed in the waves) to manually assess the impact of these shared changes.

4.  **Unjustified Information Removal:** The plan frames the removal of the `scenario` and `token-count` columns as "clutter removal." This assumes these data points have no value to the user. However, for a researcher or engineer, the scenario context is critical for interpreting a decision, and token counts can be a proxy for cost or model verbosity. Removing this information without validating the assumption with users risks creating a functional regression for debugging and analysis workflows.

5.  **Undefined Behavior for Unhandled Data States:** The display rules do not specify fallback behavior for unexpected data. For example, the plan maps `strength` to a few explicit strings (`Strongly favors X`, etc.) but doesn't define what to display if the data contains a new, unmapped `strength` value. This could lead to a UI crash or an empty field, whereas a safe default like "Unknown" would be more robust.

## Residual Risks

1.  **Performance Degradation on Large Datasets:** The gating strategy requires iterating over an entire collection of transcripts before any rendering can occur. For analyses containing thousands or tens of thousands of transcripts, this pre-check could introduce significant client-side latency, leading to a poor user experience. The plan does not account for performance testing of this gating logic.

2.  **Hidden Workflow Disruption:** By removing the scenario column and its implicit sort grouping, the plan may disrupt established, albeit unstated, user workflows. Users accustomed to visually scanning for transcripts grouped by scenario will find the new stable sort (by time/ID) less intuitive, potentially slowing down their review process without a clear benefit.

3.  **Obscured Data State:** The binary "all-or-nothing" gating mechanism hides nuance from the user. A page will render in legacy mode if even one of thousands of transcripts is non-V2. The user has no visibility into *why* they are seeing the old UI or how close the dataset is to being fully V2-compatible. This can lead to misinterpretation, with users assuming an entire run is legacy-format when it might be 99.9% complete.

4.  **Semantic Drift:** The plan introduces new UI-specific terminology (e.g., `Decision summary` replaces `Canonical decision`). While intended to be simpler, this creates a new semantic layer a user must learn and which can diverge from the canonical backend terminology over time. As backend concepts evolve, this UI-specific copy may become stale or misleading.

## Token Stats

- total_input=2206
- total_output=829
- total_tokens=17029
- `gemini-2.5-pro`: input=2206, output=829, total=17029

## Resolution
- status: accepted
- note: The plan now defines the badge precedence, mixed-data fallback rule, stable ordering tie-breaker, and copy map so the presentation rules are explicit.
