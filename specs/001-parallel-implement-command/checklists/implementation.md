# Implementation Quality Checklist

**Feature**: [tasks.md](../tasks.md)

## Code Quality (per cloud/CLAUDE.md)

- [ ] No `any` types — use specific types or `unknown`
- [ ] All new functions have typed signatures
- [ ] No `console.log` — use structured logging (Python: print to stderr for warnings, structured output for status)
- [ ] Files stay under 400 lines; split if growing

## Import Graph

- [ ] Acyclic import graph preserved: `factory_state` ← `factory_git` ← `factory_stages` ← `run_factory`
- [ ] No circular imports introduced

## Error Handling

- [ ] Worktree cleanup runs on both success and failure paths
- [ ] Cherry-pick failure prints actionable message (which tasks overlap)
- [ ] Codex failure exits non-zero and cleans up worktrees
- [ ] Git command failures raise/propagate with context

## Protected Files

- [ ] `revert_protected_files()` called after every Codex subprocess
- [ ] CLAUDE.md, AGENTS.md, MEMORY.md not modified by Codex workers
