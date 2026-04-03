---
name: experiment
description: Compare Direct Path and Feature Factory on the same feature so we can see whether the extra review steps are worth the overhead.
argument-hint: <feature-description>
---

# Experiment Skill

This skill compares two delivery paths:

- `Direct Path`
- `Feature Factory`

The goal is simple: did the extra review steps in Feature Factory change the outcome enough to be worth the overhead?

Use plain comparisons. Do not assume Claude is the integrator. The AI the human is currently working with is the default integrator unless the human says otherwise.

---

## Step 0 — Setup

Create a kebab-case slug with at most 5 words. Create separate worktrees and experiment folders:

```bash
git worktree add /tmp/wt-<slug>-direct -b direct/<slug>
git worktree add /tmp/wt-<slug>-factory -b factory/<slug>
mkdir -p docs/feature-runs/<slug>-direct
mkdir -p docs/feature-runs/<slug>-factory
```

Use this hash rule for every `artifact_*_sha256` field:

1. Read the saved artifact as UTF-8 text.
2. Normalize line endings only: convert `CRLF` and `CR` to `LF`.
3. Do not trim whitespace, collapse blank lines, or reorder content.
4. Hash the resulting UTF-8 bytes with SHA-256.

For document stages, hash the saved artifact file.
For the implementation stage, hash a saved scoped diff patch for that stage.

Each run writes its own `experiment.md` file with this exact table:

```markdown
| Stage | Artifact | stage_started_at | stage_finished_at | artifact_before_sha256 | artifact_after_sha256 | review_rounds | issues_raised | issues_accepted | artifact_revised | token_usage | cost_usage |
|-------|----------|------------------|-------------------|------------------------|-----------------------|---------------|---------------|-----------------|------------------|-------------|------------|
| Spec | spec.md | | | | | | | | | | |
| Plan | plan.md | | | | | | | | | | |
| Tasks | tasks.md | | | | | | | | | | |
| Implement | code | | | | | | | | | | |
```

---

## Stages A And B — Run In Parallel

Run both paths in parallel in separate worktrees.

### Agent 1 — Direct Path

Use a prompt like this:

> You are running the Direct Path experiment in `/tmp/wt-<slug>-direct` on branch `direct/<slug>`.
> The current integrator is the AI the human is working with in this thread.
> Build the feature directly in this worktree. Ask questions only if needed. Use plain language.
> Keep notes in `docs/feature-runs/<slug>-direct/experiment.md`.
> Use the exact `experiment.md` table template from this skill.
> For each stage you actually use:
> 1. Record `stage_started_at` when the stage begins.
> 2. Save the stage artifact and record `artifact_before_sha256` with the hash rule from this skill.
> 3. Run exactly one structured self-review pass with this checklist:
>    - Is any acceptance criterion still unmet?
>    - Is there a concrete correctness or scope risk?
>    - Is a test or verification step missing?
>    - Is any workflow or user-facing wording stale or confusing?
> 4. Count distinct concrete issues from that checklist pass as `issues_raised`.
> 5. Apply only the issues you accept and record that count as `issues_accepted`.
> 6. Re-hash the saved artifact as `artifact_after_sha256`.
> 7. Set `artifact_revised` to `yes` only if the two hashes differ; otherwise `no`.
> 8. Record `review_rounds` as `1` for that self-review pass.
> 9. Record `stage_finished_at` after the review closes.
> 10. Leave `token_usage` and `cost_usage` blank if they are unavailable.
> If the human asked for PR creation, run preflight, push, and open a PR against `chrislawcodes/valuerank`. If not, keep the result local and report readiness.
> Use repo-root `MEMORY.md` only as a short handoff file.

### Agent 2 — Feature Factory

Use a prompt like this:

> You are running the Feature Factory experiment in `/tmp/wt-<slug>-factory` on branch `factory/<slug>`.
> Follow the repo-owned Feature Factory docs and runner. Use `docs/feature-runs/<slug>-factory/state.json` as the runtime source of truth.
> Keep notes in `docs/feature-runs/<slug>-factory/experiment.md`.
> Use the exact `experiment.md` table template from this skill.
> Track `stage_started_at`, `stage_finished_at`, `artifact_before_sha256`, `artifact_after_sha256`, `review_rounds`, `issues_raised`, `issues_accepted`, `artifact_revised`, and optional `token_usage` / `cost_usage`.
> For document stages, hash the saved artifact file. For implementation, hash a saved scoped diff patch for that stage.
> Set `artifact_revised` to `yes` only when the before and after hashes differ.
> If the human asked for PR creation, run preflight, push, and open a PR against `chrislawcodes/valuerank`. If not, keep the result local and report readiness.
> Use repo-root `MEMORY.md` only as a short handoff file.

Wait for both paths to finish before comparison.

---

## Stage C — Comparison

Write `docs/feature-runs/<slug>-comparison.md`:

```markdown
# Experiment — <Feature Name>

## Outputs

- Direct Path: <branch or PR>
- Feature Factory: <branch or PR>

## Did Reviews Change The Work?

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

## Outcome

- Did Feature Factory catch problems the Direct Path missed?
- Did the extra review steps change the code, scope, or tests?
- Was the extra overhead worth it for this feature?
- Which path would we choose next time, and why?
```

## Step 4 — Report

Tell the user:
- where the comparison file lives
- both branch names or PR links
- which path you recommend next time and why
