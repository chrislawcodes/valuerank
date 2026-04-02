# Claude-Direct Experiment Instructions

You are running this feature **Claude-direct** — no feature factory, no Gemini checkpoints, no Codex workers.

## Your job

1. **Read the feature request** and write a short plan (what you're building, key decisions, files you'll touch)
2. **Attack your own plan** — look for bugs, edge cases, and integration risks before writing any code. Be adversarial. What could go wrong?
3. **Implement** based on the plan
4. **Create a PR**

## Token tracking — do this first

Before anything else, write a start marker:

```bash
python3 ~/.claude/scripts/token-usage.py snapshot > docs/feature-runs/<slug>/token-start.txt
```

At the very end (after PR is created), report total Claude tokens for the feature:

```bash
python3 ~/.claude/scripts/token-usage.py total docs/feature-runs/<slug>/token-start.txt
```

Record the `total_billed_input` and `output_tokens` values in experiment.md.

## Experiment tracking — maintain this file throughout

Create `docs/feature-runs/<slug>/experiment.md` immediately (use the feature slug as the directory name) and keep it updated as you work:

```markdown
## Method
claude-direct

## Pre-implementation findings
<!-- Every issue you caught during your self-review of the plan, before writing code -->
<!-- Format: - [acted on: yes/no] description -->

## Human interruptions
<!-- Every time the human had to step in to unblock, correct, or redirect you -->
<!-- Format: - [brief description of what happened] -->

## Claude token usage
<!-- Run: python3 ~/.claude/scripts/token-usage.py total docs/feature-runs/<slug>/token-start.txt -->
- total_billed_input:
- output_tokens:

## Post-merge bugs
<!-- Fill in after PR is merged if any issues are found -->
- none
```

**Rules:**
- Log a finding for every real issue you catch during plan self-review — not nitpicks, but things that would have caused a bug or wrong behavior if you hadn't caught them
- Log an interruption every time the human has to correct your direction, unblock you, or make a decision you couldn't make yourself
- Be honest — this data is only useful if it's accurate

## What NOT to do
- Don't run `run_factory.py` for anything
- Don't invoke Gemini or Codex
- Don't create spec.md, plan.md, or tasks.md in the feature-runs directory — just `experiment.md` and your normal implementation work
