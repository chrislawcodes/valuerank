---
reviewer: "gemini"
lens: "requirements"
stage: "spec"
artifact_path: "docs/workflows/analysis-scenario-metadata-normalization/spec.md"
artifact_sha256: "1e2f3234d4e92b91519e7025766fb5bd8e5a37f1e0a24c75588a1ee9b4fd9846"
repo_root: "."
git_head_sha: "624b0f433b3bde215339f6a95d865f7163a2cc2a"
git_base_ref: "origin/main"
git_base_sha: "ad7e0c4060f149412a4100117981a45704a5c3c0"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflows/analysis-scenario-metadata-normalization/reviews/spec.gemini.requirements.review.md.stdout.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements

## Findings

*   **Cross-Language Normalization Paradox:** The spec mandates that "Python workers should receive already-normalized metadata from the TypeScript analysis boundary" to avoid re-implementing logic. However, many workers (like `analyze_basic.py`) currently pull data directly from the database or files. If normalization is performed "at read/analysis time" within the TypeScript API, there is no mechanism for the Python workers to access this normalized state unless the entire job-dispatch payload is significantly expanded to include a full scenario-metadata manifest for every run.
*   **Undefined "Vignette Family" Registry:** The normalization module is "keyed by vignette family." Currently, "vignette family" is not a formal, first-class field in the database or scenario content (it is often inferred from folder paths or naming conventions). Without a strict registry or a `vignetteFamily` field in the scenario metadata, the normalization module will rely on brittle string matching or heuristics to decide which mapping rule to apply.
*   **Job-Choice Mapping Exhaustion:** The spec assumes "exact deterministic normalization from `dimension_values`." In the Job-Choice format, these are human-readable strings. If a user authors a new vignette with a slight variation in wording (e.g., "High Salary" vs. "High Pay"), the "read-time" normalization will fail or mark it as `unavailable` unless the mapping code is updated. The spec lacks a strategy for handling "unmapped but valid" metadata that doesn't fit the hardcoded deterministic map.
*   **UI/Grouping Ambiguity:** The spec introduces `groupingDimensions` (machine-readable) and `displayDimensions` (human-readable). It is unclear which should be used for the labels in the Pivot/Stability UI. If the UI uses `groupingDimensions` for logic but `displayDimensions` for text, the spec needs to define how to handle cases where multiple `displayDimensions` map to a single `groupingDimension`.
*   **Performance at Scale:** Computing normalization at read/analysis time for runs involving hundreds of scenarios and multiple models could introduce significant latency in GraphQL resolvers or frontend processing, especially if the mapping logic involves complex lookups or regex.

## Residual Risks

*   **Logic Drift:** If the centralized TypeScript module is not easily accessible to Python workers, developers may be tempted to temporarily re-implement mapping in Python, leading back to the same format-branch problem.
*   **The "Mixed" Format Trap:** If a scenario is marked as `sourceFormat: "mixed"` due to conflicting fields, the spec does not yet define whether that scenario is excluded from all analysis or only the specific conflicting dimension.
*   **Schema Debt:** Delaying the database migration keeps canonical metadata harder to query through plain SQL/Prisma filters.
*   **Mapping Maintenance:** As new Job-Choice vignette flavors are created, the normalization module could become a bottleneck if creation-time validation does not enforce canonical compatibility.

## Resolution
- status: open
- note:
