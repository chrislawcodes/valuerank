---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/full-pvq-survey/spec.md"
artifact_sha256: "beaf5a3b0a80ecee270b1734b9cae8b983d4ed19b864684545f57dd11e3337c5"
repo_root: "."
git_head_sha: "597508be0050a106dddfaa1bc4d6b1a4443993af"
git_base_ref: "origin/main"
git_base_sha: "597508be0050a106dddfaa1bc4d6b1a4443993af"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH 1 (hide refused models): REJECTED — explicit user requirement is to exclude refused model columns. HIGH 2 (samplesPerScenario): FIXED — added to US1-AC1 and FR-017. MEDIUM 1 (brittle refusal logic): REJECTED — explicit user policy is any missing score = full trial refusal. MEDIUM 2 (cross-run aggregation unsound): ACCEPTED as strengthened Residual Risk 1. MEDIUM 3 (deleted survey 404): FIXED — edge case added. LOW 1 (duplicate Q handling): REJECTED — last-occurrence with warning is the correct policy. LOW 2 (edit name): DEFERRED to post-v1. Residual risk amplifications noted and strengthened in spec."
raw_output_path: "docs/workflow/feature-runs/full-pvq-survey/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | Finding | Recommendation |
| :--- | :--- | :--- |
| **HIGH** | **Hiding Models with 100% Refusals Creates Misleading Results** | Instead of excluding the model's column from the grid (per US2-AC2), display the column but populate cells with "Refused" or "N/A". This accurately communicates that the model was tested but failed to produce valid data, preventing user confusion about whether the model was part of the run. |
| **HIGH** | **Spec Omits User Control Over Trial Count (`samplesPerScenario`)** | The `FullPvqRun` entity includes `samplesPerScenario`, but no user story or acceptance criterion describes how an admin sets this crucial parameter. This is a major gap, as it controls the number of trials and thus the statistical significance of the results. The spec should define how this is set (e.g., in the run creation UI) and what the default is. |
| **MEDIUM** | **"All or Nothing" Refusal Logic is Brittle and Inefficient** | The current design (FR-003) discards an entire 40-question trial if even one answer is missing or malformed. This is extremely inefficient and will lead to a high rate of data loss, especially with less reliable or more verbose models. The system should still flag the trial as having a parsing issue, but it should calculate category averages using the valid data points it did receive. A trial should only be a total refusal if a full category's worth of questions is un-parsable, preventing that category's average from being calculated. |
| **MEDIUM** | **[UNVERIFIED] Cross-Run Aggregation is Unsound Without Parameter Locks** | The spec requires aggregating trials across all runs for a survey (FR-005). However, it doesn't prevent an admin from changing run parameters like `samplesPerScenario` between runs. Averaging results from a run with `temperature=0.1` and another with `temperature=0.9` is methodologically unsound. The system should either a) prevent new runs if parameters change, forcing a new survey, or b) partition results by run parameters, not just by framing. |
| **MEDIUM** | **Handling of Deleted Surveys is Undefined** | US4-AC2 specifies soft-deletion for surveys. However, the spec does not define system behavior if a user attempts to access a deleted survey's results via a direct URL (e.g., from browser history). The system should return a clear "Survey not found" or "This survey has been deleted" page instead of a generic error or blank screen. |
| **LOW** | **Arbitrary Handling of Duplicate Answers** | The edge case for duplicate question labels is to "take the last occurrence". This choice is arbitrary and lacks a clear rationale. A better approach would be to invalidate both answers for that specific question (treating it as missing for that trial) and flagging it more strongly on the trial detail page, as this indicates a more significant parsing or model behavior issue. |
| **LOW** | **No Path for Correcting Simple User Errors** | The spec includes creating and deleting surveys (US4) but omits any mention of editing. An admin who makes a simple typo in a survey name has no recourse but to delete it and recreate it, potentially losing associated run data if not handled carefully. An "edit name" function is a basic requirement for managing any user-created entity. |

## Residual Risks

The spec includes a solid `Residual Risks` section. The findings above identify net-new issues not already acknowledged. The following points amplify the existing risks with an adversarial lens.

1.  **Risk of Data Corruption is Understated:** The acknowledged risk that "Aggregation across time conflates methodology changes" is framed as a user discipline issue. This is a critical design flaw. Relying on users to manually create new surveys for prompt changes is unreliable and guarantees that data will eventually be corrupted. The system should enforce this by versioning the prompt template within the survey or by creating a hash of the prompt and linking it to the run, preventing the mixing of data from different methodologies.

2.  **Mean-Only Display is Insufficient for Comparative Analysis:** The spec correctly identifies that a "Mean-only display hides distribution." This is not just a missing feature; for a tool designed to *compare* models, it's a
    functional deficiency. A model with low variance (high consistency) and one with high variance (erratic behavior) can have the same mean score, but they represent entirely different behavioral profiles. Displaying standard deviation or a simple distribution visualization is critical for meaningful analysis, even in v1.

3.  **Refusal Logic Creates a Black Box:** The decision to treat any parsing failure as a full trial refusal (per FR-003), combined with hiding fully refused models (per US2-AC2), creates a black box. An admin may never know *why* a model is being excluded. They can't see the malformed response because the trial is simply "refused". To enable debugging, even refused trials must show the full transcript (US3-AC4), and the system should explicitly highlight the part of the response that caused the parsing failure.

## Token Stats

- total_input=15973
- total_output=1115
- total_tokens=19418
- `gemini-2.5-pro`: input=15973, output=1115, total=19418

## Resolution
- status: accepted
- note: HIGH 1 (hide refused models): REJECTED — explicit user requirement is to exclude refused model columns. HIGH 2 (samplesPerScenario): FIXED — added to US1-AC1 and FR-017. MEDIUM 1 (brittle refusal logic): REJECTED — explicit user policy is any missing score = full trial refusal. MEDIUM 2 (cross-run aggregation unsound): ACCEPTED as strengthened Residual Risk 1. MEDIUM 3 (deleted survey 404): FIXED — edge case added. LOW 1 (duplicate Q handling): REJECTED — last-occurrence with warning is the correct policy. LOW 2 (edit name): DEFERRED to post-v1. Residual risk amplifications noted and strengthened in spec.
