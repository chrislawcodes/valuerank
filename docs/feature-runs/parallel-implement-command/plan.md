# Implementation Plan: Parallel Implementation via Codex Agent Teams

**Branch**: `claude/parallel-implement-command` | **Date**: 2026-03-29 | **Spec**: [spec.md](spec.md)

## Summary

Add a `run_factory.py implement --slug <slug>` command that reads the next `[CHECKPOINT]`-bounded slice from `tasks.md`, identifies tasks annotated `[P: file1, file2]`, detects file-scope overlap, and when safe dispatches one `codex exec` worker per task in an isolated git worktree — merging results back via cherry-pick. Tasks without `[P]` annotations or with overlapping file sets fall back to a single serial Codex call.

---

## Technical Context

**Language**: Python 3.11+
**Testing**: pytest (`test_run_factory_repair.py`)
**Key tool**: `codex exec -m gpt-5.4-mini -s workspace-write`
**Storage**: None (filesystem only — `tasks.md`, git worktrees)
**Performance Goals**: Parallel path must complete faster than serial for ≥2 non-overlapping tasks (SC-001)
**Constraints**: Acyclic import graph must be preserved; worktrees at `/tmp/wt-{slug}-{pid}-{i}`; dirty working tree = hard failure; `--max-workers` flag (default 4)

---

## Constitution Check

**Status**: PASS

`cloud/CLAUDE.md` covers TypeScript/Node.js standards; this feature is pure Python tooling and does not touch the cloud app. No violations.

---

## Architecture Decisions

### Decision 1: Where to put annotation parsing and overlap detection

**Chosen**: `factory_stages.py`

**Rationale**: Parsing `tasks.md` for structure (checkpoint markers, `[P]` annotations) is already in `factory_stages.py` (`parse_checkpoint_markers`). Overlap detection is a pure function of the parsed task data — no git or subprocess involvement. Adding it here keeps the import graph acyclic.

**Alternatives Considered**:
- New `factory_implement.py` module: Would require another file and an import edge; not justified for ~60 lines of parsing logic.
- `run_factory.py` directly: Violates the principle that `run_factory.py` is CLI plumbing only, not logic.

---

### Decision 2: Where to put worktree helpers

**Chosen**: `factory_git.py`

**Rationale**: `factory_git.py` already owns all git subprocess wrappers (`git_output`, `revert_protected_files`, etc.). Worktree creation/removal is a pure git operation with no domain knowledge.

**Alternatives Considered**:
- Inline in `run_factory.py`: Makes command handler too long and untestable.

---

### Decision 3: Where to put parallel dispatch orchestration

**Chosen**: `run_factory.py` (`command_implement`)

**Rationale**: Dispatch is the command handler — it composes `factory_stages` (parsing), `factory_git` (worktrees), and `subprocess` (Codex). `run_factory.py` is already the composition layer. Using `concurrent.futures.ThreadPoolExecutor` for parallel Codex is the same pattern just shipped in `factory_review.py`.

---

### Decision 4: How to build each Codex worker's prompt

**Chosen**: Inline in `command_implement` — read `spec.md`, `plan.md`, task text, and file scope from the annotation; compose a prompt string; pass as a direct argument to `subprocess.run(["codex", "exec", ..., prompt_text])`. No shell expansion.

**Rationale**: Each worker needs focused context (just its task + relevant specs). Passing as a subprocess argument avoids all shell injection and quoting issues. The temp file approach is explicitly rejected to prevent shell metacharacter issues.

---

### Decision 5: Cherry-pick vs merge for integrating worktree results

**Chosen**: Cherry-pick each worktree's commits in task-index order.

**Rationale**: Cherry-pick preserves individual commit authorship and gives a clean, readable history. Since file sets don't overlap, cherry-picks should be conflict-free. If one does conflict (bad annotation), it fails loudly — the right behaviour (FR-010).

**Alternatives Considered**:
- `git merge --squash`: Loses per-task granularity; makes it harder to bisect if something breaks.
- `git merge`: Creates a merge commit; messier history for what should be linear implementation work.

---

## Project Structure

Changes are confined to the feature factory scripts directory and the feature-tasks skill:

```
docs/operations/codex-skills/feature-factory/scripts/
├── factory_stages.py        ← ADD: parse_p_annotation(), parse_parallel_task_groups()
├── factory_git.py           ← ADD: create_worktree(), remove_worktree(),
│                                        get_worktree_commits(), cherry_pick_commits()
├── run_factory.py           ← ADD: command_implement(), wire into CLI subparser
└── (factory_state.py, factory_review.py, factory_deliver.py — unchanged)

docs/operations/codex-skills/feature-factory/tests/
└── test_run_factory_repair.py  ← ADD: tests for new functions

.claude/skills/feature-tasks/
└── SKILL.md                 ← UPDATE: require [P: file-scope] when marking [P]
```

---

## Detailed Design

### 1. `factory_stages.py` — Annotation parsing + overlap detection

```python
# Parse [P: file1, file2] from a task line. Returns [] if no [P] or no file list.
def parse_p_annotation(line: str) -> list[str]:
    ...

# Returns list of task groups for the next [CHECKPOINT]-bounded slice.
# Each group: {"tasks": [str], "parallel": bool, "files": list[str], "overlap_warning": str|None}
# - parallel=True only when ≥2 tasks all have [P] annotations with non-overlapping file sets
# - overlap_warning set when [P] tasks exist but have overlapping files
def parse_parallel_task_groups(slug: str) -> list[dict]:
    ...
```

**Logic for `parse_parallel_task_groups`:**
1. Read `tasks.md`, find unchecked tasks up to next `[CHECKPOINT]` (or EOF).
2. Collect all `[P: ...]` annotated tasks. Strip `[P: ...]` from task text for Codex prompt.
3. For tasks with `[P]` but no file list: treat as unannotated (add to serial group, no warning).
4. Validate and normalize paths before comparison:
   - Reject absolute paths (starting with `/`) — treat as unannotated, print warning.
   - Resolve `..` components using `Path(REPO_ROOT / p).resolve()` to prevent traversal; reject any path that escapes REPO_ROOT.
   - Strip leading `./`, collapse `//`. Do NOT lowercase — preserve case (unsafe on case-sensitive filesystems).
   - Sanitize `slug` before using in worktree path: replace `/` and other path separators with `_`.
   - Deduplicate within a single annotation (case-sensitive dedup).
5. Detect overlap: build `{normalized_file: [task_index]}` map; if any file maps to >1 task → overlap.
6. If overlap: one group, `parallel=False`, `overlap_warning="tasks N,M share file X"`.
7. If no overlap and ≥2 annotated tasks: parallel group for annotated tasks + separate serial group for unannotated tasks (run serial group after parallel group completes).
8. If 0 or 1 annotated tasks: single serial group.

---

### 2. `factory_git.py` — Worktree helpers

All git-calling functions accept an optional `run_fn` parameter (default `subprocess.run`) so unit tests can inject a mock without patching the global module.

```python
def create_worktree(slug: str, index: int, run_fn=subprocess.run) -> Path:
    """Create git worktree at /tmp/wt-{slug}-{pid}-{index} from HEAD. Removes stale first."""

def remove_worktree(path: Path, run_fn=subprocess.run) -> None:
    """Remove worktree at given path using 'git worktree remove --force'.
    Runs 'git worktree prune' after removal. Silent if already gone."""

def remove_all_worktrees(paths: list[Path], run_fn=subprocess.run) -> None:
    """Remove all listed worktrees. Calls remove_worktree on each; runs 'git worktree prune' once at end."""

def get_new_commits(worktree_path: Path, base_sha: str, run_fn=subprocess.run) -> list[str]:
    """Return SHAs of commits in worktree since base_sha (oldest first)."""

def stage_and_commit_if_dirty(worktree_path: Path, message: str, run_fn=subprocess.run) -> str | None:
    """If worktree has unstaged/uncommitted changes, stage all and commit. Returns SHA or None.
    Returns None if no changes detected (empty worktree — no commit created).
    Handles: no changes, deleted files, modified files."""

def cherry_pick_commits(commits: list[str], run_fn=subprocess.run) -> tuple[bool, str]:
    """Cherry-pick commits onto REPO_ROOT HEAD. Returns (success, error_detail).
    On failure: runs 'git cherry-pick --abort' to clean the in-progress cherry-pick state
    before returning (False, detail). Caller is responsible for git reset --hard base_sha."""
```

---

### 3. `run_factory.py` — `command_implement`

