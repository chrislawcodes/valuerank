---
name: feature-workflow
description: Run the repo's end-to-end feature workflow from spec through implementation, adversarial review, and closeout. Reuse the repo-owned checkpoint scripts, continue automatically into implementation unless blocked, and identify safe opportunities to parallelize disjoint workstreams.
---

# Feature Workflow

Use this skill when the user wants to take a feature from idea to shipped code inside this repo's workflow structure.

This skill is the orchestrator. It should reuse the existing repo-owned scripts for workflow initialization, review checkpoints, reconciliation, and closeout instead of re-implementing that logic in prompt text.

## Orchestration Mode

This skill runs in one of two modes depending on which agent is executing it:

**Claude Orchestrator** — Claude is available and leads the workflow. Claude authors artifacts, judges review findings, and drives delivery. Codex implements and attacks. Gemini reviews.

**Codex Orchestrator** — Claude is unavailable (token exhaustion or session end). Codex drives the workflow: authors artifacts, implements, attacks, and judges findings. Gemini reviews and researches. The human approves PR creation and post mortem changes.

If you are Claude, follow Claude Orchestrator behavior throughout this skill.
If you are Codex, follow Codex Orchestrator behavior throughout this skill.

### Oscillation Rule

If the same task fails under both orchestrators, do not retry. Halt the workflow with `block --slug <slug> --reason "<reason>"` and wait for human intervention. Do not create a loop between orchestrators.

### Handoff from Claude to Codex

When Claude's tokens are exhausted mid-workflow:

1. Claude runs `status --slug <slug>` and records the current phase and any open decisions
2. Claude writes a brief handoff note into the workflow state with `block --slug <slug> --reason "Claude session ended at <phase>. Open decisions: <list>"`
3. Codex reads `status --slug <slug>` on resume to find the current phase and any blocked state
4. Codex clears the block once it has read and understood the open decisions: `block --slug <slug> --clear`

## What This Skill Owns

- create or resume the workflow directory under `docs/workflows/<slug>/`
- keep the main artifact chain moving:
  - `spec.md`
  - `plan.md`
  - `tasks.md`
  - implementation
  - diff review
  - closeout
  - post mortem
- run adversarial reviews at each major checkpoint
- continue into implementation by default once planning artifacts are ready
- identify safe parallel work without creating overlapping edits

## Reused Repo Tooling

Use these scripts as the workflow backbone:

- `scripts/sync-codex-skills.py`
- `docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py`
- `docs/operations/codex-skills/review-lens/scripts/*.py`

Do not duplicate checkpoint manifest logic, review file validation, diff writing, or reconciliation logic in the skill itself unless the scripts are broken.

## Stage Order and Role Assignments

| Phase | Task | Claude Orchestrator | Codex Orchestrator |
|---|---|---|---|
| Discovery | Ask clarifying questions one at a time, record assumptions, determine if spec is stable enough to proceed | Claude | Codex |
| Write spec | Research real file paths in codebase, author `spec.md` with scope boundaries and acceptance criteria | Claude (research) · Codex (file paths) | Gemini (research) · Codex (authors) |
| Spec checkpoint | Adversarial attack on spec, semantic review, judge findings and reconcile into spec | Codex (attack) · Gemini (2 adversarial reviews, different lenses) · Claude (judges) | Codex (attack) · Gemini (2 adversarial reviews, different lenses) · Codex (judges, escalates blockers to human) |
| Write plan | Author `plan.md` with architecture decisions, wave breakdown, and risk callouts | Claude | Codex |
| Plan checkpoint | Adversarial attack on plan, architecture review, judge findings and reconcile into plan | Codex (attack) · Gemini (2 adversarial reviews, different lenses) · Claude (judges) | Codex (attack) · Gemini (2 adversarial reviews, different lenses) · Codex (judges, escalates blockers to human) |
| Write tasks | Author `tasks.md` with executable slices, checkpoint boundaries (`[CHECKPOINT]`), estimated diff size per slice, dependencies, and verification steps. No slice should exceed ~300 lines changed. | Claude | Codex |
| Tasks checkpoint | Adversarial attack on tasks, execution-order review, judge findings and reconcile into tasks | Codex (attack) · Gemini (2 adversarial reviews, different lenses) · Claude (judges) | Codex (attack) · Gemini (2 adversarial reviews, different lenses) · Codex (judges, escalates blockers to human) |
| Implementation slice | Implement one `[CHECKPOINT]`-bounded slice from `tasks.md`, run build and tests, commit | Codex | Codex |
| Diff checkpoint | Adversarial attack on the slice diff only (not the full branch), regression and correctness review, judge findings and reconcile | Codex (attack) · Gemini (2 adversarial reviews, different lenses) · Claude (judges) | Codex (attack) · Gemini (2 adversarial reviews, different lenses) · Codex (judges, escalates blockers to human) |
| *(repeat per slice)* | Implementation slice → Diff checkpoint repeats for each `[CHECKPOINT]` boundary in `tasks.md` | | |
| Deliver | Create PR, watch CI, record delivery state in workflow | Claude | Codex (stages) · Human (approves and creates PR) |
| CI failure | Extract errors, implement fix, re-run CI | Claude (judges) · Codex (fixes) | Codex (fixes) · Human (approves) |
| Write closeout | Write summary of what shipped, what remains open, and deferred risks | Claude | Codex |
| Closeout checkpoint | Adversarial attack on closeout, final state review, judge findings and approve | Codex (attack) · Gemini (2 adversarial reviews, different lenses) · Claude (judges) | Codex (attack) · Gemini (2 adversarial reviews, different lenses) · Codex (judges, escalates blockers to human) |
| Write post mortem | Review what went well, what didn't, and propose specific changes to the workflow | Claude | Codex |
| Post mortem approval | Review proposed workflow changes and approve, reject, or defer each one | Human | Human |

