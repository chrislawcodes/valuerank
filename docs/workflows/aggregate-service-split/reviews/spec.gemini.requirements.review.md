---
reviewer: "gemini"
lens: "requirements"
stage: "spec"
artifact_path: "/Users/chrislaw/valuerank/docs/workflows/aggregate-service-split/spec.md"
artifact_sha256: "5b179e42c7db08a425a3a1645e7b89cfa7a3bd9478b673e298747687dd6bd311"
repo_root: "/Users/chrislaw/valuerank"
git_head_sha: "f4994a3fa0e40d89e81a5afb0eddcb46336155bd"
git_base_ref: "origin/main"
git_base_sha: "f4994a3fa0e40d89e81a5afb0eddcb46336155bd"
resolution_status: "open"
resolution_note: ""
raw_output_path: "/Users/chrislaw/valuerank/docs/workflows/aggregate-service-split/reviews/spec.gemini.requirements.review.md.json"
created_at: "2026-03-12T17:38:52.541374+00:00"
---

# Review: spec requirements

## Findings

Here are the findings from reviewing the "Aggregate Service Split Spec" using a requirements lens, ordered by severity:

*   **High Severity: Unaccounted Logic for `normalizeAnalysisArtifacts`**
    *   **Finding:** The specification details the need to preserve the behavior of "normalization of visualization and variance artifacts" and lists `tests/services/analysis/normalize-analysis-output.test.ts` for verification. However, it does not specify where the `normalizeAnalysisArtifacts` logic (or its equivalent) will reside within the new file structure, nor how it integrates with the proposed split of `aggregate.ts`. The proposed new files (`constants.ts`, `contracts.ts`, `config.ts`, `aggregate-logic.ts`, `variance.ts`, `update-aggregate-run.ts`) do not explicitly account for this critical piece of functionality and its associated testing.
    *   **Recommendation:** Clarify the location and integration strategy for the `normalizeAnalysisArtifacts` logic and its corresponding tests within the new modular structure. This includes detailing if it will be moved, refactored, or remain separate, and how it will be called from the new modules.

*   **High Severity: Potential Testing Gap for Worker Payload and Artifact Normalization**
    *   **Finding:** The spec acknowledges a potential need for a new, focused test to assert worker payload construction and normalized aggregate artifacts if the existing test suite is insufficient. However, the "Acceptance Criteria" and "Verification" sections do not explicitly mandate the creation of this test. If existing tests do not adequately cover these specific aspects, subtle contract drifts or behavioral changes could go undetected.
    *   **Recommendation:** Explicitly mandate the creation of the described focused test if existing test coverage is found to be insufficient.

*   **Medium Severity: Future Scope Ambiguity for `buildValueOutcomes`**
    *   **Finding:** The spec states that `buildValueOutcomes` will be kept in `update-aggregate-run.ts` for the first pass, implying a future move. However, the criteria or plan for this future relocation are not detailed within the current specification.
    *   **Recommendation:** Acknowledge that the future refactoring of `buildValueOutcomes` is outside the immediate scope of this PR but is a known potential follow-up task.

## Token Stats

- total_input=14055
- total_output=488
- total_tokens=18106
- `gemini-2.5-flash-lite`: input=14055, output=488, total=18106

## Resolution
- status: open
- note: