---
reviewer: "gemini"
lens: "risk"
stage: "plan"
artifact_path: "/Users/chrislaw/valuerank/docs/workflows/job-choice-implementation/plan.md"
artifact_sha256: "2bf84ee2ae0f27d0c76976ecec9286ac046f50095e12183e8c917ca02dfbd88a"
repo_root: "/Users/chrislaw/valuerank"
git_head_sha: "35da80309f01f3cfe549e3aa0ac0f8cfd6ac6a25"
git_base_ref: "origin/main"
git_base_sha: "3aa0478c59137277c911bea998522cfd86ec9934"
resolution_status: "open"
resolution_note: ""
raw_output_path: "/Users/chrislaw/valuerank/docs/workflows/job-choice-implementation/reviews/plan.gemini.risk.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan risk

## Findings

*   **Migration/Rollback Seams:** The plan defines `feature-flag and rollback seam` (Slice 1) and `explicit rollback seam` (Migration Guardrails) but lacks detail on their specific testing and validation, which is critical given the migration risk. The reliance on `same-signature compatibility assumptions` (Slice 1) also lacks explicit validation against real data *before* the default switch.
*   **Parsing Ambiguity and Coverage Loss:** The `fallback classification and ambiguity handling` (Slice 3) and the plan to `expose coverage loss` and prevent `silently dropping unresolved transcripts` (Slice 5) are key to data integrity and reporting accuracy, but their precise implementation and testing are not detailed.
*   **Observability Completeness:** The ability to root-cause issues and audit via `parser metadata` and `transcript exemplars` (Observability) depends on exhaustive capture, which is not explicitly guaranteed.
*   **Reporting Segregation:** The strict enforcement of `methodology-safe` (`Paired Batch`) versus `exploratory` (`Ad Hoc Batch`) reporting (Slice 4, Verification) is crucial to prevent contamination of core metrics.
*   **Phased Verification Timing:** While verification steps like `real pilot data` validation (Verification) and `full-family smoke coverage` (Slice 2, Verification) are planned, their timing relative to default switches is critical and could be a point of failure if executed too late.

## Residual Risks

*   **Unsafe Rollout/Rollback:** The highest risk is a failure in the defined rollback mechanisms. If the `feature-flag and rollback seam` or `explicit rollback seam` are not robust, it could lead to an unrecoverable state, trapping the system in a partially migrated or faulty configuration. While the current professional launch path remaining operational mitigates this significantly, the transition itself remains a high-risk phase.
*   **Compromised Reporting Accuracy:** Flaws in parsing ambiguity handling or in surfacing `coverage loss` could lead to silently inaccurate reports. This could result in misinformed business decisions due to artificially clean or misleading aggregate data.
*   **Subtle Data Corruption/Loss:** Despite compatibility checks and the preservation of manual overrides, there is a residual risk that subtle, un-anticipated incompatibilities or errors in data transformation could lead to data corruption or loss during migration, particularly concerning complex parsing edge cases or initial data duplication.
*   **Hindered Debugging and Auditing:** If `parser metadata` or `transcript exemplars` are not completely or correctly captured as per observability expectations, diagnosing complex parsing failures, understanding adjudication discrepancies, or performing necessary audits will be significantly hindered, increasing resolution times for any emergent issues.

## Token Stats

- total_input=912
- total_output=567
- total_tokens=13225
- `gemini-2.5-flash-lite`: input=912, output=567, total=13225

## Resolution
- status: open
- note:
