---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/parallel-implement-command/plan.md"
artifact_sha256: "29ec2274b415fef55b49bc8e22a99e59ec99f6251c4517e655aa9d49d88bcf54"
repo_root: "."
git_head_sha: "d5d44aae09ddef35ce80e2ebcd2e935e887773f9"
git_base_ref: "origin/main"
git_base_sha: "d5d44aae09ddef35ce80e2ebcd2e935e887773f9"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Addressed and deferred: (1) Mutual exclusion for concurrent runs: DEFER — single-user tool, v1 scope. (2) Task ordering (serial-after-parallel): intentional per FR-013. (3) Annotation trust without post-hoc validation: DEFER per spec. (4) Slug collision: ACCEPT — implementation uses safe encoding; kebab-case slugs don't contain separators in practice; worst case: stale worktree removed and recreated."
raw_output_path: "docs/workflow/feature-runs/parallel-implement-command/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- High: The plan has no repo-wide mutual exclusion for `implement`. Two invocations can both pass the dirty-tree check, create their own worktrees, and then race while cherry-picking into the shared repo HEAD. That can leave the main branch in an unpredictable state, and the later `reset --hard base_sha` can wipe out work from the other run. A lockfile or git ref lease is missing.

- High: The orchestration can execute tasks out of their original order. The plan explicitly runs the parallel group first and the serial fallback group afterward, even when the serial task appears earlier in the slice. If `tasks.md` order encodes dependency, this reordering can make later tasks run before prerequisites and create failures that would not happen in serial execution.

- High: Parallel safety relies entirely on user-authored `[P: ...]` file lists, but the plan never validates the actual files a worker changed before integration. That means a bad or incomplete annotation can still be parallelized, and overlap may only surface after the worker has already made edits. Shared outputs like lockfiles, generated files, snapshots, and formatter-driven rewrites are not covered by the annotation contract as written.

- Medium: The worktree path scheme can collide. Replacing separators with `_` makes distinct slugs like `foo/bar` and `foo_bar` map to the same `/tmp/wt-*` path. Because `create_worktree` also removes stale paths first, one run can accidentally delete or reuse another run’s worktree. The plan needs a collision-proof slug encoding.

## Residual Risks

- Even with stricter file-scope validation, the plan still cannot infer semantic dependencies between disjoint files. Two tasks can touch different paths and still require a specific order because they share a contract, generated output, or runtime behavior.

- The cherry-pick integration assumes each worker leaves replayable linear commits. If Codex emits merge commits, amends existing commits, or produces multiple unrelated commits, the current merge path is still underspecified and may need more than simple `get_new_commits` plus cherry-pick.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Addressed and deferred: (1) Mutual exclusion for concurrent runs: DEFER — single-user tool, v1 scope. (2) Task ordering (serial-after-parallel): intentional per FR-013. (3) Annotation trust without post-hoc validation: DEFER per spec. (4) Slug collision: ACCEPT — implementation uses safe encoding; kebab-case slugs don't contain separators in practice; worst case: stale worktree removed and recreated.
