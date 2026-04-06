---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/transcript-decision-model-winner-first/spec.md"
artifact_sha256: "f700cf0f8ff2a01f2f962c243cc19a8001231b42c7a373aca172ed2356ac68a3"
repo_root: "."
git_head_sha: "0e47504311b8d1449e7d178bd56e0d23e9a87cf5"
git_base_ref: "origin/fix/conditions-matrix-paired-transcripts"
git_base_sha: "0e47504311b8d1449e7d178bd56e0d23e9a87cf5"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/transcript-decision-model-winner-first/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

1.  **Contradictory Definition of Null Outcomes.** The spec creates a critical ambiguity in how to represent non-winning outcomes. In the `Proposed Decision Shape` table, `favoredValueKey` is `null` for "neutral or unresolved" outcomes. However, the subsequent definition states, "Ambiguous, refused, or unparseable responses do not get forced into neutral. They remain unresolved and are carried as unknown." This is a direct contradiction. The system cannot treat a "neutral" decision (a deliberate choice for the middle) the same as an "unparseable" one (a system failure). This conflation makes it impossible for analysis to distinguish between a model's intentional neutrality and its failure to respond coherently. The `favoredValueKey` field, as defined, cannot support the stated goal.

2.  **Canonical Frame Instability.** The entire strategy relies on a "canonical value order" derived from the vignette definition's `dimensions` order. This assumes the order of elements in the `dimensions` field is immutable. If a user ever edits a vignette and re-orders the `dimensions`, the canonical direction for that `pair_key` will flip, silently poisoning all past and future analysis by misclassifying what `direction` means for every transcript associated with that pair. The spec does not mention any mechanism (e.g., immutability constraints, versioning) to prevent this catastrophic data corruption.

3.  **Vague Legacy Compatibility Path.** The spec asserts that legacy transcripts will remain readable "through the existing compatibility path until consumers are migrated" but fails to define this path. This is a high-risk omission. The analysis layer will have to contain conditional logic (e.g., `if (transcript.favoredValueKey) { ... } else { ... }`) to handle two different data models simultaneously. Without specifying how to derive the new model's concepts from the old model's `decisionCode`, the spec creates a significant implementation gap and a high probability of inconsistent analysis between old and new data.

4.  **Undefined Location of `presentationOrder`.** The spec leaves a critical architectural decision, the storage location of `presentationOrder`, as an "Open Question." This is not a peripheral detail; it is a core requirement for the feature to function. If `presentationOrder` is not stored atomically with the decision, the system risks losing the link between a transcript's outcome and the context in which it was generated, making the intended normalization impossible and defeating the purpose of the feature.

5.  **Downplayed Impact of Changing Totals.** The spec claims to "Keep the existing visible analysis surfaces unchanged" while also noting "totals may change if the prior path was mis-normalizing B-first runs." A change in reported numbers *is* a change to the analysis surface, and likely the most important one to users. The spec is weak on the assumption that this is a non-event. It omits the need for a plan to communicate, validate, and explain these numerical shifts to users, who will perceive them as a significant change to their results.

## Residual Risks

1.  **Migration and Consumer Coordination Risk.** The plan to migrate consumers over time instead of performing a "big bang" backfill introduces a prolonged period of system instability. During this transition, two different data models and two different analysis logics (new vs. compatibility path) will coexist. This creates a high risk of bugs if a data consumer is not correctly identified as "migrated" or "unmigrated," leading to it applying the wrong logic and producing incorrect results.

2.  **Insufficient Error State Representation.** The proposed `favoredValueKey` and `strength` fields do not adequately capture the variety of non-successful outcomes. Beyond "neutral," a transcript can be "ambiguous," "refused," or "unparseable." Forcing all of these into a single `null` state (as per the primary contradiction) loses vital diagnostic information. If this is not addressed, analysis cannot properly account for model failures, which is a key metric.

3.  **Lack of Debuggability.** The "Open Question" about "hidden diagnostics for order-aware counts" should be a requirement. When numerical results in reports inevitably change, there will be an immediate need to trace how the new totals were calculated. Without a tool to expose the raw `favoredValueKey` and the applied `presentationOrder` normalization for a given result, debugging and validating the correctness of the new pipeline will be exceptionally difficult and time-consuming.

## Token Stats

- total_input=13696
- total_output=946
- total_tokens=16344
- `gemini-2.5-pro`: input=13696, output=946, total=16344

## Resolution
- status: open
- note: