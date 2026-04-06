---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/spec.md"
artifact_sha256: "5c1990b277f7a4bcb07127c34a2d7f1c9fc4181434a3ddb169733ae7f645d353"
repo_root: "."
git_head_sha: "5d04de64d2bf84e1434fd754cd77b7159a695474"
git_base_ref: "origin/main"
git_base_sha: "b60f7e7ff0708de6013e64f4045868895bbbcf6e"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

| Severity | Finding | Recommendation |
| :--- | :--- | :--- |
| **HIGH** | **Contradictory Mitigation for Exports:** The `Risks` section proposes to "Keep existing export formats, add deprecation notice" for downstream consumers. This contradicts US-6, which explicitly states "No versioned endpoints, no parallel code paths in the generator" and that new files will use the new canonical names. This ambiguity creates a significant risk of misimplementation. | Clarify the exact strategy. The recommended approach is the one from US-6 (hard cutover for new exports), which is simpler and aligns with the project's goal of removing legacy code. The `Risks` section should be updated to reflect this as a communication/documentation risk, not a technical one. |
| **HIGH** | **Potential Data Loss for Re-queued Jobs:** US-5 states that if a re-queued job with an old data payload is processed by a new Python worker, it will be treated as "unscored" and excluded from analysis. This silently drops data that was previously processable. While a technical solution, it may violate business requirements for data fidelity during retries. | The business/product owner must explicitly approve this data loss scenario. A better approach would be for the worker to detect the old format and either fail the job with an "unsupported format" error, or route it to a (temporary) legacy queue for conversion before reprocessing. |
| **MEDIUM** | **Ambiguity in "Invalid" Decision Metadata:** US-3 states that if `decisionMetadata` is "present but invalid", the resolver should return null. It does not define "invalid". This could be a missing `direction`, a null `strength` for a non-neutral direction, or an unexpected enum value. This ambiguity will lead to inconsistent implementation and debugging challenges. | Define "invalid" metadata explicitly in the spec. A valid canonical model requires `direction` and, if the direction is not `neutral`, it must have a valid `strength`. Any deviation from this should be considered invalid. |
| **MEDIUM** | **[UNVERIFIED] Overly Strong Assumption on Code Usage:** US-2 and US-3 make strong claims that certain functions (`decisionBucketCodeToScore`) and database columns (`decisionCode`) are only used in specific, known legacy contexts. While this may be true, it's a risky assumption without a full codebase audit. A seemingly unrelated function could be using these for a different purpose, which would break. | The "Success criteria" `grep` checks are a good backstop. However, the spec should acknowledge this as a key assumption. Consider adding a temporary runtime error/warning in the removed functions (if possible) during a testing phase to catch unexpected callers. |
| **MEDIUM** | **[UNVERIFIED] Critical Architectural Assumption on Worker Data Access:** US-5 is predicated on the assumption that "Python workers receive transcript decision data exclusively via the job queue payload" and never query the database directly. If this assumption is violated anywhere, workers will fetch data that they can no longer process, leading to runtime errors. | This is a major architectural dependency. The spec should flag this as a critical assumption that must be verified. The Python test suite must be reviewed to ensure it does not mock direct DB access in a way that would mask this type of failure. |
| **LOW** | **Weak Mitigation for Stored `scoreCounts`:** The mitigation for stored analysis outputs using the old `scoreCounts` field is to "handle both shapes in the normalizer". This introduces a new, temporary compatibility layer, which runs counter to the project's goal of removing legacy code. It increases complexity and creates a new piece of code that must be tracked and removed later. | A cleaner, though more forceful, solution is to require a data migration. Regenerate and re-save the affected analysis outputs. If this is not feasible, the spec should document the "handle both shapes" normalizer as explicit, short-term technical debt with a scheduled removal date. |

## Residual Risks

| Severity | Risk | Comment |
| :--- | :--- | :--- |
| **MEDIUM** | **Semantic Equivalence Bugs:** The transition from numeric math (`score - 3`) to a discrete mapping in US-1 is a common source of subtle bugs. While "semantically equivalent" is the goal, an off-by-one or sign-flip error in the new logic could corrupt variance analysis results in a non-obvious way. | The success criterion to compare analysis output is good mitigation. This risk can be further reduced by creating a suite of golden-master tests that compare the output of the old and new logic against a comprehensive set of test data, including all edge cases from the canonical mapping table. |
| **LOW** | **[UNVERIFIED] Implicit "Re-import" Feature Breakage:** US-6 assumes that the application never needs to re-parse old, stored export files. If a hidden or informal workflow exists where users re-import or process these files, this change will break it, as all *new* code will expect the canonical format. | This risk is low, as it relies on an unstated feature. However, it's an example of how assumptions about system usage can be fragile. The finding should be communicated to the product owner to confirm no such workflows exist. |
| **LOW** | **Orphaned Transcripts:** The resolver logic in US-3 correctly handles transcripts that have neither `decisionMetadata` nor a valid `decisionCode` by returning `null`. This could slightly decrease the total count of "scorable" transcripts if the previous scattered logic was more lenient. This may be perceived as a regression by users if not communicated. | This is an acceptable and necessary outcome of standardizing the logic. The risk is one of perception. It should be mitigated by documenting this as an expected outcome and, if possible, reporting on how many transcripts (if any) are now considered unscored after the change. |

## Token Stats

- total_input=3450
- total_output=1262
- total_tokens=16992
- `gemini-2.5-pro`: input=3450, output=1262, total=16992

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
