---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/feature-runs/i7-structured-discovery/tasks.md"
artifact_sha256: "cdee23ebf4344932e53fd82c8427eadefcd6f7185ecf34adb22d9c284a222913"
repo_root: "."
git_head_sha: "acd7dd3a428760b036c85a8f24442853bde050b9"
git_base_ref: "origin/main"
git_base_sha: "bb7a5403bbe8414e99820865a15e2490fe0542cb"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Finding 1 (dirty V2 not cleaned): Wave 4 handles count field removal from new writes; migration skips V2 by design. Finding 2 (deferred type check): using i.get('deferred') is not True for strict boolean check. Finding 3 (complete field string type): gate uses explicit bool() cast. Finding 4 (answer overwrite): upsert is intended behavior. Finding 5 (missing gate malformed test): added to Task 3.4."
raw_output_path: "docs/feature-runs/i7-structured-discovery/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

1.  **Migration Does Not Clean Up "Dirty" V2 Objects:** The `migrate_discovery_state` function is designed to be idempotent by immediately returning if `d.get("version", 1) >= 2`. However, this means if a V2 state object contains deprecated V1 fields (e.g., `question_count`), the migration will not remove them (as specified in Task 4.3). This allows for inconsistent object shapes in the system, where some V2 objects are clean and others are not.
2.  **Gate Logic Makes Weak Assumptions About Data Types:** The `command_checkpoint` gate (Task 3.1) and `recommended_next_action` (Task 3.2) check for deferred items using `not i.get("deferred", False)`. This correctly handles missing keys and `False` values. However, if the `deferred` key holds a non-boolean value from a manual edit (e.g., a string `"true"` or an integer `1`), the `not` operator's truthiness evaluation may lead to unexpected behavior (e.g., `not "true"` is `False`, correctly treating it as deferred, but `not ""` is `True`, incorrectly treating it as blocking). A stricter check like `i.get("deferred") is not True` would be more robust against malformed data.
3.  **Migration Assumes Correct Types for V1 Data:** The migration logic in Task 1.2 correctly sanitizes the `questions` and `unresolved` fields if they are not lists. However, it implicitly trusts the types of other V1 fields. For example, if `d.get("complete")` returns a string `"false"` instead of a boolean `False`, it will be treated as `True` when evaluating whether to populate the `unresolved` list from V1 questions. This could cause the migration to skip a critical step based on malformed input.
4.  **Implicit Answer Overwriting:** The implementation for the `--answer` flag (Task 2.3) stores an answer via `discovery["answers"][QUESTION] = ANSWER`. This will silently overwrite any existing answer for that question. While this may be the intended behavior, the task description does not specify how to handle pre-existing answers, creating ambiguity.
5.  **Missing Test Coverage for Malformed `unresolved` Gate Check:** The test plan for the checkpoint gate (Task 3.4) covers key logical paths but omits testing how the gate behaves with malformed entries in the `unresolved` list (e.g., `["a string"]`, `[{"wrong_key": "value"}]`). While the proposed list comprehension in Task 3.1 appears to handle these cases gracefully by ignoring them, the lack of an explicit test means this robustness is unverified.

## Residual Risks

1.  **State Desynchronization on Write Failure:** The `discovery_state` function (Task 2.1) reads a file, migrates its content, and writes it back to disk if changes occurred. This write operation is a side effect in a function that primarily acts as a getter. If the `atomic_json_write` fails (e.g., due to permissions, disk full), the function returns the successfully migrated in-memory state, but the on-disk state remains outdated. Subsequent calls will repeatedly and inefficiently attempt the same failing migration and write, and other processes reading the file will see stale data.
2.  **Duplicate `unresolved` Items from V1 Migration:** The logic to populate `unresolved` from V1 `questions` (Task 1.2) checks against items already in the `unresolved` list to prevent duplicates. However, it does not prevent duplicate questions from the V1 `questions` list from being added. If `questions` contained `[{"question": "Q1"}, {"question": "Q1"}]`, the `unresolved` list would become `[{"item": "Q1"}, {"item": "Q1"}]`.
3.  **CLI Command Failure on Duplicate `item` Text:** The instructions for `--resolve` and `--defer` (Task 2.3) state to "Find first entry" and act upon it. If the `unresolved` list contains items with duplicate text, the CLI will only ever operate on the first one found, leaving no way to interact with subsequent identical items.

## Token Stats

- total_input=4118
- total_output=936
- total_tokens=19306
- `gemini-2.5-pro`: input=4118, output=936, total=19306

## Resolution
- status: accepted
- note: Finding 1 (dirty V2 not cleaned): Wave 4 handles count field removal from new writes; migration skips V2 by design. Finding 2 (deferred type check): using i.get('deferred') is not True for strict boolean check. Finding 3 (complete field string type): gate uses explicit bool() cast. Finding 4 (answer overwrite): upsert is intended behavior. Finding 5 (missing gate malformed test): added to Task 3.4.
