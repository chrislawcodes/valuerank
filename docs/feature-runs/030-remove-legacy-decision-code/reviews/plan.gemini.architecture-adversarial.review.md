---
reviewer: "gemini"
lens: "architecture-adversarial"
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
raw_output_path: "docs/feature-runs/030-remove-legacy-decision-code/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

| Severity | Finding |
| :--- | :--- |
| **HIGH** | **Permanent Maintenance Burden via Single Fallback**<br/>The decision to make `resolveTranscriptDecisionModel` the single, permanent gateway for handling legacy `decisionCode` data instead of performing a one-time data backfill introduces a significant, long-term architectural risk. This function becomes a permanent maintenance burden and a single point of failure for viewing all historical data. Any future changes to the decision model or a bug in this specific fallback logic will have disproportionately high impact. The plan correctly identifies this as a trade-off, but understates the long-term cost of embedding this legacy logic directly into a core query resolver. |
| **HIGH** | **Client-Side Complexity without a Deprecation Plan**<br/>The plan pushes the complexity of handling two different data shapes (`scoreCounts` and `directionCounts`) to the frontend normalizer. While presented as a temporary solution, there is no corresponding plan or wave to remove this compatibility code. This introduces immediate complexity and a high risk of this "temporary" fix becoming permanent technical debt, making the frontend more fragile and harder to maintain. |
| **MEDIUM** | **[UNVERIFIED] Unaudited Data Access Patterns**<br/>The plan focuses on removing legacy code from the main application stack but assumes no other systems consume the legacy fields. The `decisionCode` and `decisionCodeSource` columns are being left in the database. There is a risk that external systems (e.g., BI tools, data science notebooks, direct database queries) rely on these columns. By not selecting them in the application, the application's view of the world can diverge from other consumers, creating a risk of data inconsistency and breaking downstream dependencies that were not audited. |
| **MEDIUM** | **[UNVERIFIED] Overly Strong Assumption about Worker Behavior**<br/>The mitigation for old `scoreCounts` data relies on the assumption that "Python workers only write aggregate results, never read them." If this assumption is incorrect, or if worker behavior changes in the future, workers could fail when encountering old aggregate data. This assumption should be verified as a hard constraint before proceeding. |
| **LOW** | **Ambiguity in Parity Testing**<br/>Wave 4 proposes a parity test comparing `directionCounts` output to the old `scoreCounts` mapping. This is good, but it may not be sufficient. The legacy numeric code could have implicit behaviors (e.g., handling of nulls, zeroes, or out-of-range values) that are not captured by a simple fixture-based parity test. The removal of the `6 - score` flip, for example, is a pattern of numeric inversion that could have subtle, untested side effects if it existed elsewhere. |

## Residual Risks

Even if the above findings are addressed, the project will be left with the following risks:

| Risk | Description |
| :--- | :--- |
| **Architectural Debt Concentration** | The `resolveTranscriptDecisionModel` function will become a critical, fragile "don't touch" component. By choosing a runtime fallback over a data migration, the project concentrates a piece of legacy logic in a single, high-traffic location, making future refactoring of this domain significantly more complex and risky. |
| **Stale Schema** | By leaving the `decisionCode` column in the database, the schema no longer accurately represents the state of the application logic. This creates a landmine for future developers, database administrators, or data analysts who may incorrectly assume the column is in use or contains meaningful, up-to-date information. |
| **Incomplete Deletion** | The legacy system is not being truly removed, but rather hidden at the application layer. This incomplete removal means the team must retain knowledge of how the legacy system worked indefinitely to maintain the fallback and debug any issues that arise from it. This cognitive overhead is a hidden cost not accounted for in the plan. |

## Token Stats

- total_input=2757
- total_output=835
- total_tokens=15884
- `gemini-2.5-pro`: input=2757, output=835, total=15884

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
