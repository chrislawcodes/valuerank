# File Structure Tech Debt

This document tracks known file-structure issues that should be cleaned up
**opportunistically** — when someone next edits code in the flagged area. Do
not open refactor-only PRs for these; the goal is to fix them as a natural
part of feature work.

The list has two sections:

1. **Fragmented clusters** — files that were prematurely split into
   `-helpers`, `-utils`, or `-types-detail` siblings. Collapse them or give
   them domain-meaningful names.
2. **Grandfathered large files** — files currently over the hard line-size
   cap. Split by responsibility (not by line count) next time you touch them.

The machine-readable version lives in
[`file-structure.json`](./file-structure.json) and is consumed by
`cloud/scripts/check-tech-debt.sh` and the Claude Code PostToolUse hook.

## Fragmented clusters

| Area | Files | Action |
|---|---|---|
| `domain/decision-model` | `decision-model.ts` + `-helpers.ts` + `-types.ts` | Collapse into one file or rename with real responsibilities |
| `domain/planning` | `planning.ts` + `-utils.ts` + `-estimate.ts` | Same |
| `domain/types` | `types.ts` + `types-detail.ts` | Merge |
| `coverageMatrixHelpers` | 28-line helper with one caller | Inline into `CoverageMatrix.tsx` |
| `shared/math-utilities` | `cosine-similarity.ts` + `decision-scoring.ts` (each <25 lines) | Consolidate into a single module |

## Grandfathered large files

Exempt from the hard line-size cap via `cloud/scripts/file-size-allowlist.txt`.

| File | Lines | Action |
|---|---|---|
| [PairedRunComparisonCard.tsx](../../cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx) | 889 | Decompose by responsibility |
| [start.test.ts](../../cloud/apps/api/tests/services/run/start.test.ts) | 1975 | Split by scenario group |
| [definition.test.ts (queries)](../../cloud/apps/api/tests/graphql/queries/definition.test.ts) | 1336 | Split by test group |
| [run.test.ts (queries)](../../cloud/apps/api/tests/graphql/queries/run.test.ts) | 1226 | Split by test group |
| [aggregation.ts (pressure-sensitivity)](../../cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts) | 721 | Extract stat helpers (wilsonInterval, diffProportionCI, tBasedMeanCI) into stat-math.ts |

## Existing banned-suffix files (filename allowlist)

Ten files currently end in `-helpers.ts` or `-utils.ts` and are grandfathered
in `cloud/scripts/filename-allowlist.txt`. See that file for the list. Rename
them with domain-meaningful names when you next touch the code, or inline the
helper back into its caller.

## Removing entries

When you fix an item:

1. Edit the code.
2. Remove the file from the relevant allowlist
   (`file-size-allowlist.txt`, `filename-allowlist.txt`, or
   `barrel-allowlist.txt`).
3. Update `docs/tech-debt/file-structure.json` and this file.
4. Confirm CI still passes.

If the fix ends up being bigger than the change that brought you there, stop
and discuss scope — don't let cleanup balloon the PR.
