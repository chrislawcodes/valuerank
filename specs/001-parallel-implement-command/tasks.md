# Tasks: Parallel Implementation via Codex Agent Teams

**Prerequisites**: spec.md, plan.md
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

## Format: `[ID] [P: file]? [Story]? Description`

- **[P: file]**: Can run in parallel with other [P] tasks — file list is the overlap-detection scope
- **[US1]/[US2]/[US3]/[US4]**: User story label (required in story phases)
- All paths are repo-relative from the valuerank root

---

## Phase 1: Setup

**Purpose**: Branch and verify baseline

- [ ] T001 Create feature branch `claude/parallel-implement-command` from `origin/main` and confirm `run_factory.py doctor` passes

---

## Phase 2: Foundation — Parsing + Git Helpers

**Purpose**: Pure functions that `command_implement` will depend on. Two independent file tracks (factory_stages.py and factory_git.py) can be implemented in parallel.

⚠️ **CRITICAL**: Phases 3–4 cannot begin until T002–T005 are complete.

- [ ] T002 [P: docs/workflow/operations/codex-skills/feature-factory/scripts/factory_stages.py] Add `parse_p_annotation(line: str) -> list[str]` — regex extracts comma-separated file paths from `[P: file1, file2]` in a task line; returns `[]` if pattern absent or file list empty
- [ ] T003 [P: docs/workflow/operations/codex-skills/feature-factory/scripts/factory_git.py] Add `create_worktree(slug: str, index: int) -> Path` — creates `/tmp/wt-{slug}-{index}` via `git worktree add`, removing any pre-existing worktree at that path first; and `remove_worktree(slug: str, index: int) -> None` and `remove_all_worktrees(slug: str, count: int) -> None` cleanup helpers
- [ ] T004 [P: docs/workflow/operations/codex-skills/feature-factory/scripts/factory_stages.py] Add `parse_parallel_task_groups(slug: str) -> list[dict]` — reads tasks.md, collects unchecked tasks up to the next `[CHECKPOINT]` (or EOF), calls `parse_p_annotation` per line, detects file overlap, returns list of groups each with keys `tasks: list[str]`, `parallel: bool`, `files: list[str]`, `overlap_warning: str | None`; [P] with no file list → treated as unannotated; single [P] task → serial; ≥2 [P] tasks with no overlap → parallel group; overlap → serial with warning
- [ ] T005 [P: docs/workflow/operations/codex-skills/feature-factory/scripts/factory_git.py] Add `get_new_commits(worktree_path: Path, base_sha: str) -> list[str]` — returns SHAs of commits in worktree since base_sha (oldest first); `stage_and_commit_if_dirty(worktree_path: Path, message: str) -> str | None` — stages all changes and commits if dirty, returns SHA or None; `cherry_pick_commits(commits: list[str]) -> tuple[bool, str]` — cherry-picks onto REPO_ROOT HEAD, returns (success, error_detail)

[CHECKPOINT]

---

## Phase 3: US1 + US4 — `command_implement` and Worktree Lifecycle

**Purpose**: The core command. All tasks touch `run_factory.py` — sequential within this phase.

**Goal (US1)**: `implement --slug foo` dispatches parallel Codex workers for non-overlapping [P] tasks
**Goal (US4)**: Worktrees created, used, and cleaned up on both success and failure paths

- [ ] T006 [US1] Add `_build_codex_prompt(slug: str, tasks: list[str], file_scope: list[str]) -> str` to `docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py` — reads spec.md, plan.md, and tasks.md from the feature workflow dir; composes a focused implementation prompt; writes to `/tmp/codex-impl-{slug}-{i}.txt`; returns the temp file path
- [ ] T007 [US1] Add `_run_serial(slug: str, tasks: list[str]) -> int` to `run_factory.py` — writes combined prompt to `/tmp/codex-impl-{slug}.txt`, runs `codex exec -m gpt-5.4-mini -s workspace-write "$(cat /tmp/codex-impl-{slug}.txt)"` via subprocess, calls `revert_protected_files()`, returns exit code
- [ ] T008 [US1] [US4] Add `_run_parallel(slug: str, group: dict) -> int` to `run_factory.py` — captures HEAD sha as base; creates one worktree per task via `create_worktree`; dispatches one Codex process per worktree concurrently using `ThreadPoolExecutor`; on each completion calls `stage_and_commit_if_dirty` then `get_new_commits`; cherry-picks all commits in task-index order; if any cherry-pick fails prints conflict detail and returns non-zero; calls `remove_all_worktrees` in both success and failure paths
- [ ] T009 [US1] [US2] Add `command_implement(args: argparse.Namespace) -> int` to `run_factory.py` — calls `parse_parallel_task_groups(slug)`, prints "nothing to implement" if empty, iterates groups: prints overlap warning if present then calls `_run_serial`; else prints "dispatching N parallel workers" then calls `_run_parallel`
- [ ] T010 [US1] Wire `implement` subparser into `run_factory.py` CLI: `subparsers.add_parser("implement")` with `--slug` required argument, `set_defaults(func=command_implement)`

---

## Phase 4: US3 — SKILL.md Update

**Purpose**: Ensure Gemini task generation produces properly annotated [P] tasks. Independent of Phase 3.

- [ ] T011 [US3: .claude/skills/feature-tasks/SKILL.md] Update `.claude/skills/feature-tasks/SKILL.md` Parallel Marker section to require `[P: repo/relative/file.ext]` annotation whenever a task is marked `[P]`; add a correct-format example and a note that `[P]` without a file list is treated as unannotated (serial) by the runner

[CHECKPOINT]

---

## Phase 5: Tests

**Purpose**: All new functions need unit tests in the existing test file.

- [ ] T012 Add unit tests for `parse_p_annotation` in `docs/workflow/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py`: with valid file list, with empty list `[P:]`, bare `[P]` no colon, no annotation at all, multiple files, paths with slashes
- [ ] T013 Add unit tests for `parse_parallel_task_groups` in `test_run_factory_repair.py`: no [P] tasks → single serial group; 2 non-overlapping [P] tasks → parallel group; 2 [P] tasks sharing a file → serial with overlap_warning; single [P] task → serial; [P] without file list → treated as unannotated; tasks after [CHECKPOINT] not included; all tasks checked → empty return
- [ ] T014 Add unit tests for worktree helpers in `test_run_factory_repair.py` (mock `subprocess.run`): `create_worktree` calls correct git commands; `create_worktree` removes stale path first; `remove_worktree` silent if path absent; `stage_and_commit_if_dirty` returns None when clean; `cherry_pick_commits` returns (True, "") on success; `cherry_pick_commits` returns (False, detail) on non-zero exit
- [ ] T015 Add integration-style tests for `command_implement` in `test_run_factory_repair.py` (mock subprocess and git helpers): serial path calls `_run_serial` once; parallel path calls `_run_parallel` once; overlap → serial with warning printed; empty groups → prints "nothing to implement" and exits 0
- [ ] T016 Run `python -m pytest docs/workflow/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py -q` — all tests must pass; run `python docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py doctor` — must pass

[CHECKPOINT]

---

## Phase 6: Deliver

- [ ] T017 Run preflight: `python -m pytest docs/workflow/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py -q` passes; `doctor` passes
- [ ] T018 Commit and create PR against `chrislawcodes/valuerank` with title `feat(factory): add implement command with parallel Codex dispatch`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundation (Phase 2)**: Depends on Setup — BLOCKS Phases 3–4
  - T002 and T003 are parallel (different files)
  - T004 and T005 are parallel (different files), each depends on its Phase 2 predecessor
- **command_implement (Phase 3)**: Depends on Foundation — tasks are sequential (all in run_factory.py)
- **SKILL.md (Phase 4)**: Depends on Foundation — can run in parallel with Phase 3
- **Tests (Phase 5)**: Depends on Phases 3 and 4
- **Deliver (Phase 6)**: Depends on Phase 5

### Parallel Opportunities Within Phases

- T002 ‖ T003 (factory_stages.py vs factory_git.py)
- T004 ‖ T005 (same files as T002/T003, run after those complete)
- Phase 4 (T011) ‖ Phase 3 (T006–T010) — different files, no dependency
