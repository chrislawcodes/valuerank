---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/i7-structured-discovery/spec.md"
artifact_sha256: "eafa64781cfa17066bfa672f7c6b8e0642c7403adabaf0f162ef49e5a9d6cf3f"
repo_root: "."
git_head_sha: "acd7dd3a428760b036c85a8f24442853bde050b9"
git_base_ref: "origin/main"
git_base_sha: "bb7a5403bbe8414e99820865a15e2490fe0542cb"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "4 findings: migration will populate unresolved from V1 questions when required+incomplete; text-key fragility accepted-limitation; resolve uses exact full-string match; deferred is boolean and skips gate. complete flag clarified: gate is required AND (not complete OR any non-deferred unresolved)"
raw_output_path: "docs/feature-runs/i7-structured-discovery/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

1.  **Unsafe V1->V2 Migration Loopholes.** The most critical flaw is the migration strategy. The spec states `migrate_discovery_state` will add V2 fields with "empty defaults," including `unresolved: []`. This means any V1 `state.json` with existing, unanswered questions will be upgraded to a V2 state with zero unresolved items. This allows all in-flight projects to immediately bypass the new `unresolved[]` gate, completely undermining the feature's core purpose for existing work. A safe migration would populate the new `unresolved` list with all existing questions that lack an answer.

2.  **Brittle Text-Based Identifiers.** The schema relies on the full, exact text of a question to act as its unique key in the `answers` dictionary and for the `--resolve TEXT` command. This is extremely fragile and a significant design weakness. Any minor change to a question's wording, punctuation, or even whitespace during its lifecycle would de-synchronize it from its answer or prevent it from being resolved. This will inevitably lead to state corruption and user frustration.

3.  **Ambiguous and Dangerous `--resolve` Behavior.** The spec defines the `--resolve TEXT` command as working by "text match." This is dangerously ambiguous. It does not specify whether this is a full-string match, a substring search, or a case-sensitive operation. A partial-string match could incorrectly resolve multiple items at once (e.g., `--resolve "API key"` could resolve both "How is the API key stored?" and "What is the API key rate limit?"). This ambiguity makes the command's behavior unpredictable and unreliable.

4.  **Undefined `deferred` State.** The schema for an `unresolved` item is `{item, reason, deferred}`, but the spec provides no definition or handling for the `deferred` field. It's unclear if this is a boolean, a string (e.g., a ticket ID), or how setting it affects the checkpoint gate. An item that is `deferred` is still technically unresolved; the enforcement logic needs to explicitly account for this state.

## Residual Risks

1.  **Poor CLI Ergonomics.** Requiring users to provide the full, exact text of a question for the `--answer` and `--resolve` commands creates a poor user experience. Users will be forced to copy-paste long strings, which is inefficient and error-prone. A more robust solution would use numerical IDs or a guided interactive prompt to select the item to act upon.

2.  **Inconsistent State Is Possible.** The design does not prevent an item from existing simultaneously in the `unresolved` list and having an entry in the `answers` dictionary. This can lead to a confusing state where a question appears both answered and unresolved, potentially causing inconsistent behavior in status reporting and gate logic.

3.  **Purpose of `complete` Flag Is Now Unclear.** With the introduction of a hard `unresolved[]` gate, the role of the original `complete` flag becomes ambiguous. The spec states both must be satisfied, but an agent could set `complete: true` while many items are still in the `unresolved` list. This creates a confusing dual state and diminishes the clarity of what "complete" signifies. The spec should clarify the new role for this flag or plan for its deprecation.

## Token Stats

- total_input=1925
- total_output=702
- total_tokens=16223
- `gemini-2.5-pro`: input=1925, output=702, total=16223

## Resolution
- status: accepted
- note: 4 findings: migration will populate unresolved from V1 questions when required+incomplete; text-key fragility accepted-limitation; resolve uses exact full-string match; deferred is boolean and skips gate. complete flag clarified: gate is required AND (not complete OR any non-deferred unresolved)
