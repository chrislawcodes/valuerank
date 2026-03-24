---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/vignette-analysis-decision-model/spec.md"
artifact_sha256: "bcb7cbf2c3dd2bec4a0dd03de8d94a0850d5b05d16ac67e587bebf14deaa493d"
repo_root: "."
git_head_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Clarified orientation normalization, label resolution, and error-versus-unknown behavior for canonical decisions."
raw_output_path: "docs/feature-runs/vignette-analysis-decision-model/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

The review focuses on identifying potential edge cases, ambiguities, and failure modes in the specification. Findings are ordered by severity, from most to least critical.

1.  **Critical Flaw in Manual Override Logic Regarding Orientation:** The spec defines `manualOverride` as the highest level of precedence. However, it does not specify how overrides interact with `orientation_flipped` normalization. A user performing a manual override is likely acting on the vignette as they saw it presented, which may have a flipped orientation. If the `appliedDecision` is stored as-is without accounting for the presentation orientation, and the normalization logic is bypassed (as "authoritative" implies), the override will be recorded incorrectly. The system must define whether the `appliedDecision` is relative to the canonical pair order or the presented pair order, and ensure the adapter handles it correctly. The current spec leaves this ambiguous, risking silent data corruption for all manually overridden, orientation-flipped transcripts.

2.  **Missing Validation for Matched Labels:** Under `Label resolution`, the spec mandates that `matchedLabel` must resolve to a canonical value key. It fails to require a subsequent check: that the resolved key must be one of the two values (`valueA` or `valueB`) in the specific vignette's value-pair. Without this check, a parser could mis-classify a response, matching a valid but unrelated value (e.g., finding the label "Security" in a vignette about "Tradition" vs. "Freedom"). The adapter would then incorrectly populate `favoredValueKey` with "Security", creating a nonsensical decision record that violates the vignette's core value conflict.

3.  **Ambiguous Derivation of `rawScore` in Legacy Compatibility:** The definition for `rawScore` is complex and has multiple potential failure modes. The rule states: "if manual override supplies only canonical data, the adapter derives `rawScore` from the compatibility mapping; otherwise it is `null`."
    *   What if the manual override is `direction: 'unknown'`? The compatibility mapping shows this results in a `null` `canonicalScore`. The spec should explicitly confirm `rawScore` would also be `null` in this case.
    *   The rule for non-override cases is not stated. It should clarify that for deterministic conversions, `rawScore` is derived from `canonicalScore` using the same compatibility mapping.
    *   It's unclear how pre-existing non-numeric legacy `decisionCode` values (e.g., "neutral", "ambiguous") should be handled. The spec should explicitly state they map to a `null` `rawScore`.

4.  **Inconsistent States in `manualOverride.appliedDecision`:** The spec requires the adapter to return `source: 'error'` if `appliedDecision` is "internally inconsistent." However, it doesn't cover the case where `appliedDecision` itself is present, but its internal fields are `null` (e.g., `{ direction: null, strength: null, ... }`). This could be a valid state representing a "reset to unknown" override. The spec should clarify if this is a supported use case or if it should be treated as an error.

5.  **Undefined "Runtime Failure" for `source: 'error'`:** The spec assigns `source: 'error'` for malformed input or a "runtime failure." This is too vague. A transient network error while fetching pair metadata is a runtime failure, but retrying might succeed. Malformed input is a permanent failure. The adapter's error handling needs to be more granular. It should be specified whether `source: 'error'` is reserved for permanent, unrecoverable data integrity issues with the input, versus transient environmental problems which should likely throw an exception to be handled by the caller.

## Residual Risks

These are risks acknowledged by the spec's scope, or downstream risks created by this phase, that should be explicitly tracked.

1.  **User Error in Manual Overrides:** The most significant residual risk is that this phase provides the mechanism for manual overrides without the corresponding UI/UX. The logic for an override is complex (especially concerning orientation). There is a high probability that when the UI is built, users will misinterpret the context and submit incorrect `appliedDecision` data, leading to flawed "golden" records. The team implementing the override UI must be made aware of the critical need to display the canonical pair order and orientation context clearly.

2.  **Permanent Provenance Loss for Legacy Data:** By design, all data processed before this change will be marked with `source: 'unknown'`. This represents a permanent loss of information. While likely unavoidable, it's a systemic risk to data quality, as it will be impossible to distinguish between a pre-phase-1 `exact` parse and an `unparseable` one without re-analyzing the raw text.

3.  **Feature Flag Discipline:** The introduction of the `decision_model_v2` flag creates a point of failure. If it is enabled prematurely before consumer surfaces are migrated, existing logic that does not expect the new `CanonicalDecision` shape (or its potential `null`/`unknown` values) could fail in subtle ways, leading to runtime errors or incorrect calculations in production. Strict discipline will be required during the rollout phases.

## Token Stats

- total_input=3432
- total_output=1111
- total_tokens=18761
- `gemini-2.5-pro`: input=3432, output=1111, total=18761

## Resolution
- status: accepted
- note: Clarified orientation normalization, label resolution, and error-versus-unknown behavior for canonical decisions.
