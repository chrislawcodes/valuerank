---
name: feature-workflow
description: Run the repo's end-to-end feature workflow from spec through implementation, adversarial review, and closeout. Reuse the repo-owned checkpoint scripts, continue automatically into implementation unless blocked, and identify safe opportunities to parallelize disjoint workstreams.
---

# Feature Workflow

Use this skill when the user wants to take a feature from idea to shipped code inside this repo's workflow structure.

This skill is the orchestrator. It should reuse the existing repo-owned scripts for workflow initialization, review checkpoints, reconciliation, and closeout instead of re-implementing that logic in prompt text.

## Choosing an Orchestrator

Use this table to decide which agent drives the workflow for a given feature:

| Situation | Recommended Orchestrator | Why |
|-----------|--------------------------|-----|
| Default — any new feature | Codex (`gpt-5.4`) | Codex tokens are free for the operator; Claude tokens are paid. PR #768 demonstrated the Codex-orchestrator pattern works end-to-end (full spec → plan → tasks → implement → deliver). |
| Hard architectural decision (schema changes, new job types, major tradeoff) | Claude | Claude is better at open-ended judgment calls and adversarial review of Codex PRs. |
| Codex quota exhausted | Claude | Fall back to Claude when Codex hits usage limits; Claude can drive the full workflow until quota resets. |

### Default dispatch pattern

```bash
codex exec -m gpt-5.4 -s workspace-write "$(cat docs/workflow/orchestrator-prompts/<task>.md)"
```

Write the task prompt to `docs/workflow/orchestrator-prompts/<task>.md` before dispatching. This avoids `/tmp` GC risk (see Background Dispatch Discipline below).

Use Claude for: hard architectural calls, adversarial review of Codex's PRs, and when Codex hits quota.

---

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

- create or resume the workflow directory under `docs/workflow/feature-runs/<slug>/`
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
- `docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py`
- `docs/workflow/operations/codex-skills/review-lens/scripts/*.py`

Do not duplicate checkpoint manifest logic, review file validation, diff writing, or reconciliation logic in the skill itself unless the scripts are broken.

## Stage Order and Role Assignments

| Phase | Task | Claude Orchestrator | Codex Orchestrator |
|---|---|---|---|
| Discovery | Ask clarifying questions one at a time, record assumptions, determine if spec is stable enough to proceed | Claude | Codex |
| Write spec | Research real file paths in codebase, author `spec.md` with scope boundaries and acceptance criteria | Claude (research) · Codex (file paths) | Gemini (research) · Codex (authors) |
| Spec checkpoint | Adversarial attack on spec, semantic review, judge findings and reconcile into spec | Codex (2 adversarial reviews: `feasibility` + `edge-cases`) · Gemini (1 adversarial review: `requirements`) · Claude (judges) | Codex (2 adversarial reviews: `feasibility` + `edge-cases`) · Gemini (1 adversarial review: `requirements`) · Codex (judges, escalates blockers to human) |
| Write plan | Author `plan.md` with architecture decisions, wave breakdown, and risk callouts. Each residual risk MUST have a `verification:` sentence naming a concrete pre-merge check (e.g., "run circumplexAnalysis against a production model ID", "inspect a failing fixture", "grep the migration output for N rows"). Unverified residual risks block plan approval — see "Residual risks must be verifiable" below. | Claude | Codex |
| Plan checkpoint | Adversarial attack on plan, architecture review, judge findings and reconcile into plan | Codex (2 adversarial reviews: `implementation` + `architecture`) · Gemini (1 adversarial review: `testability`) · Claude (judges) | Codex (2 adversarial reviews: `implementation` + `architecture`) · Gemini (1 adversarial review: `testability`) · Codex (judges, escalates blockers to human) |
| Write tasks | Author `tasks.md` with executable slices, checkpoint boundaries (`[CHECKPOINT]`), estimated diff size per slice, dependencies, and verification steps. No slice should exceed ~300 lines changed. | Claude | Codex |
| Record parallel analysis | Look for safe parallel implementation opportunities in tasks.md. Annotate parallel tasks with `[P: file1, file2]`. Run `parallel --slug <slug> --note "..." [--found]`. If opportunities exist, add `[P:]` annotations first — the command validates they are conflict-free. | Claude | Codex |
| Tasks checkpoint | Adversarial attack on tasks, execution-order review, judge findings and reconcile into tasks | Codex (2 adversarial reviews: `execution` + `dependency-order`) · Gemini (1 adversarial review: `coverage`) · Claude (judges) | Codex (2 adversarial reviews: `execution` + `dependency-order`) · Gemini (1 adversarial review: `coverage`) · Codex (judges, escalates blockers to human) |
| Implementation slice | Implement one `[CHECKPOINT]`-bounded slice from `tasks.md`, run build and tests, commit | Codex | Codex |
| Diff checkpoint | Adversarial attack on the slice diff only (not the full branch), regression and correctness review, judge findings and reconcile | Codex (2 adversarial reviews: `correctness` + `regression`) · Gemini (1 adversarial review: `quality`) · Claude (judges) | Codex (2 adversarial reviews: `correctness` + `regression`) · Gemini (1 adversarial review: `quality`) · Codex (judges, escalates blockers to human) |
| *(repeat per slice)* | Implementation slice → Diff checkpoint repeats for each `[CHECKPOINT]` boundary in `tasks.md` | | |
| Deliver | Create PR, watch CI, record delivery state in workflow | Claude | Codex (stages) · Human (approves and creates PR) |
| CI failure | Extract errors, implement fix, re-run CI | Claude (judges) · Codex (fixes) | Codex (fixes) · Human (approves) |
| Write closeout | Write summary of what shipped, what remains open, and deferred risks | Claude | Codex |
| Closeout checkpoint | Adversarial attack on closeout, final state review, judge findings and approve | Codex (2 adversarial reviews: `fidelity` + `completeness`) · Gemini (1 adversarial review: `residual-risk`) · Claude (judges) | Codex (2 adversarial reviews: `fidelity` + `completeness`) · Gemini (1 adversarial review: `residual-risk`) · Codex (judges, escalates blockers to human) |
| Write post mortem | Write `postmortem.md` covering what went well, what didn't, and specific proposed workflow changes. Required before workflow is marked done. | Claude | Codex |
| Update STATUS.md | Update `STATUS.md` to reflect what shipped. Required before workflow is marked done. | Claude | Codex |
| Post mortem approval | Review proposed workflow changes and approve, reject, or defer each one | Human | Human |

If the workflow already exists, resume from the earliest incomplete stage instead of starting over.

Use `status --slug <slug>` to determine the current workflow state, blockers, delivery state, and next recommended action.
Use the `diff-review-budget` section in `status` to see whether a large diff is likely to trigger another full Codex rerun.
Use `doctor` before or during a workflow when the local tooling or GitHub wiring looks suspect.

## Residual risks must be verifiable

`plan.md` often ends with a **Residual Risks** section — known limitations the team has decided to accept rather than mitigate in-feature. In practice these are the most dangerous entries in the whole plan, because the word "accepted" hides the question "how do we know the risk didn't happen?"

**Rule:** every item in `plan.md`'s `Residual Risks` section MUST carry a `verification:` line naming a concrete, cheap, pre-merge action that would catch the risk if it fired. Without a verification action, the orchestrator marks the risk `unverified` and the plan phase does not advance.

**Examples:**

- ❌ *"Pooling pressure conditions may wash out condition-specific structure."* — **NO verification.** Plan does not advance.
- ✅ *"Pooling pressure conditions may wash out condition-specific structure.* **verification:** *compare circumplex ρ for diagonal-only vs all-conditions on two models via local GraphQL query; if they differ by > 0.2 flag before merge."*
- ✅ *"Aggregation assumes primary runs (not rollup runs) carry transcripts.* **verification:** *smoke-test the circumplexAnalysis resolver against one production-populated model ID + signature via MCP graphql_query tool before merge; if trialsPerValue is all-zero, resolver is wrong."*

**Why this rule exists:** the circumplex-report feature (2026-04-20) shipped with a data-model misunderstanding that made every model return zero trials in production. Both Codex adversarial reviewers had flagged the transcript-to-run join as an unverified assumption in residual risks. The orchestrator accepted those risks without specifying how they'd be checked; the implementation encoded the wrong assumption; review could not detect the wrongness because it had no runtime context. Requiring a concrete verification action forces the "how will we know this is OK?" conversation BEFORE the risk becomes a production bug.

**Plan-checkpoint enforcement:** the plan adversarial reviewers (`implementation-adversarial`, `architecture-adversarial`, `testability-adversarial`) should reject any Residual Risks entry that lacks a `verification:` line. Reviewers who surface a new risk in their own findings must also state the verification action in their resolution note.

