# Plan: feature-workflow-repair

## Approach

Repair the workflow surface in 4 layers:

1. decide which commands are real ValueRank entrypoints and which are only shims
2. fix stage sequencing so entrypoints cannot point agents into invalid flow
3. restore mechanical experiment measurement without making the experiment Claude-only
4. run a consistency sweep so the same stale instructions do not stay alive elsewhere

The repo-owned Feature Factory docs and runner stay canonical. Wrapper commands must either
point at that canon correctly or get out of the way.

When the same file appears in Story 1 and Story 2, do one combined edit per file:

1. set the file's scope first
2. fix its stage logic second
3. verify the final behavior before marking either story complete

Do not do separate overwriting passes on the same file.

## Story 1: Scope and entrypoint boundaries

### Goal

Remove ambiguity about which files are the real workflow entrypoints and which ones are only
wrappers or convenience aliases.

### Changes

- Plain `/spec` becomes a redirect-only shim in ValueRank:
  - if the cwd is ValueRank, tell the agent to use `/feature-spec <slug>` and stop
  - do not call `run_factory.py`
  - outside ValueRank, refuse to invent a repo-specific spec workflow
- Plain `/plan` becomes a redirect-only shim in ValueRank:
  - if the cwd is ValueRank, tell the agent to use `/feature-plan <slug>` and stop
  - do not call `run_factory.py`
  - outside ValueRank, refuse to invent a repo-specific plan workflow
- Plain `/wave` becomes a redirect-only shim in ValueRank:
  - if the cwd is ValueRank, tell the agent to use `/feature-implement <slug>` and stop
  - do not call `run_factory.py`
  - outside ValueRank, refuse to invent a repo-specific implementation workflow
- `/handoff` stays a generic helper, but its ValueRank branch must point handoffs into
  `docs/workflow/feature-runs/<slug>/handoff-*.md` and must not revive `docs/workflow/plans/...`
- `/resume` stays a generic helper:
  - in ValueRank, its default search prefers handoff, progress, status, `MEMORY.md`, and
    `STATUS.md`
  - it may read `docs/workflow/feature-runs/<slug>/state.json` as supporting context after that
  - it must not surface raw `state.json` as the default progress file
- ValueRank convenience entrypoints live in the prefixed `feature-*` commands and point to
  the repo-owned Feature Factory in a consistent way.
- Audit the touched home-directory commands under `~/.claude/commands` and document their
  scope explicitly.
- Keep the installed Codex skill as a thin pointer only:
  - `~/.codex/skills/feature-workflow/SKILL.md`
  - if `~/.codex/skills/feature-workflow/CODEX-ORCHESTRATOR.md` exists, audit it too
  - if that orchestrator pointer is missing, record the absence in `install-notes.md` and
    do not recreate local workflow logic locally
  - no embedded stage logic
  - no deprecated paths
  - no copied runner instructions beyond the pointer

### Likely files

- `~/.claude/commands/spec.md`
- `~/.claude/commands/plan.md`
- `~/.claude/commands/feature-implement.md`
- `~/.claude/commands/wave.md`
- `~/.claude/commands/handoff.md`
- `~/.claude/commands/resume.md`
- `~/.claude/commands/feature-spec.md`
- `~/.claude/commands/feature-plan.md`
- `~/.claude/commands/feature-tasks.md`
- `~/.codex/skills/feature-workflow/SKILL.md`
- `~/.codex/skills/feature-workflow/CODEX-ORCHESTRATOR.md`

## Story 2: Stage sequencing and discovery safety

### Goal

Make sure spec, plan, tasks, and implement entrypoints line up with the actual Feature
Factory stage order.

### Changes

- Define `workflow scope path` exactly as one repo-relative path passed to
  `run_factory.py init --slug <slug> --path <path>`.
- `feature-spec` must collect at least one workflow scope path on a fresh slug before
  running `init`.
- `feature-spec` must record discovery before `checkpoint --stage spec` with one of these
  exact paths:
  - discovery path: `run_factory.py discover` calls that capture questions, answers,
    unresolved items, or acceptance criteria and then finish with `--complete`
  - carried-assumptions path:
    `run_factory.py discover --slug <slug> --summary <text> --assumption <text> ... --complete`
- `feature-plan` must run `run_factory.py status --slug <slug>` first.
- If `status --slug <slug>` shows that discovery or spec is still incomplete,
  `feature-plan` must redirect to `/feature-spec <slug>` and stop.