```python
def command_implement(args: argparse.Namespace) -> int:
    slug = args.slug
    max_workers = args.max_workers  # from --max-workers flag (default 4)

    # FR-002: hard failure on dirty working tree
    if working_tree_is_dirty():
        print("error: uncommitted changes — stash or commit before running implement", file=sys.stderr)
        return 1

    groups = parse_parallel_task_groups(slug)

    if not groups:
        print("nothing to implement — all tasks complete or no tasks.md")
        return 0

    for group in groups:
        if not group["parallel"]:
            if group.get("overlap_warning"):
                print(f"[warn] {group['overlap_warning']} — running serially")
            rc = _run_serial(slug, group["tasks"])
        else:
            rc = _run_parallel(slug, group, max_workers=max_workers)
        if rc != 0:
            return rc

    return 0

def _run_serial(slug: str, tasks: list[str]) -> int:
    # Write prompt to /tmp/codex-impl-{slug}.txt
    # subprocess.run(["codex", "exec", "-m", "gpt-5.4-mini", "-s", "workspace-write",
    #                 prompt_text], ...)  — pass prompt as arg, NOT via shell expansion
    # revert_protected_files()
    # Returns exit code from Codex

def _run_parallel(slug: str, group: dict, max_workers: int = 4) -> int:
    # base_sha = current HEAD sha (for rollback on failure)
    # Create worktrees, write per-task prompts to /tmp/codex-impl-{slug}-{i}.txt
    # Each codex exec: subprocess.run(["codex", "exec", ...], cwd=str(worktree_path))
    # — cwd=worktree_path guarantees isolation; repo-relative paths resolve correctly
    # — pass prompt as argument list, NOT via shell string expansion
    # ThreadPoolExecutor(max_workers=max_workers): run one Codex per worktree concurrently
    # For each worktree: stage_and_commit_if_dirty if needed, get_new_commits
    # cherry_pick_commits in task-index order
    # On cherry-pick failure: cherry-pick --abort run first (git cleanup),
    #   then git reset --hard base_sha (undo any earlier cherry-picks), return 1
    # On Codex failure: git reset --hard base_sha (no cherry-picks applied), return 1
    # remove_all_worktrees + /tmp/codex-impl-*.txt cleanup in finally block (success and failure)
```

**CLI wiring:**
```
subparser = subparsers.add_parser("implement", help="dispatch Codex for next slice")
subparser.add_argument("--slug", required=True)
subparser.add_argument("--max-workers", type=int, default=4,
                       help="max concurrent Codex workers (default: 4)")
subparser.set_defaults(func=command_implement)
```

---

### 4. `.claude/skills/feature-tasks/SKILL.md` — Update parallel task rules

Add to the "Parallel tasks" section (or create one):

> When marking a task `[P]`, you MUST include a comma-separated list of the files that task will modify, using repo-relative paths:
> ```
> - [ ] Add the route handler [P: apps/api/src/routes/foo.ts]
> - [ ] Add the service layer [P: apps/api/src/services/foo.ts]
> ```
> A `[P]` marker without a file list will be treated as unannotated (serial) by the runner.

---

## Test Plan

All new tests go in `test_run_factory_repair.py` (existing test file).

