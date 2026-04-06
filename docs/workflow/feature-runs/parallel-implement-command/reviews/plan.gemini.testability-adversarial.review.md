---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/parallel-implement-command/plan.md"
artifact_sha256: "29ec2274b415fef55b49bc8e22a99e59ec99f6251c4517e655aa9d49d88bcf54"
repo_root: "."
git_head_sha: "d5d44aae09ddef35ce80e2ebcd2e935e887773f9"
git_base_ref: "origin/main"
git_base_sha: "d5d44aae09ddef35ce80e2ebcd2e935e887773f9"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Addressed and deferred: (1) Serial-after-parallel context gap: DEFER — in a mixed slice, serial tasks should be designed to be independent of parallel tasks (same as annotation independence rule). (2) Commit strategy contradiction: REJECT — design is correct: Codex may or may not commit; stage_and_commit_if_dirty handles the no-commit case; get_new_commits retrieves whichever commits exist. Not contradictory. (3) Silent [P] without file list: DEFER per spec FR-004 — treating bare [P] as serial is intentional. (4) ARG_MAX: DEFER — well under 2MB for typical prompts."
raw_output_path: "docs/workflow/feature-runs/parallel-implement-command/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

The plan is well-structured but contains several testability gaps and assumptions that present a risk to successful implementation. The findings are ordered by severity.

1.  **CRITICAL: State Inconsistency Between Task Groups.** The most significant flaw is the plan for handling serial tasks that run *after* a parallel group. The `_run_parallel` function executes, and its resulting commits are cherry-picked, modifying the `HEAD`. Immediately after, `_run_serial` is called for any un-annotated tasks. However, the prompt for this serial execution is based on the original `tasks.md` and repository state *before* the parallel work was done. This creates a race condition and state inconsistency. A serial task intended to modify a file just changed by a parallel worker will fail, revert the parallel change, or have other unpredictable effects. The test plan completely omits a scenario to cover this hazardous interaction.

2.  **MAJOR: Contradictory Worktree Commit Strategy.** The plan is inconsistent about what creates the commits inside a worktree.
    *   `Decision 5` and `factory_git.py::get_new_commits` are designed around the idea that commits already exist in the worktree to be found and cherry-picked.
    *   However, `factory_git.py::stage_and_commit_if_dirty` is a function whose purpose is to create a commit from file changes, implying `codex exec` *only* modifies files and does not commit.
    *   The `_run_parallel` logic calls `stage_and_commit_if_dirty`, confirming the latter interpretation. This contradiction makes the design unclear and untestable. The plan must commit to one strategy: either `codex exec` is required to make a commit, or the script is always responsible for it.

3.  **MODERATE: Silent Failure on User Error.** In `factory_stages.py` logic, a task annotated as `[P]` but missing the required file list (`[P: file1]`) is silently treated as a serial task. This hides a user's incorrect usage of the feature. The user intended the task to be parallel, but a mistake makes it run serially with no feedback. This violates the principle of least astonishment and makes debugging the process harder. This behavior should, at minimum, produce a warning like the `overlap_warning`.

4.  **MODERATE: Risk of `ARG_MAX` Error.** `Decision 4` and `_run_serial` specify passing the entire generated prompt as a command-line argument to `subprocess.run`. While this correctly avoids shell injection, it is vulnerable to system-level argument length limits (`ARG_MAX`). For features with large `spec.md`, `plan.md`, and task descriptions, the prompt could easily exceed this limit, causing the tool to fail hard. The explicit rejection of a temporary file for the prompt is a brittle decision.

5.  **MINOR: Incomplete Test Plan.** The test plan is a good start but misses several critical and edge-case scenarios:
    *   **Path validation:** No tests to verify the rejection of path traversal (`../`) or the handling of absolute paths that are legitimately inside the repository.
    *   **Path edge cases:** No tests for file paths containing spaces, unicode characters, or other special characters.
    *   **Annotation parsing:** Does not test `[P:]` (empty file list) or other malformed variations.
    *   **`stage_and_commit` behavior:** Does not explicitly test the handling of newly created (untracked) files by `codex exec`.
    *   **Conflict simulation:** `test_cherry_pick_commits_conflict` needs to verify that `git cherry-pick --abort` is called to ensure the repository is left in a clean state.

## Residual Risks

Even if the above findings are addressed, the design retains some inherent risks that cannot be fully eliminated but should be acknowledged.

1.  **"All-or-Nothing" Rollback is Unforgiving.** The strategy to `git reset --hard` the main branch upon any `codex` or `cherry-pick` failure is safe but brutal. If 9 out of 10 parallel tasks succeed and the last one fails, all 9 successful pieces of work are discarded. This makes the tool potentially frustrating and inefficient for large checkpoints, forcing users to shrink the number of tasks between `[CHECKPOINT]` markers.

2.  **Filesystem Instability.** The use of `/tmp` for worktrees is standard, but filesystem-level race conditions are still possible, especially if multiple instances of this script run concurrently on the same machine for the same feature. The `{pid}` in the path helps but is not a perfect lock.

3.  **External Tool Brittleness.** The entire workflow is tightly coupled to the specific behavior of `codex exec` (that it operates cleanly within its `cwd`, respects prompts, and provides meaningful exit codes). Any change in the `codex` tool's behavior could break this workflow in ways that are difficult to test for in advance.

## Token Stats

- total_input=4087
- total_output=1084
- total_tokens=20546
- `gemini-2.5-pro`: input=4087, output=1084, total=20546

## Resolution
- status: accepted
- note: Addressed and deferred: (1) Serial-after-parallel context gap: DEFER — in a mixed slice, serial tasks should be designed to be independent of parallel tasks (same as annotation independence rule). (2) Commit strategy contradiction: REJECT — design is correct: Codex may or may not commit; stage_and_commit_if_dirty handles the no-commit case; get_new_commits retrieves whichever commits exist. Not contradictory. (3) Silent [P] without file list: DEFER per spec FR-004 — treating bare [P] as serial is intentional. (4) ARG_MAX: DEFER — well under 2MB for typical prompts.
