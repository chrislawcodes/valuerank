# Plan — Feature 036: Paired-Batch Wave 5

The full task plan lives in [`docs/tech-debt/wave5-spec.md`](../../../tech-debt/wave5-spec.md) sections "Implementation tasks" and "Order of changes". This file restates the implementation sequencing and the reasoning behind it for FF.

## Sequencing rationale

Wave 5 is mechanical removal, but the operations are not commutative. The order is:

1. **Stop writes first.** Remove `jobChoiceLaunchMode`, `jobChoiceValueFirst`, `companionRunId`, `methodologySafe` writes from launch + lifecycle paths. New runs after this point already match the post-Wave-5 shape.
2. **Add the loud-fail.** Reject any `launchMode` input on `startRun` with a `ValidationError` that names the migration path. Internal callers were audited in pre-flight (only `job-choice-bridge-report.ts` references the field, and that is Wave 6 deletion — no live callers pass `launchMode`).
3. **Delete topup.** `PAIRED_BATCH_TOPUP` handler paths come out. The generic top-up handler still works for individual runs.
4. **Delete dead code.** `valuePairModelVotes` snapshot writes, the dead `lifecycle-helpers` exports.
5. **Prisma migration.** Capture the prod row count for `run_anomalies WHERE type = 'PAIR_ASYMMETRY'`. The migration deletes those rows then drops the enum value via the standard rename-create-swap-drop pattern.
6. **GraphQL schema removals.** `Run.pairedBatchGroupId`, `Run.companionRunId`, the `launchMode` input, the `'PAIR_ASYMMETRY'` enum value. Re-emit schema, run codegen.
7. **Web enum consumers.** Web touches that reference the now-removed enum value get cleaned.
8. **Web operation files.** Drop the removed fields from `.graphql` selection sets.
9. **Web UI cleanup.** Delete `StartPairedBatchPage`, the launch-mode picker, `PairedRunComparisonCard`, the topup button, the `launchMode`-conditional rendering paths.
10. **MCP tools.** Audit and drop the removed fields from any tool that exposed them.
11. **Tests.** Remove tests for removed fields; add a regression guard that `RunAnomalyTypeEnum` does not include `'PAIR_ASYMMETRY'`.
12. **Verify.** Full preflight (lint + tests + builds + codegen + migration on test DB).

## Why this order

- "Stop writes" before "remove schema" prevents a window where the schema rejects fields the writes still emit.
- "Add loud-fail" together with "stop writes" ensures we surface stragglers immediately rather than silently dropping the input.
- "Migration" before "GraphQL schema field removals" because Prisma is the source of truth — schema removal that lacks a corresponding column drop would leave dead columns. (For the two columns we're dropping, Prisma also handles the column-drop migration in the same step.)
- "Codegen" runs after schema emit; web operation file changes go after codegen so the type-checker validates them against the updated types.
- "Tests" last because they refer to types that change throughout. Touching tests earlier creates churn.

## Risk register

See [`wave5-spec.md` § Risk and rollback](../../../tech-debt/wave5-spec.md#risk-and-rollback) for the full table.

Key risks:

| # | Failure | Detection | Mitigation |
|---|---|---|---|
| 1 | Migration deletes more rows than expected | Pre-flight count vs post-migration count diverge | Capture count before + after; rollback if off |
| 2 | A caller still passes `launchMode` | First post-deploy call fails with ValidationError | Pre-flight audit complete (only Wave-6 file references it); error message names migration |
| 3 | Build break from missed UI consumer | TS error during `npm run build --workspace @valuerank/web` | Caught by preflight |
| 4 | `Run.mirroredRuns` regression | Wave 4's resolver tests | Tests preserved; codegen verifies the field still resolves |

## DO NOT MODIFY (per spec)

`CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `GEMINI.md`, `.gitignore`, `STATUS.md`, `experiments.md`, the docs in `docs/tech-debt/`, `legacyCompanionPairedRun.ts` (Wave 6), `cloud/scripts/job-choice-bridge-report.ts` (Wave 6), `docs/backend/paired-batch-run-flow.md` (Wave 6), `cloud/apps/api/src/graphql/queries/models-stability-math.ts` (sample-count weighting is intentional).

## DO NOT use

`@ts-ignore`, `eslint-disable`, `as any`.