If the workflow already exists, resume from the earliest incomplete stage instead of starting over.

Use `status --slug <slug>` to determine the current workflow state, blockers, delivery state, and next recommended action.
Use the `diff-review-budget` section in `status` to see whether a large diff is likely to trigger another full Codex rerun.
Use `doctor` before or during a workflow when the local tooling or GitHub wiring looks suspect.

## Requirements Discovery

Before the first spec checkpoint, decide whether the requirements are solid enough to proceed.

If they are not, ask high-level design questions first.

The discovery step should feel predictable to the user:

- decide the full set of questions before asking the first one
- surface the count up front, with a target of about 5 questions when that is enough to stabilize the work
- do not exceed 10 total questions
- if the count is materially above the target, explicitly tell the user that there are a lot of unknowns in the requirements and why
- give a concrete estimate, for example: "I expect about 8 questions because several core choices are still open."
- ask the questions one by one, in order, so the user knows how long the discovery phase will take
- for each question, include the AI's recommendation and a short rationale before asking the question itself
- keep each question focused on product behavior, user experience, scope boundaries, architecture-shaping constraints, and success criteria
- do not ask low-level implementation trivia at this stage
- do not reorder questions midstream unless an answer makes a later question unnecessary
- do not batch multiple questions into one message unless the user explicitly asks for that

If the answers are not enough to proceed after the planned questions are answered:

- explain what remains unclear
- say which assumptions you would carry into the spec if the user wants to continue
- keep the next step explicit instead of silently drifting into implementation
- if the workflow runner supports it, record the discovery state with the repo-owned `discover` command so the question count, assumptions, and completion status stay visible in workflow state

If the answers are already clear from the repo context or user instructions:

- do not invent extra questions
- briefly state the assumptions you are carrying into the spec

**Discovery is not optional.** Before authoring the spec, always either ask the clarifying questions or explicitly state the assumptions you are carrying in. Do not silently proceed to spec authoring without one of these two. If the request arrives with enough context to make the spec stable, a one-sentence "here are the assumptions I'm carrying in" satisfies this requirement — but the step must not be skipped entirely.

Do not start implementation until the answers are good enough to make the spec and plan stable.
For workflow-system improvement work, treat the maintained plan as the source of truth for the next slice, and prioritize making discovery and task shaping more enforceable before deeper engine hardening.

## Review Policy

Every checkpoint requires:

- minimum 2 Gemini adversarial reviews, each using a different lens
- 1 Codex adversarial attack

All three are adversarial — each one is looking for ways the artifact is wrong, incomplete, or risky. Gemini's two reviews must use different lenses so they attack from different angles, not repeat the same critique.

The checkpoint runner selects the specific lenses by stage. Do not override to fewer than 2 Gemini reviews. The default lenses are configured for `spec`, `plan`, `tasks`, `diff`, and `closeout`.

Keep the Codex review independent from the Gemini reviews. Do not merely restate Gemini findings.

## Codex Orchestrator: Escalation Protocol

When running as Codex Orchestrator, use the following criteria to decide whether to judge a finding or escalate to the human:

**Codex can judge and reconcile:**
- findings that are clearly out of scope for the current slice
- findings that duplicate something already addressed in the artifact
- findings that conflict with an explicit decision recorded in the spec or plan

**Codex must escalate to human via `block`:**
- architectural decisions not covered by the existing spec or plan (schema changes, new job types, new external dependencies)
- conflicting findings from Codex attack and Gemini review that point in opposite directions
- implementation failures that persist after 3 fix attempts
- anything that would affect production data, credentials, or deployment configuration

When escalating, use `block --slug <slug> --reason "<specific decision needed>"` so the human knows exactly what to decide, not just that something is blocked.

## Orchestration Rules

### Keep Moving

After `tasks.md` is ready and reviewed, continue into implementation unless one of these is true:

- the user explicitly asked to stop before coding
- a checklist or review found a blocker that has not been reconciled
- the repo state makes implementation unsafe

Do not stop merely because the old workflow used separate skills.

