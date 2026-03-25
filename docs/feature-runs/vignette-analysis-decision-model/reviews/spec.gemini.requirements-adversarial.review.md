---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/vignette-analysis-decision-model/spec.md"
artifact_sha256: "bcb7cbf2c3dd2bec4a0dd03de8d94a0850d5b05d16ac67e587bebf14deaa493d"
repo_root: "."
git_head_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "fce47f73a2542524b87e0bbf199703aaf9f3c4c6"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Added canonical-first override fields, explicit direction-plus-strength contract wording, and fail-closed parse and compatibility rules."
raw_output_path: "docs/feature-runs/vignette-analysis-decision-model/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

1.  **Critical: Project Convention Violation.** The spec repeatedly uses the term "definition" (e.g., "transcript definition snapshot") when referring to vignettes. This directly violates the project's canonical terminology specified in `GEMINI.md` and `docs/canonical-glossary.md`, which mandates using `vignette` instead of `definition`. Adherence to the canonical glossary is a core project principle.

2.  **High: Type Contract Allows Invalid States.** The `CanonicalDecision` and `manualOverride.appliedDecision` types permit logically inconsistent states, such as `{ direction: 'favor_first', strength: 'neutral' }`. The spec lists the valid pairings under "Required behavior," but the type definition itself should enforce this constraint. A discriminated union would make invalid states unrepresentable at the type level, significantly strengthening the contract and preventing an entire class of potential bugs.

3.  **Medium: Confusing `LegacyDecisionCompat` Contract.** The distinction between `rawScore` and `canonicalScore` is ambiguous. The name `rawScore` implies it's an original, unprocessed value, yet the spec states it can be *derived* from the `CanonicalDecision` during a manual override. This introduces confusion and could lead to implementation errors or incorrect assumptions by future developers about data provenance. The rules for their generation and their relationship in edge cases (e.g., when they might conflict) need clarification.

4.  **Medium: Incomplete `parseClass` Enum.** The `RawDecisionEvidence.parseClass` enum is missing a `'manual'` variant. The spec describes manual overrides as the highest-precedence conversion rule and even suggests a `parsePath` of `manual.override`, but there is no corresponding `parseClass` to classify the evidence itself as manually authored. This is an omission that weakens the auditability and classification of the raw evidence.

5.  **Low: Ambiguity in Handling Legacy Data.** The spec does not explicitly define how to handle legacy transcripts that have non-numeric, string-based `decisionCode` values (e.g., `"AMBIGUOUS"`). The rules cover valid numeric scores and nulls, but this case is omitted, leaving its implementation open to interpretation.

## Residual Risks

1.  **Tight Coupling to `parsePath` String Format.** The adapter's logic for determining direction and strength relies on parsing the `parsePath` string (e.g., `exact.favor_first.strong`). This creates a brittle dependency. While `parserVersion` helps identify the source, a future change to the `parsePath` format in the parser worker would break the decision adapter. The contract is coupled to another component's implementation detail, not a formal interface.

2.  **Undefined Constraints on Manual Overrides.** The `manualOverride` object in `RawDecisionEvidence` includes `overriddenByUserId`, but the spec doesn't state whether this field is required. If `null` is permitted, it would be possible to have unattributed manual decisions in the system, weakening the audit trail that the feature is designed to create.

3.  **No Protection Against Stale Metadata.** The spec correctly states that the adapter should use the value registry snapshot attached to the vignette. However, it's a risk that an implementation could mistakenly resolve against the *live* value registry. While the spec intends the correct behavior, the risk of implementation error is non-trivial and should be explicitly highlighted in test cases that ensure a stale vignette snapshot resolves against its own attached registry, not the current one.

## Token Stats

- total_input=15317
- total_output=743
- total_tokens=19188
- `gemini-2.5-pro`: input=15317, output=743, total=19188

## Resolution
- status: accepted
- note: Added canonical-first override fields, explicit direction-plus-strength contract wording, and fail-closed parse and compatibility rules.
