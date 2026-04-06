---
reviewer: "gemini"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/vignette-analysis-decision-model/plan.md"
artifact_sha256: "318014dd758efdb309ddbda0bbce43cd02cda01054b15491f5af8262cab744aa"
repo_root: "."
git_head_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "The plan intentionally anchors the phase-1 adapter in the API GraphQL domain module, while later phases reuse it through service wrappers and server-side boundaries rather than direct cross-language import. The failure/provenance contract is now explicit in the plan, so the remaining concerns are architectural follow-on risks, not blockers for this checkpoint."
raw_output_path: "docs/workflow/feature-runs/vignette-analysis-decision-model/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

1.  **Permanent Data Bifurcation:** The plan accepts that historical data without pair/orientation metadata will remain "undecodable canonically." The mitigation is to preserve a legacy compatibility path. This is presented as closing a "coverage gap" but is more severe: it creates a permanent schism in the data model. All future consumers (reporting, analysis, UI) will be forced to build and maintain dual-logic paths—one for rich canonical data and one for sparse legacy data. This significantly increases the architectural complexity and maintenance burden of all downstream features, a cost not fully accounted for in the plan.

2.  **Implicit Trust in Upstream Parser:** The entire decision model is an adapter that sits downstream of an unspecified parser which produces `RawDecisionEvidence`. The plan assumes the parser's output and its semantic meaning (e.g., what constitutes a `fallback_resolved` path) are stable. There is no contract, versioning, or schema enforcement on the evidence itself. A future change in the parser's logic could silently alter the inputs to the canonical model, leading to a drift in meaning without breaking the adapter's own tests.

3.  **Complexity of "Favored vs. Opposed" Derivation:** The plan notes that `favoredValueKey` vs. `opposedValueKey` is "derived from the parse branch and orientation metadata." This introduces a new, complex layer of business logic that is a prime candidate for subtle bugs. An error in this derivation would create fundamentally incorrect canonical decisions that might not be caught by unit tests, which would only verify that the derivation logic itself is executing as coded, not that the meaning is correct. The risk of getting this interpretation wrong is high.

4.  **Incomplete Audit Trail for Manual Overrides:** The plan specifies storing only the `previousDecisionCode` upon override. This is insufficient for a true audit trail. It doesn't capture a history of multiple sequential overrides, obscuring the full decision-making process. For an audited system, losing this history is a significant flaw, even for a V1 implementation. It prevents accurately replaying the state changes a transcript has gone through.

5.  **Undefined Source of Truth for Override Validity:** The plan mitigates the risk of inconsistent manual overrides by adding negative tests. However, it fails to specify the canonical source of truth that defines a "valid" or "consistent" override. Without referencing a spec (e.g., in `docs/valuerank_prd.yaml`), the tests will simply enforce their own assumptions, creating a risk that the implementation's rules diverge from the intended system-wide semantics.

## Residual Risks

1.  **Long-Term Maintainability Debt:** The choice to not migrate or backfill metadata for historical rows means the `LegacyDecisionCompat` path is not a temporary bridge but a permanent architectural fixture. The project will forever pay a tax in development time, testing, and cognitive overhead for every feature that needs to handle vignette analysis, as it must always account for two different data shapes and semantic levels.

2.  **Silent Semantic Drift:** The lack of a schema or versioning contract with the upstream parser is a critical vulnerability. The "canonical" model's meaning is not self-contained but dependent on an external component's implementation details. A seemingly unrelated change to the parser in the future could silently poison the canonical data, leading to incorrect analyses that are trusted as authoritative.

3.  **Black-Box Logic Risk:** The derivation of favored/opposed values is a new, mission-critical piece of logic. If it is not perfectly specified and its edge cases exhaustively documented and tested, it risks becoming a "black box" that no developer can confidently modify. This concentrates risk in a single, complex function and makes future evolution of the model brittle and dangerous.

## Token Stats

- total_input=1993
- total_output=793
- total_tokens=16409
- `gemini-2.5-pro`: input=1993, output=793, total=16409

## Resolution
- status: accepted
- note: The plan intentionally anchors the phase-1 adapter in the API GraphQL domain module, while later phases reuse it through service wrappers and server-side boundaries rather than direct cross-language import. The failure/provenance contract is now explicit in the plan, so the remaining concerns are architectural follow-on risks, not blockers for this checkpoint.
