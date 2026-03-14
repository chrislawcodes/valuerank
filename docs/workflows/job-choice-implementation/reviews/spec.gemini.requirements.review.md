---
reviewer: "gemini"
lens: "requirements"
stage: "spec"
artifact_path: "/Users/chrislaw/valuerank/docs/workflows/job-choice-implementation/spec.md"
artifact_sha256: "c8c5eb353c701e9cb58ad89381ce04268df4b5a6f9da38be5d54bd41f853b996"
repo_root: "/Users/chrislaw/valuerank"
git_head_sha: "35da80309f01f3cfe549e3aa0ac0f8cfd6ac6a25"
git_base_ref: "origin/main"
git_base_sha: "3aa0478c59137277c911bea998522cfd86ec9934"
resolution_status: "open"
resolution_note: ""
raw_output_path: "/Users/chrislaw/valuerank/docs/workflows/job-choice-implementation/reviews/spec.gemini.requirements.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements

## Findings

*   **Vignette Transformation:** The spec clearly requires the creation of a new `Job Choice` vignette family by duplicating and transforming existing professional `Jobs (...)` vignettes. This includes removing job titles, retaining value descriptions, adding a `job-choice` tag, and recording canonical value and shown-first order metadata.
*   **Dual Response Formats:** The implementation must support two response types: an option-text-labeled form with a specific sentence structure and short response labels, and the existing `value A / value B` bridge format.
*   **Parallel Parsing and Adjudication Paths:** A critical requirement is to maintain the legacy numeric parsing path while introducing a new text-label path for `Job Choice`. This includes preserving raw output and provenance, and enabling manual inspection and relabeling of ambiguous cells.
*   **Human Adjudication Support:** The need for CSV export of fallback-resolved transcripts is specified to facilitate comprehensive human adjudication during the manual pilot and the first bridge.
*   **Launch Workflow Distinction:** The user interface must clearly differentiate between `Start Paired Batch` (primary, methodology-safe) and `Start Ad Hoc Batch` (less prominent, exploratory) launch actions.
*   **Staged Migration and Labeling:** The system must support a staged migration approach, ensuring the current professional `Jobs` system remains accessible and clearly labeled as `Old V1`.
*   **Coverage Loss Reporting:** A requirement exists to highlight any loss of coverage where unresolved text outputs would otherwise be excluded from numeric analysis.
*   **Methodology Adherence:** The implementation must strictly follow defined methodology decisions, including treating `Job Choice` as a new instrument, using descriptive side-by-side claims for bridges, conducting a manual pilot first, ensuring pilot and bridge data are reusable, and adhering to specific targets for parser agreement (95%) and unparseable transcripts (<3%).

## Residual Risks

*   **Score Interpretation:** A significant risk identified is that parser-derived scores may appear artificially more favorable than adjudicated scores because ambiguous or unparseable transcripts are dropped. This could lead to a misinterpretation of model performance.
*   **Abstracted Value Statements:** The removal of job titles from vignettes might render some value statements too abstract, potentially diminishing the clarity or direct relevance of the ethical dilemmas presented to the AI.
*   **Tooling Compatibility:** Existing tooling for assumption analysis and order-effect calculations is tightly coupled to legacy semantics. Adapting this tooling for the new `Job Choice` semantics could be complex and may require substantial rework or replacement.
*   **Compromised Reuse:** If pilot launches utilize a "test-only run type," it could undermine the intended "same-signature reuse" of pilot and bridge data, impacting the ability to establish a consistent baseline for evidence.
*   **Incomplete Migration:** The "Non-Goals" section indicates that full sentinel migration, immediate replacement of all legacy pages, and claims of strong cross-family equivalence are not part of the initial scope. This implies that a complete or perfectly consistent system may not be achieved in the first phase, leaving potential gaps or limitations.
*   **Parser Agreement Attainment:** Achieving the target of 95% parser agreement for new text-label outputs, especially when transitioning from a legacy system, may prove challenging and require significant effort in tuning and validation.

## Token Stats

- total_input=596
- total_output=695
- total_tokens=14919
- `gemini-2.5-flash-lite`: input=596, output=695, total=14919

## Resolution
- status: open
- note:
