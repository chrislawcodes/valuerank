---
reviewer: "gemini"
lens: "requirements"
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
raw_output_path: "docs/workflows/domain-first-site-ia-migration/reviews/backend-spec.gemini.requirements.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements

## Findings

1.  **Backend and Route Dependency (High Severity):** The specification extensively relies on external documents (`plan.md`, `backend-engineering-spec.md`) for crucial details regarding backend capabilities, data models, route compatibility, and migration sequencing. This creates a dependency where UI behavior is contingent on unstated or yet-to-be-implemented backend logic. Discrepancies between this spec and its dependent documents could lead to significant implementation challenges and rework.
2.  **Clarity of "Active-Run Edit Rule" (Medium-High Severity):** While the rule states that active runs use the launch snapshot, the UI's communication of this to the user needs to be exceptionally clear. The specification mentions explicit warnings in the vignette editor and relevant run surfaces, but the exact wording, placement, and prominence of these warnings are critical to prevent user confusion about whether editing a vignette will affect an ongoing evaluation.
3.  **Ambiguity in "Findings Eligibility" Criteria (Medium Severity):** The spec clearly defines "auditable" vs. "non-auditable" states for Findings and mandates explanatory messages. However, the *criteria* for determining eligibility are backend-dependent and acknowledged as needing development. The user-facing messages must be carefully crafted to manage expectations, especially if the backend logic for eligibility is complex or subject to change.
4.  **Distinguishing Validation Execution vs. Reference (Medium Severity):** The spec clearly states `Validation` is not the execution home, with domain-scoped checks starting from `Domains > Runs`. However, ensuring the UI consistently reinforces this distinction and prevents users from seeking execution entry points within the `Validation` section is crucial to avoid user confusion and workflow disruption.
5.  **Clarity of "Archive" Transition (Medium Severity):** The spec defines `Archive` for historical work and states active work should not be filed there. However, the process for migrating items to `Archive` and the criteria for deeming work as "historical" or "retired" need robust definition to ensure active projects are not inadvertently moved or archived items are not confused with active ones.
6.  **Cost Estimation Confidence and Fallbacks (Medium Severity):** The specification requires cost estimates with confidence labeling and fallback warnings. The implementation details of how confidence is calculated, displayed, and what "fallback" means in practice are key user trust factors, especially given the acknowledgement that cost prediction is not perfectly accurate initially.
7.  **Effectiveness of "Return-State Behavior" (Medium Severity):** While the spec details features like "resume work" and "needs-attention items," the success of orienting returning users heavily depends on the UI's implementation. If the direct deep links or "needs-attention" indicators are not immediately obvious, actionable, or precise, this feature may not meet its intended goal.

## Residual Risks

1.  **User Migration from Object-First to Domain-First (High Risk):** The core goal of this spec is to shift the user's mental model from object-centric to domain-centric workflows. This is a significant change. While route compatibility and clear IA are proposed, there's an inherent risk that users accustomed to old habits may struggle, leading to confusion or adoption friction, despite best efforts in the spec.
2.  **"Good Enough" MVP States (Medium Risk):** The spec acknowledges that certain backend capabilities (e.g., precise cost prediction, complete immutability for findings) may not be fully realized at launch. The risk is that these "good enough" states, while functional, might be perceived by users as incomplete or unreliable, potentially impacting trust in the system's auditability and accuracy.
3.  **Complexity of State Transitions and Edge Cases (Medium Risk):** The detailed vignette lifecycle (`Draft`, `Unready`, `Ready for pilot`, etc.) and their transition rules introduce significant complexity. Without rigorous testing and clear UI feedback for each transition, there's a risk of edge cases, inconsistent states, or unexpected behavior that could be difficult for users to navigate or debug.
4.  **Interdependency of Navigation and Backend Truths (Medium Risk):** The spec defines UI surfaces and navigation, but its ultimate correctness relies on backend implementation for grouped history, status aggregation, and provenance. Any delay or divergence in backend development could lead to navigational dead ends or data inconsistencies on the frontend, even if the UI spec itself is perfectly implemented.

## Token Stats

- total_input=24679
- total_output=916
- total_tokens=27492
- `gemini-2.5-flash-lite`: input=24679, output=916, total=27492

## Resolution
- status: accepted
- note: The backend engineering spec now bounds the remaining work well; the reported concerns are known migration and dependency risks already represented in the paired product spec, workflow plan, and backend gating sections.
