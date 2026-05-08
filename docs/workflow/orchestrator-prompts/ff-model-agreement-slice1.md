# Codex Prompt — Model Agreement on Tradeoffs · Slice 1: Snapshot Infrastructure

You are implementing **slice 1 of 5** in a Feature Factory feature. The full design is in:

- Spec: `docs/workflow/feature-runs/model-agreement-on-tradeoffs/spec.md`
- Plan: `docs/workflow/feature-runs/model-agreement-on-tradeoffs/plan.md`
- Tasks: `docs/workflow/feature-runs/model-agreement-on-tradeoffs/tasks.md`

**Read those three docs first.** This prompt is a focused task list for slice 1 only.

## Repo

- Working branch: `ff/model-agreement-on-tradeoffs` (already checked out off `main`).
- Working dir: the repo root (`/Users/chrislaw/valuerank`).
- Do NOT push, do NOT open a PR — slice 1 is a partial. The human ships only after slice 5.

## What this slice does

Extends the domain-analysis snapshot output with a new `cellLevelOutcomes` field (alongside the existing `valuePairModelVotes` — both are written by the new builder). Bumps the snapshot code version.

**No resolver, no UI, no deletes in this slice.** Those come in later slices. Keep the scope tight.

## Files to modify (3 files, ~150 lines net add)

1. `cloud/apps/api/src/services/analysis/domain-analysis-cache-types.ts`
2. `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-builder.ts`
3. `cloud/apps/api/src/services/analysis/domain-analysis-cache.ts`

## Implementation details

### File 1 — `domain-analysis-cache-types.ts`

Add to the `DomainAnalysisSnapshotOutput` type (after the existing `valuePairModelVotes` field):

```typescript
// Per-(definitionId, modelId, canonicalA, canonicalB, ownLevel, opponentLevel) outcome.
// Key format: `${definitionId}::${modelId}::${canonicalA}::${canonicalB}::${ownLevel}::${opponentLevel}`
// where canonicalA < canonicalB alphabetically.
// `aChoices` = number of trials where the model chose canonicalA.
// `bChoices` = number of trials where the model chose canonicalB.
// `neutrals` = trials with no decisive choice.
// Used by the modelAgreementOnTradeoffs resolver (v1.12.0+).
cellLevelOutcomes?: Record<string, { aChoices: number; bChoices: number; neutrals: number }>;
```

Bump `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` from `'1.11.0'` to `'1.12.0'`.

### File 2 — `domain-analysis-snapshot-builder.ts`

Locate the existing `valuePairModelVotes` derivation in `buildSnapshotOutput`. It looks roughly like:

```typescript
const valuePairModelVotes: Record<string, { wins: number; losses: number }> = {};
const defModelCells = new Map<string, Map<string, ValueKeyCounts>>();
// ... two-pass loop ...
```

**Do NOT remove or modify the existing loop.** It stays for one release for rollback safety per spec § Risks (current valuePairModelVotes consumers may still exist).

Add a NEW derivation pass AFTER the existing one. Pseudocode (from plan § A2):

```
groups: Map<(definitionId::modelId::ownLevel::opponentLevel), Map<valueKey, CellCounts>>

for each (key, counts) in cellMap:
    parts = key.split('::')
    if parts.length !== 5: skip
    [defId, modelId, valueKey, ownLevel, oppLevel] = parts
    groupKey = `${defId}::${modelId}::${ownLevel}::${oppLevel}`
    let byValueKey = groups.get(groupKey)
    if undefined: byValueKey = new Map(); groups.set(groupKey, byValueKey)
    byValueKey.set(valueKey, counts)

cellLevelOutcomes: Record<string, { aChoices: number; bChoices: number; neutrals: number }> = {}

for each (groupKey, byValueKey) of groups:
    if byValueKey.size !== 2: continue   # non-binary — skip (matches existing behavior)
    sortedKeys = [...byValueKey.keys()].sort()
    [canonicalA, canonicalB] = sortedKeys
    aCell = byValueKey.get(canonicalA)
    bCell = byValueKey.get(canonicalB)
    # In cellMap, "wins" for valueKey X = times the model chose X.
    # aChoices = aCell.wins, bChoices = bCell.wins.
    # Neutrals are mirrored, so either side's neutrals count is fine.
    [defId, modelId, ownLevel, oppLevel] = groupKey.split('::')
    outKey = `${defId}::${modelId}::${canonicalA}::${canonicalB}::${ownLevel}::${oppLevel}`
    cellLevelOutcomes[outKey] = {
      aChoices: aCell.wins,
      bChoices: bCell.wins,
      neutrals: aCell.neutrals,
    }
```