If implementation cannot safely continue, record that explicitly with `block --slug <slug> --reason "<reason>"` so `status` reports a concrete blocked state instead of silently stalling.

### Use Review Gates

At each checkpoint:

1. create or update the artifact
2. run the checkpoint
3. inspect the required reviews
4. reconcile blocking findings into the plan or artifact
5. only then move forward

### Keep Diffs Scoped

Design for small diffs at tasks authoring time, not at diff checkpoint time.

When writing `tasks.md`:
- estimate the approximate diff size for each slice
- place a `[CHECKPOINT]` boundary whenever a slice would exceed ~300 lines changed
- if a natural slice boundary does not exist at that point, split the tasks at a stable interface boundary (e.g. after a type is defined but before callers are updated)

At diff checkpoint time:
- the diff should cover only the current `[CHECKPOINT]`-bounded slice, not the full branch
- the base for each diff is the HEAD at the previous diff checkpoint, not the branch base
- if unrelated dirty repo files would otherwise block a valid scoped diff, use explicit `--allow-dirty-path <path>` entries rather than a blanket bypass
- if a previously reviewed diff is already large, batch follow-up fixes before rerunning the diff checkpoint
- `checkpoint --stage diff` will require `--allow-large-diff-rerun` before it regenerates a previously reviewed large diff on purpose

### CI Failures

If CI fails after deliver:

1. extract the errors (use `parse-ci-errors.sh` if available)
2. Codex implements the fix
3. Claude Orchestrator: Claude judges the fix diff before pushing; Codex Orchestrator: Human approves before pushing
4. push and re-run CI

If CI fails a second time on the same PR, re-read the new errors before attempting another fix. Do not retry blindly.

## Parallelization Rules

The orchestrator should actively look for safe parallel work. Good candidates:

- tasks already marked `[P]` in `tasks.md`
- file sets in different directories with no shared ownership
- backend and frontend work that only meet at a stable contract
- docs or test updates that are downstream from already-settled code

Do not parallelize work that:

- edits the same file
- depends on unsettled API or schema choices
- depends on unresolved review findings
- needs the result immediately for the next blocking step

When the current user request explicitly allows parallel agent work, split work by disjoint write sets and keep ownership clear. The main rollout should retain integration work and any urgent blocker on the critical path.

Always announce the planned parallel split before delegating or executing it.

## Implementation Expectations

During implementation:

- use `spec.md`, `plan.md`, and `tasks.md` as the source of truth
- update `tasks.md` as progress changes
- run targeted verification for each meaningful slice
- pause for approval only when the next action has hidden risk or irreversible consequences

If implementation is large, prefer phase-by-phase progress over a single giant diff.

Gemini reviews are serialized by default. Do not try to launch multiple Gemini checkpoint reviews in parallel.

## Closeout and Post Mortem

Use the repo-owned `deliver` command after diff review so PR creation, CI status, and optional merge are first-class workflow stages.

Reconciliation must be in terminal status (`accepted`, `rejected`, or `deferred`) before closeout will pass.

Then use the repo-owned `closeout` command to write the summary artifact, and run the `closeout` checkpoint so the final state also gets adversarial review.

The closeout summary should clearly call out:

- what shipped
- what remains open
- any deferred risks
- where the workflow artifacts live

After the closeout checkpoint, write a post mortem that covers:

- what went well in this workflow run
- what didn't work and why
- specific proposed changes to the workflow (guides, scripts, or stage order)

Post mortem changes require human approval before being applied to any guide or script.

## Workflow File Reference

Each workflow lives in `docs/workflows/<slug>/`. The files have different roles:

| File | Role |
|------|------|
| `workflow.json` | **Authoritative runtime state** — the runner reads and writes this; it is the single source of truth for phase, block status, delivery state, and discovery state |
| `spec.md`, `plan.md`, `tasks.md`, `closeout.md` | **Authored artifacts** — source of truth for intent, scope, and decisions; edited by the orchestrator |
| `reviews/*.md` | **Generated + resolved state** — produced by the checkpoint runner, resolved via reconcile; do not edit manually except to update resolution fields |
| `reviews/*.checkpoint.json` | **Generated state** — checkpoint metadata; do not edit manually |

When in doubt about current workflow state, read `workflow.json` or run `status --slug <slug>`. Do not infer state from which artifact files exist.

## Notes

- The skill should stay lean and prefer the existing Python scripts over new helper code.
- The skill is the front door; the scripts are the durable workflow machinery.
- If a repo script is missing or broken, say so briefly, fall back to the closest manual equivalent, and keep the artifact structure intact.
- For workflow-system improvement work, treat [feature-workflow-plan.md](/Users/chrislaw/valuerank/docs/plans/feature-workflow-plan.md) as the maintained plan of record and keep it in sync with this skill.
- Keep the workflow principle simple: spec before code, questions before assumptions, and move quickly once the requirements are clear enough to stabilize the spec and plan.
- Use the repo-owned `discover` command to keep ambiguous-request discovery visible in workflow state when you are already tracking a workflow slice.
