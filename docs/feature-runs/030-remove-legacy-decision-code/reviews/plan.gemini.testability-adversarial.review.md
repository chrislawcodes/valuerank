---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/030-remove-legacy-decision-code/plan.md"
artifact_sha256: "587a1726077d6b975f2458031ae03648e78c4f687d96a1d5068066c3041daa55"
repo_root: "."
git_head_sha: "5d04de64d2bf84e1434fd754cd77b7159a695474"
git_base_ref: "origin/main"
git_base_sha: "b60f7e7ff0708de6013e64f4045868895bbbcf6e"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/feature-runs/030-remove-legacy-decision-code/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Recommendation |
| :--- | :--- | :--- |
| **CRITICAL** | **Tests are back-loaded into a final "cleanup" wave.** | **Shift test work into the implementation waves.** Wave 1 must include updating/writing tests for the core TypeScript API changes and adding the new parity/regression tests. Wave 2 must update Python tests alongside the code changes. Developing logic for three waves without a corresponding, passing test suite is a significant regression risk and makes debugging more difficult. |
| **HIGH** | **The plan introduces a new, undefined-lifespan compatibility layer in the frontend.** | **Define the frontend normalizer's lifecycle and testing requirements.** The plan to have the frontend "handle both shapes temporarily" for `scoreCounts` vs `directionCounts` creates new, untracked technical debt. The plan should specify: 1) How the normalizer will detect the data shape (e.g., property sniffing, version field). 2) A dedicated test plan for this brittle logic. 3) A ticket/task to remove this compatibility layer once aggregate data is backfilled or considered expired. |
| **MEDIUM** | **[UNVERIFIED] The plan assumes a stable, tested contract between the TS job queue and Python workers but proposes no contract testing.** | **Implement a contract test.** The mitigation "Run pytest" only validates the Python worker in isolation. A failure can still occur if the TypeScript service sends a payload that doesn't match the Python worker's new expectations. A shared-fixture test or a dedicated contract test should be added to Wave 2 to verify the JSON payload passed from TS to Python matches the consumer's expectations. |
| **MEDIUM** | **The regression test plan for the `decisionCode` fallback is underspecified.** | **Expand the `decisionCode` fallback test case.** The test added in Wave 4 (but should be in Wave 1) must explicitly cover all valid legacy values (1 through 5), `null`, `undefined`, and zero to ensure the mapping to the canonical model is robust and prevents runtime errors from historical data anomalies. |
| **LOW** | **The `grep` strategy for finding hidden consumers is incomplete.** | **Broaden the search pattern for the final cleanup `grep`.** The proposed command only searches `.ts` and `.tsx` files. It should be expanded to include other potentially relevant extensions like `.js`, `.jsx`, and `.json`, and check other directories where queries might be stored (e.g., `specs/`, `scripts/`). |

## Residual Risks

| Risk | Description |
| :--- | :--- |
| **External Consumer Breakage** | Even with a `grep` sweep, an external, non-TypeScript consumer of the GraphQL API (e.g., a data science script, an external partner integration) could be using the `legacy` field. The plan correctly notes this is out of scope per the spec, but if the spec's assumptions about usage are wrong, this change could break an untracked client. |
| **Permanent Compatibility Debt** | The "temporary" frontend normalizer for `scoreCounts` becomes a permanent fixture in the codebase. Without a formal plan for its removal, it is likely to persist, adding maintenance overhead and a confusing data-flow branch for future developers. |
| **Historical Data Corruption** | A transcript in the production database may contain an unexpected value in the `decisionCode` column (e.g., a non-integer string, a value outside 1-5). If the single fallback resolver in `resolveTranscriptDecisionModel` does not have robust error handling for unexpected input types, it could cause the GraphQL resolver to fail for specific historical records. |

## Token Stats

- total_input=2758
- total_output=789
- total_tokens=16109
- `gemini-2.5-pro`: input=2758, output=789, total=16109

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
