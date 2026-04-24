---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/ff-housekeeping/tasks.md"
artifact_sha256: "6a1cb7a4e3e5795f82b58a5507b831982ecd5a2562bdc79b74955193941f3bda"
repo_root: "."
git_head_sha: "0c36f43209746964038a3ba98b1d7a8f3817c5d8"
git_base_ref: "origin/main"
git_base_sha: "85a91778b3c3de491fd6b326879d29fa5dc6d0fa"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/ff-housekeeping/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

| Severity | ID | Finding |
| :--- | :--- | :--- |
| **HIGH** | S2.1 | **Non-Transactional State Updates Create Drift Risk:** The `reconcile_review_full` function (T2.3) is explicitly non-transactional. A failure mid-way through its sequential writes (e.g., after updating the review file but before updating `plan.md`) will leave the system in an inconsistent state. The plan to rely on an idempotent re-run to repair this drift is optimistic; the re-run itself could fail, or the corrupted state might be un-parseable, requiring manual intervention. |
| **MEDIUM** | S3.1 | **Brittle `git diff` Parsing:** The implementation-rule check (T3.1) relies on parsing the output of `git diff --numstat`. This is fragile and may break if git's output format changes, or if filenames contain unusual characters. The task assumes the first column is always "added lines," which is true for `numstat` but is a weak dependency on an external tool's string output. |
| **MEDIUM** | S1.1 | **Brittle Quota Detection Logic:** The `_is_codex_quota_exhaustion` helper (T1.1) relies on matching a hardcoded list of substrings from API error messages. These messages are external dependencies that can change at any time, which would cause the detection to fail silently (classifying a quota error as a generic failure). The HTTP status check is more robust but is still coupled to context markers in the log text. |
| **LOW** | S2.2 | **[UNVERIFIED] Fragile `plan.md` Update:** The task to update `plan.md` (T2.3c) specifies finding and replacing a line via a simple string match: `- review: reviews/<basename>.review.md`. This is not robust against minor formatting variations like extra whitespace. If the line doesn't match exactly, the logic will append a new line, creating a duplicate entry and state drift. A regular expression would be more resilient. |
| **LOW** | S3.2 | **[UNVERIFIED] Hardcoded Test File Exclusions:** The `git diff` command in the implementation-rule check (T3.1) uses hardcoded patterns to exclude test files (e.g., `:\!**/tests/**`). If any part of the codebase uses a different convention for test files not covered by these patterns, test code will be incorrectly counted as implementation code, potentially triggering false-positive warnings. |
| **LOW** | S4.1 | **[UNVERIFIED] Incomplete Test Isolation via Env Var:** The smoke test setup (T4.1) introduces an `FF_FACTORY_RUNS_ROOT` environment variable to redirect file writes during testing. However, it only specifies this variable is honored in `factory_state.py`. If any other part of the codebase constructs feature-run paths without using this central variable, the tests could leak and modify live data outside the temporary test directory. |

## Residual Risks

Even if all tasks are implemented as written, the following risks will remain:

1.  **State Inconsistency:** The most significant residual risk is that the three-way reconcile script (Slice 2) can leave the `review`, `plan`, and `state` files in a conflicting state if a write operation fails partway through. This places the burden of recovery on a subsequent run or manual repair, and a systemic issue (e.g., disk full, permissions error) could make automated recovery impossible.
2.  **External Dependency Brittleness:** The system's correctness will depend on fragile parsing of external outputs that are not guaranteed to be stable: `git diff --numstat` output (Slice 3) and OpenAI/Codex API error messages (Slice 1). Future changes to these external dependencies are likely to break these features.
3.  **Filesystem Race Conditions:** The pre-check for write permissions (`os.access`) before the write operation (T2.2) is not atomic. A race condition where permissions change between the check and the write could still lead to a failure, triggering the state inconsistency risk described above.

## Token Stats

- total_input=2787
- total_output=905
- total_tokens=17056
- `gemini-2.5-pro`: input=2787, output=905, total=17056

## Resolution
- status: open
- note: