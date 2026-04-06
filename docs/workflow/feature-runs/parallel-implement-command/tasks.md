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

- [ ] T002 [P: docs/operations/codex-skills/feature-factory/scripts/factory_stages.py] Add `parse_p_annotation(line: str) -> list[str]` — regex extracts comma-separated file paths from `[P: file1, file2]`; validates paths (reject absolute, reject `..`-escape from REPO_ROOT); normalizes (strip `./`, collapse `//`, do NOT lowercase — preserve case); case-sensitive dedup; returns `[]` if absent or empty
- [ ] T003 [P: docs/operations/codex-skills/feature-factory/scripts/factory_git.py] Add `create_worktree(slug: str, index: int, run_fn=subprocess.run) -> Path` — sanitizes slug (replace `/` with `_`), creates `/tmp/wt-{sanitized_slug}-{pid}-{index}` via `git worktree add`, removing any pre-existing worktree first; `remove_worktree(path: Path, run_fn=subprocess.run) -> None` — uses `git worktree remove --force` + `git worktree prune`; `remove_all_worktrees(paths: list[Path], run_fn=subprocess.run) -> None`; all functions accept `run_fn` for test injection
- [ ] T004 [P: docs/operations/codex-skills/feature-factory/scripts/factory_stages.py] Add `parse_parallel_task_groups(slug: str) -> list[dict]` — reads tasks.md, collects unchecked tasks up to the next `[CHECKPOINT]` (or EOF), calls `parse_p_annotation` per line, detects file overlap on normalized paths, returns list of groups each with keys `tasks: list[str]`, `parallel: bool`, `files: list[str]`, `overlap_warning: str | None`; [P] with no file list → treated as unannotated; single [P] task → serial; ≥2 [P] tasks with no overlap → parallel group; overlap → serial with warning
- [ ] T005 [P: docs/operations/codex-skills/feature-factory/scripts/factory_git.py] Add `get_new_commits(worktree_path: Path, base_sha: str, run_fn=subprocess.run) -> list[str]`; `stage_and_commit_if_dirty(worktree_path: Path, message: str, run_fn=subprocess.run) -> str | None` — returns None when no changes (no empty commit); handles deleted files; `cherry_pick_commits(commits: list[str], run_fn=subprocess.run) -> tuple[bool, str]` — on failure runs `git cherry-pick --abort` first to clear in-progress state before returning (False, detail); all functions accept `run_fn` for test injection

[CHECKPOINT]

---

## Phase 3: US1 + US4 — `command_implement` and Worktree Lifecycle

**Purpose**: The core command. All tasks touch `run_factory.py` — sequential within this phase.

**Goal (US1)**: `implement --slug foo` dispatches parallel Codex workers for non-overlapping [P] tasks
**Goal (US4)**: Worktrees created, used, and cleaned up on both success and failure paths

- [ ] T006 [US1] Add `_build_codex_prompt(slug: str, i: int, tasks: list[str], file_scope: list[str]) -> str` to `docs/operations/codex-skills/feature-factory/scripts/run_factory.py` — sanitizes slug for filesystem use (replace `/` and path-unsafe chars with `_`); reads spec.md, plan.md, and tasks.md from the feature workflow dir; composes a focused implementation prompt string; writes to `/tmp/codex-impl-{safe_slug}-{i}.txt` (unique per task index); returns the prompt text (not the file path)
- [ ] T007 [US1] Add `_run_serial(slug: str, tasks: list[str]) -> int` to `run_factory.py` — sanitizes slug; builds prompt via `_build_codex_prompt`; runs Codex via `subprocess.run(["codex", "exec", "-m", "gpt-5.4-mini", "-s", "workspace-write", prompt_text], timeout=3600)` (argument list, not shell string — avoids injection); calls `revert_protected_files()`; cleans up temp file; returns exit code
- [ ] T008 [US1] [US4] Add `_run_parallel(slug: str, group: dict, max_workers: int = 4) -> int` to `run_factory.py` — captures HEAD sha as base; creates one worktree per task via `create_worktree`; dispatches Codex concurrently using `ThreadPoolExecutor(max_workers=max_workers)`; each Codex invoked as `subprocess.run(["codex", "exec", ...], cwd=str(worktree_path), timeout=3600)` (list form, cwd set, timeout prevents hung workers); AFTER all futures complete: call `executor.shutdown(wait=True, cancel_futures=True)` to cancel pending futures; for each task in original task-index order, call `stage_and_commit_if_dirty` then `get_new_commits` — collect all commit lists indexed by task; cherry-pick all commits in deterministic task-index order (oldest-first within each task); on cherry-pick failure: `cherry-pick --abort` then `git reset --hard base_sha`; on Codex failure: `git reset --hard base_sha`; call `revert_protected_files()` after cherry-picks succeed; remove all worktrees and temp prompt files in finally block; returns non-zero on any failure; sanitize slug in temp prompt file paths (same as worktree path sanitization)
- [ ] T009 [US1] [US2] Add `command_implement(args: argparse.Namespace) -> int` to `run_factory.py` — checks dirty working tree first (exit 1 if dirty); calls `parse_parallel_task_groups(slug)`, prints "nothing to implement" if empty; iterates groups propagating non-zero exit codes; prints overlap warning if present then calls `_run_serial`; else calls `_run_parallel(slug, group, max_workers=args.max_workers)`
- [ ] T010 [US1] Wire `implement` subparser into `run_factory.py` CLI: `subparsers.add_parser("implement")` with `--slug` required and `--max-workers` optional (type=int, default=4), `set_defaults(func=command_implement)`