**Scope of the rule:** applies to ALL residual risks, including those labeled "LOW" or "acknowledged as tech debt." A LOW risk without a verification plan is still unverified.

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

If discovery has unresolved items, do not mark discovery complete or checkpoint spec until
each item is either resolved or explicitly deferred.

**Discovery is not optional.** Before authoring the spec, always either ask the clarifying questions or explicitly state the assumptions you are carrying in. Do not silently proceed to spec authoring without one of these two. If the request arrives with enough context to make the spec stable, a one-sentence "here are the assumptions I'm carrying in" satisfies this requirement — but the step must not be skipped entirely.

Do not start implementation until the answers are good enough to make the spec and plan stable.
For workflow-system improvement work, treat the maintained plan as the source of truth for the next slice, and prioritize making discovery and task shaping more enforceable before deeper engine hardening.

## Background Dispatch Discipline

Every background dispatch — `codex exec`, long-running `checkpoint`, `judge`, `implement`, `deliver` — can die silently. The orchestrator will not notice without a heartbeat. This has happened more than once. Treat these rules as non-negotiable.

**Rule 1: Pair every background dispatch with a heartbeat Monitor.** Immediately after starting a background task that may run >10 minutes, start a persistent `Monitor` that emits a line every 600 seconds reporting (a) whether the expected process is still alive, (b) the most recent git commit on the active worktree. Example:

```bash
# In Monitor's command field:
while true; do
  sleep 600
  TS=$(TZ=America/Los_Angeles date +"%H:%M")
  CODEX=$(ps aux | grep -E "codex exec" | grep -v grep | wc -l | tr -d ' ')
  COMMIT=$(cd <worktree> && git log -1 --format="%h %s" 2>/dev/null)
  echo "[heartbeat PT $TS] codex_procs=$CODEX last_commit=$COMMIT"
done
```

When a monitor reports `codex_procs=0` for 2+ consecutive ticks AND no new commit has landed, assume the dispatch died silently and intervene.

**Rule 2: Do not put dispatch specs in `/tmp`.** `/tmp` is garbage-collected. A dispatch spec file deleted between "orchestrator writes it" and "codex reads it" means the subagent gets an empty prompt and produces nothing useful. Instead, write specs to one of:
- `docs/workflow/feature-runs/<slug>/codex-specs/slice-<N>.txt` (committed with the slice)
- `.codex-slice<N>-spec.txt` in the worktree root (gitignored but survives GC)
- Recommended long-term home: `docs/workflow/feature-runs/<slug>/codex-specs/slice-<N>.md` alongside the slice artifact PR. The `.codex-slice<N>-spec.txt` worktree-local form remains acceptable as an interim pattern.

**Rule 3: Only use "I'll check back in N minutes" as a comment, not a plan.** The session has no timer that wakes Claude; between background-task notifications, Claude is idle. Any "check back later" commitment must be backed by a running Monitor or a scheduled wakeup. Promises without machinery behind them fail silently.

## Judge Panel

After three adversarial-review rounds on a stage, stop using the review loop and use the judge panel instead. The runner enforces the 3-round adversarial cap and routes the next action to `judge_panel`; do not rely on voluntary convergence to break the loop.

- Judge prompts live under `docs/workflow/operations/codex-skills/feature-factory/judge-prompts/`.
- The `judge` subcommand is the only supported entry point for panel voting: `judge --slug <slug> --stage <stage>`.
- Judges are blinded to each other. Dissent escalates back to the orchestrator for edits, and the runner enforces the round cap instead of letting the loop continue forever.
- When `judge_panel` is the recommended next action, treat that as a hard control-flow signal, not a suggestion.

## Review Policy

Every checkpoint requires:

- 2 Codex adversarial reviews, each using a different lens
- 1 Gemini adversarial review

All three are adversarial — each one is looking for ways the artifact is wrong, incomplete, or risky. Codex runs two lenses because it has codebase context and is more likely to find hard technical issues. Gemini runs one lens chosen for its different perspective — it is less likely to find hard issues but adds signal from a different angle.

The judge panel also has a runner-enforced 3-round cap. Reviewers should stay rigorous, but they should not assume the loop can keep refining forever.

