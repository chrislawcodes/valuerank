---
reviewer: "gemini"
lens: "requirements"
stage: "spec"
artifact_path: "docs/workflows/domain-first-site-ia-migration/spec.md"
artifact_sha256: "795ab64099db83c36a6c541b6215e0c2c3e54e0df02691393adcce3d480e1987"
repo_root: "."
git_head_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
git_base_ref: "origin/main"
git_base_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No blocking requirements gaps; the remaining concerns are already represented in acceptance criteria and migration guardrails."
raw_output_path: "docs/workflows/domain-first-site-ia-migration/reviews/spec.gemini.requirements.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements

## Findings

*   **Core Workflow Support:** The product must implement a domain-first research workflow consisting of six key steps: frame a domain, assemble the instrument, pilot and tune vignettes, run a domain evaluation, interpret findings, and validate methodology.
*   **Primary Navigation Structure:** The top-level navigation must consist of `Home`, `Domains`, `Validation`, `Archive`, and `Settings`.
*   **Domain Workspace Structure:** Within each domain, the workspace must expose the following sections: `Overview`, `Vignettes`, `Setup`, `Runs`, and `Findings`.
*   **Canonical Entry Points:** Each major user task must have a single, clearly defined canonical entry point within the IA to ensure consistent access and prevent user confusion.
*   **Consistent Product Vocabulary:** The defined terms (`Domain`, `Vignette`, `Domain Evaluation`, `Run`, `Batch`, `Trial`, `Diagnostics`, `Findings`, `Validation`, `Archive`) must be used consistently across all user interfaces and documentation.
*   **Guided Vignette Creation:** The vignette creation process must prevent user dead ends by either allowing inline asset creation or providing a preflight state that clearly indicates missing requirements and offers direct links to create them.
*   **Clear Configuration Distinction:** The UI must explicitly differentiate between domain-level defaults managed in `Setup` and per-vignette configurations in `Vignettes`, clearly showing inheritance and override states.
*   **Domain Evaluation Launch Flow:** A defined sequence for launching domain evaluations must be followed, including scope selection, vignette set choice, setup summary review, cost estimation, and final confirmation. Configuration coverage review must be integrated into this flow.
*   **Distinct Status Surfaces:** Three distinct status views—`Domain Evaluation Summary`, `Run Detail`, and `Global Status Center`—must be implemented without conflation of their scope or purpose.
*   **Explicit Diagnostics Scoping:** All entry points for accessing diagnostics must be explicitly labeled with their scope (e.g., "View diagnostics for this run," "View diagnostic history").
*   **Findings Eligibility Criteria:** The `Findings` surface is reserved for auditable data. When data is not auditable, an explicit "non-auditable state" with specific explanatory copy must be displayed, guiding users toward production evaluations.
*   **User Return-State Behavior:** The `Home` and `Domain Overview` surfaces must intelligently surface relevant information for returning users, including recent activity, stalled work, and clear next steps.
*   **Vignette Lifecycle Management:** Vignettes must adhere to a prompted transition model through defined states (`Draft`, `Unready`, `Ready for pilot`, `Ready for production`, `Archived`), with UI safeguards against silent promotion to readiness.
*   **Active Run Edit Rule:** Users must be allowed to edit vignettes even if an active run is using them, provided the UI clearly communicates that active runs continue using the pre-edit snapshot.
*   **Route Compatibility During Migration:** The migration process must preserve legacy routes, provide alias routes, implement redirects, and define sunset rules to ensure continuity for existing users and deep links.
*   **Acceptance Criteria:** The specification includes specific, measurable acceptance criteria covering navigation, workflow, UI clarity, and state management.

## Residual Risks

1.  **Migration Complexity & Habitual User Disruption:** High risk that preserving "habitual use, deep links, or historical interpretation" while shifting to a domain-first IA leads to an incoherent user experience or fails to fully retire old mental models, especially if backend normalization lags. Users accustomed to the old object-first structure might struggle with new canonical entry points, or legacy routes might not be perfectly handled.
    *   *Severity: High*
2.  **Ambiguity in "Auditable Data" for Findings:** The determination of when data is "auditable enough" for `Findings` is subjective. If this threshold is set too low or too high, users might see incomplete interpretations or be unable to access insights when they expect to. The transition from non-auditable to auditable states needs clear triggers and consistent UI messaging.
    *   *Severity: High*
3.  **Inconsistent Application of Product Vocabulary:** Failure to enforce the defined product vocabulary (`Domain`, `Vignette`, `Domain Evaluation`, `Run`, etc.) across all UI elements and documentation could lead to significant user confusion and hinder understanding of the new IA.
    *   *Severity: Medium-High*
4.  **Active Run Edit Rule Misinterpretation:** If the UI does not clearly communicate that active runs continue using the launch snapshot when a vignette is edited, users might assume their edits apply immediately to ongoing runs, leading to confusion or incorrect assumptions about results.
    *   *Severity: Medium*
5.  **Vignette Readiness State Transitions:** Any ambiguity or silent promotion in vignette readiness transitions could lead to unintended launches or a false sense of preparedness, disrupting the controlled research workflow.
    *   *Severity: Medium*
6.  **Complexity of Guided Vignette Creation:** If the "inline asset creation" or "preflight state" logic is not robust, users may still encounter dead ends or confusing error messages when creating vignettes, undermining the goal of a smooth workflow.
    *   *Severity: Medium*
7.  **UI Clarity for Setup vs. Vignette Configuration:** If the distinction between domain defaults (`Setup`) and per-vignette overrides (`Vignettes`) is not visually clear and consistently reinforced, users may misconfigure their evaluations or misunderstand how settings are applied.
    *   *Severity: Medium*
8.  **Incomplete Route Migration:** Even with planned redirects and aliases, if any legacy routes are missed or redirects fail, users relying on deep links or old bookmarks will be stranded, breaking established workflows.
    *   *Severity: Medium*
9.  **Conflation of Status Surfaces:** If the `Domain Evaluation Summary`, `Run Detail`, and `Global Status Center` are not strictly separated in their presentation and scope, users may receive an incomplete or misleading view of the status of their work.
    *   *Severity: Medium*

## Token Stats

- total_input=27
- total_output=1282
- total_tokens=21343
- `gemini-2.5-flash-lite`: input=27, output=1282, total=21343

## Resolution
- status: accepted
- note: No blocking requirements gaps; the remaining concerns are already represented in acceptance criteria and migration guardrails.
