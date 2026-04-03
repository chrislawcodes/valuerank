# Install Notes: feature-workflow-repair

This repair touches home-directory workflow files as well as repo-local workflow docs.

## Home-directory files touched

- `/Users/chrislaw/.claude/commands/spec.md`
- `/Users/chrislaw/.claude/commands/plan.md`
- `/Users/chrislaw/.claude/commands/wave.md`
- `/Users/chrislaw/.claude/commands/feature-spec.md`
- `/Users/chrislaw/.claude/commands/feature-plan.md`
- `/Users/chrislaw/.claude/commands/feature-tasks.md`
- `/Users/chrislaw/.claude/commands/feature-implement.md`
- `/Users/chrislaw/.claude/commands/resume.md`

## Home-directory files audited but left unchanged

- `/Users/chrislaw/.codex/skills/feature-workflow/SKILL.md`
- `/Users/chrislaw/.codex/skills/feature-workflow/CODEX-ORCHESTRATOR.md`

## Repo-local files touched

- `/Users/chrislaw/valuerank/.claude/skills/feature-tasks/SKILL.md`
- `/Users/chrislaw/valuerank/.claude/skills/experiment/SKILL.md`
- `/Users/chrislaw/valuerank/docs/operations/codex-skills/feature-factory/SKILL.md`
- `/Users/chrislaw/valuerank/docs/operations/codex-skills/feature-factory/CODEX-ORCHESTRATOR.md`
- `/Users/chrislaw/valuerank/experiments.md`

## Follow-up for another workstation

1. Sync the touched `~/.claude/commands` files.
2. Review the existing `~/.codex/skills/feature-workflow` pointer files and leave them as-is
   if they still point at the repo-owned Feature Factory docs.
3. Pull the repo changes so the repo-owned Feature Factory docs and experiment skill match.

## Guardrails

- Do not recreate `docs/workflows/<slug>/`, `workflow.json`, or `run_feature_workflow.py`.
- Do not treat repo-root `MEMORY.md` as workflow runtime state.
- Keep plain `/spec`, `/plan`, and `/wave` as redirect-only shims in ValueRank.
