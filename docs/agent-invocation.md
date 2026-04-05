# Agent Invocation Syntax

## Codex

```bash
# Implementation tasks — requires -s workspace-write to write files
cd /path/to/worktree
codex exec -m gpt-5.4-mini -s workspace-write "$(cat /tmp/codex-spec.txt)"

# Read-only review/verification (no -s flag)
codex exec -m gpt-5.4-mini "$(cat /tmp/codex-review.txt)"
```

**After every Codex task:** run `git status` in the worktree. Codex doesn't always commit.

Sandbox access: `[workdir, /tmp, $TMPDIR]`. Run verification from main repo, not worktree.

For specs with backticks: write to `/tmp/codex-spec.txt`, pass via `$(cat /tmp/codex-spec.txt)`.

`config.toml` sandbox key doesn't work — only the `-s` CLI flag works reliably.

## Gemini

```bash
gemini -m gemini-2.5-pro --prompt "$(cat /tmp/gemini-prompt.txt)" --yolo > /tmp/gemini-output.txt
```

**After Gemini with --yolo:** run `git status` in the main worktree. Gemini may write files there.

Always pass MEMORY.md context to both agents. This is shared state across sessions.

## Escalation Signals (watch in agent output)

- `ESCALATE_TO_CLAUDE` — requires human judgment
- `IMPLEMENTATION_BLOCKED` — Codex can't proceed without clarification
- `MERGE_BLOCKED` — reviewer found a blocker; do not merge until resolved
- `PROCEED: NO` — Codex pre-flight found spec issues; fix before dispatching
