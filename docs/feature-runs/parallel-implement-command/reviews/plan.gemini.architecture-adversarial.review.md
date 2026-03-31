---
reviewer: "gemini"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/parallel-implement-command/plan.md"
artifact_sha256: "29ec2274b415fef55b49bc8e22a99e59ec99f6251c4517e655aa9d49d88bcf54"
repo_root: "."
git_head_sha: "d5d44aae09ddef35ce80e2ebcd2e935e887773f9"
git_base_ref: "origin/main"
git_base_sha: "d5d44aae09ddef35ce80e2ebcd2e935e887773f9"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Addressed and deferred: (1) New file creation race: DEFER per spec — annotation is advisory, overlap detection fires on declared paths only, post-hoc validation deferred. (2) /tmp security: DEFER — standard developer tool practice; source code already on disk. (3) Case-sensitivity: ACCEPTED — using case-sensitive comparison is the safe default for Linux/Docker; macOS false-negative risk accepted as known limitation. (4) ARG_MAX: DEFER — typical spec+plan+task prompts are well under 2MB limit. (5) Logical deps: DEFER per spec. (6) Rollback atomicity: addressed — cherry-pick --abort in cherry_pick_commits + finally block. (7) All-or-nothing: intentional per spec FR-011."
raw_output_path: "docs/feature-runs/parallel-implement-command/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

| Severity | Finding |
| :--- | :--- |
| **High** | **Race Condition on New File Creation:** The overlap detection mechanism only accounts for pre-existing files. If two parallel tasks are instructed to create a new file at the same path (e.g., `apps/api/src/services/new-feature.ts`), this will not be flagged as an overlap. The first worktree to be merged will succeed, but the second will fail with a file conflict during the cherry-pick, causing the entire run to fail and revert. |
| **High** | **Insecure & Leaky Temporary Directory Usage:** Using a globally accessible path like `/tmp/wt-{slug}-{pid}-{i}` for worktrees poses two risks. First, it exposes potentially sensitive source code in a world-readable directory. Second, the proposed cleanup mechanism is insufficient; it only removes a stale worktree if the path (including PID) collides exactly. It will not clean up orphaned worktrees from previous, crashed runs, leading to unbounded disk space consumption over time. A project-local directory (e.g., `.tmp/worktrees/`) should be used. |
| **High** | **Path Overlap Detection is Flawed (Case-Sensitivity):** The plan specifies case-sensitive deduplication and overlap checking. This is incorrect for case-insensitive filesystems (the default on Windows and macOS). On these systems, `[P: src/File.ts]` and `[P: src/file.ts]` refer to the same file but would not be detected as an overlap. This would lead to two agents writing to the same file in parallel, resulting in a guaranteed cherry-pick conflict and run failure. Path normalization must account for filesystem case-sensitivity. |
| **Medium** | **Risk of Exceeding `ARG_MAX` Limit:** The decision to reject temporary files and pass the entire generated prompt as a direct command-line argument is brittle. If the source spec, plan, and task descriptions are large, the combined prompt text could easily exceed the operating system's `ARG_MAX` limit for command-line argument length, causing the `subprocess.run` call to fail before the Codex agent ever starts. |
| **Medium** | **Implicit Logical Dependencies Between Tasks:** The plan fundamentally assumes that tasks with non-overlapping file sets are independent. This is frequently false. One task may introduce a new function in `services.ts` that a second task consumes in `routes.ts`. If the commits are cherry-picked in the wrong order, the repository will be in a broken state at an intermediate commit, defeating a primary benefit of atomic commits. The system has no mechanism to understand or enforce logical ordering between parallel tasks. |
| **Low** | **Brittle Rollback Logic:** A failure during the cherry-pick process requires the main `command_implement` function to perform a `git reset --hard`. If the script were to crash after the cherry-pick fails but before the reset is performed, the repository would be left in a broken, half-merged `CHERRY-PICKING` state, requiring manual user intervention to fix. The failure-handling logic is not atomic. |
| **Low** | **All-or-Nothing Rollback Discards Work:** The `git reset --hard base_sha` strategy is safe but inefficient. If a parallel batch of 10 tasks fails on the final cherry-pick, the 9 preceding successful changes are completely discarded. The user gets no partial success, making large parallel runs risky and potentially wasteful. |

## Residual Risks

| Risk | Description |
| :--- | :--- |
| **Complexity & Maintainability:** | The proposed architecture introduces significant complexity involving git worktrees, subprocess management, and fragile rollback mechanics. A bug in this tooling could easily corrupt a user's local repository. The long-term maintenance burden and the risk of subtle bugs may outweigh the performance benefits of parallelization. |
| **Semantic Incoherence of History:** | Even if functionally correct, the resulting git history will consist of a series of file-scoped commits rather than feature-scoped ones. This atomization of work optimizes for machine execution but de-optimizes for human understanding. It may become harder to use `git bisect` or to understand the intent behind a set of changes, as the logical feature is spread across many small, potentially interleaved commits. |
| **LLM Agent Nondeterminism:** | The plan assumes `codex exec` workers are perfectly contained. In practice, LLMs are non-deterministic. Two workers might produce functionally identical code but with different formatting, import ordering, or comment styles. This can create merge conflicts or noisy diffs. Furthermore, a rogue or poorly-instructed agent could still make changes outside its declared file scope, and the system would only catch this at the `stage_and_commit_if_dirty` step, after the fact. |

## Token Stats

- total_input=4086
- total_output=1036
- total_tokens=20303
- `gemini-2.5-pro`: input=4086, output=1036, total=20303

## Resolution
- status: accepted
- note: Addressed and deferred: (1) New file creation race: DEFER per spec — annotation is advisory, overlap detection fires on declared paths only, post-hoc validation deferred. (2) /tmp security: DEFER — standard developer tool practice; source code already on disk. (3) Case-sensitivity: ACCEPTED — using case-sensitive comparison is the safe default for Linux/Docker; macOS false-negative risk accepted as known limitation. (4) ARG_MAX: DEFER — typical spec+plan+task prompts are well under 2MB limit. (5) Logical deps: DEFER per spec. (6) Rollback atomicity: addressed — cherry-pick --abort in cherry_pick_commits + finally block. (7) All-or-nothing: intentional per spec FR-011.
