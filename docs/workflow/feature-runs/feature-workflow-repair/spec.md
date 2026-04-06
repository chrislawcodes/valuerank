# Spec: feature-workflow-repair

## Problem

Recent workflow cleanup improved the repo contract, but the workflow surface is still not
consistent end to end.

Current problems:

- some command wrappers and repo-owned workflow docs disagree about the right entrypoint
- some entrypoints can skip mandatory discovery or point to an invalid stage sequence
- the experiment skill no longer measures overhead mechanically
- the repo contract is cleaner now, and we should keep that without bringing back stale
  duplicate workflow logic

## Goal

Make the ValueRank workflow entrypoints consistent, safe, and measurable without
reintroducing multiple conflicting sources of truth.

## Requirements

- Repo-owned Feature Factory remains the source of truth for workflow state and stage order.
- `AGENTS.md` and `cloud/CLAUDE.md` stay aligned on terminology and memory policy.
- `MEMORY.md` remains a short active handoff file, not workflow runtime state.
- Plain home-directory commands such as `/spec`, `/plan`, and `/wave` are ValueRank shims
  only:
  - in ValueRank, they redirect to `/feature-spec`, `/feature-plan`, or
    `/feature-implement` and stop
  - they do not call `run_factory.py` themselves
  - outside ValueRank, they refuse to invent a repo-specific workflow and tell the agent
    to use that repo's own docs
- Touched commands under `~/.claude/commands` must state their scope clearly:
  - generic helper
  - or ValueRank-specific convenience wrapper
- `feature-*` commands are the ValueRank convenience layer.
- A `workflow scope path` means one repo-relative path passed to
  `run_factory.py init --slug <slug> --path <path>`.
- On a fresh slug, `feature-spec` must collect at least one workflow scope path before it
  runs `init`.
- Before `feature-spec` calls `checkpoint --stage spec`, it must record discovery in the
  runner state with one of these exact paths:
  - discovery path: one or more `run_factory.py discover ...` calls that record questions,
    answers, or unresolved items and then finish with `--complete`
  - carried-assumptions path: `run_factory.py discover --slug <slug> --summary <text>`
    plus one or more `--assumption <text>` flags and `--complete`
- Prose alone does not satisfy discovery. The discovery state must be written through the
  runner.
- `feature-plan` must run `run_factory.py status --slug <slug>` first.
- If `status --slug <slug>` shows that spec or discovery is still incomplete, `feature-plan`
  must redirect to `/feature-spec <slug>` and stop.
- `feature-plan` may call `checkpoint --stage plan` only when `status --slug <slug>` shows
  that `plan` is the next ready stage.
- `/resume` stays generic. In ValueRank, its default search must prefer handoff, progress,
  or status notes and only use `docs/workflow/feature-runs/<slug>/state.json` as supporting context.
  It must not surface raw `state.json` as the default progress file.
- The installed Codex pointer stays thin and continues to point only at repo-owned Feature
  Factory docs and runner code.
- Repo-owned workflow docs that describe current stage order must stay in sync:
  - `docs/operations/codex-skills/feature-factory/SKILL.md`
  - `docs/operations/codex-skills/feature-factory/CODEX-ORCHESTRATOR.md`
  - `docs/workflow/plans/feature-workflow-plan.md`
- The existing Gemini rate-limit protection must not regress:
  - Gemini review launches are offset by 30 seconds
  - the runner may overlap Gemini reviews, but it must preserve that 30-second stagger
  - do not launch multiple Gemini reviews at the same moment without that stagger
- Experiment comparisons must include mechanical review-effect data and overhead data that
  work for Claude or Codex.
- Direct Path measurement must use one fixed structured self-review pass per stage. Use
  the same review checklist every time so issue counts are comparable.
- Experiment artifacts must use one pinned markdown table layout with exact column order.
- Mechanical artifact markers use SHA-256 only:
  - decode the saved file as UTF-8 text
  - normalize line endings only: convert `\r\n` and `\r` to `\n`
  - do not trim whitespace, collapse blank lines, or reorder content
  - hash the resulting UTF-8 bytes
  - document stages hash the saved artifact file
  - implementation stages hash a saved scoped diff patch
- If the repair depends on home-directory files under `~/.claude` or `~/.codex`, the plan
  must record the manual sync or install expectation in
  `docs/workflow/feature-runs/feature-workflow-repair/install-notes.md`.

## Non-goals

- Renaming the installed `feature-workflow` skill to `feature-factory`
- Re-architecting `run_factory.py`
- Rewriting the full Feature Factory process
- Turning every home-directory command into a portable workflow framework for all repos

## Acceptance Criteria

- Canonical ValueRank workflow entrypoints are explicit and documented:
  - plain global commands are not the canonical path
  - `feature-*` commands or repo-owned docs are the canonical convenience layer
- Any touched home-directory command clearly states whether it is generic or
  ValueRank-specific. No ambiguous half-redirects remain.
- In ValueRank, plain `/spec` tells the agent to use `/feature-spec <slug>` and stops
  without calling `run_factory.py`.
- In ValueRank, plain `/plan` tells the agent to use `/feature-plan <slug>` and stops
  without calling `run_factory.py`.
- In ValueRank, plain `/wave` tells the agent to use `/feature-implement <slug>` and stops
  without calling `run_factory.py`.
- Outside ValueRank, touched plain commands either behave generically or refuse to invent a
  repo-specific workflow.
- `feature-spec` can initialize a fresh slug because it gathers at least one repo-relative
  scope path and passes it through `run_factory.py init --slug <slug> --path <path>`.
- `feature-spec` cannot move into spec checkpoint until discovery is written through
  `run_factory.py discover ... --complete` or the carried assumptions are written through
  `run_factory.py discover --summary ... --assumption ... --complete`.
- `feature-plan` runs `status --slug <slug>` first and redirects to `/feature-spec <slug>`
  when spec or discovery is still incomplete.
- `feature-plan` cannot tell agents to run `checkpoint --stage plan` when the prerequisite
  spec work is still missing.
- `feature-tasks` is audited so it does not point agents at stale stage order or stale
  next-step text.
- `feature-implement` does not present deprecated `docs/workflow/plans/...` paths or the old manual
  `/wave` flow as the active path.
- `/resume` does not treat raw `state.json` as the default progress file in ValueRank.
- The installed Codex pointer files stay thin and do not embed stale workflow logic or
  deprecated paths.
- Experiment artifacts record, at minimum:
  - stage start time
  - stage finish time
  - `artifact_before_sha256`
  - `artifact_after_sha256`
  - review round count
  - issues raised
  - issues accepted
  - `artifact_revised` as a yes/no field
  - optional token or cost metrics when tooling is available
- Experiment artifacts use the pinned markdown table template from `plan.md`.
- The final `docs/workflow/feature-runs/<slug>-comparison.md` artifact includes the same mechanical
  data needed to answer whether Feature Factory overhead paid off.
- Repaired workflow docs do not instruct agents to launch multiple Gemini reviews at the
  same moment without the runner-managed 30-second stagger.
- `AGENTS.md` and `STATUS.md` still point to the right `experiments.md` file after the
  experiment repair.
- Active ValueRank workflow docs and wrappers do not instruct agents to use:
  - `docs/workflows/<slug>/`
  - `workflow.json`
  - `run_feature_workflow.py`
  - `MEMORY.md` as shared workflow state
