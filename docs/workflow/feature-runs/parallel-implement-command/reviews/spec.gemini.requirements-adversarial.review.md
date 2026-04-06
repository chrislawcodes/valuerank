---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/parallel-implement-command/spec.md"
artifact_sha256: "4547dbb9d634f74f59a30e95b1f2b7aa79c5f552b9593e3b3ffac1a741fb8e64"
repo_root: "."
git_head_sha: "d5d44aae09ddef35ce80e2ebcd2e935e887773f9"
git_base_ref: "origin/main"
git_base_sha: "d5d44aae09ddef35ce80e2ebcd2e935e887773f9"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Spec revised: fixed overlap contradiction (warn+serial, not fail), dirty-tree is now hard failure, empty worktree skips commit, multi-commit cherry-picks each individually, pre-dispatch HEAD reset on failure, PID in worktree path, --max-workers flag added. Rejected: post-hoc file-scope validation and dependency graph (deferred to future wave)."
raw_output_path: "docs/workflow/feature-runs/parallel-implement-command/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. Critical Flaw: Unenforced File Scopes Invalidate Overlap Detection

The entire safety model for parallelism rests on detecting overlapping file modifications. However, the spec explicitly states:

> What if Codex produces changes to a file not listed in the `[P]` annotation? → Cherry-pick proceeds; the annotation is advisory for overlap detection only. Post-hoc file-scope validation is deferred to a future wave.

This turns the overlap detection into security theater. If two tasks are deemed parallel because their declared scopes are disjoint, but both modify the *same undeclared file*, the system will run them concurrently. This creates a race condition that leads to a non-atomic merge conflict when the changes are cherry-picked. The "atomic failure" logic in FR-011 will be triggered, but only after a complex failure state has been created. The core premise of safe parallelism is undermined if the scopes that guarantee it are not enforced.

### 2. Concurrency Hazard: Unlocked Main Branch Allows Race Conditions

The spec addresses worktree path collisions between concurrent `implement` runs by using the process PID in the path (`wt-{slug}-{pid}-{index}`). However, it completely ignores the far more dangerous race condition on the main branch itself.

If two developers (or CI jobs) run `implement --slug <same_slug>` on the same repository and branch at the same time, their processes will not collide on worktree creation. But they will race to perform the final cherry-pick and HEAD manipulation on the shared main branch. This will inevitably lead to a corrupt git history, lost commits, or a branch in an indeterminate state. A repository-level locking mechanism (e.g., creating a `.git/implement.lock` file) is required to prevent concurrent execution against the same branch.

### 3. Ambiguous State in Mixed Parallel/Serial Slices

User Story 2.3 and FR-013 define a dangerous ambiguity for slices containing both parallel (`[P]`) and serial (non-`[P]`) tasks. The spec states the serial group runs *after* the parallel group completes and is merged.

However, it fails to specify the state of the world that the serial Codex worker is given. If the serial worker's prompt and context are based on the *original* pre-dispatch HEAD, its generated changes will be based on stale code and will almost certainly conflict with the just-merged parallel work. The implementation **must** ensure the serial task is executed against the new, post-parallel HEAD, but the spec omits this critical orchestration detail, making a severe implementation error highly likely.

### 4. Brittle Dependency on Upstream Annotation Accuracy

User Story 3 places the burden of creating correct `[P: file-scope]` annotations on the upstream `feature-tasks` skill. While there is a safe fallback for missing annotations (treat as serial), there is no protection against *incorrect* annotations.

If the skill marks a task `[P]` but provides an incomplete file list, the overlap detector will have a blind spot. This will lead to the exact race condition described in Finding #1, where tasks believed to be independent are not. Relying on a separate agent to provide mission-critical safety data without a verification step is inherently fragile.

## Residual Risks

### 1. Semantic Conflicts Will Lead to "Successful" but Broken Merges

The spec explicitly puts semantic conflicts out of scope. This is a reasonable scoping decision for v1, but it remains the highest-severity risk for the user. Two workers can make changes to different files that are textually and syntactically valid but logically incompatible.

For example, a worker for Task A renames a function `calculate_total()` to `compute_final_total()`, and a worker for Task B adds a new call to the old `calculate_total()` function in a different file. The file scopes are disjoint. Both tasks will run in parallel. Both will be "successfully" cherry-picked. The resulting code will be broken, but the `implement` command will report success. This is more dangerous than a merge conflict because the failure is latent.

### 2. Cherry-Pick Ordering is Brittle

FR-010 mandates a deterministic cherry-pick order (by task index). While deterministic, this order is arbitrary. A conflict can occur during the cherry-pick of task 2's changes that would not have occurred if task 3's changes were applied first. The current design will fail atomically (which is good), but has no recourse. It will not try alternative orderings or provide context on why the conflict occurred, leading to brittle failures that require manual intervention to debug and resolve.

### 3. Prompt Engineering Complexity is Underestimated

FR-007 states that each worker receives a prompt "describing only that task's scope". This hand-waves a significant implementation challenge. Generating a high-quality, minimal, and sufficient prompt for an LLM to perform a surgical code change is non-trivial. A poorly-scoped prompt will cause Codex to either fail or produce low-quality changes that require manual cleanup, partially defeating the purpose of the automation. This risk is amplified for the serial-fallback case in mixed slices, where the prompt must correctly describe a set of non-contiguous tasks against a just-modified codebase.

## Token Stats

- total_input=14968
- total_output=1117
- total_tokens=18851
- `gemini-2.5-pro`: input=14968, output=1117, total=18851

## Resolution
- status: accepted
- note: Spec revised: fixed overlap contradiction (warn+serial, not fail), dirty-tree is now hard failure, empty worktree skips commit, multi-commit cherry-picks each individually, pre-dispatch HEAD reset on failure, PID in worktree path, --max-workers flag added. Rejected: post-hoc file-scope validation and dependency graph (deferred to future wave).
