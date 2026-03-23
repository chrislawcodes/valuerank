---
reviewer: "gemini"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/feature-runs/i7-wave2-runner-extension/reviews/implementation.diff.patch"
artifact_sha256: "33b415e439225716d3f4adcdeecab1e33fcdfe56eaabe8427415d30f269339e7"
repo_root: "."
git_head_sha: "123d8a6ef3d72b14f018f369abb56ff9129d5276"
git_base_ref: "origin/main"
git_base_sha: "1bc92c5502d64397cd53f28fed52f4f58ff07934"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Round 3 findings: migration idempotent and well-tested (Wave 1, 13 tests). _safe_list() defensive loading added. Resolve/defer duplicate inconsistency deferred. Silent no-op deferred to Wave 4."
raw_output_path: "docs/feature-runs/i7-wave2-runner-extension/reviews/diff.gemini.regression-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

Here is a regression-adversarial review of the artifact. The findings are ordered by severity.

### 1. **High Severity: Forward-Compatibility Safety Net Removed**

The most critical issue is the removal of the discovery state version check:

```diff
-    if discovery.get("version", 1) \!= 1:
-        print(f"workflow: {args.slug}")
-        print("discovery:")
-        print(f"- version: {discovery.get('version', 1)}")
-        print("- warning: discovery state version is newer than this runner understands")
-        return 0
```

**Adversarial Analysis:**
This check was a crucial safety mechanism that prevented older versions of the script from reading and potentially corrupting a newer state format they don't understand. By removing it, the script now silently assumes it can handle any state it encounters.

**Regression Scenario:**
1.  A user runs this new version of `run_factory.py`, which creates/updates a state file with new fields like `unresolved` and `acceptance_criteria`.
2.  Another user (or a CI system) on an older branch runs an older version of `run_factory.py` against the same state file.
3.  The old script, lacking this version check, will read the file, ignore the unknown fields, perform its operations, and write the state back, potentially **deleting the new fields** (`unresolved`, `acceptance_criteria`, etc.) entirely. This causes silent data loss.

This change introduces a significant regression in data integrity when multiple versions of the script are in use.

### 2. **Medium Severity: Implicit, Untested State Migration**

The diff introduces a `migrate_discovery_state` function, but its implementation and tests are not provided.

```python
# run_factory.py
merged = migrate_discovery_state(merged)

# run_factory.py
def _migrated_mutate(state: dict):
    discovery = state.setdefault(DISCOVERY_KEY, default_discovery_state())
    migrated = migrate_discovery_state(discovery)
    # ...
```

**Adversarial Analysis:**
The state mutation logic now depends entirely on this unseen migration function. The `update_discovery_state` function applies this migration on every single write.
-   The migration logic itself is a black box. It could contain bugs that corrupt or misinterpret state.
-   The tests do not validate the migration path. There are no tests that load a legacy state object (pre-change), run a command, and assert that the new fields (`unresolved`, `non_goals`, etc.) are correctly initialized.
-   While existing tests are updated with the new fields, they use default empty values. This confirms the new structure won't break old tests but fails to confirm the migration from the old structure to the new one actually works.

This creates a blind spot where the critical path for state evolution is completely unverified.

### 3. **Low Severity: State Completion Logic is Brittle**

The logic for marking the discovery phase as incomplete is now tied to any modification of the new fields.

```python
# run_factory.py
elif (
    #...
    or getattr(args, "non_goal", None) is not None
    or getattr(args, "acceptance_criteria", None) is not None
):
    discovery["complete"] = False
```

**Adversarial Analysis:**
This assumes that adding, for example, a "non-goal" or "acceptance criterion" should always invalidate the completion of the discovery phase. This might be undesirable. A user may consider discovery complete but want to add a clarifying non-goal afterward without having to re-run the completion steps (`--complete --force-complete`). This UX assumption makes the workflow more rigid than necessary.

### 4. **Low Severity: Test Coverage is Limited to "Happy Paths"**

The new tests in `test_run_factory_repair.py` validate that the new commands work as expected under normal conditions but fail to explore edge cases or negative scenarios.

**Adversarial Analysis:**
The tests are missing:
-   **Idempotency checks:** What happens if you `--defer` an already-deferred item or `--resolve` an item that doesn't exist?
-   **Input validation:** What happens with empty strings (e.g., `discover --non-goal ""`)?
-   **State interaction:** What happens if you try to `--resolve` a deferred item?
-   **Conflict scenarios:** Although the code prevents adding duplicate `unresolved` items, a test could manually create a state with duplicates to confirm that `--resolve` and `--defer` only act on the first match, which is important but potentially non-obvious behavior.

Without these tests, the robustness of the new functionality is unproven.

## Residual Risks

-   **Race Conditions:** The `read -> modify -> write` pattern for the JSON state file is inherently vulnerable to race conditions if two processes execute `run_factory.py` concurrently. One process could overwrite the changes of another. The diff does not show any file-locking mechanism, so this risk remains.
-   **Fragile String-Based Matching:** The `--resolve` and `--defer` commands identify items by exact text match. While the script attempts to enforce uniqueness, any manual edit or future bug that introduces items with identical text will make these commands ambiguous, as they will only operate on the first match found.

## Token Stats

- total_input=6068
- total_output=1186
- total_tokens=22471
- `gemini-2.5-pro`: input=6068, output=1186, total=22471

## Resolution
- status: accepted
- note: Round 3 findings: migration idempotent and well-tested (Wave 1, 13 tests). _safe_list() defensive loading added. Resolve/defer duplicate inconsistency deferred. Silent no-op deferred to Wave 4.
