---
reviewer: "gemini"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/i7-structured-discovery/plan.md"
artifact_sha256: "dd0d7573b935ab366f5bef64386a57958ea3426045fe7273ea74b299903ee113"
repo_root: "."
git_head_sha: "acd7dd3a428760b036c85a8f24442853bde050b9"
git_base_ref: "origin/main"
git_base_sha: "bb7a5403bbe8414e99820865a15e2490fe0542cb"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Finding 1: --answer semantics fixed: require question exists in questions[], error otherwise. --answer also clears matching item from unresolved[]. Finding 2: --resolve matches against item key of unresolved dict, removes first exact match. Finding 3: migration transforms each questions[] entry into {item: question_text, deferred: false} dict in unresolved[]. Migration write-back uses existing atomic_json_write."
raw_output_path: "docs/feature-runs/i7-structured-discovery/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

1.  **Contradictory CLI Behavior for `--answer` Flag.** The plan's reconciliation notes state "`--answer` requires question already in `questions[]`" but also "upserts otherwise." These are mutually exclusive behaviors. Allowing an "upsert" is architecturally weak: it conflates the act of *defining* a question with *answering* it. This could lead to state pollution if an agent mistypes a question when trying to answer it, creating a new, unintended question entry rather than failing explicitly. The more robust and predictable design is to enforce that a question must exist before it can be answered.

2.  **Ambiguous Resolution and Removal Logic.** The plan specifies that `--resolve` uses an "exact full-string match" to clear an item from the `unresolved` list. However, it fails to define *what* is being matched. An `unresolved` item is a dictionary (e.g., `{"item": "text", "deferred": false}`). The plan should clarify if the match is against the value of the `"item"` key or the string representation of the entire dictionary. Furthermore, it doesn't specify the removal behavior in case of duplicates. If multiple `unresolved` items have the same text, it's unclear if the command would remove the first match or all matches, leading to unpredictable state changes.

3.  **Underspecified Migration Transformation.** Wave 1 states the migration will populate the `unresolved[]` list from the V1 `questions[]` list. However, it omits the crucial detail that items in `unresolved[]` are meant to be dictionaries, not simple strings. If the migration performs a direct copy, it will populate the list with strings, creating a structural inconsistency. The gate logic in Wave 3 (`i.get("deferred")`) would not fail, but it would rely on a fragile default behavior rather than a well-defined structure, making future extensions to the `unresolved` item schema difficult. The migration plan must explicitly state it transforms each question string into a `{"item": "question text", "deferred": false}` dictionary.

## Residual Risks

1.  **Migration Race Condition.** The Wave 2 plan to have the `discovery_state()` function read the state, migrate it in memory, and write it back to disk is vulnerable to a race condition. If two processes access the same V1 state file concurrently, they could both perform the migration and the last process to write its result would overwrite the other, potentially causing data loss if the first process made other changes. While agent-only operation makes this less likely, it is not impossible. The lack of an atomic file lock for the read-migrate-write operation presents a low-probability, high-impact risk.

2.  **Fragility of Text-Based Identifiers.** The plan explicitly accepts the risk of using exact-match text for identifying questions and unresolved items. While acceptable for a V1 agent-operated workflow, this remains a significant architectural weakness. It assumes agent output is infallible. A single typo, an extra space, or a subtle rephrasing by a future LLM version could break the lookup mechanism, creating orphaned answers or preventing unresolved items from being cleared. This design lacks the robustness of using stable, unique IDs.

## Token Stats

- total_input=2216
- total_output=688
- total_tokens=16793
- `gemini-2.5-pro`: input=2216, output=688, total=16793

## Resolution
- status: accepted
- note: Finding 1: --answer semantics fixed: require question exists in questions[], error otherwise. --answer also clears matching item from unresolved[]. Finding 2: --resolve matches against item key of unresolved dict, removes first exact match. Finding 3: migration transforms each questions[] entry into {item: question_text, deferred: false} dict in unresolved[]. Migration write-back uses existing atomic_json_write.
