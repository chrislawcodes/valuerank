# Feature 001: Parallel Implementation via Codex Agent Teams

**Status**: Draft
**Created**: 2026-03-29
**Feature branch**: `claude/parallel-implement-command`

---

## Overview

The feature factory runner currently recommends `next-action: implement_next_slice` but has no command to act on it — implementation is done manually. This feature adds a `run_factory.py implement --slug <slug>` command that reads the next `[CHECKPOINT]`-bounded slice from `tasks.md`, detects parallelizable tasks annotated with `[P: file1, file2]`, and dispatches one Codex worker per task in an isolated git worktree when their file sets do not overlap.

---

## User Scenarios & Testing

### User Story 1 — Run a parallel implementation slice (Priority: P1)

As a developer running the feature factory, I need `run_factory.py implement --slug <slug>` to automatically dispatch parallel Codex workers for `[P]`-annotated tasks so that implementation of non-conflicting work happens concurrently without manual orchestration.

**Why this priority**: Core value of the feature — without this, nothing is parallel.

**Independent Test**: Given a `tasks.md` with two `[P]`-annotated tasks touching disjoint files and a `[CHECKPOINT]` boundary, running `implement` spawns two Codex processes in separate worktrees, merges both back, and the working tree contains both changes.

**Acceptance Scenarios**:

1. **Given** the next slice has two tasks both annotated `[P: fileA]` and `[P: fileB]` with no shared files, **When** `implement --slug foo` runs, **Then** two Codex workers execute concurrently in `/tmp/wt-foo-0` and `/tmp/wt-foo-1`, both commits are cherry-picked back to the main branch, and worktrees are cleaned up.

2. **Given** Codex completes but makes no commit in its worktree, **When** cherry-pick is attempted, **Then** the runner stages all changes in that worktree and creates a commit before cherry-picking.

3. **Given** a cherry-pick fails due to a conflict (annotations were wrong), **When** the conflict is detected, **Then** the command fails with a clear message naming which tasks share files and instructs the user to remove their `[P]` annotations.

---

### User Story 2 — Serial fallback for non-parallel or overlapping tasks (Priority: P1)

As a developer, I need the `implement` command to fall back gracefully to a single serial Codex call when tasks don't have `[P]` annotations or when their file sets overlap, so I can use one command for all slices regardless of whether parallel work is possible.

**Why this priority**: Without serial fallback the command is unusable on most slices (the common case is serial).

**Independent Test**: Given a `tasks.md` where the next slice has no `[P]` tasks, running `implement` dispatches a single Codex call covering all tasks in the slice (same as current manual behavior).

**Acceptance Scenarios**:

1. **Given** the next slice has tasks with no `[P]` annotations, **When** `implement --slug foo` runs, **Then** a single Codex process is dispatched with all tasks in the slice as its prompt.

2. **Given** two tasks are both annotated `[P]` but share a file path, **When** `implement` runs, **Then** the runner prints a warning identifying the overlapping file and runs both tasks as a single serial Codex call.

3. **Given** a mix of `[P]`-annotated and non-annotated tasks in the same slice, **When** `implement` runs, **Then** the `[P]` tasks are evaluated for parallelism and the non-`[P]` tasks are always included in the serial group.

---

### User Story 3 — Task annotation format enforced in SKILL.md (Priority: P2)

As a developer using the feature-tasks skill to generate `tasks.md`, I need Gemini to include `[P: file-scope]` annotations whenever it marks a task `[P]` so that the overlap detector has the information it needs.

**Why this priority**: Parallel dispatch is useless if tasks are marked `[P]` without file scopes — the runner would have no basis for overlap detection.

**Independent Test**: The `.claude/skills/feature-tasks/SKILL.md` states that `[P]` tasks MUST include a comma-separated file list, and provides an example in the correct format.

**Acceptance Scenarios**:

1. **Given** the updated SKILL.md, **When** Gemini generates tasks for a parallelizable feature, **Then** all `[P]` tasks include a `[P: path/to/file.ts]`-style annotation.

2. **Given** a `[P]` task without a file annotation in `tasks.md`, **When** `implement` runs, **Then** the runner warns that the task is missing its file scope and falls back to serial execution.

---

### User Story 4 — Worktree lifecycle management (Priority: P1)

As a developer, I need worktrees to be created, used, and removed cleanly so that failed or partial runs don't leave orphaned worktrees that conflict with future runs.

**Why this priority**: Orphaned worktrees at `/tmp/wt-{slug}-{i}` will cause the next `implement` call to fail.

**Independent Test**: After a successful parallel run, no worktrees exist at the expected paths. After a failed run, worktrees are cleaned up with an error message.

