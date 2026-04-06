---
reviewer: "gemini"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/parallel-implement-command/tasks.md"
artifact_sha256: "bf793e0fd555f429868f82f078a13da52283475ddded221a50d379a06bb2f335"
repo_root: "."
git_head_sha: "d5d44aae09ddef35ce80e2ebcd2e935e887773f9"
git_base_ref: "origin/main"
git_base_sha: "d5d44aae09ddef35ce80e2ebcd2e935e887773f9"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Addressed and rejected: (1) Worktree path collision: REJECT — pid is the process PID (shared across threads) but index is unique per task within the group, so /tmp/wt-{slug}-{pid}-{index} IS unique. (2) revert_protected_files undefined: REJECT — existing function in factory_git.py. (3) Directory vs file overlap: DEFER — file-level annotations only, not directory-level, v1 scope. (4) Mixed valid/invalid paths: implementation rejects invalid paths with warning; valid paths in same annotation can still be used."
raw_output_path: "docs/workflow/feature-runs/parallel-implement-command/reviews/tasks.gemini.dependency-order-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

1.  **(High Severity) Race Condition in Parallel Worktree Creation:** The worktree path generation in T003, `wt-{sanitized_slug}-{pid}-{index}`, is not thread-safe. `ThreadPoolExecutor` workers in T008 share the same process ID (`pid`), so if multiple tasks have the same `index` (which is their index in the task group, not a unique number), their temporary paths will collide, leading to data corruption and race conditions. The `{pid}` provides a false sense of security; uniqueness must be guaranteed by the orchestrator.

2.  **(Medium Severity) Ambiguous Dependency on Undefined Function:** Tasks T007 (`_run_serial`) and T008 (`_run_parallel`) both call `revert_protected_files()`. This function is not defined, implemented, or tested anywhere in this plan. This introduces a significant hidden dependency; if this function does not exist or behaves incorrectly, the core implementation tasks will fail.

3.  **(Medium Severity) Flawed Directory Overlap Detection:** The file overlap detection logic in T004 is described as checking for overlap on normalized paths. This is insufficient as it would fail to identify a conflict between a task scoped to a directory `[P: src/app/]` and another scoped to a file within it `[P: src/app/component.ts]`. Treating these as non-overlapping and running them in parallel would create a race condition on the filesystem and likely lead to merge conflicts.

4.  **(Low Severity) Incomplete Test Specification:** The test plan for `parse_p_annotation` in T012 omits a critical case: testing an annotation that contains a mix of valid and invalid paths (e.g., `[P: path/one.py, /absolute/path.py, ../escaped.py]`). The specified behavior for invalid paths is to return `[]`, but it's unclear if valid paths in the same annotation should be extracted or if the entire annotation is rejected.

## Residual Risks

1.  **(High Severity) Brittle and Obscure Error Recovery:** The primary recovery strategy in T008 upon a Codex or cherry-pick failure is to `git reset --hard base_sha`. While this restores a clean state, it is destructive. It discards the successful commits from non-failing parallel workers, making it impossible to debug the failure. The system has no way to report *which* worker's changes caused the conflict, forcing a manual, trial-and-error process to find the root cause.

2.  **(Medium Severity) Untested Git Command Interactions:** The testing strategy for the core logic (T015) relies on mocking `git` helpers and `subprocess`. This means the sequential interaction of the real `git` commands (`stage_and_commit_if_dirty`, `get_new_commits`, `cherry_pick_commits`) is never tested in an integrated fashion. Edge cases arising from the state left by one command affecting the next (e.g., unexpected untracked files, partially staged changes) will not be caught.

3.  **(Low Severity) Overly Trusting of Agent Scope:** The parallel execution model fundamentally assumes the `codex exec` agent will honor the `cwd` provided and not modify files outside its assigned worktree. A "rogue" edit that breaks out of this scope could corrupt the main repository state or interfere with another parallel task. The `revert_protected_files` function is a weak, blacklist-based mitigation for a systemic risk.

## Token Stats

- total_input=3277
- total_output=759
- total_tokens=19036
- `gemini-2.5-pro`: input=3277, output=759, total=19036

## Resolution
- status: accepted
- note: Addressed and rejected: (1) Worktree path collision: REJECT — pid is the process PID (shared across threads) but index is unique per task within the group, so /tmp/wt-{slug}-{pid}-{index} IS unique. (2) revert_protected_files undefined: REJECT — existing function in factory_git.py. (3) Directory vs file overlap: DEFER — file-level annotations only, not directory-level, v1 scope. (4) Mixed valid/invalid paths: implementation rejects invalid paths with warning; valid paths in same annotation can still be used.
