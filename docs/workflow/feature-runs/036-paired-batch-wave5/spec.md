# Feature 036 — Paired-Batch Removal, Wave 5

**Branch**: `claude/focused-proskuriakova-7a71e4` (continuation)
**Created**: 2026-05-09
**Status**: Implementation
**Context**: Wave 5 of the [paired-batch removal cleanup](../../../tech-debt/remove-paired-batch-concept.md). Predecessor: Wave 4 ([PR #1019](https://github.com/chrislawcodes/valuerank/pull/1019)) repointed all analysis off the obsolete fields.

The full implementation spec is at `docs/tech-debt/wave5-spec.md`. That document is the source of truth — it has been adversarially reviewed by Codex and Gemini at the spec level and includes the complete file inventory, task breakdown, migration SQL, risk register, and rollback plan.

This file is a Feature-Factory wrapper that points at it.

---

## What this wave does

Wave 5 deletes the schema fields and UI affordances that Wave 4 made obsolete. By the time Wave 5 starts, no code reads any of these fields — Wave 4 repointed all consumers. Wave 5 is mechanical removal:

- GraphQL schema: remove `Run.pairedBatchGroupId`, `Run.companionRunId`, `Run.launchMode` (input on `startRun`), `'PAIR_ASYMMETRY'` enum value
- Stop writing `companionRunId`, `jobChoiceLaunchMode`, `jobChoiceValueFirst`, `methodologySafe`
- Delete the `PAIRED_BATCH_TOPUP` top-up handler paths
- Delete `persistPairedCompanionRunIds`, `mergeCompanionRunId`, `getConfiguredCompanionRunId` from `lifecycle-helpers.ts`
- Delete the `StartPairedBatchPage`, the launch-mode picker on `RunForm`, the paired-batch badge on `RunCard`, the topup button on `RunDetail`
- Delete `PairedRunComparisonCard` and its render site (replacement deferred to Wave 6)
- Database migration: delete existing `PAIR_ASYMMETRY` rows and remove the enum value
- Fail loudly: any caller that passes `launchMode` gets a hard `ValidationError`
- Delete dead `valuePairModelVotes` storage from snapshot builder
- Update MCP tool outputs to drop pair-related fields

Lower-risk than Wave 4 because the data-layer changes are done.

## Out of scope (Wave 6 work)

- `legacyCompanionPairedRun.ts` deletion
- `job-choice-bridge-report.ts` deletion
- `docs/backend/paired-batch-run-flow.md` deletion
- Pooled-vignette-metrics replacement card (replaces deleted `PairedRunComparisonCard`)
- Glossary and PRD updates

## Acceptance criteria

- All greps in `wave5-spec.md` "Final greps" section return empty (excluding `dist/` and Wave 6 files)
- Migration runs cleanly on local test DB; row count of deleted `PAIR_ASYMMETRY` rows captured
- API + web preflight passes (lint + tests + build)
- Codegen yields no orphan types after schema edits
- `Run.mirroredRuns` resolver still works (Wave 4 functionality preserved)
- No `@ts-ignore`, `eslint-disable`, or `as any` introduced

## Constraints

DO NOT MODIFY: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `GEMINI.md`, `.gitignore`, `STATUS.md`, `experiments.md`, the docs in `docs/tech-debt/`, or any file outside the inventory in `wave5-spec.md`. DO NOT delete `legacyCompanionPairedRun.ts` (Wave 6). DO NOT delete `cloud/scripts/job-choice-bridge-report.ts` (Wave 6).

## Source-of-truth pointer

See [`docs/tech-debt/wave5-spec.md`](../../../tech-debt/wave5-spec.md) for:

- Full implementation tasks (1–11) with file paths and line numbers
- Pre-flight requirements
- Migration SQL
- Order of operations
- Risk and rollback plan