- `feature-plan` may call `checkpoint --stage plan` only when `status --slug <slug>` shows
  that `plan` is the next ready stage.
- `feature-tasks` audit must check these exact surfaces:
  - `~/.claude/commands/feature-tasks.md` ends with `Next step: /feature-implement <slug>`
  - `.claude/skills/feature-tasks/SKILL.md` keeps the top ValueRank warning that points to
    the repo-owned Feature Factory
  - `.claude/skills/feature-tasks/SKILL.md` must not present `use feature-implement skill`
    as the ValueRank next step
- `feature-implement` must use `run_factory.py implement --slug <slug>` as the active path.
- Any deprecation text must point to the right canonical path and must not leave agents
  with a broken next step.
- Any repaired workflow guidance must preserve the current Gemini rate-limit rule:
  Gemini review launches are offset by 30 seconds, and any overlapping runner behavior
  must keep that validated stagger.

### Likely files

- `~/.claude/commands/spec.md`
- `~/.claude/commands/plan.md`
- `~/.claude/commands/feature-spec.md`
- `~/.claude/commands/feature-plan.md`
- `~/.claude/commands/feature-tasks.md`
- `~/.claude/commands/feature-implement.md`
- `~/.claude/commands/wave.md`
- `.claude/skills/feature-tasks/SKILL.md`
- `docs/operations/codex-skills/feature-factory/SKILL.md`

## Story 3: Mechanical experiment measurement

### Goal

Restore hard measurement in the experiment workflow so we can compare Direct Path and
Feature Factory with more than narrative judgment.

### Changes

- Define one required metrics table that works for both Claude and Codex.
- Record `stage_started_at` and `stage_finished_at` for each stage.
- Record `artifact_before_sha256` and `artifact_after_sha256` for each stage:
  - decode the saved file as UTF-8 text
  - normalize line endings only: convert `CRLF` and `CR` to `LF`
  - do not trim whitespace, collapse blank lines, or reorder content
  - hash the resulting UTF-8 bytes
  - document stages hash the saved artifact file
  - implementation stages hash a saved scoped diff patch
- Record `review_rounds`, `issues_raised`, `issues_accepted`, and `artifact_revised`.
- Treat token or cost metrics as optional fields when tooling exists.
- Keep the agent-neutral path naming: `Direct Path` and `Feature Factory`.
- Pin the per-path `experiment.md` metric table to this exact markdown template:

```markdown
| Stage | Artifact | stage_started_at | stage_finished_at | artifact_before_sha256 | artifact_after_sha256 | review_rounds | issues_raised | issues_accepted | artifact_revised | token_usage | cost_usage |
|-------|----------|------------------|-------------------|------------------------|-----------------------|---------------|---------------|-----------------|------------------|-------------|------------|
| Spec | spec.md | | | | | | | | | | |
| Plan | plan.md | | | | | | | | | | |
| Tasks | tasks.md | | | | | | | | | | |
| Implement | code | | | | | | | | | | |
```

- Pin the final `docs/workflow/feature-runs/<slug>-comparison.md` metric table to this exact
  markdown template:

```markdown
| Stage | Path | Artifact | stage_started_at | stage_finished_at | artifact_before_sha256 | artifact_after_sha256 | review_rounds | issues_raised | issues_accepted | artifact_revised | token_usage | cost_usage |
|-------|------|----------|------------------|-------------------|------------------------|-----------------------|---------------|---------------|-----------------|------------------|-------------|------------|
| Spec | Direct Path | spec.md | | | | | | | | | | |
| Plan | Direct Path | plan.md | | | | | | | | | | |
| Tasks | Direct Path | tasks.md | | | | | | | | | | |
| Implement | Direct Path | code | | | | | | | | | | |
| Spec | Feature Factory | spec.md | | | | | | | | | | |
| Plan | Feature Factory | plan.md | | | | | | | | | | |
| Tasks | Feature Factory | tasks.md | | | | | | | | | | |
| Implement | Feature Factory | code | | | | | | | | | | |
```