**Acceptance Scenarios**:

1. **Given** a successful parallel run, **When** it completes, **Then** `/tmp/wt-{slug}-0` and `/tmp/wt-{slug}-1` no longer exist.

2. **Given** an existing worktree at `/tmp/wt-{slug}-0` from a previous partial run, **When** `implement` starts, **Then** it removes the stale worktree before creating a fresh one.

3. **Given** Codex fails (non-zero exit) in one worktree, **When** the failure is detected, **Then** all worktrees for that slice are cleaned up and the command exits non-zero.

---

## Edge Cases

- What if `tasks.md` has no `[CHECKPOINT]` boundaries? → Run all remaining tasks as a single slice.
- What if all tasks in the slice are already checked off? → Print "nothing to implement" and exit 0.
- What if Codex produces changes to a file not listed in the `[P]` annotation? → Cherry-pick proceeds; the annotation is advisory for overlap detection only. A future wave could add post-hoc conflict detection.
- What if only one `[P]` task exists in the slice (no partner to parallelize with)? → Run it as serial; no worktree overhead.
- What if `/tmp` lacks space for a worktree? → Git worktree add fails; command exits non-zero with the git error.
- What if the repo has uncommitted changes when `implement` starts? → Cherry-picks may conflict; command should warn and suggest stashing first.

---

## Functional Requirements

- **FR-001**: The runner MUST expose an `implement` subcommand accepting `--slug <slug>`.
- **FR-002**: The command MUST read `tasks.md` and identify the next `[CHECKPOINT]`-bounded slice (all unchecked tasks up to and including the next `[CHECKPOINT]` line).
- **FR-003**: The command MUST parse `[P: file1, file2, ...]` annotations from task lines. A task line with `[P]` but no file list MUST be treated as unannotated (serial).
- **FR-004**: The command MUST detect file overlap: if any two `[P]` tasks in the slice share a normalised file path, they MUST all be run serially with a warning.
- **FR-005**: When no overlap exists and at least two `[P]` tasks are present, the command MUST create one git worktree per `[P]` task at `/tmp/wt-{slug}-{index}`, removing any pre-existing worktree at that path first.
- **FR-006**: Each Codex worker MUST be invoked as `codex exec -m gpt-5.4-mini -s workspace-write` with a prompt describing only that task's scope, run inside its dedicated worktree.
- **FR-007**: Codex workers for non-overlapping `[P]` tasks MUST execute concurrently.
- **FR-008**: If a Codex worker makes no commit, the runner MUST stage all changes in that worktree and create a commit before cherry-picking.
- **FR-009**: The runner MUST cherry-pick each worktree's commits back to the main branch in deterministic order (by task index).
- **FR-010**: If any cherry-pick fails, the runner MUST abort, print which tasks conflict, and exit non-zero. All worktrees MUST be cleaned up before exit.
- **FR-011**: All worktrees MUST be removed on both success and failure paths.
- **FR-012**: The serial fallback path (no `[P]` tasks, overlap detected, or single `[P]` task) MUST dispatch a single Codex call covering all tasks in the slice.
- **FR-013**: The `.claude/skills/feature-tasks/SKILL.md` MUST be updated to require `[P: file-scope]` annotations whenever a task is marked `[P]`.
- **FR-014**: New logic (parsing, overlap detection, worktree management) MUST be added to the appropriate existing module respecting the acyclic import graph: parsing/overlap in `factory_stages.py`, worktree helpers in `factory_git.py`, dispatch orchestration in `run_factory.py`.

---

## Success Criteria

- **SC-001**: A slice with two non-overlapping `[P]` tasks completes faster than the equivalent serial run (verified by wall-clock timing in tests using mocked Codex).
- **SC-002**: A slice with overlapping `[P]` tasks runs serially with a human-readable warning — zero errors, zero orphaned worktrees.
- **SC-003**: A slice with no `[P]` tasks behaves identically to the current manual Codex invocation.
- **SC-004**: All 84 existing tests continue to pass after the change.
- **SC-005**: `run_factory.py doctor` continues to pass.

---

## Assumptions

- Codex workers are trusted to only modify files in the listed scope; the annotation is advisory for overlap detection, not a security boundary.
- Git worktrees at `/tmp/wt-{slug}-{i}` are safe to create and remove without user confirmation.
- The spec generation for each Codex worker (the prompt describing the task) is authored by `run_factory.py implement` from the task text and the relevant context files (`spec.md`, `plan.md`, `tasks.md`).
- Tasks within a parallel group are independent enough that each Codex worker needs only its own task description, not the full slice context.
