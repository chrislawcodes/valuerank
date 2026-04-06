---
reviewer: "gemini"
lens: "requirements-adversarial"
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
raw_output_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | Finding | Details |
| :--- | :--- | :--- |
| **CRITICAL** | **Data Regression in Resolver Fallback Logic** | **US-3** introduces a critical data regression risk. The spec states the resolver "falls back to `decisionCode` only when `decisionMetadata` is absent." If a transcript has both *malformed* `decisionMetadata` and a valid legacy `decisionCode`, the new logic would return `null` (unscored), whereas it was likely scorable before. The fallback should trigger if `decisionMetadata` is absent OR invalid, preventing transcripts from losing their scored status. |
| **HIGH** | **"Semantic Equivalence" in Variance Analysis is Unproven** | **US-1** claims replacing the 1-5 score with a new distance mapping will produce "semantically equivalent" results. This claim is based only on replacing distance calculations (`score - 3`) and ignores how other statistical measures (e.g., variance, standard deviation) will be affected by a change from a quasi-interval scale (1-5) to a purely categorical/ordinal one. The spec provides no rigorous verification strategy, risking subtle and incorrect changes to stability metrics. |
| **MEDIUM** | **Breaking Change to Export Consumers is Undermitigated** | **US-6** mandates a breaking change to the schema of generated export files by renaming columns. The proposed mitigation is a "deprecation notice" with "no versioned endpoints." This is insufficient for automated consumers, which will fail. The assumption that downstream systems can immediately adapt without a transition period (e.g., via API versioning or temporary redundant columns) is weak and likely to cause external integration failures. |
| **MEDIUM** | **[UNVERIFIED] Python Worker Isolation Assumption** | **US-5**'s safety relies on the assumption that Python workers *never* query the database directly for decision data. This is presented as a hard "Data boundary." If this is merely a convention and not an enforced architectural constraint, any existing workflow, script, or debug process that violates it will break when it encounters an old transcript that now depends on the TypeScript resolver's fallback logic. |
| **LOW** | **Ambiguous Definition of "Invalid" Metadata** | **US-3** states that if `decisionMetadata` is "present but invalid," the resolver should return null. The definition of "invalid" is not provided. This could mean anything from a missing `direction` field to an incorrect enum value. This ambiguity could lead to inconsistent implementation and makes it difficult to reason about the exact behavior of the critical resolver fallback logic. |

## Residual Risks

Even if all findings above are addressed, the following risks are inherent in the proposed strategy and should be acknowledged:

| Risk | Description |
| :--- | :--- |
| **Permanent Tech Debt from Fallback Logic** | By explicitly scoping out the backfilling of old transcripts, the fallback logic in `resolveTranscriptDecisionModel` to handle `decisionCode` becomes a permanent fixture. This adds long-term maintenance overhead and increases the cognitive load for developers, as they must always account for two different decision models in what should be a single, unified system. |
| **Incomplete Verification via `grep`** | The success criteria's reliance on `grep` to ensure all legacy code is removed is unreliable. It will not detect dynamic property access, string-based property construction, or aliased types. While a full test suite provides better coverage, this approach risks leaving behind subtle bugs that manifest only when a specific data shape hits a specific, un-tested code path. |
| **Frontend Normalizer Complexity** | The proposed mitigation for handling `scoreCounts` in old stored analysis ("handle both shapes in the normalizer") introduces state-dependent branching into the frontend data layer. This temporary fix adds complexity and, if not explicitly scheduled for removal with a tracking ticket, is at high risk of becoming permanent tech debt. |

## Token Stats

- total_input=14133
- total_output=832
- total_tokens=17887
- `gemini-2.5-pro`: input=14133, output=832, total=17887

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
