---
reviewer: "gemini"
lens: "risk"
stage: "spec"
artifact_path: "docs/workflows/domain-first-site-ia-migration/spec.md"
artifact_sha256: "795ab64099db83c36a6c541b6215e0c2c3e54e0df02691393adcce3d480e1987"
repo_root: "."
git_head_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
git_base_ref: "origin/main"
git_base_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Spec-level risks are acknowledged and intentionally handled through Phase 0 contracts, route compatibility, and explicit non-auditable findings states."
raw_output_path: "docs/workflows/domain-first-site-ia-migration/reviews/spec.gemini.risk.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec risk

## Findings

*   **Complexity of Compatibility:** The core goal of simultaneously transitioning to a "domain-first" paradigm while preserving "habitual use, deep links, or historical interpretation" introduces significant complexity. This duality risks breaking existing user workflows or expectations, especially if migration is not handled with extreme care.
*   **Ambiguity in Navigation and Entry Points:** While canonical entry points are defined, the specification lists numerous paths to similar tasks. This could lead to user confusion regarding the most efficient or intended method for performing actions, potentially creating a less streamlined experience than intended.
*   **Potential for UI/UX Conflation:** The spec explicitly identifies the risk of conflating distinct status surfaces (`Domain Evaluation Summary`, `Run Detail`, `Global Status Center`) and diagnostic scopes. If these are not meticulously differentiated in the UI, users may receive incorrect or misleading information.
*   **Configuration Misinterpretation:** The clear split between domain defaults (`Setup`) and per-vignette overrides (`Vignettes`) is crucial. If the UI does not render this distinction with exceptional clarity, users may misunderstand how configurations are applied, leading to inaccurate `Domain Evaluations`.
*   **Incomplete Migration Strategy:** The spec acknowledges an incomplete "repo-local feature-workflow wrapper" and defers route compatibility to a separate "workflow plan." This highlights a dependency on external, potentially undefined, elements that could introduce risks if not fully realized and integrated.
*   **Unreliable Cost Estimation Warnings:** The inclusion of a "fallback warning if estimate quality is weak" for cost estimates presents a risk. Inadequate or unclear warnings could lead users to place undue trust in inaccurate cost projections.
*   **Premature Findings Publication:** The mechanism for transitioning `Findings` from a "non-auditable" to an "auditable" state relies on subjective criteria like "auditable enough for interpretation." If these criteria are not rigorously defined and enforced, users might make premature or unfounded domain claims based on incomplete data.

## Residual Risks

*   **Navigation Overload:** Despite efforts to define canonical entry points, the overall IA, with multiple top-level items and nested domain-specific sections, may still prove overwhelming for some users. The sheer volume of navigation options could obscure critical actions or lead to a feeling of being lost, even with clear labeling.
*   **Subtle UX Discrepancies:** The success of crucial communication points (e.g., indicating active run snapshots during edits, labeling diagnostic scopes) relies heavily on precise UI implementation. Even minor deviations from the spec's intent in these nuanced areas could lead to user confusion and misinterpretation.
*   **Alienation of Habitual Users:** While the spec aims to preserve old habits, the fundamental shift to a "domain-first" model might still create friction for users deeply entrenched in the prior "object-first" paradigm. The eventual "sunset rule" for legacy routes also poses a risk of stranding users if not managed transparently.
*   **Effectiveness of Guided Creation:** The success of "guided vignette creation" hinges on the clarity and usability of the "preflight state" and any "inline asset creation" features. If these are poorly implemented, they could become points of frustration rather than helpful aids, failing to prevent dead-ends as intended.
*   **Misunderstanding of Archive Purpose:** The `Archive` section is intended for retired work. However, the distinction between active and historical data could be blurred in practice, leading to users accidentally archiving active studies or misunderstanding the scope and purpose of archived content.
*   **Data Audibility Criteria:** The determination of when data is "auditable enough for interpretation" remains a point of potential ambiguity. While a non-auditable state is mandated, the underlying logic for this classification may require continuous refinement and could be a source of ongoing debate or error in practice.

## Token Stats

- total_input=16017
- total_output=792
- total_tokens=19475
- `gemini-2.5-flash-lite`: input=16017, output=792, total=19475

## Resolution
- status: accepted
- note: Spec-level risks are acknowledged and intentionally handled through Phase 0 contracts, route compatibility, and explicit non-auditable findings states.
