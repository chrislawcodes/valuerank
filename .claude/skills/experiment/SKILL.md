---
name: experiment
description: Dual-method experiment — runs a feature through Claude-solo AND the factory pipeline, tracking whether adversarial reviews actually change the implementation at each stage. Answers whether factory is worth the overhead.
argument-hint: <feature-description>
---

# Experiment Skill

Answers one question: **is the factory pipeline worth the overhead vs Claude doing it solo?**

The measurement is mechanical: at each adversarial review step, snapshot git state before and after. If the review caused code to change, it had teeth. If not, it was overhead. Tracked automatically, no manual work.

---

## Step 0 — Setup

Create a kebab-case slug (max 5 words). Create worktrees, experiment dirs, and token start markers:

```bash
git worktree add /tmp/wt-<slug>-direct -b claude/<slug>-direct
git worktree add /tmp/wt-<slug>-factory -b factory/<slug>
mkdir -p docs/feature-runs/<slug>-direct
mkdir -p docs/feature-runs/<slug>-factory

# Write token start markers — must happen BEFORE any work begins
python3 ~/.claude/scripts/token-usage.py snapshot > docs/feature-runs/<slug>-direct/token-start.txt
python3 ~/.claude/scripts/token-usage.py snapshot > docs/feature-runs/<slug>-factory/token-start.txt
```

Each experiment.md tracks one table. "Artifact" means whatever the stage produces — spec doc, plan doc, tasks doc, or implementation code:

| Stage | Artifact | Issues raised | Issues accepted | Artifact revised? |
|-------|----------|--------------|-----------------|-------------------|

---

## Stages A & B — Run in Parallel

Use the Agent tool to spawn both sub-agents in a single message. They run simultaneously — do not wait for one before launching the other.

**Agent 1 prompt (Stage A — Claude Solo):**
> You are running Stage A of a feature experiment in worktree `/tmp/wt-<slug>-direct` on branch `claude/<slug>-direct`.
> Run the full pipeline solo: spec → plan → tasks → implement.
> At each stage: do an adversarial self-review, capture SHA before and after (`git rev-parse HEAD`), record issues raised and accepted.
> Run preflight after implement, push, create PR to chrislawcodes/valuerank.
> After the PR is created, run: `python3 ~/.claude/scripts/token-usage.py total docs/feature-runs/<slug>-direct/token-start.txt`
> Record the total_billed_input and output_tokens in experiment.md under "## Claude token usage".
> Write all results to `docs/feature-runs/<slug>-direct/experiment.md`.
> Context: MEMORY.md at repo root. Feature: <feature description>.

**Agent 2 prompt (Stage B — Factory Pipeline):**
> You are running Stage B of a feature experiment in worktree `/tmp/wt-<slug>-factory` on branch `factory/<slug>`.
> Run the factory pipeline: /feature-spec → /feature-plan → /feature-tasks → /feature-implement.
> At each stage: Gemini and/or Codex run adversarial reviews. Capture SHA before and after, record issues raised and accepted.
> Push, create PR to chrislawcodes/valuerank.
> After the PR is created, run: `python3 ~/.claude/scripts/token-usage.py total docs/feature-runs/<slug>-factory/token-start.txt`
> Record the total_billed_input and output_tokens in experiment.md under "## Claude token usage".
> Write all results to `docs/feature-runs/<slug>-factory/experiment.md`.
> Context: MEMORY.md at repo root. Feature: <feature description>.

Both agents write to separate worktrees and experiment.md files — no coordination needed mid-run. Wait for both to complete before Stage C.

---

## Stage C — Comparison

Write `docs/feature-runs/<slug>-comparison.md`:

```markdown
# Experiment — <Feature Name>

**Direct PR:** #NNN | **Factory PR:** #NNN

## Did Reviews Change the Code?

| Stage | Path | Artifact | Issues raised | Issues accepted | Artifact revised? |
|-------|------|----------|--------------|-----------------|-------------------|
| Spec | Direct | spec.md | | | |
| Plan | Direct | plan.md | | | |
| Tasks | Direct | tasks.md | | | |
| Implement | Direct | code | | | |
| Spec | Factory | spec.md | | | |
| Plan | Factory | plan.md | | | |
| Tasks | Factory | tasks.md | | | |
| Implement | Factory | code | | | |

## Claude Token Usage

| Path | total_billed_input | output_tokens |
|------|--------------------|---------------|
| Direct | | |
| Factory | | |
| Delta | | |

Notes:
- total_billed_input = input_tokens + cache_creation_input_tokens (the tokens Claude actually processed)
- output_tokens = tokens generated
- cache_read_input_tokens excluded — they're cheap reads, not new work

## Verdict
- Factory reviews that changed code: N/M
- Direct reviews that changed code: N/M
- Claude token delta: Factory was X% cheaper/more expensive
- Was factory overhead justified?
```

Report to user with both PR links and the verdict table.
