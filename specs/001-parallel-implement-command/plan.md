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
**Constraints**: Acyclic import graph must be preserved; worktrees at `/tmp/wt-{slug}-{i}`

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

**Chosen**: Inline in `command_implement` — read `spec.md`, `plan.md`, task text, and file scope from the annotation; compose a prompt string; write to `/tmp/codex-impl-{slug}-{i}.txt`; pass via `$(cat ...)`.

**Rationale**: Each worker needs focused context (just its task + relevant specs). Using a temp file avoids shell quoting problems with backticks (same pattern as existing Codex invocations in the codebase).

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
docs/workflow/operations/codex-skills/feature-factory/scripts/
├── factory_stages.py        ← ADD: parse_p_annotation(), parse_parallel_task_groups()
├── factory_git.py           ← ADD: create_worktree(), remove_worktree(),
│                                        get_worktree_commits(), cherry_pick_commits()
├── run_factory.py           ← ADD: command_implement(), wire into CLI subparser
└── (factory_state.py, factory_review.py, factory_deliver.py — unchanged)

docs/workflow/operations/codex-skills/feature-factory/tests/
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
4. Detect overlap: build `{file: [task_index]}` map; if any file maps to >1 task → overlap.
5. If overlap: one group, `parallel=False`, `overlap_warning="tasks N,M share file X"`.
6. If no overlap and ≥2 annotated tasks: parallel group for annotated tasks + separate serial group for unannotated tasks (run serial group after parallel group completes).
7. If 0 or 1 annotated tasks: single serial group.

---

### 2. `factory_git.py` — Worktree helpers

```python
def create_worktree(slug: str, index: int) -> Path:
    """Create git worktree at /tmp/wt-{slug}-{index} from HEAD. Removes stale first."""

def remove_worktree(slug: str, index: int) -> None:
    """Remove worktree and its directory. Silent if already gone."""

def remove_all_worktrees(slug: str, count: int) -> None:
    """Remove worktrees 0..count-1. Used for cleanup on failure."""

def get_new_commits(worktree_path: Path, base_sha: str) -> list[str]:
    """Return SHAs of commits in worktree since base_sha (oldest first)."""

def stage_and_commit_if_dirty(worktree_path: Path, message: str) -> str | None:
    """If worktree has unstaged/uncommitted changes, stage all and commit. Returns SHA or None."""

def cherry_pick_commits(commits: list[str]) -> tuple[bool, str]:
    """Cherry-pick commits onto REPO_ROOT HEAD. Returns (success, error_detail)."""
```

---

### 3. `run_factory.py` — `command_implement`

```python
def command_implement(args: argparse.Namespace) -> int:
    slug = args.slug
    groups = parse_parallel_task_groups(slug)

    if not groups:
        print("nothing to implement — all tasks complete or no tasks.md")
        return 0

    for group in groups:
        if not group["parallel"]:
            if group.get("overlap_warning"):
                print(f"[warn] {group['overlap_warning']} — running serially")
            _run_serial(slug, group["tasks"])
        else:
            _run_parallel(slug, group)

    return 0

def _run_serial(slug: str, tasks: list[str]) -> None:
    # Write prompt to /tmp/codex-impl-{slug}.txt
    # codex exec -m gpt-5.4-mini -s workspace-write "$(cat /tmp/codex-impl-{slug}.txt)"
    # revert_protected_files()

def _run_parallel(slug: str, group: dict) -> None:
    # base_sha = current HEAD
    # Create worktrees, write per-task prompts
    # ThreadPoolExecutor: run one Codex per worktree concurrently
    # For each worktree: stage_and_commit_if_dirty if needed, get_new_commits
    # cherry_pick_commits in task-index order
    # remove_all_worktrees on success and failure
```

**CLI wiring:**
```
subparser = subparsers.add_parser("implement", help="dispatch Codex for next slice")
subparser.add_argument("--slug", required=True)
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
| `test_parse_parallel_task_groups_serial_only` | No `[P]` tasks → single serial group |
| `test_parse_parallel_task_groups_parallel` | 2 non-overlapping `[P]` tasks → parallel group |
| `test_parse_parallel_task_groups_overlap` | 2 `[P]` tasks sharing a file → serial with warning |
| `test_parse_parallel_task_groups_single_p` | Only 1 `[P]` task → serial (no worktree overhead) |
| `test_parse_parallel_task_groups_respects_checkpoint` | Tasks after `[CHECKPOINT]` not included |
| `test_create_remove_worktree` | Worktree created at expected path, removed cleanly |
| `test_create_worktree_removes_stale` | Pre-existing worktree removed before creating fresh one |
| `test_stage_and_commit_if_dirty` | Dirty worktree gets staged and committed |
| `test_cherry_pick_commits_success` | Clean cherry-pick returns `(True, "")` |
| `test_cherry_pick_commits_conflict` | Conflicting cherry-pick returns `(False, detail)` |
| `test_command_implement_serial` | Serial path dispatches one Codex call |
| `test_command_implement_parallel` | Parallel path dispatches N Codex calls concurrently |
| `test_command_implement_cleans_up_on_failure` | Worktrees removed even when Codex fails |
