# Feature Factory Feedback

## Context

This feedback comes from using feature factory on a real repo feature, `vignette-analysis-decision-model`, from spec through plan, tasks, implementation slices, and review checkpoints.

I am not commenting on the feature itself here. This note is about the workflow system:

- what made the feature run safer
- where the workflow was hard to follow
- what would make future runs easier for another agent to operate

## Summary

Feature factory is **good at structure and safety**, but it needs **stricter phase boundaries and better state reporting**.

The biggest recurring problem was not code delivery. It was ambiguity about:

- whether a phase meant “artifact writing” or “implementation”
- whether the workflow was still expected to continue automatically
- what the current next action was after a checkpoint

## What Worked Well

| Area | Why it helped |
|---|---|
| Small phases | Breaking work into phases reduced blast radius and kept diffs reviewable. |
| Review gates | The adversarial checkpoints caught weak assumptions before they became code. |
| Additive changes | Keeping slices additive made it easier to reason about rollback risk. |
| Handoff structure | The workflow already encouraged deliberate checkpoints instead of ad hoc progress. |

## What Hurt The Most

| Problem | What happened | Why it matters |
|---|---|---|
| Phase ambiguity | It was easy to confuse “phase 1 artifacts are done” with “phase 1 implementation is done.” | The workflow stopped too early or sounded finished when it was not. |
| Weak state visibility | The workflow did not always make the current stage and next action obvious. | Another agent could not tell whether to continue, revise, or stop. |
| Inconsistent stopping point | The workflow sometimes paused after plan or task setup even when implementation was expected next. | This creates hidden delays and extra back-and-forth. |
| Handoff drift | A handoff note could say “phase complete” without clearly stating whether coding should continue. | That makes it hard for a second agent to resume cleanly. |

## Concrete Changes I Recommend

| Priority | Change | Rationale |
|---|---|---|
| High | Make workflow state explicit and machine-readable at every stage. | The runner should always know and report: current stage, current artifact, next action, and whether the workflow is blocked. |
| High | Separate “phase number” from “artifact state” in wording. | “Phase 1 artifacts complete” and “Phase 1 implementation complete” should never sound interchangeable. |
| High | After `tasks.md` is ready and reviewed, auto-continue into implementation unless there is an explicit blocker or the user asked to stop. | This avoids accidental stalling between planning and coding. |
| Medium | Put open decisions, blocked state, and the exact next action into every handoff note. | Another agent can resume without guessing. |
| Medium | Add a short status summary that says “done / in progress / next.” | This makes the workflow easier to inspect quickly. |
| Medium | Keep phase boundaries tied to files, tests, and review gates, not just narrative labels. | That keeps the workflow grounded in concrete deliverables. |

## Suggested Status Model

I would make the runner report one of these states explicitly:

- `discovering`
- `writing_spec`
- `spec_review`
- `writing_plan`
- `plan_review`
- `writing_tasks`
- `tasks_review`
- `implementing`
- `diff_review`
- `closing`
- `post_mortem`
- `blocked`

That would reduce the ambiguity I ran into around “we are in phase 1” versus “we are done with phase 1.”

## Suggested Acceptance Criteria For A Better Feature Factory

Feature factory is working better if, after a checkpoint, another agent can answer these three questions without reading the full conversation:

1. What stage is this workflow in right now?
2. What is the next action?
3. Is anything blocking progress?

If the answer to any of those is unclear, the workflow still has a usability problem.

## One-Sentence Recommendation

Make feature factory more like a small state machine and less like a guided conversation.

