# Spec — Compact (acceptance criteria only)

## Coexistence with PR #764 (already on main)

PR #764 (commit `1dace33f`, "Fix coverage matrix cells to show model-set-filtered batch counts") landed on main during this feature's planning. It changed `CoverageCell.tsx` and the resolver in ways that overlap with this feature. Implementation MUST integrate with #764, NOT undo it.

### What PR #764 already shipped

In `cloud/apps/web/src/components/domains/CoverageCell.tsx`:
- New props: `orphanedBatchCount: number`, `aFirstBatchCount: number`, `bFirstBatchCount: number`
- Removed props: `minTrialCount`, `maxTrialCount`
- New "Direction imbalance" orange box rendered when `aFirstBatchCount !== bFirstBatchCount` (the `hasMismatch` flag), showing per-direction batch counts and unpaired count
- New tooltip behaviour: when `hasMismatch`, the cell's `title` attribute shows the direction breakdown
- Display label simplified — no longer shows "trial (min)"; always shows pairedBatchCount or batchCount
- Border becomes `border-orange-400 border-2` when `hasMismatch`
- Small ⚠ glyph appears under the count when `hasMismatch`

In `cloud/apps/api/src/graphql/queries/domain-coverage.ts` and friends:
- The resolver now applies a "model-set" filter (a different filter from `filterModelIds`) — the new condition counts MUST respect both filters consistently
- Aggregate run tracking happens BEFORE the model-set filter (PR #764 fix)

### Integration rules for this feature

**Rule 1 — additive, not subtractive.** Do NOT remove `aFirstBatchCount`, `bFirstBatchCount`, `orphanedBatchCount`, or any of #764's props. Add the new fields and props alongside them.

**Rule 2 — popover layout: Option A (table).** Replace #764's existing 3-row "Direction imbalance" orange box with a column-header table that shows BOTH batch and condition counts per direction. The new layout (when shown):

```
┌─ Direction imbalance ───────────┐
│             Batches  Conditions │
│  A-first      <a-b>     <a-c>   │
│  B-first      <b-b>     <b-c>   │
│                                 │
│  <N> unpaired directional batches  (only when N > 0)
│  <M> unpaired conditions          (only when M > 0)
└─────────────────────────────────┘
```

Where `<a-b>` is `aFirstBatchCount`, `<a-c>` is `directionalCoverage[direction='A'].filledSlots` (or 0 if absent), etc. Use `directionalCoverage` keyed by direction name (the value name like "achievement"), not by A/B labels — display the actual value names where the spec example says A-first / B-first. (`A-first` / `B-first` shorthand used in the box header is fine; the per-row labels can show "Achievement-first" using `VALUE_LABELS`.)

**Rule 3 — orange-box gating.** Show the orange box when ANY of these conditions is true (broader than #764's `aFirstBatchCount !== bFirstBatchCount`):
- `aFirstBatchCount !== bFirstBatchCount` (existing #764 signal), OR
- `directionalCoverage[A].filledSlots !== directionalCoverage[B].filledSlots` (new condition-level signal), OR
- `orphanedBatchCount > 0`, OR
- `orphanedConditionCount > 0`

This means cells with ONLY a trial-level imbalance (same batch counts, different condition counts) now also surface the orange box. Update the box title text if helpful — "Direction imbalance" still works.

**Rule 4 — Match Pair Counts gating.** Match Pair Counts link is visible whenever the orange box is visible AND `aggregateRunId === null` (don't offer top-up on aggregate cells). Same expanded gating as Rule 3 — wherever the user SEES imbalance, they can act on it.

**Rule 5 — incomplete-batch warning copy: keep #764's text.** Do NOT change PR #764's existing wording ("X incomplete batches — not all transcripts generated") to a no-count form. The shipped count-quoting behaviour stays. The earlier spec draft proposed a "no-count" warning out of caution about double-counting; that worry is overridden by the shipped behaviour working in practice.

**Rule 6 — Transcripts header on per-model breakdown.** Add a "Transcripts" column header above the existing per-model rows (when at least one model row shows). PR #764 didn't add this; we still want it for clarity.

**Rule 7 — preserve #764's tooltip behaviour.** The cell button's `title` attribute should continue to show direction breakdown when `hasMismatch`, falling back to model breakdown otherwise. This feature can extend the title to optionally include condition counts when condition-only imbalance triggers the box, but must NOT remove the existing direction-breakdown tooltip.

**Rule 8 — `hasMismatch` flag in #764 must be replaced/expanded.** PR #764 uses `hasMismatch = aFirstBatchCount !== bFirstBatchCount` for the border, the ⚠ glyph, and the orange box. This feature must extend that flag to cover the broader signal in Rule 3 (so a cell with only a condition-level imbalance still gets the orange border and ⚠). Rename the flag to something like `hasImbalance` and update all four use sites consistently.

### What stays the same as the original spec

Everything else: counting invariants, schema additions (`pairedConditionCount`, `orphanedConditionCount`, `directionalCoverage`, `contributingDefinitionIds`), `PAIRED_BATCH_TOPUP` launch mode, lagging-direction tie-breaker, route state contract, summary card on Start Paired Batch page, shared trial-count helper. The only changes from the integration with #764 are the popover layout (Rule 2), the gating expansion (Rules 3 + 4), the warning copy decision (Rule 5), and the `hasMismatch` rename (Rule 8).

---

## Feature

Add condition-level (per-trial) coverage detection to `domainValueCoverage`, surface it in the cell popover, and add a "Match Pair Counts" action that opens the existing Start Paired Batch page pre-configured to top up the lagging direction. Includes a new backend launch mode `PAIRED_BATCH_TOPUP` for single-direction launches.

## Definitions

- **Slot** = `(scenarioId, modelId, sampleIndex)` triple. Transcripts with `scenarioId == null` OR `sampleIndex == null` are EXCLUDED from slot counts.
- **Filled slot** = a slot with at least one transcript present.
- **Paired slot** (cell-level) = a slot with transcripts in BOTH directions.
- **Orphaned slot** (cell-level) = a slot with transcripts in only ONE direction.
- **Direction** = `Run.config.jobChoiceValueFirst` (e.g. "achievement").
- **Dedupe key** for both new counts is the 3-tuple `(scenarioId, modelId, sampleIndex)` — NOT 4-tuple including `runId`. Multiple runs filling the same slot in the same direction collapse to one entry.

## Counting invariants

1. `pairedConditionCount` = size of intersection of "slots filled in direction A" and "slots filled in direction B" Sets.
2. `orphanedConditionCount` = size of symmetric difference of those Sets.
3. Both counts use the 3-tuple dedupe rule.
4. Null `scenarioId` AND null `sampleIndex` transcripts excluded from all condition counts.
5. Aggregate runs and soft-deleted runs/transcripts excluded.
6. The new condition counts apply the SAME `filterModelIds` filter that `batchCount` already applies.

## GraphQL schema (additive — no breaking changes)

New type:
```graphql
type DirectionalCoverage {
  direction: String!
  completeBatches: Int!
  filledSlots: Int!           # NEW — total distinct slots filled by ANY transcript in this direction
  leftoverConditions: Int!    # slots filled by transcripts in INCOMPLETE runs only (subset of filledSlots)
  definitionIds: [ID!]!       # contributing definitionIds for this direction (alphabetical order)
}
```

New fields on `DomainValueCoverageCell`:
- `pairedConditionCount: Int!`
- `orphanedConditionCount: Int!`
- `directionalCoverage: [DirectionalCoverage!]!`
- `contributingDefinitionIds: [ID!]!` (cell-level union, both directions)

## New launch mode

`PAIRED_BATCH_TOPUP` on `startRun`:
- Required input: `topUpDirection: String` (one of the target definition's two value names)
- Validation: load Definition, call `resolveDefinitionContent` + `extractValuePair` (existing utility at `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts:5`); reject if `topUpDirection` not in pair; reject if `runCategory` other than `PRODUCTION` is supplied
- Behavior: creates ONE run with `methodologySafe: true`, `runCategory: 'PRODUCTION'`, `jobChoiceLaunchMode: 'PAIRED_BATCH_TOPUP'`, `jobChoiceValueFirst: <topUpDirection>`, fresh `jobChoiceBatchGroupId` (NOT inherited), no `companionRunId`
- Audit log: `log.info({ runId, definitionId, userId, launchMode, topUpDirection }, 'Top-up run started')`

Existing `PAIRED_BATCH` and `AD_HOC_BATCH` modes unchanged.

## Cell popover (UI)

- "Transcripts" header above the per-model trial breakdown column (when at least one model row shows)
- Per-direction display in form `X batches + Y conditions` reading from `directionalCoverage`
- Match Pair Counts action: visible only when `aggregateRunId === null AND (orphanedBatchCount > 0 || orphanedConditionCount > 0)`
- "Start Paired Batch" remains visible whenever the cell has a vignette (independent of the new action)
- Informational warning when `incompleteBatchCount > 0`: *"This pair has incomplete batches — topping up may not converge in one launch. Check the existing batches' status first."* (always plural, no number quoted)

## Lagging-direction tie-breaker (client-side)

Implemented in pure helper `cloud/apps/web/src/utils/coverageGap.ts` (NOT in the React component). Operates on `directionalCoverage[].filledSlots` and `[].completeBatches`.

Rule order:
1. Compare `filledSlots`. Smaller side = lagging.
2. If `filledSlots` equal, compare `completeBatches`. Smaller side = lagging.
3. If both equal AND non-zero gap, no gap exists; return null.
4. If one direction has zero everything (one-sided cell), the absent direction is lagging.
5. Final tie-breaker: alphabetical-first value name (deterministic only).
6. Multi-definition cells: rule operates on aggregated counts; launch picks `directionalCoverage[laggingDirection].definitionIds[0]` as `launchDefinitionId`, falling back to cell `definitionId` when the directional list is empty.

## Start Paired Batch page

When arrived via Match Pair Counts (route state present):
- Render summary card above existing `<RunForm>` showing pair label, before/after diff per direction, footer with batch + trial deltas
- Pre-fill form: defaults + `launchMode = 'PAIRED_BATCH_TOPUP'`, `jobChoiceValueFirst` pinned to lagging direction (read-only)
- Card recomputes "after" live as form changes (using `computeLaunchTrialCount` shared helper, see plan)
- Footer copy uses TRIALS as the headline magnitude; never "X conditions (Y trials)"

When NOT arrived via Match Pair Counts: page behaves exactly as today (existing US-5 regression).

## Route state contract

```ts
type StartPairedBatchRouteState = {
  returnLabel?: string;
  returnTo?: string;
  matchPairCounts?: {
    pairKey: string;             // "achievement::power_dominance"
    valueA: string;              // raw value name (consumer formats via formatPairLabel)
    valueB: string;
    contributingDefinitionIds: string[];
    launchDefinitionId: string;
    laggingDirection: string;
    before: {
      directionA: { name: string; batches: number; conditions: number };
      directionB: { name: string; batches: number; conditions: number };
    };
  };
};
```

## Trial-count math (shared helper)

Both branches must match backend `sampleScenarios()` in `cloud/apps/api/src/services/run/start-helpers.ts:163`:

- **Sample-percentage mode** (`samplePercentage < 100` and no explicit `scenarioIds`): `effective_scenarios = max(1, floor(total_scenarios × samplePercentage / 100))`. Total trials per direction = `selectedModels.length × effective_scenarios × samplesPerScenario`. **`Math.floor`, not `Math.ceil`.**
- **Specific-condition mode** (explicit `scenarioIds` non-empty, equivalent to `runMode: 'SPECIFIC_CONDITION'`): `effective_scenarios = scenarioIds.length`. Total trials per direction = `selectedModels.length × scenarioIds.length × samplesPerScenario`.
- Empty `scenarioIds` array falls back to sample-percentage mode (matching backend).

## Verified facts (do not re-flag)

- `Run` and `Transcript` BOTH have `deletedAt` (verified in `cloud/packages/db/prisma/schema.prisma`). The `cloud/CLAUDE.md` soft-delete list is stale; existing `domain-coverage.ts` already filters both.
- `batchCount = 1 per complete run`, regardless of `samplesPerScenario` (post-PR-#756 behavior). The `getCoverageBatchIncrement(samplesPerScenario)` multiplication path is dead in main HEAD.
- `expectedCount = scenarioSelections × modelCount × samplesPerScenario` is DEAD CODE post-#756; current main uses `isRunComplete` (slot-by-slot).
- `orphanedBatchCount` exists on `DomainValueCoverageCell` from PR #759 (commit `057658f0` on main). It is DIFFERENT from `incompleteBatchCount` (existing); both coexist.
- This worktree HEAD `728da7d1` is pre-#756/pre-#759. Implementation must `git checkout -b match-pair-counts origin/main`.
- Top-up runs are intentionally `runCategory: 'PRODUCTION'`. The `jobChoiceLaunchMode` field is the discriminator for filtering top-up runs separately (e.g., in lists or analyses).
- The new condition counts do NOT need explicit `jobChoiceBatchGroupId` dedupe; the `Set<slotKey>` per direction naturally collapses retries.

## Out of scope

- A separate "fix incomplete batches" remediation surface (different feature)
- Detecting trial-count drift from mismatched `samplesPerScenario` across batches (rare; flagged limitation)
- Auto-thresholding (operator decides whether a gap is worth topping up)
- Banners or proactive UI elsewhere — Match Pair Counts lives only in the cell popover
- Modifying `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `MEMORY.md`, `.gitignore`, or any file not listed in `scope.json`
