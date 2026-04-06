---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/parallel-implement-command/spec.md"
artifact_sha256: "4547dbb9d634f74f59a30e95b1f2b7aa79c5f552b9593e3b3ffac1a741fb8e64"
repo_root: "."
git_head_sha: "d5d44aae09ddef35ce80e2ebcd2e935e887773f9"
git_base_ref: "origin/main"
git_base_sha: "d5d44aae09ddef35ce80e2ebcd2e935e887773f9"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Spec revised: fixed overlap contradiction (warn+serial, not fail), dirty-tree is now hard failure, empty worktree skips commit, multi-commit cherry-picks each individually, pre-dispatch HEAD reset on failure, PID in worktree path, --max-workers flag added. Rejected: post-hoc file-scope validation and dependency graph (deferred to future wave)."
raw_output_path: "docs/workflow/feature-runs/parallel-implement-command/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

1. **High** - The spec never defines a persistence step for task completion or checkpoint advancement. FR-003 only reads the next unchecked slice, but nothing writes back checked state or advances the workflow. As written, the same slice will be selected again on the next invocation unless some external manual process updates `tasks.md`.

2. **High** - Failure recovery is not safe enough for parallel execution. FR-011 and FR-012 require resetting HEAD and removing worktrees, but they do not require canceling in-flight Codex processes, waiting for them to exit, or guaranteeing a hard reset of the main worktree and index. A slow worker can keep writing while cleanup starts, and a plain ref reset can still leave the repo in an inconsistent state.

3. **High** - The parallel safety model is advisory, not enforced. FR-004 and FR-005 explicitly treat `[P]` scopes as hints and defer post-hoc validation, so a worker can modify files outside its declared list and the runner will still cherry-pick those edits. That means the overlap detector cannot actually guarantee non-conflicting execution, which weakens the core premise of the feature.

4. **Medium** - Slice parsing and boundary handling are underdefined. FR-003 does not say how to handle multiple checkpoints, malformed task lines, or already-checked tasks mixed into the next slice. A small parsing mistake changes which tasks are launched, and there is no validation gate before worktrees are created.

## Residual Risks

- Semantic dependencies can still exist even when file scopes are disjoint, so “safe by path overlap” does not guarantee the combined edits are correct.
- Prompt construction may become too large or too noisy if `spec.md`, `plan.md`, and `tasks.md` are injected verbatim for every worker.
- PID-based worktree names reduce collisions, but stale-path cleanup still has a small risk if PIDs are reused after a crash.
- Serial fallback for non-`[P]` tasks means one misannotated slice can silently lose most of the intended parallel speedup.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Spec revised: fixed overlap contradiction (warn+serial, not fail), dirty-tree is now hard failure, empty worktree skips commit, multi-commit cherry-picks each individually, pre-dispatch HEAD reset on failure, PID in worktree path, --max-workers flag added. Rejected: post-hoc file-scope validation and dependency graph (deferred to future wave).