- Define the Direct Path review step exactly:
  - after each stage artifact is saved, run one structured self-review pass with the same
    checklist each time
  - checklist:
    1. Is any acceptance criterion still unmet?
    2. Is there a concrete correctness or scope risk?
    3. Is a test or verification step missing?
    4. Is any workflow or user-facing wording stale or confusing?
  - `issues_raised` is the count of distinct concrete issues from that checklist pass
  - `issues_accepted` is the subset of those issues that caused a change
  - `artifact_revised` is `yes` only when `artifact_after_sha256` differs from
    `artifact_before_sha256`
  - place this checklist inside the `Agent 1 — Direct Path` prompt block in
    `.claude/skills/experiment/SKILL.md`, not only in a reference section
- Update both per-path `experiment.md` files and the final
  `docs/workflow/feature-runs/<slug>-comparison.md` artifact so the measured data survives into the
  final comparison output.
- Touch `experiments.md` only if the delivery-path labels drift. If the labels already say
  `Direct Path` and `Feature Factory`, leave the file unchanged.

### Likely files

- `.claude/skills/experiment/SKILL.md`
- experiment artifacts under `docs/workflow/feature-runs/*/experiment.md`
- comparison artifacts under `docs/workflow/feature-runs/*-comparison.md`
- `experiments.md` only if delivery-path labels drift

## Story 4: Consistency sweep

### Goal

Confirm that the active ValueRank workflow surface no longer contains stale path,
terminology, or memory instructions.

### Changes

- Scan active workflow docs and wrappers for stale path references.
- Confirm `AGENTS.md` and `cloud/CLAUDE.md` still agree on terminology and memory policy.
- Confirm `AGENTS.md` and `STATUS.md` still point to the correct `experiments.md` file.
- Keep the other repo-owned workflow docs in sync with the repaired entrypoints:
  - `docs/operations/codex-skills/feature-factory/CODEX-ORCHESTRATOR.md`
  - `docs/workflow/plans/feature-workflow-plan.md`
- Keep the documented Gemini rate-limit rule in sync with the runner behavior:
  - Gemini review launches are offset by 30 seconds
  - overlapping runner behavior keeps that 30-second stagger
- Record the manual follow-up and install expectation for touched home-directory files in
  `docs/workflow/feature-runs/feature-workflow-repair/install-notes.md`
- If we touch home-directory files, note any backup, sync, or workstation follow-up there
- Optionally add a short `STATUS.md` note pointing to this feature run

### Likely files

- `AGENTS.md`
- `cloud/CLAUDE.md`
- `docs/operations/codex-skills/feature-factory/CODEX-ORCHESTRATOR.md`
- `docs/workflow/plans/feature-workflow-plan.md`
- `docs/workflow/feature-runs/feature-workflow-repair/install-notes.md`
- `STATUS.md`

## Risks

- We may preserve command ambiguity if we patch wording without deciding whether a wrapper
  is a shim, a generic helper, or a ValueRank convenience command.
- We may over-correct and remove useful shortcuts if we treat every wrapper as a bug.
- The experiment can become noisy if we require metrics that one active AI cannot collect.
- Home-directory command edits affect future sessions beyond this repo, so wording must be
  deliberate and scoped.

## Verification

- Fresh-slug smoke checks:
  - `feature-spec` asks for at least one repo-relative scope path and runs
    `init --slug <slug> --path <path>`
  - `feature-spec` records discovery through `run_factory.py discover ... --complete`
    before spec checkpoint
  - `feature-plan` runs `status --slug <slug>` first and redirects to `/feature-spec <slug>`
    if spec or discovery is not ready
  - `feature-tasks` next-step text still points to the right stage
  - `feature-implement` path uses the repo runner
- Plain global commands do not pretend to be the canonical ValueRank workflow path
- In ValueRank, plain `/spec`, `/plan`, and `/wave` redirect and stop without calling
  `run_factory.py`
- Any plain command kept as generic gets one non-ValueRank sanity check or an explicit
  outside-ValueRank refusal path
- Focused scans confirm no active ValueRank instructions point to deprecated workflow paths
- Experiment template and final comparison output include required mechanical metrics
- Direct Path review counts come from the fixed checklist, not ad hoc comments
- Terminology and memory wording stay aligned between `AGENTS.md` and `cloud/CLAUDE.md`
- `AGENTS.md` and `STATUS.md` still point to the correct `experiments.md` file
- Repo-owned workflow docs stay aligned after the repair
- Gemini rate-limit guidance still matches the validated 30-second stagger behavior
- Manual follow-up for home-directory command and skill changes is written down in
  `docs/workflow/feature-runs/feature-workflow-repair/install-notes.md`