Add `cellLevelOutcomes` to the returned `DomainAnalysisSnapshotOutput` object alongside `valuePairModelVotes`.

### File 3 — `domain-analysis-cache.ts`

Add a new exported function. Mirror the existing `readValuePairModelVotesFromSnapshot` pattern (same query, same JSDoc style):

```typescript
/**
 * Read the pre-computed per-(canonicalA::canonicalB::modelId) cell-level outcomes from
 * the current domain-analysis snapshot. Returns null if no CURRENT snapshot exists or if
 * the snapshot pre-dates v1.12.0 (i.e. does not include `cellLevelOutcomes`).
 *
 * Used by the modelAgreementOnTradeoffs resolver to compute Cohen's kappa, percent
 * agreement, and divergence metrics with equal-weight aggregation.
 */
export async function readCellLevelOutcomesFromSnapshot(
  scope: DomainAnalysisScope,
  domainId: string,
  configSignature: string,
): Promise<Record<string, { aChoices: number; bChoices: number; neutrals: number }> | null> {
  const snapshot = await getCurrentSnapshot(db, scope, domainId, configSignature);
  if (snapshot == null) return null;
  const parsed = parseSnapshotOutput(snapshot.output);
  return parsed?.cellLevelOutcomes ?? null;
}
```

## Verification

After making the changes:

1. `cd /Users/chrislaw/valuerank/cloud && npm run build --workspace @valuerank/api` — must succeed with zero errors.
2. `cd /Users/chrislaw/valuerank/cloud && npm run lint --workspace @valuerank/api` — zero NEW warnings (pre-existing warnings in unrelated files are fine).
3. Sanity-grep: `rg "cellLevelOutcomes" cloud/apps/api/src/` should return matches in all three modified files.

No tests required at this slice — math/resolver tests live in slices 2 and 3.

## Commit

Create ONE commit on `ff/model-agreement-on-tradeoffs`:

```
ff(model-agreement) slice 1: extend snapshot with cellLevelOutcomes

- Adds optional cellLevelOutcomes field to DomainAnalysisSnapshotOutput
- Snapshot builder writes both legacy valuePairModelVotes AND new cellLevelOutcomes
- Bumps DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION 1.11.0 → 1.12.0
- Adds readCellLevelOutcomesFromSnapshot reader

Slice 1 of 5 in feature 'model-agreement-on-tradeoffs'.
See docs/workflow/feature-runs/model-agreement-on-tradeoffs/.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## Constraints

- DO NOT remove or modify the existing `valuePairModelVotes` derivation loop.
- DO NOT modify `accumulateTranscriptCells` or `transcript-cell-accumulator.ts`.
- DO NOT modify any resolver or UI file.
- DO NOT push the branch or open a PR. Just commit locally.
- DO NOT MODIFY: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `.gitignore`, `docs/workflow/feature-runs/model-agreement-on-tradeoffs/spec.md`, `plan.md`, or `tasks.md`. If you think another file needs updating, note it in your output but do not write it.
- No `@ts-ignore`, no `eslint-disable`, no `any` casts.
- Run `npm run build --workspace @valuerank/api` before committing. If it fails, fix the root cause properly.
