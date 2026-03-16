---
reviewer: "gemini"
lens: "risk"
stage: "spec"
artifact_path: "docs/workflows/domain-first-site-ia-migration/backend-engineering-spec.md"
artifact_sha256: "2513c5f8fbbc3168fcda11c19fc5f042e08c5d476219eb8c7053d1129d882a4f"
repo_root: "."
git_head_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
git_base_ref: "origin/main"
git_base_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The backend engineering spec now bounds the remaining work well; the reported concerns are known migration and dependency risks already represented in the paired product spec, workflow plan, and backend gating sections."
raw_output_path: "docs/workflows/domain-first-site-ia-migration/reviews/backend-spec.gemini.risk.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec risk

## Findings

*   **Backend Complexity and Dependencies:** The success of the later implementation waves (3-6) is critically dependent on significant backend changes outlined in the `backend-engineering-spec.md`. These include introducing new models like `DomainEvaluation`, schema modifications, new query surfaces, and complex logic for snapshotting and cost estimation. Delays or issues in these backend workstreams pose a substantial risk to the project timeline and the delivery of core features like auditable findings and accurate domain evaluation summaries.
*   **Data Integrity and Historical Truth Preservation:** The spec aims for a paradigm shift from "object-first" to "domain-first" while preserving historical data. This is a complex undertaking with a high risk of data drift, loss of historical context, or broken deep links, especially given that `Definition.domainId` is mutable. The conservative migration rules (e.g., "no silent backfill") for `runCategory` will result in a period where data is classified as `UNKNOWN_LEGACY`, potentially impacting query accuracy and user experience.
*   **User Experience Transition and Confusion:** The planned IA changes introduce a significant risk of user confusion during the migration. Users accustomed to the "object-first" model may struggle with the new "domain-first" structure, readiness states, and navigation. While the spec aims for compatibility, maintaining multiple navigation paths and clear communication during the transition is challenging and prone to error.
*   **Auditable Findings Incompleteness:** The core goal of "auditable findings" relies heavily on complete and accurate snapshotting of execution parameters. The `backend-engineering-spec.md` explicitly states that this is "incomplete." If this remains a gap, the primary value proposition of the findings surface will be compromised, potentially leading to unreliable or misleading interpretations.
*   **Cost Estimation Accuracy and Trust:** The plan acknowledges that "perfectly accurate realized-cost prediction in early phases" is a non-goal. However, the requirement to show cost estimates with confidence labeling and fallback warnings carries a risk. If these estimates are consistently inaccurate or misleading, it could erode user trust in the platform's financial projections, even with caveats.
*   **Route Compatibility and Deep Link Breakage:** The migration involves substantial structural changes, increasing the risk of breaking existing deep links, internal redirects, or user habits related to specific routes. While the plan includes compatibility rules, the sheer scale of the change makes it difficult to guarantee seamless preservation of all legacy routes and user entry points.

## Residual Risks

*   **AI Review Dependency:** The reliance on AI reviews for architectural and regression checks, while efficient, may not catch all subtle issues that a human expert would, particularly for "large_structural" changes. This could lead to the overlooking of nuanced problems that manifest later in development.
*   **Complexity of State Management:** The defined vignette lifecycle, readiness states, and transition rules involve complex state management that depends on accurate backend state synchronization. Errors in these transitions could lead to incorrect readiness calculations, unexpected UI behavior, or a mismatch between user perception and the system's actual state.
*   **Non-Goals Becoming De Facto Goals:** The specification lists several "non-goals" (e.g., perfectly accurate cost prediction, immediate backend normalization). If these become critical for user adoption or perceived product completeness, it could lead to rushed implementations or the introduction of technical debt to satisfy these emergent requirements.

## Token Stats

- total_input=11213
- total_output=702
- total_tokens=28376
- `gemini-2.5-flash-lite`: input=11213, output=702, total=28376

## Resolution
- status: accepted
- note: The backend engineering spec now bounds the remaining work well; the reported concerns are known migration and dependency risks already represented in the paired product spec, workflow plan, and backend gating sections.
