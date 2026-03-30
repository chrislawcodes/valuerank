# Testing Quality Checklist

**Feature**: [tasks.md](../tasks.md)

## Pre-Commit (per cloud/CLAUDE.md preflight)

- [ ] `python -m pytest docs/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py -q` — all pass
- [ ] `python docs/operations/codex-skills/feature-factory/scripts/run_factory.py doctor` — all OK
- [ ] Existing 84 tests still pass (no regressions)

## Coverage

- [ ] `parse_p_annotation` — valid list, empty list, bare [P], no annotation
- [ ] `parse_parallel_task_groups` — serial, parallel, overlap, single [P], checkpoint boundary, all-checked
- [ ] Worktree helpers — create, stale cleanup, remove, dirty commit, cherry-pick success, cherry-pick conflict
- [ ] `command_implement` — serial path, parallel path, overlap warning, empty (nothing to do)

## Test Quality

- [ ] Git operations mocked via `patch.object(subprocess, "run")` — no real worktrees created in tests
- [ ] Each test is independent (no shared state between tests)
- [ ] Failure messages are assertable strings (not just returncode checks)