| Test | What it verifies |
|---|---|
| `test_parse_p_annotation_with_files` | `[P: a.ts, b.ts]` → `["a.ts", "b.ts"]` |
| `test_parse_p_annotation_no_files` | `[P]` with no file list → `[]` |
| `test_parse_p_annotation_not_present` | Task without `[P]` → `[]` |
| `test_parse_p_annotation_paths_with_slashes` | `[P: a/b/c.ts]` parses correctly |
| `test_parse_p_annotation_deduplicates` | `[P: a.ts, b.ts, a.ts]` → `["a.ts", "b.ts"]` (dedup) |
| `test_parse_p_annotation_normalizes_paths` | `[P: ./a.ts]` → `["a.ts"]` (strip leading `./`) |
| `test_parse_parallel_task_groups_serial_only` | No `[P]` tasks → single serial group |
| `test_parse_parallel_task_groups_parallel` | 2 non-overlapping `[P]` tasks → parallel group |
| `test_parse_parallel_task_groups_overlap` | 2 `[P]` tasks sharing a file → serial with warning printed |
| `test_parse_parallel_task_groups_overlap_via_normalization` | `[P: ./a.ts]` and `[P: a.ts]` detected as overlap after normalization |
| `test_parse_parallel_task_groups_single_p` | Only 1 `[P]` task → serial (no worktree overhead) |
| `test_parse_parallel_task_groups_respects_checkpoint` | Tasks after `[CHECKPOINT]` not included |
| `test_create_remove_worktree` | `create_worktree` calls correct git commands (via mock run_fn) |
| `test_create_worktree_removes_stale` | Pre-existing worktree removed before creating fresh one |
| `test_remove_worktree_silent_if_absent` | `remove_worktree` on missing path does not raise |
| `test_stage_and_commit_if_dirty` | Dirty worktree gets staged and committed; returns SHA |
| `test_stage_and_commit_if_clean` | Clean worktree returns None (no empty commit created) |
| `test_stage_and_commit_with_deleted_file` | Worktree with deleted file treated as dirty, gets committed |
| `test_cherry_pick_commits_success` | Clean cherry-pick returns `(True, "")` |
| `test_cherry_pick_commits_conflict` | Conflicting cherry-pick returns `(False, detail)` |
| `test_command_implement_serial` | Serial path: one Codex subprocess call with expected args |
| `test_command_implement_parallel` | Parallel path: N Codex calls each with `cwd=worktree_path`; `ThreadPoolExecutor` called with `max_workers` |
| `test_command_implement_respects_max_workers` | `--max-workers 2` limits pool size |
| `test_command_implement_cleans_up_on_failure` | Worktrees removed and HEAD reset on Codex failure |
| `test_command_implement_cleans_up_on_cherry_pick_conflict` | HEAD reset to pre-dispatch sha on conflict |

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Spec revised: fixed overlap contradiction (warn+serial, not fail), dirty-tree is now hard failure, empty worktree skips commit, multi-commit cherry-picks each individually, pre-dispatch HEAD reset on failure, PID in worktree path, --max-workers flag added. Rejected: post-hoc file-scope validation and dependency graph (deferred to future wave).
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: Spec revised: fixed overlap contradiction (warn+serial, not fail), dirty-tree is now hard failure, empty worktree skips commit, multi-commit cherry-picks each individually, pre-dispatch HEAD reset on failure, PID in worktree path, --max-workers flag added. Rejected: post-hoc file-scope validation and dependency graph (deferred to future wave).
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Spec revised: fixed overlap contradiction (warn+serial, not fail), dirty-tree is now hard failure, empty worktree skips commit, multi-commit cherry-picks each individually, pre-dispatch HEAD reset on failure, PID in worktree path, --max-workers flag added. Rejected: post-hoc file-scope validation and dependency graph (deferred to future wave).
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: Addressed and deferred: (1) New file creation race: DEFER per spec — annotation is advisory, overlap detection fires on declared paths only, post-hoc validation deferred. (2) /tmp security: DEFER — standard developer tool practice; source code already on disk. (3) Case-sensitivity: ACCEPTED — using case-sensitive comparison is the safe default for Linux/Docker; macOS false-negative risk accepted as known limitation. (4) ARG_MAX: DEFER — typical spec+plan+task prompts are well under 2MB limit. (5) Logical deps: DEFER per spec. (6) Rollback atomicity: addressed — cherry-pick --abort in cherry_pick_commits + finally block. (7) All-or-nothing: intentional per spec FR-011.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Addressed and deferred: (1) Serial-after-parallel context gap: DEFER — in a mixed slice, serial tasks should be designed to be independent of parallel tasks (same as annotation independence rule). (2) Commit strategy contradiction: REJECT — design is correct: Codex may or may not commit; stage_and_commit_if_dirty handles the no-commit case; get_new_commits retrieves whichever commits exist. Not contradictory. (3) Silent [P] without file list: DEFER per spec FR-004 — treating bare [P] as serial is intentional. (4) ARG_MAX: DEFER — well under 2MB for typical prompts.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Addressed and deferred: (1) Mutual exclusion for concurrent runs: DEFER — single-user tool, v1 scope. (2) Task ordering (serial-after-parallel): intentional per FR-013. (3) Annotation trust without post-hoc validation: DEFER per spec. (4) Slug collision: ACCEPT — implementation uses safe encoding; kebab-case slugs don't contain separators in practice; worst case: stale worktree removed and recreated.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: Addressed and rejected: (1) Worktree path collision: REJECT — pid is the process PID (shared across threads) but index is unique per task within the group, so /tmp/wt-{slug}-{pid}-{index} IS unique. (2) revert_protected_files undefined: REJECT — existing function in factory_git.py. (3) Directory vs file overlap: DEFER — file-level annotations only, not directory-level, v1 scope. (4) Mixed valid/invalid paths: implementation rejects invalid paths with warning; valid paths in same annotation can still be used.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Addressed and deferred: (1) revert_protected_files: REJECT — existing function in codebase. (2) cancel_futures doesn't stop running subprocesses: ACCEPT — known Python limitation, subprocess timeout=3600 bounds max wait. (3) SIGKILL cleanup: DEFER — cannot protect against SIGKILL; standard developer tool limitation. (4) Symlinks: DEFER — v1 scope. (5) Directory overlap: DEFER — file-level only, v1 scope. (6) Prompt temp file vs arg: RESOLVED — T006 writes to temp file, T007 reads and passes text as arg (not via shell); implementation should add PID to temp file path to prevent cross-run collision.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Addressed and rejected: (1) Internal .. segments: REJECT — already handled by Path(REPO_ROOT/p).resolve() in T002; resolves ../src/a.ts correctly. (2) Prompt file PID: ACCEPT — implementation should add PID to /tmp/codex-impl-{safe_slug}-{pid}-{i}.txt; noted as implementation detail. (3) get_new_commits ordering: REJECT — T005 already specifies 'oldest first'. (4) Mixed interleaved blocks: REJECT — FR-013 specifies serial-after-parallel; no split on serial boundary.