The checkpoint runner selects the specific lenses by stage. The default lenses are configured for `spec`, `plan`, `tasks`, `diff`, and `closeout`. Sensitive or performance-critical features may swap the Codex secondary lens for `risk-adversarial`, `security-adversarial`, or `performance-adversarial`.

Keep the two Codex reviews independent from each other. Do not let the second Codex review merely restate the first.

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

After every runner command completes, read the `→ next:` line printed to stdout and proceed to that action immediately. Do not stop between steps unless the next action is `mark_blocked` or `done`.

Stop only when one of these is true:

- `recommended_next_action` is `mark_blocked` — human decision required
- `recommended_next_action` is `done` — workflow complete
- the user explicitly asked to stop at a specific point
- the repo state makes the next action unsafe to proceed with

Do not stop merely because the old workflow used separate skills. Do not wait for the user to say "continue" between steps.

If a step cannot safely continue, record that explicitly with `block --slug <slug> --reason "<reason>"` so `status` reports a concrete blocked state instead of silently stalling.

### Report Status After Every Step

After every runner command, emit a one-sentence status to the user before starting the next step. Include: what just completed, and what is starting next. This keeps the user informed without requiring them to ask.

Example: "Spec checkpoint passed — starting plan authoring now."

For long-running operations (checkpoint launching reviews, implement dispatching Codex workers), emit a "starting" message before the command so the user knows work is in progress.

### Use Review Gates

At each checkpoint:

1. create or update the artifact
2. run the checkpoint
3. run `auto-reconcile --slug <slug> --stage <stage>` — auto-accepts reviews with no HIGH, MEDIUM, LOW, or CRITICAL findings and prints which reviews still need attention
4. read and reconcile only the reviews listed under `needs-review` in the auto-reconcile output
5. only then move forward

### Auto-Context Defaults

Checkpoint auto-context is enabled by default for `spec` and `tasks` stages.
It is disabled by default for `plan` and `diff` stages because those artifacts
are already the review source of truth and extra inferred context often pushes
review payloads over character limits. Use `--auto-context` to force inferred
context back on for plan or diff. Use `--no-auto-context` to force it off for
any stage.

### Progress Heartbeat

Long-running runner activity needs a heartbeat. Follow the FR-023a cadence: emit progress every 10 minutes PT, and keep the operator-orchestrator heartbeat discipline from FR-023d in mind. If the workflow is still alive, the user should be able to tell at a glance which stage is active and whether progress is still moving.

### `--json` Flag

When a runner subcommand supports `--json`, treat the JSON payload as the structured control-flow contract. The human-readable `→ next: ...` string stays for compatibility, but new orchestration should prefer the JSON shape and write that same payload back into state.

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

Gemini review launches are staggered by 30 seconds. The runner may overlap them, but it
preserves that stagger. Do not start multiple Gemini checkpoint reviews at the same moment
outside the runner.

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

Each workflow lives in `docs/workflow/feature-runs/<slug>/`. The files have different roles:

| File | Role |
|------|------|
| `state.json` | **Authoritative runtime state** — the runner reads and writes this; it is the single source of truth for phase, block status, delivery state, and discovery state |
| `spec.md`, `plan.md`, `tasks.md`, `closeout.md`, `postmortem.md` | **Authored artifacts** — source of truth for intent, scope, and decisions; edited by the orchestrator. `postmortem.md` is required before the workflow is marked done. |
| `reviews/*.md` | **Generated + resolved state** — produced by the checkpoint runner, resolved via reconcile; do not edit manually except to update resolution fields |
| `reviews/*.checkpoint.json` | **Generated state** — checkpoint metadata; do not edit manually |

When in doubt about current workflow state, read `state.json` or run `status --slug <slug>`. Do not infer state from which artifact files exist.

## Notes

- The skill should stay lean and prefer the existing Python scripts over new helper code.
- The skill is the front door; the scripts are the durable workflow machinery.
- If a repo script is missing or broken, say so briefly, fall back to the closest manual equivalent, and keep the artifact structure intact.
- For workflow-system improvement work, treat [feature-workflow-plan.md](/Users/chrislaw/valuerank/docs/workflow/plans/feature-workflow-plan.md) as the maintained plan of record and keep it in sync with this skill.
- Keep the workflow principle simple: spec before code, questions before assumptions, and move quickly once the requirements are clear enough to stabilize the spec and plan.
- Use the repo-owned `discover` command to keep ambiguous-request discovery visible in workflow state when you are already tracking a workflow slice.
