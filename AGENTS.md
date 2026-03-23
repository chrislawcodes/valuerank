# ValueRank - AI Moral Values Evaluation Framework

## What This Project Does
ValueRank measures how AI models prioritize moral values in ethical dilemmas. It's a "nutrition label for AI behavior" — making value alignment comparable across models.

---

## Terminology

All terms (Vignette, Condition, Attribute, Trial, Batch, etc.) are defined in the canonical glossary:
→ `docs/canonical-glossary.md`

Use those terms in all code, specs, UI copy, and docs. Key mappings:

| Use this | Not this |
|----------|----------|
| vignette | definition |
| attribute | dimension |
| condition | scenario (when meaning one exact case) |

---

## Repository

- All PRs go to `chrislawcodes/valuerank`: `gh pr create --repo chrislawcodes/valuerank`
- Railway deployment pulls from `chrislawcodes/valuerank` on `main`
- All agents must follow the Preflight Gate in `cloud/CLAUDE.md` before any `git push` or PR creation

---

## Critical Documentation

Read these before making significant changes:

| Document | Purpose |
|----------|---------|
| `docs/canonical-glossary.md` | Canonical terminology — use these terms everywhere |
| `docs/values-summary.md` | 19 Schwartz values — canonical definitions and circular structure |
| `docs/valuerank_prd.yaml` | Product requirements — user journeys, scenario design rules, Judge philosophy |
| `docs/README.md` | Cloud platform overview — architecture, components, getting started |
| `cloud/CLAUDE.md` | Cloud constitution — coding standards, testing, database patterns |

**Key principles:**
- Values are based on Schwartz et al. (2012), DOI: 10.1037/a0029393
- The Judge doesn't decide right/wrong — it records which values the AI focused on
- Scenarios must expose true value trade-offs with no procedural escape hatches
- Opposite quadrants in the circular structure create the strongest value tensions

---

## Tech Stack

- **TypeScript/Node.js** — API server (GraphQL/Express), React frontend (Vite)
- **PostgreSQL** — Database with Prisma ORM
- **PgBoss** — Job queue for async processing
- **Python 3** — Workers (probe, judge, summarize)
- **LLM Providers** — OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral

Everything runs through the cloud platform. The legacy Python CLI (`src/`) is no longer used.

---

## Key Analysis Concepts

These are needed to understand the codebase — not just background reading:

- **Blind Judging** — Models are anonymized during evaluation to prevent bias. Code that handles judge results must never expose raw model IDs until after scoring.
- **Win Rate** — `prioritized / (prioritized + deprioritized)` per value. This is the core metric for scoring.
- **Pairwise Matrix** — How often one value beats another in direct conflicts. Used in comparison and display features.
- **Higher-Order Categories** — Four quadrants grouping values by motivational conflict. Used for UI organization and analysis grouping.

---

## Feature Development Workflow

For any feature:
1. Describe what you want — the feature factory will clarify and build it correctly
2. Feature factory runs: spec → plan → tasks → implementation
3. One PR per branch — never build new work on top of an open PR branch
4. Claude integrates — Codex and Gemini never push to main directly

For data-critical work (migrations, backfills, rollout scripts) → see `~/.claude/rules/data-critical-waves.md`

---

## Multi-Agent Roles

| Agent | Role |
|-------|------|
| Claude | Coordinator, judge, integrator |
| Gemini | Adversarial review, codebase research |
| Codex | Implementation, adversarial attacks |

- Codex and Gemini never push to main or merge PRs
- If blocked or uncertain, output `ESCALATE_TO_CLAUDE` and stop

---

## MEMORY.md

Every feature gets a `MEMORY.md` at the repo root. It tracks:
- Architectural decisions made during the feature
- Off-limits symbols (do NOT rename without updating this file)
- Removed/renamed symbols (for `check-symbols.sh`)
- Current wave status and resolved impasses

Always pass `MEMORY.md` context when handing off between agents.

---

## CI Failures

1. Run `~/.claude/scripts/parse-ci-errors.sh <run-id>` to extract errors
2. Fix properly — don't suppress errors
3. Push and wait for CI
4. If CI fails a second time, read the new errors before fixing again

---

## Project Status

`STATUS.md` is the Obsidian-linked project board. Update it whenever a task is completed — mark it done, move it to Recently Completed, and update the Next column for whatever is now unblocked.

---

## Claude Code Agent Instructions

- Use the **test-runner-json** agent when running tests
- Use the **coverage-analyzer** agent for coverage analysis
- Use the **feature factory** skill workflow for any non-trivial feature: `feature-spec` → `feature-plan` → `feature-tasks` → `feature-implement`
