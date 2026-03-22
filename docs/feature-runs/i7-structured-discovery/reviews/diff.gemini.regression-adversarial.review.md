---
reviewer: "gemini"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/feature-runs/i7-structured-discovery/reviews/implementation.diff.patch"
artifact_sha256: "c5bac998c3e5564afa9dd59438661cb7f5d19e4720025e0238a878eb1e9c30db"
repo_root: "."
git_head_sha: "1310e207293440894fe2a6092ff537d450c8a993"
git_base_ref: "origin/main"
git_base_sha: "bb7a5403bbe8414e99820865a15e2490fe0542cb"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "shallow-copy safe in Wave 1 (no nested mutation). Codex crash findings fixed: version type guard, non-string question guard, unhashable item guard added. Dedup casing deferred to Wave 2."
raw_output_path: "docs/feature-runs/i7-structured-discovery/reviews/diff.gemini.regression-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

1.  **Risk of Unintended Mutation via Shallow Copy:** The migration function uses `d = dict(d)` to create a copy of the input dictionary. This is a *shallow copy*. If any values in the dictionary are mutable objects (like lists or other dicts), they will be shared between the original V1 dictionary and the new V2 dictionary. For example, if the `assumptions` list is modified in the returned V2 dictionary, the original V1 dictionary will also be mutated. This breaks the expectation of a safe, non-destructive migration and could lead to hard-to-debug side effects elsewhere in the application. Using `copy.deepcopy()` would provide better isolation.

2.  **Silent Data Loss in Sanitization:** The migration logic for the `unresolved` field (`d["unresolved"] = [item for item in existing_unresolved if isinstance(item, dict) and "item" in item]`) silently discards any pre-existing entries that are malformed (e.g., strings, or dicts without an `"item"` key). In a data migration context, silent data loss is dangerous. A more robust approach would be to log a warning or move malformed entries into a separate `_malformed_unresolved` field for later inspection, rather than deleting them permanently.

3.  **Incomplete Deduplication of Questions:** The logic to populate `unresolved` from `questions` prevents duplicates based on the exact stripped text of the question. However, it does not normalize for case or internal whitespace. This could result in functionally duplicate unresolved items like `"what is the goal?"` and `"What is the goal?"`, polluting the final state.

## Residual Risks

1.  **Untested Migration Scenarios:** The test suite is comprehensive but misses a few key adversarial cases:
    *   **V1 State with Mixed Content:** There is no test for a V1 object that contains *both* a pre-existing `unresolved` list and a `questions` list where the content overlaps. While the current implementation appears to handle this correctly, the lack of a dedicated test makes the behavior vulnerable to regressions during future refactoring.
    *   **Shallow Copy Side Effects:** The tests do not check for the mutation risk described in Finding #1. A test that modifies a list in the migrated output and then asserts that the original input remains unchanged would have caught this flaw.

2.  **Integration Point Assumption:** A test in `RepairDecisionTests` was updated to assert `discovery["version"] == 2`. This confirms that *newly generated* discovery states are V2. However, this implicitly assumes that all code paths that *read* discovery states will now correctly handle V2 or transparently migrate V1. The risk is that another part of the system might read an old V1 state file from disk, not use the migration function, and fail due to the missing V2 fields. A full regression would require auditing all consumers of this state object, not just its producers.

## Token Stats

- total_input=15847
- total_output=632
- total_tokens=19290
- `gemini-2.5-pro`: input=15847, output=632, total=19290

## Resolution
- status: accepted
- note: shallow-copy safe in Wave 1 (no nested mutation). Codex crash findings fixed: version type guard, non-string question guard, unhashable item guard added. Dedup casing deferred to Wave 2.