---

## Phase 4: US3 — SKILL.md Update

**Purpose**: Ensure Gemini task generation produces properly annotated [P] tasks. Independent of Phase 3.

- [ ] T011 [US3: .claude/skills/feature-tasks/SKILL.md] Update `.claude/skills/feature-tasks/SKILL.md` Parallel Marker section to require `[P: repo/relative/file.ext]` annotation whenever a task is marked `[P]`; add a correct-format example and a note that `[P]` without a file list is treated as unannotated (serial) by the runner

[CHECKPOINT]

---

## Phase 5: Tests

**Purpose**: All new functions need unit tests in the existing test file.

- [ ] T012 Add unit tests for `parse_p_annotation` in `docs/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py`: with valid file list; empty list `[P:]`; bare `[P]` no colon; no annotation at all; multiple files; paths with slashes; duplicate files in one annotation (deduped); `./` prefix normalized; absolute path rejected (returns `[]` with warning); `..`-escape path rejected (returns `[]` with warning)
- [ ] T013 Add unit tests for `parse_parallel_task_groups` in `test_run_factory_repair.py`: no [P] tasks → single serial group; 2 non-overlapping [P] tasks → parallel group; 2 [P] tasks sharing a file → serial with overlap_warning; overlap warning text is printed to stdout/stderr; `./a.ts` and `a.ts` detected as overlap via normalization; single [P] task → serial; [P] without file list → treated as unannotated; tasks after [CHECKPOINT] not included; all tasks checked → empty return
- [ ] T014 Add unit tests for worktree helpers in `test_run_factory_repair.py` (pass mock `run_fn` to each function): `create_worktree` calls correct git commands with expected path; `create_worktree` calls remove before add when stale path exists; `remove_worktree` silent if path absent; `stage_and_commit_if_dirty` returns SHA when dirty; `stage_and_commit_if_dirty` returns None when clean (no empty commit); `stage_and_commit_if_dirty` with deleted file returns SHA (treated as dirty); `cherry_pick_commits` returns (True, "") on success; `cherry_pick_commits` returns (False, detail) on non-zero exit and also calls `git cherry-pick --abort` to clear in-progress state
- [ ] T015 Add integration-style tests for `command_implement` in `test_run_factory_repair.py` (mock subprocess and git helpers): serial path calls `_run_serial` once and returns exit code; parallel path calls `_run_parallel` once with correct `max_workers`; each Codex exec call has `cwd=worktree_path`; `ThreadPoolExecutor` called with `max_workers`; overlap → serial with warning printed; dirty working tree → exits 1 without calling Codex; empty groups → prints "nothing to implement" and exits 0; cherry-pick failure → HEAD reset to pre-dispatch sha and all worktrees removed
- [ ] T016 Run `python -m pytest docs/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py -q` — all tests must pass; run `python docs/operations/codex-skills/feature-factory/scripts/run_factory.py doctor` — must pass

[CHECKPOINT]

---

## Phase 6: Deliver

- [ ] T017 Run preflight: `python -m pytest docs/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py -q` passes; `doctor` passes
- [ ] T018 Update `STATUS.md` to mark `parallel implement command` as in-progress/done; update `MEMORY.md` if any new operational patterns were established
- [ ] T019 Commit and create PR against `chrislawcodes/valuerank` with title `feat(factory): add implement command with parallel Codex dispatch`

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
