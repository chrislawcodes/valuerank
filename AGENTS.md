# ValueRank Agent Contract

This file is the shared working contract for Claude, Codex, Gemini, and any other agent that works in this repo.

ValueRank evaluates how AI models prioritize moral values in tradeoff prompts.

## Communication Style

- Use plain, direct language at a high-school reading level.
- Use short sentences.
- Explain jargon if you need it.
- Start with a short summary, then details.
- When there are real options, use a table and give a recommendation with a reason.
- Be honest about risk, uncertainty, or disagreement.

## Clarifying Questions

- If you need clarifying questions, decide the full set first.
- Say how many questions you have before asking the first one.
- Ask them one at a time.
- Give your recommendation before each question when helpful.

## Never Do

- Push commits directly to `main`.
- Merge a PR unless the human directly asks.
- Suppress errors to make checks pass.
- Commit secrets or credentials.
- Rename legacy symbols casually when the task is not an explicit terminology migration.

## Project Scope

- The active product lives under `cloud/`.
- Treat `src/` as legacy unless the task explicitly targets it.
- Railway deploys from `main`, so treat `main` as production-facing.

## Terminology

Canonical source: `docs/canonical-glossary.md`

- Use glossary terms in new specs, UI copy, docs, and analysis discussions.
- Existing code, schema, and APIs may still use older names. Map them instead of renaming them casually.
- `definition` usually means `vignette`
- `dimension` usually means `attribute`
- `scenario` is ambiguous; use `vignette`, `condition`, or `narrative` based on what is actually meant

## Repo Rules

- Open PRs against `chrislawcodes/valuerank`.
- Follow the Preflight Gate in `cloud/CLAUDE.md` before any `git push` or PR creation.
- One feature per branch. Do not stack new work on top of an open feature PR unless the human asks.
- Fix the root cause when CI fails. Do not retry blindly.

## Read First

Always read:

- `cloud/CLAUDE.md` for coding standards and preflight
- `docs/canonical-glossary.md` for terminology

Read when relevant:

- `docs/valuerank_prd.yaml` for product behavior
- `docs/values-summary.md` for value definitions and tensions
- `docs/README.md` for architecture overview
- `experiments.md` when choosing a delivery path
- `MEMORY.md` for the active branch handoff
- `docs/feature-runs/<slug>/` when working in Feature Factory

## Delivery Paths

- The human chooses the delivery path.
- Available paths: `Direct Path`, `Feature Factory`, `Experiment Workflow`.
- If the path is unclear, ask before starting.
- Do not switch paths mid-feature unless the human asks.

## Roles And Handoffs

- The AI the human is currently working with is the default integrator.
- In Feature Factory, follow the repo-owned workflow docs and workflow state.
- Agents may hand off work, but the current integrator owns user communication and the next decision.
- When blocked, stop and ask the human for the missing decision.

## Data-Critical Work

- For migrations, backfills, rollout scripts, or seed changes, follow `~/.claude/rules/data-critical-waves.md`.
- Do not assume production enum values or string formats.
- Require a safe verification plan before push.

## Memory Policy

- `MEMORY.md` is a short handoff file for the active feature on the current branch.
- Keep only: locked decisions, off-limits symbols, removed or renamed symbols, current status, and open blockers.
- Do not use `MEMORY.md` as a long-term archive.
- In Feature Factory, runtime state lives in `docs/feature-runs/<slug>/state.json`.
- In Feature Factory, durable artifacts live in `docs/feature-runs/<slug>/spec.md`, `plan.md`, `tasks.md`, and `closeout.md`.
- Before merge, move durable notes into feature artifacts or another normal doc.
- Trim `MEMORY.md` back to the current active handoff.

## Project Status

- Update `STATUS.md` when a meaningful task is complete.
- Mark the work done.
- Move it to Recently Completed.
- Update Next for what is now unblocked.
