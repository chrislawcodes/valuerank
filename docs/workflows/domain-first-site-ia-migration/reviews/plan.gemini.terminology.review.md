---
reviewer: "gemini"
lens: "terminology"
stage: "plan"
artifact_path: "docs/plans/domain-first-site-ia-plan.md"
artifact_sha256: "5f7a97a3bdc993257e3971ce99f63e6baa541cdb9d69ee5dbdb21efe5bf46f20"
repo_root: "."
git_head_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
git_base_ref: "origin/main"
git_base_sha: "ad1056848eaf99799e005d2b73be7a3e1f9287f2"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflows/domain-first-site-ia-migration/reviews/plan.gemini.terminology.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan terminology

## Findings

### Diagnostics vs. Findings Distinction
The plan correctly identifies the critical need to differentiate between instrument tuning data (`Diagnostics`) and broader interpretative claims (`Findings`). The primary risk is that users might treat diagnostic data as auditable findings, leading to premature or incorrect conclusions. The proposed transitional labels and explicit UI copy are crucial mitigation strategies.

### Run Types and Hierarchy
The plan clearly defines `Run` (vignette-scoped execution), `Domain Launch` (user action), `Batch` (vignette pass), and `Trial` (single model/condition). This hierarchy is essential for understanding workflows and costs. The distinction between a `Domain Launch` and a true domain-level `Run` object is noted, prioritizing the user action in the UI.

### `Validation` Scope
The plan positions `Validation` as a top-level concern for "methodology validation" and "instrument tuning" rather than domain-level interpretation. This is distinct from `Findings`, but the broadness of `Validation` could still lead to confusion if users expect it to encompass the interpretation of domain-level results, especially if domain-scoped validation runs within `Domains > Runs` are not clearly demarcated.

### Lifecycle States (`Draft`, `Unready`, `Ready`, `Archived`)
The definitions for `Draft`, `Unready`, `Ready`, and `Archived` appear clear and distinct, with explicit transition rules outlined. This aims to prevent confusion between work that is in progress but not yet ready, and work that has been intentionally set aside.

### `Archive` Label
The plan defines `Archive` for historical or retired work. The explicit risk noted is that "archive labeling may still confuse users if active survey work exists," highlighting the need for very clear boundaries between active, archived, and draft states.

## Residual Risks

*   **Misinterpretation of `Findings`:** The most significant residual risk is users conflating diagnostic data with auditable findings due to insufficient labeling or clear contextualization, leading to flawed interpretations. The success of this mitigation relies heavily on precise UI copy and banners during rollout.
*   **Run Types and Hierarchy (`Batch` Overload):** While `Batch` is defined, the plan acknowledges the risk of UI copy failing to maintain its distinct meaning from `Run`, potentially leading to confusion in practice.
*   **`Validation` Scope Creep:** The risk of `Validation` being perceived as encompassing domain interpretation, rather than strictly instrument validation, persists if the distinction between domain-scoped diagnostic runs and domain-level findings is not rigorously maintained in UI and documentation.
*   **Distinguishing `Unready` and `Archived`:** Without clear visual indicators or immediate contextual cues, users might struggle to differentiate between work that is actively being prepared (`Unready`) and work that has been intentionally set aside (`Archived`).
*   **`Archive` Content Clarity:** The plan flags confusion if "active survey work exists" but is still archived. This implies a need for extremely clear rules and UI to prevent accidental archiving or mislabeling of active, albeit non-primary, research.

## Token Stats

- total_input=23552
- total_output=643
- total_tokens=27478
- `gemini-2.5-flash-lite`: input=23552, output=643, total=27478

## Resolution
- status: open
- note: