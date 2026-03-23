---
reviewer: "gemini"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/feature-runs/i7-structured-discovery/tasks.md"
artifact_sha256: "cdee23ebf4344932e53fd82c8427eadefcd6f7185ecf34adb22d9c284a222913"
repo_root: "."
git_head_sha: "acd7dd3a428760b036c85a8f24442853bde050b9"
git_base_ref: "origin/main"
git_base_sha: "bb7a5403bbe8414e99820865a15e2490fe0542cb"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Findings 1,3 (flag order, race condition): accepted for single-agent CLI. Finding 2 (migration idempotency): scenario requires manual V1 JSON editing while using V2 CLI; accepted-limitation. Finding 4 (error messages): --resolve/--defer errors will list current unresolved items, consistent with --answer. Finding 5 (whitespace question text): filter with text.strip() in migration. Finding 6 (vague test scope): lines specified."
raw_output_path: "docs/feature-runs/i7-structured-discovery/reviews/tasks.gemini.dependency-order-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

1.  **Critical: Ambiguous State from Competing CLI Flags.** In `Task 2.3`, the order of processing for new CLI flags (`--unresolved`, `--resolve`, `--defer`, `--answer`) is undefined. If a user runs a single command like `... discover --unresolved "Q1" --resolve "Q1"`, the final state of the `unresolved` list is unpredictable, as it depends entirely on the implementation's `if/elif` order for argument processing. This can lead to non-deterministic state corruption.

2.  **Severe: Migration Idempotency Flaw.** The migration logic in `Task 1.2` has a flaw that breaks idempotency in a specific edge case. It populates `unresolved` from `questions` if the blob is V1 and incomplete. If a user resolves an item, and then an older version of the tool adds a new question to the same V1 blob, the next time migration runs it will re-populate the `unresolved` list with all original questions, including the one that was already resolved, because it only checks for the item's current existence, not its history. This resurrects resolved items, undermining the system's integrity.

3.  **Major: Lost Update Risk on Migration.** The read-migrate-writeback mechanism in `Task 2.1` is not atomic. If two processes read the same V1 state file around the same time, they will both migrate it in memory. Process A may write its migrated V2 state, and then Process B will overwrite that file with its own migrated V2 state, potentially discarding any other changes that occurred between its read and write. `atomic_json_write` prevents file corruption but does not prevent this "lost update" race condition.

4.  **Moderate: Inconsistent and Unhelpful Error Handling.** `Task 2.3` specifies that `--resolve` and `--defer` should "print error and exit" if the target item is not found. This is inconsistent with the behavior for `--answer`, which helpfully lists available questions on failure. This provides a poor user experience, forcing users to run a separate `status` command to debug a typo, when the tool could provide the necessary context immediately.

5.  **Minor: Weak Input Sanitization in Migration.** The logic in `Task 1.2` to populate `unresolved` items from V1 questions (`text = q.get("question", "")`) does not account for questions that are empty or consist only of whitespace. The `if text:` check will pass, adding junk data to the `unresolved` list which may be difficult for a user to target and remove via CLI flags.

6.  **Minor: Vague Test Update Scope.** `Task 2.4` instructs to update "Any discover mutation tests", which is an imprecise and risky requirement. It relies on the developer's diligence to find all relevant tests, creating a high probability that a V1-dependent test case will be missed, leading to a brittle test suite that fails unexpectedly on unrelated changes.

## Residual Risks

1.  **Duplicate `unresolved` Items:** The logic for `--unresolved` checks if an item with the same text exists before adding it. However, `--answer` removes the *first* match, and `--resolve`/`--defer` also target the *first* match. If a duplicate entry were to enter the system through a bug or manual edit, the CLI provides no mechanism to disambiguate or remove the subsequent duplicates. This is a weak assumption about the state's purity.

2.  **Pedagogical Ordering:** The task waves are ordered by dependency, but not optimally for implementation. `Task 3.3` (updating the `status` command to display the new state) should be part of Wave 2. Implementing the gating logic (`Task 3.1`, `3.2`) without a way to see the state that is being gated (`unresolved` items) makes verification difficult and error-prone for the developer implementing the changes.

3.  **Future Migration Brittleness:** The cleanup in Wave 4 removes `question_count` and `asked_count` by adding `.pop()` to the migration script. While this works, it adds to the complexity of a single, monolithic migration function. If a `v3` is ever needed, this function will become increasingly convoluted and fragile. A better pattern would be a series of discrete migration functions (e.g., `_migrate_v1_to_v2`, `_migrate_v2_to_v3`) that are chained together.

## Token Stats

- total_input=4120
- total_output=974
- total_tokens=19396
- `gemini-2.5-pro`: input=4120, output=974, total=19396

## Resolution
- status: accepted
- note: Findings 1,3 (flag order, race condition): accepted for single-agent CLI. Finding 2 (migration idempotency): scenario requires manual V1 JSON editing while using V2 CLI; accepted-limitation. Finding 4 (error messages): --resolve/--defer errors will list current unresolved items, consistent with --answer. Finding 5 (whitespace question text): filter with text.strip() in migration. Finding 6 (vague test scope): lines specified.
