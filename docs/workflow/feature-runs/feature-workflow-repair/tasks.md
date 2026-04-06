# Tasks: feature-workflow-repair

## Story 1: Scope and entrypoint boundaries

- [ ] Make plain `/spec` a ValueRank redirect-only shim:
      tell the agent to use `/feature-spec <slug>` and stop without calling `run_factory.py`
- [ ] Make plain `/plan` a ValueRank redirect-only shim:
      tell the agent to use `/feature-plan <slug>` and stop without calling `run_factory.py`
- [ ] Make plain `/wave` a ValueRank redirect-only shim:
      tell the agent to use `/feature-implement <slug>` and stop without calling
      `run_factory.py`
- [ ] Keep `/handoff` generic, but make its ValueRank branch write handoffs under
      `docs/feature-runs/<slug>/handoff-*.md`
- [ ] Audit `/resume` so it stays generic and, in ValueRank, prefers handoff, progress,
      status, `MEMORY.md`, and `STATUS.md` before any supporting `state.json` read
- [ ] Keep ValueRank convenience entrypoints in the prefixed `feature-*` commands
- [ ] Tighten the touched command descriptions so the scope is explicit
- [ ] Verify `~/.codex/skills/feature-workflow/SKILL.md` is pointer-only and contains no
      embedded stage logic or deprecated paths
- [ ] If `~/.codex/skills/feature-workflow/CODEX-ORCHESTRATOR.md` exists, verify it stays
      pointer-only and aligned with the repo-owned orchestrator doc; if it is missing,
      record that in `install-notes.md` and do not recreate local logic

## Story 2: Stage sequencing and discovery safety

- [ ] Define `workflow scope path` as a repo-relative path passed through
      `run_factory.py init --slug <slug> --path <path>`
- [ ] Fix `feature-spec` so it gathers at least one workflow scope path before
      `run_factory.py init --slug <slug> --path <path>`
- [ ] Fix `feature-spec` so it writes discovery through `run_factory.py discover` before
      spec checkpoint
- [ ] Support the carried-assumptions path in `feature-spec` with
      `run_factory.py discover --summary ... --assumption ... --complete`
- [ ] Fix `feature-plan` so it runs `status --slug <slug>` first
- [ ] Fix `feature-plan` so it redirects to `/feature-spec <slug>` and stops when spec or
      discovery is still incomplete
- [ ] Fix `feature-plan` so it calls `checkpoint --stage plan` only when `plan` is the
      next ready stage
- [ ] Audit `feature-tasks` with these exact checks:
      `~/.claude/commands/feature-tasks.md` ends with `Next step: /feature-implement <slug>`
      and `.claude/skills/feature-tasks/SKILL.md` keeps the top ValueRank warning while not
      presenting `use feature-implement skill` as the ValueRank next step
- [ ] Keep `feature-implement` on `run_factory.py implement --slug <slug>`
- [ ] Remove any active next-step text that points agents to deprecated `docs/plans/...`
      flow
- [ ] Preserve the current Gemini rate-limit rule in any touched workflow docs:
      Gemini review launches are offset by 30 seconds, including overlapping
      runner-managed review flow

## Story 3: Mechanical experiment measurement

- [ ] Add the exact markdown metric table templates from `plan.md` to per-path
      `experiment.md` files and the final `<slug>-comparison.md`
- [ ] Record `stage_started_at` and `stage_finished_at`
- [ ] Record `artifact_before_sha256` and `artifact_after_sha256`
- [ ] Record `review_rounds`
- [ ] Define the Direct Path review step as one fixed structured self-review pass with the
      same checklist every time
- [ ] Put that fixed checklist inside the `Agent 1 — Direct Path` prompt block in
      `.claude/skills/experiment/SKILL.md`
- [ ] Count `issues_raised` only from that fixed checklist pass
- [ ] Count `issues_accepted` as the subset of those issues that caused a change
- [ ] Record `artifact_revised` as a stable yes/no field based on SHA-256 change
- [ ] Add optional token or cost metrics only when tooling exists
- [ ] Carry the same metrics into the final `<slug>-comparison.md` output
- [ ] Touch `experiments.md` only if its delivery-path labels drift from `Direct Path` and
      `Feature Factory`; otherwise leave it unchanged

## Story 4: Consistency sweep

- [ ] Scan active ValueRank workflow docs and wrappers for stale workflow paths
- [ ] Confirm `AGENTS.md` and `cloud/CLAUDE.md` still match on terminology and memory
- [ ] Confirm `AGENTS.md` and `STATUS.md` still point to the correct `experiments.md` file
- [ ] Keep `CODEX-ORCHESTRATOR.md` and `docs/plans/feature-workflow-plan.md` aligned with
      the repaired workflow surface
- [ ] Keep Gemini rate-limit guidance aligned with the validated 30-second stagger already
      documented in the repo and runner comments
- [ ] Record the manual follow-up or install step for touched `~/.claude` and `~/.codex`
      files in `docs/feature-runs/feature-workflow-repair/install-notes.md`
- [ ] Decide whether to add a short `STATUS.md` note for this feature run

## Verification

- [ ] Fresh slug smoke check for `feature-spec`
- [ ] Fresh slug `feature-spec` smoke check includes successful `init --path`
- [ ] Fresh slug `feature-spec` smoke check includes `run_factory.py discover ... --complete`
      before spec checkpoint
- [ ] Fresh slug smoke check for `feature-plan`
- [ ] Fresh slug `feature-plan` smoke check includes redirect to `/feature-spec <slug>`
      when spec or discovery is missing
- [ ] Fresh slug smoke check for `feature-tasks`
- [ ] Existing slug smoke check for `feature-implement`
- [ ] Plain `/spec`, `/plan`, and `/wave` no longer present themselves as the canonical
      ValueRank path and do not call `run_factory.py`
- [ ] Any generic plain command gets a non-ValueRank sanity check or explicit refusal test
- [ ] Experiment template and final comparison output include mechanical metrics
- [ ] Direct Path review counts come from the fixed checklist, not ad hoc notes
- [ ] Touched workflow docs still match the current 30-second Gemini stagger rule
- [ ] Final scan shows no active ValueRank workflow instructions using deprecated workflow
      paths or shared-memory wording
