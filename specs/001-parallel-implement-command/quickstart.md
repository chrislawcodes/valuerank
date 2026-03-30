# Quickstart: Parallel Implementation Command

## Prerequisites

- [ ] Feature factory installed and `doctor` passing
- [ ] A feature with a `tasks.md` containing `[P: ...]` annotated tasks
- [ ] `codex` CLI available (`which codex`)

---

## Testing User Story 1: Parallel dispatch for non-overlapping tasks

**Goal**: Verify two `[P]`-annotated tasks with disjoint files run concurrently in separate worktrees.

**Steps**:
1. Init a test feature: `python run_factory.py init --slug test-parallel`
2. Create a `tasks.md` with two `[P]` tasks and a `[CHECKPOINT]`:
   ```
   - [ ] Add foo service [P: src/services/foo.py]
   - [ ] Add bar service [P: src/services/bar.py]
   [CHECKPOINT]
   ```
3. Run: `python run_factory.py implement --slug test-parallel`

**Expected**:
- Runner prints "dispatching 2 parallel Codex workers"
- Two worktrees appear at `/tmp/wt-test-parallel-0` and `/tmp/wt-test-parallel-1`
- Both Codex processes run concurrently
- Commits cherry-picked back, worktrees cleaned up
- `git log --oneline -3` shows two implementation commits

---

## Testing User Story 2: Serial fallback

**Goal**: Verify tasks without `[P]` annotations run as a single Codex call.

**Steps**:
1. Create `tasks.md` with plain tasks:
   ```
   - [ ] Implement feature X
   - [ ] Add tests for X
   [CHECKPOINT]
   ```
2. Run: `python run_factory.py implement --slug test-parallel`

**Expected**:
- Runner prints "dispatching serial Codex call (2 tasks)"
- No worktrees created
- Single Codex call with both tasks in the prompt

---

## Testing User Story 2b: Overlap detected → serial fallback with warning

**Steps**:
1. Create `tasks.md` where two `[P]` tasks share a file:
   ```
   - [ ] Add route [P: src/routes/index.ts]
   - [ ] Update barrel [P: src/routes/index.ts]
   [CHECKPOINT]
   ```
2. Run: `python run_factory.py implement --slug test-parallel`

**Expected**:
- Runner prints `[warn] tasks 0,1 share src/routes/index.ts — running serially`
- Single Codex call dispatched, no worktrees

---

## Testing User Story 4: Worktree cleanup on failure

**Steps**:
1. Create `tasks.md` with two `[P]` tasks pointing to non-existent files
2. Run implement; interrupt Codex mid-run (Ctrl+C) or let Codex fail
3. Check: `ls /tmp/wt-test-parallel-*`

**Expected**: No worktrees remain. Command exits non-zero with error message.

---

## Troubleshooting

**Issue**: `git worktree add` fails with "already exists"
**Fix**: The runner should have cleaned this up. Manually: `git worktree remove /tmp/wt-{slug}-0 --force`

**Issue**: Cherry-pick conflict
**Fix**: The runner will print which tasks share files. Remove `[P]` from one of them and re-run.

**Issue**: Codex makes no commit in worktree
**Fix**: The runner auto-stages and commits. If you see "auto-committed worktree changes" in output, this worked correctly.
