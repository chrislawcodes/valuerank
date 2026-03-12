---
reviewer: "gemini"
lens: "requirements"
stage: "spec"
artifact_path: "/Users/chrislaw/valuerank/docs/workflows/domain-query-split/spec.md"
artifact_sha256: "87b44fa1f9d3c1a8c6539cf16daf47a45f5dc2309a7fb8fbec9542a0929b1cc0"
repo_root: "/Users/chrislaw/valuerank"
git_head_sha: "3aa0478c59137277c911bea998522cfd86ec9934"
git_base_ref: "origin/main"
git_base_sha: "3aa0478c59137277c911bea998522cfd86ec9934"
resolution_status: "accepted"
resolution_note: "The spec already narrows scope, preserves the old export path, and requires a focused schema or query test for registration safety."
raw_output_path: "/Users/chrislaw/valuerank/docs/workflows/domain-query-split/reviews/spec.gemini.requirements.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements

## Findings

- **Critical Functional Risk:** The primary risk identified is Pothos side-effect registration failures (Risk 1). If new files are not imported correctly into `domain/index.ts` or the compatibility shim `domain.ts`, GraphQL fields and types can silently disappear from the schema. This would lead to runtime errors without TypeScript warnings, directly impacting Acceptance Criteria 4 (GraphQL schema registration still exposes the same domain query fields and domain result types) and the core goal of maintaining GraphQL behavior.
- **Compatibility Breakage:** Maintaining compatibility at the old `cloud/apps/api/src/graphql/queries/domain.ts` path is critical (Risk 2, Acceptance Criteria 2 & 3). If the shim file or the `DOMAIN_ANALYSIS_VALUE_KEYS` export is broken, downstream consumers like `domain-coverage.ts` will fail, potentially impacting system stability.
- **Scope Creep Mitigation:** The specification explicitly warns against moving helper files, adding GraphQL codegen, or renaming terms within this PR (Risk 3, Acceptance Criteria 7 & 8, Out of Scope). Combining too many significant changes simultaneously would increase review cost and complicate rollbacks.

## Residual Risks

- **Structural Complexity and Import Management:** While the goal is to reduce complexity by splitting files, the proposed `domain/index.ts` acting as an importer for other files could still be a point of failure. Ensuring explicit imports and clear responsibilities are maintained across `index.ts`, `shared.ts`, `types.ts`, `catalog.ts`, `planning.ts`, and `analysis.ts` is key to preventing future issues.
- **Testing Gaps for Schema Registration:** The specification notes that the current test suite might not directly prove that the same domain GraphQL fields are still registered after the split (Acceptance Criterion 6). While adding a dedicated schema registration test is planned, the thoroughness of this test will be critical for ensuring no fields have been silently dropped.
- **Accidental Data Shape Modifications:** The spec highlights the need to safeguard against accidental changes to JSON-backed GraphQL fields like `centroid` and `faultLinesByPair` (Edge Cases). Although the proposed file separation aims to minimize this, careful attention during implementation is required to prevent unintended modifications to these data shapes, even if the schema itself appears unchanged.

## Token Stats

- total_input=2562
- total_output=484
- total_tokens=15563
- `gemini-2.5-flash-lite`: input=2562, output=484, total=15563

## Resolution
- status: accepted
- note: The spec already narrows scope, preserves the old export path, and requires a focused schema or query test for registration safety.
