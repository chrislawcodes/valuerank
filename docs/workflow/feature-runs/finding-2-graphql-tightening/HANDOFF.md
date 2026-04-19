# Handoff — Finding #2: GraphQL Schema Gap Fix (for Claude Cloud Session)

**Date:** 2026-04-17
**Slug:** `finding-2-graphql-tightening`
**Worktree:** `/Users/chrislaw/valuerank/.claude/worktrees/finding-2-graphql-tightening`
**Branch:** `claude/finding-2-graphql-tightening` (forked from `main` @ 6aa2af34)
**Factory state:** `docs/workflow/feature-runs/finding-2-graphql-tightening/state.json`

---

## Background

From `docs/workflow/plans/codebase-maintainability-findings.md` Section 2 ("Frontend Types Mirroring Backend Types"). Two files hand-type shapes that should come from GraphQL codegen:

- `cloud/apps/web/src/api/operations/domainAnalysis.ts` — mixes two problems (see Q1).
- `cloud/apps/web/src/api/operations/domains.ts` — 10 missing fields across 3 types + one orphan mutation.

## What's done

- **FF init** with 14 scope paths (all `cloud/apps/api/src/graphql/*` under domain, both frontend ops files, the generated/ dir, codegen config).
- **Discovery: complete.** 3 questions, all answered:

| # | Question | Answer |
|---|---|---|
| 1 | Scope | Schema gaps only. JSON-scalar conversion split into a separate deferred feature (chip spawned — will be `finding-2b-json-scalar-graphql-objects`). |
| 2 | Orphan `backfillDomainEvaluationModels` mutation | **Include.** Add Pothos resolver (or wire up existing handler), regen, delete manual `gql` block. |
| 3 | Verification | Two layers: grep-based before/after list in PR description + "must not exist" list in `tasks.md`; custom ESLint rule that fails CI when a new hand-typed GraphQL shape is added in `cloud/apps/web/src/api/operations/`, with an allowlist for the JSON-scalar types in `domainAnalysis.ts` that are intentionally staying. No CLAUDE.md note. |

## What's next

`status --slug finding-2-graphql-tightening` to confirm. Expected next stage: **author_spec — write `spec.md`**.

Recommended spec structure:
1. **Background**: cite the findings doc, note the two problems and why we split them.
2. **Goals**: add the missing fields to the schema; wire the orphan mutation; replace hand-types with generated types; add ESLint rule.
3. **Non-goals**: JSON-scalar type conversion (deferred to sibling feature).
4. **User stories** (probable structure):
   - P1: Developer reading `domains.ts` sees only documents and codegen-re-exports — no hand-typed `Domain`, `DomainEvaluation`, `DomainEvaluationMember` exports.
   - P1: The `backfillDomainEvaluationModels` mutation is reachable via codegen, not via hand-written `gql`.
   - P2: CI fails on a PR that adds a new hand-typed GraphQL shape in `api/operations/` (ESLint rule).
   - P3: Docs / handoff notes updated with the "schema gap first, hand-type never" norm.
5. **FRs**:
   - Schema additions: `Domain.defaultModelIds`, `Domain.sentencePrefix`, `Domain.labelPrefix`, `DomainEvaluationMember.modelIds`, `DomainEvaluation.{launchableDefinitionIds, launchableDefinitions, samplePercentage, samplesPerScenario, targetBatchCount}`.
   - New mutation: `backfillDomainEvaluationModels` with full typed result.
   - Removed from `domains.ts`: `export type Domain`, `export type DomainEvaluationMember`, `export type DomainEvaluation`, `BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION` const.
   - ESLint rule + allowlist config.
6. **Risks**: schema changes may need GraphQL query-side additions in consumers (8 + 11 = 19 import sites) — scope this in tasks.md explicitly.

After spec is written, checkpoint:
`python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py checkpoint --slug finding-2-graphql-tightening --stage spec`

## Verification to do during spec authoring

- Confirm the `backfillDomainEvaluationModels` resolver actually exists server-side (grep `cloud/apps/api/src/` for the string). If it doesn't, the "include it" decision from Q2 means we need to implement it, which materially expands the feature. Flag this to the human via `block` if discovered.
- Confirm the GraphQL queries that consume `Domain`, `DomainEvaluation`, `DomainEvaluationMember` actually request the missing fields today. If they do (via the hand-type), the resolvers must already be returning them as `extensions` or similar — check. If they don't, adding the fields to the schema is a pure addition.

## Known sibling work (not your concern)

- **Orchestrator split** — `/Users/chrislaw/valuerank/.claude/worktrees/trusting-heisenberg-2a4caf/`. Separate PR, zero file overlap.
- **Finding #2b (JSON-scalar conversion)** — should land *after* this feature. The spawned chip will open it in its own session.

## Uncommitted context

None. This worktree is a clean fork of `main`. FF init files (`state.json`, empty `spec.md`, empty `plan.md`, empty `tasks.md`, this `HANDOFF.md`) are the only changes.

## If you hit unresolved blockers

Use `block --slug finding-2-graphql-tightening --reason "<specific decision>"`. The human returns tomorrow.
