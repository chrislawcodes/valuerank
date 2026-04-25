# Closeout — `pairedBatchCount = min(complete A-first, complete B-first)`

**Slug:** `paired-batch-count-min-of-two`
**PR:** [chrislawcodes/valuerank#759](https://github.com/chrislawcodes/valuerank/pull/759)
**Branch:** `paired-batch-count-min-of-two`
**Status:** PR open, awaiting human review. Not merged. CI status pending.

## What shipped

API-side refactor of `DomainValueCoverageCell.pairedBatchCount`:

- Replaced `jobChoiceBatchGroupId`-based dedup with directional counting: `min(complete A-first, complete B-first)` per value pair.
- Direction read from `config.jobChoiceValueFirst` on each Run.
- Set-based dedup on `(direction, groupId)` tuples to defend against retry duplicates.
- Tie-break for cell anchor (`primaryDefinitionId`) updated to `(batchCount desc, directionCount desc, defId asc)`.
- GraphQL field description updated.
- Glossary entries for `Paired Batch` and `Incomplete Batch` rewritten with two new explanatory notes (terminology overlap, metric divergence).

5 source files touched, 0 lines on forbidden paths:

| File | Lines changed |
|---|---|
| `cloud/apps/api/src/graphql/queries/domain-coverage.ts` | +29 / −18 |
| `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts` | +96 / −85 |
| `cloud/apps/api/src/graphql/queries/domain-coverage-gql-types.ts` | +9 / −7 |
| `cloud/apps/api/tests/graphql/queries/domain-coverage.test.ts` | +391 / −101 |
| `docs/canonical-glossary.md` | +9 / −1 |

Tests: **63 pass** in `domain-coverage.test.ts` (was 51), including 5 new integration scenarios (I1–I5) covering asymmetric pairs, metric divergence, legacy runs, retry duplicates, and `>2 directions` corruption fallback.

## What remains open

1. **PR #759 awaiting human review and merge.** Per AGENTS.md, the human owns merge. CI must go green; reviewer should verify scope (`git diff --stat origin/main..HEAD`) lists only the 5 expected source files plus the FF audit trail.
2. **Post-deploy verification.** After merge + Railway deploy, the human runs the 3-pair spot-check from spec §9 (clean / asymmetric / legacy-only) and watches `services:graphql:queries` logs for 10 minutes.

## Deferred risks (recorded for follow-up)

| ID | Description | Trigger / verification |
|---|---|---|
| **F1** | `computePerModelTrialCounts` keeps the surviving-companion dedup, so `minTrialCount` and `pairedBatchCount` measure different things on the same cell. Documented in glossary "Note on metric divergence". | If operators report confusion, follow-up: revisit whether trial counts should aggregate both companions for healthy paired batches. |
| **F2** | Web UI `CoverageCell.tsx:44` falls back to `batchCount` when `pairedBatchCount = 0`. The new semantic does not surface in the typical default-models cell digit; it surfaces in popover Evidence line and analysis-page query string. | If operators want the corrected `0 paired batches` to appear in the cell directly, follow-up: drop the `> 0 ? : batchCount` fallback or add a richer dual-number rendering. |
| **F3** | `>2 distinct jobChoiceValueFirst` tokens in a single cell uses `min` of two largest counts + `log.warn`, not a hard fail. Prod query Q2 currently returns 0 rows. | If `services:graphql:queries` logs show `>2 distinct jobChoiceValueFirst` warnings, investigate the offending definition's token history; consider a hard-fail option. |
| **F4** | Pre-existing dead code: `getCoverageBatchIncrement` and its tests are no longer called by application code (post-PR #756 made `batchCount` always increment by 1). Out of scope for this slice. | Cleanup PR can drop the function + its 13 test cases. |
| **F5** | Pre-existing: model-filter is not applied to `nonAggregateRunsByDefinitionId` population in `domain-coverage.ts:233`, so model-filtered runs flow into the trial-count path even when excluded from `batchCount`. Out of scope for this slice. | Cleanup PR can apply the filter symmetrically. |

## Where the artifacts live

`docs/workflow/feature-runs/paired-batch-count-min-of-two/`

- `spec.md` — requirements, traps, prod data verification, edge cases, post-deploy plan.
- `plan.md` — architecture, wave breakdown, residual risks (each with `verification:`), test plan.
- `tasks.md` — slice 1 / slice 2 boundaries, parallel analysis, pre-merge checklist.
- `closeout.md` — this file.
- `postmortem.md` — workflow-level retrospective (separate file).
- `reviews/` — full adversarial-review chain (3 spec rounds, 1 plan round, 1 tasks round, 2 diff rounds, plus all `*.raw.txt` / `*.stdout.txt` / `*.stderr.txt` artifacts).
- `state.json` — runner state including discovery, reconciliation history, and token usage tally.
