---
reviewer: "gemini"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/vignette-analysis-group1-ui/plan.md"
artifact_sha256: "bf95cc9ed9c657ffdddf9e8617b571f208b9685f0a254678a4dbccb2eeb195c4"
repo_root: "."
git_head_sha: "b3095605580880e5884d3d66c6b47cfaa3c8d9e8"
git_base_ref: "origin/main"
git_base_sha: "445c9ab175a57ca54a0094c51078af66a1f61bd0"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The plan now centralizes V2 gating through a shared helper, requires renderable V2 fields instead of a null check, and uses a stable tie-breaker after scenario removal."
raw_output_path: "docs/feature-runs/vignette-analysis-group1-ui/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

1.  **High Severity: Page Gating Logic Is Brittle.** The proposed gating mechanism (`every` transcript must have a renderable `decisionModelV2`) has two flaws:
    *   **Empty Set Failure:** For an empty list of transcripts (`[]`), the `every` condition evaluates to `true`. This could cause page-level UI elements (headers, descriptions) to switch into the "V2" display mode, even though no transcripts are present. This creates a confusing and incorrect empty state.
    *   **Performance Bottleneck:** On pages with thousands of transcripts, the client-side `every()` check will run on each render, potentially degrading UI performance. A summary flag provided by the API (e.g., `meta.isFullyV2`) would be more robust, but is outside the UI-only scope of this plan.

2.  **High Severity: Unhandled Schema Drift.** The plan assumes that for a transcript to be considered "V2", all relevant decision metadata (like manual overrides) is located within the `decisionModelV2` object. It does not account for a "hybrid" transcript schema where a legacy `isManual: true` flag might exist at the root of a transcript object that *also* has a valid `decisionModelV2` property. In this scenario, the surface would switch to V2 mode and only inspect `decisionModelV2`, potentially ignoring the legacy manual override and displaying an incorrect decision summary.

3.  **Medium Severity: Implicit User Workflow Change.** The plan frames the removal of the scenario-based sort as "clutter removal." However, this may be a user-facing breaking change. Users might implicitly rely on the default grouping of transcripts by scenario. Changing the primary sort tie-breaker to `created time` + `id` will alter the default display order, which could disrupt established review workflows without being explicitly acknowledged as a behavioral change.

4.  **Medium Severity: Incomplete Component Discovery.** The architecture decision to centralize logic in three shared components (`TranscriptList`, `Row`, `Viewer`) assumes these are the only surfaces that render decision-related text. The plan lacks a step to audit the codebase for other, ad-hoc consumers (e.g., summary cards, tooltips, chart labels). Without such an audit, there is a risk that legacy wording will persist in undiscovered corners of the UI, undermining the goal of consistency.

## Residual Risks

1.  **Brittle Frontend-Backend Coupling.** The UI logic is being hardcoded to check for specific fields within the `decisionModelV2` object (e.g., `canonical.direction`, `canonical.strength`). This creates a tight, undocumented coupling. Future iterations of the backend V2 model could break the UI's display logic if fields are renamed or restructured, creating a future maintenance burden.

2.  **Inconsistent Badge Precedence Logic.** The plan defines badge precedence as `Manual` > `Fallback` > (nothing for deterministic). However, it does not specify what should happen if a transcript has an unknown or malformed `parseClass`. The logic should explicitly define a default case to prevent unexpected UI states or missing badges if the data is not perfectly formed.

## Token Stats

- total_input=2205
- total_output=672
- total_tokens=16553
- `gemini-2.5-pro`: input=2205, output=672, total=16553

## Resolution
- status: accepted
- note: The plan now centralizes V2 gating through a shared helper, requires renderable V2 fields instead of a null check, and uses a stable tie-breaker after scenario removal.
