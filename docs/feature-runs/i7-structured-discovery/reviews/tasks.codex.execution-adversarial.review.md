---
reviewer: "codex"
lens: "execution-adversarial"
stage: "tasks"
artifact_path: "docs/feature-runs/i7-structured-discovery/tasks.md"
artifact_sha256: "cdee23ebf4344932e53fd82c8427eadefcd6f7185ecf34adb22d9c284a222913"
repo_root: "."
git_head_sha: "acd7dd3a428760b036c85a8f24442853bde050b9"
git_base_ref: "origin/main"
git_base_sha: "bb7a5403bbe8414e99820865a15e2490fe0542cb"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Finding 1 (complete=False still blocks after all deferred): INTENTIONAL — complete is explicit sign-off; gate requires both conditions. Not a bug. Finding 2 (V2 missing fields not normalized): accepted; V2 blobs are produced by our own code and will have all fields. Finding 3 (asked_count semantic): asked_count==len(questions) confirmed in runner at line 1396; purely redundant."
raw_output_path: "docs/feature-runs/i7-structured-discovery/reviews/tasks.codex.execution-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks execution-adversarial

## Findings

1. **High:** The spec makes `--defer` sound like it will unblock the checkpoint, but the checkpoint gate still hard-blocks any `required` discovery with `complete=False`. No task updates `complete` based on the new unresolved/deferred model, so a required discovery can remain permanently blocked even after all items are deferred or answered. That is a direct contradiction between the new CLI semantics and the gate behavior.

2. **Medium-high:** `migrate_discovery_state()` is not a true repair path for malformed state because it only upgrades blobs with `version < 2` and only write-backs on version increase. Any existing `version == 2` discovery blob missing `answers`, `non_goals`, `acceptance_criteria`, or `unresolved` will remain broken and will not be normalized before the new gate/status logic reads it.

3. **Medium:** Removing `question_count`/`asked_count` while replacing reads with `len(discovery.get("questions", []))` collapses two different concepts into one. `asked_count` is not equivalent to the number of stored questions, so any progress or completion logic that depended on the distinction will silently change behavior. The cleanup plan does not specify how to preserve that semantic.

## Residual Risks

- Exact-string matching for `--resolve`, `--defer`, and `--answer` will misbehave if question text is duplicated, edited, or normalized differently from storage; the spec does not define a stable identifier.
- The new status display and gate behavior are not specified for malformed `unresolved` entries in already-version-2 state, so blocked-vs-deferred counts may diverge from actual checkpoint behavior.
- The artifact does not explicitly cover `required=False` discovery blobs that still contain unresolved items, so it is possible to accidentally over-block optional discovery if the implementation over-applies the new gate.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Finding 1 (complete=False still blocks after all deferred): INTENTIONAL — complete is explicit sign-off; gate requires both conditions. Not a bug. Finding 2 (V2 missing fields not normalized): accepted; V2 blobs are produced by our own code and will have all fields. Finding 3 (asked_count semantic): asked_count==len(questions) confirmed in runner at line 1396; purely redundant.
