# Plan: Match Pair Counts and condition-level coverage detection

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Judge round 2 approved spec advance (2/3 proceed). Findings addressed in subsequent edits: null-scenarioId rule (Counting Invariant 4), runCategory validation (Spec-level decision 4), empty scenarioIds fallback (Spec-level decision 8), incomplete-batch warning consistency (Edge Cases table aligned with US-3).
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: Judge round 2 advance. Fixes: dedupe key contradiction reconciled to single 3-tuple cell-level rule; multi-definition launch math addressed via DefinitionId-to-launch rule + Spec-level decision 7 (form pre-fill); warning copy unified across US-3 and Edge Cases.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Judge round 2 advance. Fixes: Verified Facts vs source-code ambiguity addressed (3 separate 'Verified facts' entries explicitly cite stale-branch HEAD vs main); single-direction pairing lifecycle resolved (Spec-level decision 6 — companionRunId stays unset, pairing is statistical); pre-fill defined (Spec-level decision 7).
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: R3 HIGH companion-run dedupe: addressed via Verified Facts entry explaining Set-by-slot naturally dedupes (no group-id dedupe needed for slot intersection/diff math).
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: R3 HIGH runCategory PRODUCTION lumps top-up: addressed via Verified Facts entry — top-up runs ARE production data; jobChoiceLaunchMode='PAIRED_BATCH_TOPUP' is the discriminator for any UI/list that wants to filter them separately.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: R3 HIGH contributingDefinitionIds: new field added to slice 1 GraphQL schema (and to the cell's contributing data already in resolver). MED orphanedBatchCount confusion: STALE-CODE — added to Verified Facts. MED lagging logic in component: extracted to pure helper coverageGap.ts. LOW aggregate cells: gating now requires aggregateRunId === null. LOW pairLabel coupling: route state passes raw valueA/valueB; consumer formats.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: R1 findings addressed: HIGH smoke test execution path - now lists 3 alternatives (MCP, curl, Apollo Sandbox) with the MCP path as preferred. MED null sampleIndex - slice 1 task 1.2 now requires skipping when scenarioId OR sampleIndex is null. MED leftover exclusion gates - slice 1 task 1.2 now requires same gates (null checks, modelIds filter, soft-delete, aggregate exclusion) on the leftover path. MED multi-definition routing - slice 3 task 3.3 now references the DefinitionId-to-launch rule explicitly with deterministic alphabetical-by-id tie-break for the .definitionIds[0] choice.

## Architecture Overview

The feature has three independently shippable layers, sequenced by dependency:

```
[L1: Detection] → [L2: Backend launch] → [L3: UI]
```

- **L1 (Detection):** Backend resolver expansion. Adds `pairedConditionCount`, `orphanedConditionCount`, `directionalCoverage` to `DomainValueCoverageCell`. No UI changes. No mutation changes. Independently testable.
- **L2 (Backend launch):** New launch mode `PAIRED_BATCH_TOPUP` on `startRun`. Validation, run config, no UI changes. Independently testable via mutation tests.
- **L3 (UI):** Cell popover changes (Transcripts header, X batches + Y conditions display, Match Pair Counts action), Start Paired Batch page summary card, route state plumbing. Depends on L1 and L2 being live.

Each layer can be a separate PR or a slice within one PR — see Wave Breakdown below for the recommendation.

---

## Verified Facts (do not re-flag)

These were checked during plan review and are correct:

- **`orphanedBatchCount` exists on `DomainValueCoverageCell` in main HEAD `057658f0`.** Added by PR #759 (commit `057658f0`). The worktree this FF run is in is at HEAD `728da7d1`, which is pre-PR-#759. Reviewers reading code via this worktree will not see `orphanedBatchCount` and may flag the plan's references to it. This is a stale-branch artifact, not a plan error. Implementation will fork from `origin/main`.

- **`incompleteBatchCount` and `orphanedBatchCount` are different fields, both present on the cell post-#759.** `incompleteBatchCount` (pre-existing) counts non-aggregate runs that started but failed to fill every slot. `orphanedBatchCount` (NEW in #759) counts directional runs that have no matching partner in the other direction. They are NOT a renamed field — they coexist.

- **Top-up runs are intentionally `runCategory: 'PRODUCTION'`.** The `runCategory` enum is the wrong place to mark them as "different from regular paired-batch runs" — they ARE production data and should appear in production lists. The discriminator for filtering top-up runs separately is `jobChoiceLaunchMode === 'PAIRED_BATCH_TOPUP'`, which is already in the run's config and visible to all consumers. UI/list code that wants to distinguish them should match on the launch mode.

- **The new condition counts do NOT need explicit dedupe-by-`jobChoiceBatchGroupId`.** The existing resolver dedupes group IDs to avoid double-counting in `batchCount` and `computePerModelTrialCounts` because those sum across companion definitions. The new condition counts use a `Set<slotKey>` per direction (where `slotKey = "${scenarioId}|${modelId}|${sampleIndex}"`) — multiple runs filling the same slot in the same direction naturally collapse to one entry in the Set. The dedupe-by-group-id concern doesn't apply to slot-based intersection/symmetric-difference math.

---

## Branch Strategy

**Critical:** the FF workflow is running in a worktree at `728da7d1`, which is pre-#756 / pre-#759. Implementation MUST fork from current `origin/main` (HEAD `057658f0` at start of this run) to pick up the post-#756 batch semantics and the `orphanedBatchCount` field added in #759.

Codex implementation prompts must explicitly include:

```
git checkout -b match-pair-counts origin/main
```

NOT branching from this worktree's HEAD.

---

## Data Model (no schema changes)

This feature adds **NO** Prisma migrations. All work uses existing fields:

- `Run.config.jobChoiceValueFirst` — already exists
- `Run.config.jobChoiceBatchGroupId` — already exists
- `Run.config.jobChoiceLaunchMode` — already exists; gains a new value `'PAIRED_BATCH_TOPUP'` (string-typed, no enum migration needed)
- `Run.config.companionRunId` — already exists, intentionally unset for top-up runs
- `Run.runCategory` — already exists; top-up runs set `'PRODUCTION'`
- `Transcript.scenarioId`, `Transcript.sampleIndex`, `Transcript.modelId` — already exist; the resolver query is widened to select all three (it currently selects only `modelId`)

---

## GraphQL Schema (additive)

```graphql
type DirectionalCoverage {
  direction: String!          # the value name (e.g. "achievement")
  completeBatches: Int!       # count of complete non-aggregate runs in this direction
  filledSlots: Int!           # total distinct (scenarioId, modelId, sampleIndex) slots filled by ANY transcript in this direction (across complete AND incomplete runs). This is the field computeLaggingDirection compares between directions for the tie-breaker. Equal to the per-direction Set<slotKey> size used to compute pairedConditionCount / orphanedConditionCount
  leftoverConditions: Int!    # count of distinct slots filled by at least one transcript belonging to an INCOMPLETE run, in this direction. Computation: for each incomplete run in this direction, gather its transcripts' (scenarioId, modelId, sampleIndex) tuples; take the UNION across all incomplete runs in this direction; that union's size is leftoverConditions. A slot that is also filled by a transcript in some COMPLETE run still counts here as long as it is filled by at least one transcript in an incomplete run. (filledSlots is the union across ALL runs, complete and incomplete; leftoverConditions is the union across incomplete runs only — leftoverConditions ≤ filledSlots always)
  definitionIds: [ID!]!       # all contributing definitionIds whose runs landed in this direction. Used by the client's DefinitionId-to-launch rule to pick a launch target deterministically. Length 1 in normal cases (one A-first companion); 2+ only when multiple definitions duplicate the same primary value (rare). Empty when this direction has zero runs
}

type DomainValueCoverageCell {
  # ... existing fields ...
  pairedConditionCount: Int!         # NEW — count of slots with transcripts in BOTH directions
  orphanedConditionCount: Int!       # NEW — count of slots with transcripts in ONLY ONE direction
  directionalCoverage: [DirectionalCoverage!]!  # NEW — per-direction detail (length 0/1/2 normally; >2 only in corruption case, where the resolver keeps the two largest per existing rule)
  contributingDefinitionIds: [ID!]!  # NEW — all definition IDs aggregated into this cell (across both directions, undirected). Empty when the cell has no vignette. The directional `definitionIds` on `DirectionalCoverage` is what the launch path reads; this top-level list is for diagnostic / debugging UIs. The existing `definitionId` field remains the primary picked for the analysis link
}
```

```graphql
input StartRunInput {
  # ... existing fields ...
  launchMode: LaunchMode             # existing — gains new enum value PAIRED_BATCH_TOPUP
  topUpDirection: String             # NEW — required when launchMode === PAIRED_BATCH_TOPUP, must match one of the two value names of the target definition's vignette
}

enum LaunchMode {
  PAIRED_BATCH
  AD_HOC_BATCH
  PAIRED_BATCH_TOPUP   # NEW
}
```

Note: The actual `LaunchMode` representation in the codebase may be a string union rather than a GraphQL enum — Codex implementing should match the existing pattern.

---

## Wave Breakdown

Recommended: **one PR with three `[CHECKPOINT]`-bounded slices** (each slice keeps under ~300 lines changed). Single PR keeps reviewer context together; slices give per-slice diff review.

### Slice 1: Detection (resolver + new fields + client plumbing)
- Widen `domain-coverage.ts` Prisma query to select `transcripts.scenarioId, sampleIndex` in addition to `modelId`
- **Respect existing query filters:** the new condition counts must apply the same `filterModelIds` filter that `batchCount` already applies. `filterModelIds` is the resolver-local variable computed at [`domain-coverage.ts:62`](cloud/apps/api/src/graphql/queries/domain-coverage.ts) from `args.modelIds`, used at [`domain-coverage.ts:209-210`](cloud/apps/api/src/graphql/queries/domain-coverage.ts) to gate which runs/transcripts contribute to `batchCount`. Condition counts must apply the same gate. The same null-scenarioId, null-sampleIndex, soft-delete, and aggregate exclusions that the existing path applies must apply to condition counts too — slice 1 must not introduce a divergent set of filters
- Compute per-direction `Set<slotKey>` from filled slots (excluding null `scenarioId`)
- Compute `pairedConditionCount` (intersection size) and `orphanedConditionCount` (symmetric difference size)
- Compute `directionalCoverage` list: per direction, `completeBatches` (existing) + `leftoverConditions` (new)
- Expose `contributingDefinitionIds` field on the cell (the resolver already builds `definitionsByPairKey` internally; just expose it)
- Add new GraphQL fields to `domain-coverage-gql-types.ts` matching the spec
- **Client-side plumbing** (must land in this slice so the build stays green):
  - Update `cloud/apps/web/src/api/operations/domainCoverage.ts` and `domainCoverage.graphql` to query `pairedConditionCount`, `orphanedConditionCount`, `directionalCoverage { direction, completeBatches, leftoverConditions }`
  - Update `CoverageCellProps` in `cloud/apps/web/src/components/domains/CoverageCell.tsx` to receive the new fields (used by slice 3 — but the prop type must be threaded through `CoverageMatrix.tsx` now to avoid breaking the build)
  - Re-run `npm run codegen` (or the project's GraphQL codegen step) so generated types in `cloud/apps/web/src/generated/graphql.ts` update
- Test cases: balanced cell, asymmetric cell at trial-only level, asymmetric at batch level, fully one-sided, null-scenarioId rows excluded, retry duplicates collapsed, aggregate runs excluded, soft-deleted excluded, >2-directions corruption
- Codegen verification: `npm run build --workspace @valuerank/web` must succeed after the schema and operation update

Estimated diff: ~350 lines (resolver + types + client GQL operation + codegen output + tests).

`[CHECKPOINT]` after slice 1.

### Slice 2: Backend launch (`PAIRED_BATCH_TOPUP`) + downstream readers
- Add `PAIRED_BATCH_TOPUP` to the `LaunchMode` union/enum
- Add `topUpDirection: String` input field
- In `lifecycle.ts` `startRun`, branch on the new mode: create ONE run with `methodologySafe: true`, `runCategory: 'PRODUCTION'`, `jobChoiceLaunchMode: 'PAIRED_BATCH_TOPUP'`, `jobChoiceValueFirst: <topUpDirection>`, fresh `jobChoiceBatchGroupId`, no `companionRunId`
- Validation: reject if `topUpDirection` is missing/blank/not one of the target definition's value names. Validation path: load the `Definition` by id (Prisma), call `resolveDefinitionContent(id)` (from `@valuerank/db`, returns `{ resolvedContent }`), then `extractValuePair(resolvedContent)` (verified to exist at [`domain-coverage-utils.ts:5`](cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts) — re-exported from `domain-analysis-values`); compare `topUpDirection` against the returned `valueA`/`valueB` (case-sensitive). Reject if `runCategory` is supplied as anything other than `PRODUCTION`. Errors must use the existing `ValidationError` class from `@valuerank/shared`
- Audit log entry distinguishes top-up from regular paired-batch launches (asserted in tests via mocked logger)
- **Thread the new launch mode through downstream readers** (must land in this slice to avoid type errors):
  - `cloud/apps/web/src/api/run-json-types.ts` — extend the `jobChoiceLaunchMode` union to include `'PAIRED_BATCH_TOPUP'`
  - `cloud/apps/web/src/pages/RunDetail/RunDetail.tsx` — add a label for the top-up mode (recommendation: "Paired batch top-up")
  - `cloud/apps/web/src/pages/AnalysisDetail.tsx` — review whether `isPairedBatch` logic should treat top-up runs as paired (recommendation: NO — top-up runs stand alone per Spec decision 6 — but the analysis detail UI should still surface them clearly with a top-up label, not as an "unknown" mode)
  - Any other consumer found via codebase search; the test suite must confirm no `'PAIRED_BATCH_TOPUP'` strings appear unhandled
- Test cases: happy path (single run with right config), missing direction → error, mismatched direction → error, runCategory override → error, deleted definition → error, existing PAIRED_BATCH and AD_HOC_BATCH still work unchanged, audit log structured payload contains expected fields, RunDetail renders the top-up label

Estimated diff: ~280 lines (mutation + validation + downstream readers + tests).

`[CHECKPOINT]` after slice 2.

### Slice 3: UI (popover + Match Pair Counts + summary card)
- `CoverageCell.tsx`: add Transcripts column header in popover; show `X batches + Y conditions` per direction (read from `directionalCoverage`); add Match Pair Counts link gated on **(a)** `aggregateRunId === null` (don't offer top-up on aggregate cells — they have no transcripts of their own; the action is meaningless), AND **(b)** `(orphanedBatchCount > 0 || orphanedConditionCount > 0)` — both fields exist on the cell on main: `orphanedBatchCount` from PR #759, `orphanedConditionCount` from slice 1; add the informational warning when `incompleteBatchCount > 0`
- New shared helper for trial-count math (matching backend `sampleScenarios()`) consumed by both `useRunForm.ts` and the new summary card. **Recommended location: `cloud/packages/shared/src/launch-trial-count.ts`** (the existing `@valuerank/shared` workspace package — verified to exist in this monorepo). Both `cloud/apps/api` and `cloud/apps/web` already import from `@valuerank/shared`, so backend and frontend can both consume the helper. If for any reason that import path doesn't work, duplicate with a strong unit test that asserts numerical agreement on a fixture set
- **Lagging-direction selection on the client** — **extract to a pure helper, not in `CoverageCell.tsx`**:
  - New file: `cloud/apps/web/src/utils/coverageGap.ts`. Exports:
    - `computeLaggingDirection(cell: DomainValueCoverageCell): { direction: string; definitionId: string } | null` — returns `null` when no gap. Implements the spec's 6-rule tie-breaker entirely as pure functions of input data.
    - `formatPairLabel(valueA: string, valueB: string): string` — uses `VALUE_LABELS` to format the human label. (Replaces passing pre-formatted `pairLabel` in route state — destination component uses raw `valueA, valueB` and calls `formatPairLabel` itself, decoupling components.)
  - `CoverageCell.tsx` calls `computeLaggingDirection` and uses the result to render the Match Pair Counts link (or hide it when null)
  - **`computeLaggingDirection` operates on `directionalCoverage[].filledSlots` and `directionalCoverage[].completeBatches`** for the tie-breaker comparisons. It does NOT depend on `pairedConditionCount` or `orphanedConditionCount` directly (those are aggregate views). The launch path uses the lagging direction's `directionalCoverage[i].definitionIds[0]` as the `launchDefinitionId`. **Fallback when the directional `definitionIds` list is empty** (happens only for cells that have ZERO runs in the lagging direction — i.e., one-sided cells): use the cell's existing `definitionId` field (which the resolver picks via `selectPrimaryDefinitionCounts`'s `primaryDefinitionId`; that name is internal to the resolver, while `definitionId` is what the GraphQL schema exposes)
  - **Test assertion:** for every cell shape in a fixture set, the helper's chosen lagging direction matches a hand-computed expected value. Pure unit tests, no React rendering required
- **Route state contract** (used by `CoverageCell.tsx` link → `StartPairedBatchPage.tsx`):
  ```ts
  type StartPairedBatchRouteState = {
    returnLabel?: string;        // existing
    returnTo?: string;           // existing
    matchPairCounts?: {          // NEW — present iff arrived via Match Pair Counts
      pairKey: string;             // e.g. "achievement::power_dominance"
      valueA: string;              // raw value name e.g. "achievement" (NOT pre-formatted; consumer formats via formatPairLabel)
      valueB: string;              // raw value name e.g. "power_dominance"
      contributingDefinitionIds: string[];  // all definitions the cell aggregates (from new contributingDefinitionIds field on the cell)
      launchDefinitionId: string;  // chosen by computeLaggingDirection per the DefinitionId-to-launch rule
      laggingDirection: string;    // value name of the lagging side, e.g. "achievement"
      before: {
        directionA: { name: string; batches: number; conditions: number };
        directionB: { name: string; batches: number; conditions: number };
      };
    };
  };
  ```
- `StartPairedBatchPage.tsx`: read `routeState.matchPairCounts`; if present, render summary card above `<RunForm>`; pre-fill form per Spec decision 7; pin `jobChoiceValueFirst` to lagging direction (read-only in this mode); pass `launchMode: 'PAIRED_BATCH_TOPUP'` and `topUpDirection` to the mutation. If `matchPairCounts` is undefined, behave exactly as today (US-5)
- Card shows before/after diff with batches and trials; updates live on form changes (using the shared trial-count helper)
- Test cases: popover renders new fields; gating hides Match Pair Counts on healthy cells; route state plumbed correctly; lagging-direction client logic correct for fixture cell shapes; card recomputes; refresh fallback (route state lost) renders standard form without crash; existing entry from vignette detail page still works (US-5)

Estimated diff: ~400 lines (cell + page + card + lagging-direction helper + shared trial-count helper + tests).

`[CHECKPOINT]` after slice 3.

---

## Verification

Per the ship skill's Step 4.5, this feature requires a production smoke test before merge.

**Smoke test plan:**
1. Run a real `domainValueCoverage` query against production (via the valuerank MCP `graphql_query` tool) for a known asymmetric cell from PR #759's smoke test — e.g., `achievement::power_dominance` (was 14/16).
2. Confirm `pairedConditionCount` is non-zero and roughly equals `min(A_batches, B_batches) × samplesPerScenario × scenarios × models` (sanity check, not exact match).
3. Confirm `orphanedConditionCount` is non-zero for the asymmetric cell.
4. Confirm a balanced cell (e.g., `achievement::conformity_interpersonal`) returns `orphanedConditionCount == 0`.
5. Manually click Match Pair Counts in the local dev UI, verify summary card renders, verify the form is pre-filled, do NOT submit (or submit against a dev DB only).

**Pass criteria:** All 5 checks pass. Any unexpected zero, null, or NaN value in the new fields fails the smoke test and blocks merge.

---

## Residual Risks

Per the FF rule, every residual risk MUST carry a verifiable pre-merge check.

- **Risk 1: Performance regression on resolver query expansion.** Adding `scenarioId, sampleIndex` to the transcripts selection roughly doubles the per-row payload. On a high-volume cell this could add latency.
  - **verification:** before merging slice 1, run `graphql_query` against the largest known production cell (look up `batchCount` on the `domainValueCoverage` cell for a busy domain) and compare query latency before/after the change. If latency increases by more than 200ms, redesign the query. Cheap pre-merge check via the valuerank MCP.

- **Risk 2: Dedup correctness on retry-heavy cells.** The 3-tuple slot dedup may behave incorrectly on cells where `(runId, scenarioId, modelId, sampleIndex)` collisions are common (e.g. workers retrying on the same slot).
  - **verification:** before merging slice 1, write a regression test fixture where two runs in the same direction fill the same slot multiple times, and assert `pairedConditionCount`/`orphanedConditionCount` count that slot once. Pre-merge unit test, no production query needed.

- **Risk 3: `PAIRED_BATCH_TOPUP` runs landing in aggregate analysis as orphans.** Aggregate analysis aggregates by `(definitionId, sourceFingerprint)`. Top-up runs have a fresh `jobChoiceBatchGroupId` and no `companionRunId`. Aggregate analysis should still pick them up via the standard batch-counting path, but this is unverified.
  - **verification:** before merging slice 2, dispatch a test top-up run against a dev database, run the aggregate analysis, and confirm the top-up run is included in the aggregate's `sourceRunIds`. If excluded, redesign group-ID strategy. Pre-merge integration test or dev-environment check.

- **Risk 4: UI summary card math drifts from backend `sampleScenarios()`.** The card and `useRunForm.ts` both compute trial counts; if they share no helper, they can drift.
  - **verification:** the slice 3 acceptance test must include a snapshot test that compares the card's predicted trial count to the actual trial count returned by a launched test run. If they disagree by even one trial, the shared helper is wrong. Pre-merge integration test.

- **Risk 5: Route state lost on refresh / open-in-new-tab.** Match Pair Counts uses `location.state` which is in-memory only. A user who refreshes the page mid-flow loses the summary card.
  - **verification:** the slice 3 acceptance test must include a manual / Cypress check that refreshes the Match Pair Counts page and confirms the form falls back to the standard launch flow without crashing (no card, no broken state). Pre-merge.

- **Risk 6: Top-up `jobChoiceLaunchMode` value choice clashes with existing string parsing.** Some downstream code may pattern-match on `jobChoiceLaunchMode` string values without expecting a third option.
  - **verification:** TypeScript exhaustiveness check via a compile-time assertion. Add a test like `function exhaustiveCheck(mode: JobChoiceLaunchMode): string { switch (mode) { case 'PAIRED_BATCH': ...; case 'AD_HOC_BATCH': ...; case 'PAIRED_BATCH_TOPUP': ...; } }` so adding a new mode without updating each consumer fails the build. Plus: a test that creates a top-up run and renders `RunDetail` to confirm a non-empty label is produced. Pre-merge automated tests, not a `grep`.

- **Risk 7: Aggregate analysis silently includes top-up runs but treats their data wrong.** Inclusion in `sourceRunIds` is necessary but not sufficient — the run's transcripts must contribute correctly to the aggregate computation.
  - **verification:** integration test that: (a) launches a baseline paired batch with N trials, (b) runs aggregate analysis, captures the result vector, (c) launches a top-up run with M trials, (d) re-runs aggregate analysis, (e) asserts that the result vector reflects N+M trials' data and not N alone. Pre-merge integration test against a dev DB.

- **Risk 8: Audit log entry for top-up launches is silent if logger mock isn't asserted.** The plan says we log a structured audit event, but without a test the field shape can drift.
  - **verification:** mutation test mocks the logger and asserts `log.info` is called with `{ runId, definitionId, launchMode: 'PAIRED_BATCH_TOPUP', topUpDirection, ... }` for the top-up path. Pre-merge unit test.

---

## Out of Scope (explicit)

- No Prisma schema migrations (no new columns, no enum migration)
- No changes to existing `PAIRED_BATCH` or `AD_HOC_BATCH` semantics
- No changes to aggregate analysis (top-up runs are picked up via the standard path)
- No fix-incomplete-batches remediation surface
- No detection of `samplesPerScenario` drift across batches (rare; flagged limitation)
- No banners or proactive UI elsewhere — Match Pair Counts lives only in the cell popover
- No commits to `main`. PR review and merge follow the ship skill.

---

## Test Strategy

| Layer | Test type | Coverage target |
|------|-----------|----------------|
| Resolver (slice 1) | Vitest unit + integration | Counting Invariants 1–5; null-scenarioId; retry collapse; aggregate exclusion; deletion exclusion; >2-directions corruption |
| Mutation (slice 2) | Vitest integration | All validation rules; happy path produces correct config; PAIRED_BATCH and AD_HOC_BATCH unaffected |
| UI (slice 3) | Vitest + RTL | Popover renders new fields; gating logic; route state plumbed; card live-recompute; refresh fallback; existing entry path unchanged |
| End-to-end | Manual smoke test | Pre-merge, against dev DB |

Backend test coverage target: 80% line / 75% branch (existing `cloud/CLAUDE.md` standard).
