---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/domain-analysis-value-detail-v2/spec.md"
artifact_sha256: "7b8e85d379ec35da5826aca1b66f524b349dcc74914a62257040b3e64b577661"
repo_root: "."
git_head_sha: "68c62f1df7559ce9326bc9d7d9779ab267cc1b05"
git_base_ref: "origin/main"
git_base_sha: "582439e4dacd359753f381970c9cd8c7351e393f"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Resolved by defining matrix label derivation, mixed-data failure behavior, and the canonical-only page contract."
raw_output_path: "docs/feature-runs/domain-analysis-value-detail-v2/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

1.  **Failure Handling is Vague and Potentially Harmful.** The spec requires the page to "fail loudly," but doesn't define the failure mode. If a single transcript in a set of hundreds is non-renderable, crashing the entire page with a thrown error is a poor user experience and effectively a self-inflicted denial of service. The failure mode should be granular, isolating the error to the smallest possible component (e.g., replacing the specific broken transcript with an error message) rather than bringing down the whole page.

2.  **The "Renderable" Guard is Too Permissive.** The definition of a "renderable" transcript relies on the existence of keys (`decisionModelV2`, `raw`, `canonical`) and satisfaction of "existing checks." This is a weak assumption. An adversarial payload could have `{}` (empty object) or `null` values for these keys. The guard must be much stricter, explicitly validating not just the presence but the *type and content* of critical fields (e.g., `direction` is a non-empty string, `strength` is a number, value-keys are valid identifiers, nothing is `null` or `undefined`).

3.  **Validation is Not Context-Aware.** The spec focuses on validating the *structure* of a single transcript but misses validating its *semantic context*. A transcript could be perfectly "renderable" according to the proposed guard, but contain `decisionModelV2` data for a `ValueA-vs-ValueB` conflict while being part of the dataset for a `ValueC-vs-ValueD` matrix cell. The system would render it without error, presenting fundamentally incorrect data to the user. Validation must occur at the condition-level, ensuring all transcripts within that group are semantically consistent with the condition they represent.

4.  **Error Detection Occurs Too Late.** The spec states that "mixed renderable/non-renderable transcript sets" should be treated as an error "for the selected condition." This implies the check happens *after* a user clicks on a matrix cell. This is too late. The user is presented with a UI that appears valid, only to have it fail upon interaction. Data integrity for the entire matrix should be validated *before* rendering, and any cell with inconsistent or non-renderable data should be visually marked as such (e.g., 'Error', 'N/A') from the start.

5.  **Field Blacklisting is Brittle.** Prohibiting a specific list of legacy field names (`decisionCode`, etc.) is a fragile, blacklist-style approach. A developer could easily introduce a new legacy fallback using a different field name, or a subtle bug could pull from an unexpected source. The spec should mandate a whitelist approach: define a strict, canonical `decisionModelV2`-only data type for the page and explicitly reject any and all data that does not conform to it.

## Residual Risks

1.  **Ambiguous Matrix UI.** The spec collapses two distinct states—"empty" (no transcripts for this condition) and "tied" (an equal number of wins for each value)—into a single `-` label. This conflates "no data" with "conflicting data," potentially misleading an analyst about the underlying results. These two states should have distinct visual representations.

2.  **Incomplete Test Specification.** The acceptance criteria call for testing the happy path and the guard path, but do not explicitly require testing against the adversarial cases noted here: `null`/`undefined`/empty-object payloads, semantically invalid data that is structurally valid, or data type mismatches (e.g., `strength: "5"` as a string). The feature could meet the letter of the spec's ACs but remain vulnerable to these edge cases.

3.  **Deeply Nested Fallbacks Remain Hidden.** The scope is limited to specific files. It's possible for a generic, low-level utility function or component used by the page—but not listed in the scope—to contain its own silent, legacy fallback logic. Without a full dependency audit, removing fallbacks only at the top level of the page may not be sufficient to harden the entire feature.

## Token Stats

- total_input=1537
- total_output=877
- total_tokens=15149
- `gemini-2.5-pro`: input=1537, output=877, total=15149

## Resolution
- status: accepted
- note: Resolved by defining matrix label derivation, mixed-data failure behavior, and the canonical-only page contract.
