# Spec — `pairedBatchCount` as `min(A-first complete, B-first complete)`

**Slug:** `paired-batch-count-min-of-two`

## 1. Problem

Today, `DomainValueCoverageCell.pairedBatchCount` (rendered in the Domain Overview value-pair grid) is computed by deduplicating completed non-aggregate runs by their `jobChoiceBatchGroupId`. The group ID was assigned at *launch* time — both halves of a paired batch share it — so each group survives once after dedup, and the surviving run is the "complete" companion when there is one.

The operator-facing pain point that motivates the refactor:

**The current count conflates "have a partner" with "have a survivor."** A launch where only the A-first run finished and the B-first run was abandoned today contributes `1` to `pairedBatchCount`, even though there is no usable B-first to pair against. The number on screen says "we have a paired batch" when in operator-meaningful terms we do not.

(A secondary motivation — "decouple display from launch-time bookkeeping" — is intentionally **out of scope** for this slice. The launch-side write of `jobChoiceBatchGroupId` and `jobChoiceValueFirst` is unchanged. Future ad-hoc/manual pairing flows would still require a separate launch-side change to populate `jobChoiceValueFirst`; this slice does not address those.)

## 2. Goal

Replace the group-id-based dedup with a directional-count semantic in the Domain Overview cell only:

```
pairedBatchCount = min(
  count of complete A-first non-aggregate runs,
  count of complete B-first non-aggregate runs
)
```

…where "A-first" vs "B-first" is read off `config.jobChoiceValueFirst` on each Run.

The semantic is: "how many complete runs in each direction do we have that **could** be paired off for order-bias analysis." When both directions are complete this matches the current behavior; when only one direction is complete, the new number is `0` instead of `1`.

### 2a. Loose vs strict pairing — explicitly chosen

This is **loose pairing**, not strict pairing. Two illustrative cases:

| Scenario | Strict (would be: complete groups only) | Loose (this spec: `min(A_complete, B_complete)`) |
|---|---|---|
| 3 launches, all both-complete | 3 | 3 |
| 3 launches: 2 both-complete + 1 A-only-complete | 2 | 2 |
| 2 launches: 1 A-only-complete + 1 B-only-complete (different groups, both broken) | 0 | **1** |
| 2 launches: both A-only-complete | 0 | 0 |

The third row is the pivot: under loose pairing, an A-first run from launch G1 and a B-first run from launch G2 — **even though they were never co-launched** — count as 1 paired-batch worth of analysis-ready data. The user explicitly chose loose pairing in the task brief: it lets operators see "we have at least N complete runs in each direction that could be analyzed together," without caring whether those runs share a launch-time group ID.

Operationally this is fine because: (a) order-bias analysis runs over transcript-level data and does not require runs to share a launch event; (b) launch parameters within a launch group are guaranteed identical (verified §6.3) but parameters *across* launch groups for the same value pair are also generally consistent because they are operator-driven configurations; (c) the strict definition would punish operators for natural retry patterns (re-launch one side after a failure) that today's count handles gracefully.

**This semantic shift is intentional and is the change being made.** Reviewers who want strict pairing should block on this section in the spec checkpoint, not on later checkpoints.

The launch-time `jobChoiceBatchGroupId` field stays in `start.ts` because non-display consumers still rely on it (see §6).

### 2b. Web UI rendering — explicitly out of scope (with rationale)

`cloud/apps/web/src/components/domains/CoverageCell.tsx:44` currently computes the displayed cell number as:

```ts
const displayCount = hasPerModelData
  ? minTrialCount
  : (pairedBatchCount > 0 ? pairedBatchCount : batchCount);
```

So:
- When the domain has default models configured (the typical case), the cell's main number is `minTrialCount` (per-model trial coverage), not `pairedBatchCount`. The `pairedBatchCount` value flows into the popover ("Evidence: X batches from coverage cell • Y paired batches" via `useAnalysisState.ts:209`) and into the analysis-page query string (`coveragePairedBatchCount`), but not into the cell's primary digit.
- When the domain has no default models configured, the cell falls back to `pairedBatchCount > 0 ? pairedBatchCount : batchCount`. So a cell with `pairedBatchCount = 0` and `batchCount > 0` (the asymmetric case this refactor changes) would still render `batchCount` and the label "batch(es)" — the refactor's effect would not surface.

**This slice does not change the UI fallback.** Reasons:

1. The primary visible number for the typical operator (`minTrialCount`) is already independent of `pairedBatchCount` semantics.
2. The downstream consumers of `pairedBatchCount` (popover Evidence line, analysis-page query string, `useAnalysisState`) all see the new value and benefit from the corrected semantic immediately.
3. Changing the no-models fallback would require either dropping the `> 0 ? : batchCount` fallback (so the cell shows `0` and label "paired batches" — operator-correct but visually a regression for the no-models view) or a richer label change. Either is its own design decision.

**Recommendation in `closeout.md`:** open a follow-up issue to revisit `CoverageCell.tsx:44` once the API change has been live for a release cycle and operators have given feedback on the popover Evidence line. The follow-up would either (a) drop the fallback so the no-models view shows `0 paired batches` honestly, or (b) introduce a richer dual-number rendering. That is a UI design conversation, not a refactor.

This is documented up-front so reviewers understand the API change is operationally meaningful (popover, analysis page, downstream consumers, prod-data verification) even though the cell's leading digit may not visibly move for the no-models case.

## 3. Non-goals

- Changing the launch-path code that *writes* `jobChoiceBatchGroupId` on new runs (`start.ts`, `lifecycle.ts`, `plan-slots.ts`, `execute-runs.ts`). The field stays.
- Removing `getCoverageBatchGroupId` from `domain-coverage-utils.ts`. The Web UI's `PairedRunComparisonCard` and `RunCard` read the field through the GraphQL `Run.pairedBatchGroupId` resolver, and the anomaly detector reads it directly. The util only loses one caller (the display path).
- Touching the `Run.batchCount → Run.isAggregate` rename (already shipped in PR #756).
- Touching `incompleteBatchCount`, `batchCount`, `minTrialCount`, `maxTrialCount`, or `modelBreakdown` semantics. Only `pairedBatchCount` changes.
- Touching the GraphQL `pairedBatchGroupId` resolver on `Run` (`cloud/apps/api/src/graphql/types/run.ts:193`). It still exposes the launch-time field.
- Backfilling legacy runs that lack `jobChoiceValueFirst` (see §7).

## 4. Acceptance criteria

A1. For a value pair with N complete A-first runs and M complete B-first runs (across all companion definitions for that pair), the `pairedBatchCount` cell value is `min(N, M)`.

A2. The *primary semantic* of `pairedBatchCount` is `min(complete A-first, complete B-first)` and does **not** require runs to share a `jobChoiceBatchGroupId`. The algorithm still consults `jobChoiceBatchGroupId` (via `getCoverageBatchGroupId`) for one purpose only: to collapse retry-driven duplicates within a single launch group (see §5.3 — Set-of-groupIds defense). For ungrouped runs, each run counts once. This is a defensive use, not a semantic dependency: removing the launch-time group-id altogether (hypothetically) would still let the algorithm produce the correct `min(A, B)` for pristine data; the group-id dedup only adds robustness against retries.

A3. A non-aggregate completed run with `config.jobChoiceValueFirst` missing, null, blank, or not a string contributes to **neither** direction (and therefore does not raise either count). Bucket assignment for `batchCount` vs `incompleteBatchCount` is unchanged: a complete run (per `isRunComplete`) still goes to `batchCount`; an incomplete run still goes to `incompleteBatchCount`. The two are mutually exclusive — a single run only ever lands in one.

A4. A run that does not match the model filter (when `modelIds` is provided) contributes to neither direction (same symmetric exclusion rule already used for `batchCount`).

A5. Aggregate runs (`config.isAggregate === true`) contribute to neither direction.

A6. Incomplete non-aggregate runs (per `isRunComplete`) contribute to neither direction; they continue to count toward `incompleteBatchCount` only.

A7. A signature filter (`signature` arg), if present, narrows the runs considered for both directional counts identically.

A8. The dedup logic for `selectPrimaryDefinitionCounts` (which sums batchCount and pairedBatchCount across companion definitions for the same canonical value pair) keeps batchCount semantics unchanged. For `pairedBatchCount`, the new computation is *naturally* deduplicated because the companion definitions live in disjoint `jobChoiceValueFirst` buckets — A-first runs come from one definition, B-first from the other — so summing per-definition `min` is wrong; the min must be computed across the *full* set of runs for the pair (see §5.4).

A8b. The cell's anchor (`primaryDefinitionId` / `definitionName` / `aggregateRunId`) remains stable across this semantic shift. The current tie-break in `selectPrimaryDefinitionCounts` is `batchCount` desc → `pairedBatchCount` desc → `defId.localeCompare`. After this refactor, `pairedBatchCount` is no longer per-definition (it's a per-cell aggregate), so the secondary tie-break loses its per-definition input. New tie-break order: `batchCount` desc → `directionCount` desc → `defId.localeCompare`. `directionCount` is the number of distinct non-null direction tokens observed in `directionalCompleteCountsByDefinitionId.get(defId)` (i.e., the size of that per-definition `Map<direction, count>` — a definition that has both A-first and B-first complete runs has `directionCount = 2`, one with only A-first complete has `directionCount = 1`). The new helper signature in `domain-coverage-utils.ts` takes the per-definition direction map as input; the tie-break uses `defMap.size` directly without any new bookkeeping. This avoids regression for asymmetric pairs where multiple companions tie on `batchCount` and one carries both directions.

A9. The `companionRunId`-driven aggregate analysis pipeline (`aggregate-preparation.ts`) is unaffected. The pair-asymmetry anomaly detector (`detectPairAsymmetry`) is unaffected.

A10. Glossary entry for `Paired Batch` in `docs/canonical-glossary.md` is updated to reflect the new semantic; the `Incomplete Batch` entry is updated to call out the "broken pair" case where one companion is complete and the other is not (see §5.8).

A11. The GraphQL field description for `pairedBatchCount` (`domain-coverage-gql-types.ts:83`) is updated to match the new semantic; the old description ("Count of paired-batch groups where the surviving (complete) companion run is fully complete") is removed.

A12. Existing `domain-coverage.test.ts` tests covering `pairedBatchCount` are rewritten in line with the new semantic. New tests cover: (i) min(N, M) where N ≠ M, (ii) only one direction complete → 0, (iii) both directions zero → 0, (iv) missing/blank `jobChoiceValueFirst` excluded, (v) aggregate runs excluded, (vi) signature filter applied, (vii) model filter applied symmetrically, (viii) cross-definition pair (companions split across two definitions for the same canonical pair), (ix) legacy run (no `jobChoiceValueFirst`) coexisting with new runs in the same cell.

A13. CI is green on the resulting PR (`api` + `web` workspaces — `lint`, `test`, `build` via `npx turbo`).

## 5. The new algorithm — concrete

### 5.1 Inputs (per cell, per value pair)

A cell renders one canonical value pair `(valueA, valueB)`. It can be backed by one or two companion definitions. Today's loop already collects, per definition:

- All completed non-aggregate runs that survive the model+signature filters.
- A `complete` boolean for each, derived from `isRunComplete`.
- The run's `config` JSON (so we can extract `jobChoiceValueFirst`).

We use the same source of truth — no new query.

### 5.2 Direction extraction

Add `getCoverageDirection(runConfig: unknown): string | null` to `domain-coverage-utils.ts`:

- Read `(config as { jobChoiceValueFirst?: unknown }).jobChoiceValueFirst`.
- Trim whitespace.
- Return the trimmed string if non-empty; otherwise `null`.

This intentionally does **not** map the value-token to a canonical Schwartz key. We only need the two distinct strings to partition the runs; we do not need to know which side is "A" and which is "B" in canonical terms because `min(N, M)` is symmetric. (Verification §7 confirms paired batches in prod always carry exactly two distinct `jobChoiceValueFirst` values per group.)

### 5.3 Counting per definition

Replace the `pairedBatchCountByDefinitionId` / `pairedBatchGroupIdsByDefinitionId` / `pairedBatchIncrementsByGroupId` machinery in the inner run loop with a per-definition map of `direction → Set<groupId>`:

```ts
// For each definition, track which (direction, groupId) tuples we have seen.
// Using a Set<groupId> per direction collapses duplicate runs that share the
// same launch group (e.g., retry-driven duplicates of the same A-first run).
// Ungrouped runs (no jobChoiceBatchGroupId) use the sentinel `__ungrouped__`
// plus the run's id to ensure each ungrouped run still counts once.
const directionalGroupsByDefinitionId =
  new Map<string, Map<string /* direction token */, Set<string /* groupId or "__ungrouped__:<runId>" */>>>();
```

For each completed non-aggregate run that passes the model filter and is `isRunComplete`:

- `direction = getCoverageDirection(run.config)`
- If `direction === null`: do **not** increment any direction set (A3).
- Else:
  - `groupKey = getCoverageBatchGroupId(run.config) ?? "__ungrouped__:" + run.id`
  - Add `groupKey` to `directionalGroupsByDefinitionId[run.definitionId][direction]`. (Set semantics → duplicate (groupId, direction) tuples collapse.)

The per-direction count for the definition is then `set.size` (number of distinct launch groups in that direction). Ungrouped runs each get a unique `groupKey`, so they always count once each.

We keep updating `batchCountByDefinitionId` exactly as today (the run is complete, so it counts toward `batchCount` regardless of whether it has a direction).

**Why the Set-of-groupIds:** today's `deduplicateRunsByGroupId` collapses duplicate completed runs from the same launch group (e.g., a re-run of the A-first half). The min-of-two algorithm without group-level dedup would inflate the count if such duplicates exist. This is theoretical (§6.3 found 0 prod groups with duplicate runs in the same direction) but the Set-based defense costs nothing and keeps the algorithm correct under retry patterns we haven't seen yet.

### 5.4 Per-cell min

In `selectPrimaryDefinitionCounts` (or a new sibling helper), compute `pairedBatchCount` for the cell's `defIdsForPair` as follows:

1. For each `defId` in `defIdsForPair`, fetch its `Map<direction, Set<groupId>>` from `directionalGroupsByDefinitionId`. Merge into a single cell-wide `Map<direction, Set<groupId>>` by union-ing the Sets per direction. (The unions are fine: A-first runs come from a different launch group than B-first runs because launch is per-direction-per-definition; merging Sets across companions cannot collapse meaningful entries.)
2. Reduce to `Map<direction, number>` by taking `set.size` per direction.
3. If the merged map is empty: `pairedBatchCount = 0`.
4. If the merged map has 1 entry: `pairedBatchCount = 0` (only one direction has any complete runs).
5. If the merged map has 2 entries: `pairedBatchCount = min(count[direction1], count[direction2])`.
6. If the merged map has >2 entries (data corruption — see §7): `pairedBatchCount = min` of the *two largest* counts. Log a warning at `ctx.log.warn` with the cell key, definition IDs, and the offending direction tokens. Do not throw — the operator should still see a number.

The "merge across definitions" step is what makes companion definitions count correctly: for a value pair backed by two companion definitions A and B, A's runs all carry `jobChoiceValueFirst = tokenA` and B's all carry `tokenB`. Merging gives `{tokenA: <SetA>, tokenB: <SetB>}`; `min(|SetA|, |SetB|)` is the answer.

For a single-definition case (cell backed by one definition only), the same logic applies — the definition's own runs split into `{tokenA: <SetA>, tokenB: <SetB>}` and we take `min(|SetA|, |SetB|)`.

### 5.5 Wiring

`domain-coverage.ts:370–376` currently calls `selectPrimaryDefinitionCounts(...)` with five arguments including the group-id maps. Replace those last three group-id arguments with the new directional map. The function's `pairedBatchCount` return value retains its meaning to callers; only the computation changes.

`selectPrimaryDefinitionCount` (the singular sibling) and `getCoverageBatchIncrement` are untouched.

### 5.6 What we delete

- The local maps `pairedBatchGroupIdsByDefinitionId` and `pairedBatchIncrementsByGroupId` in `domain-coverage.ts` (no longer fed into `selectPrimaryDefinitionCounts`).
- The two group-id branches in `selectPrimaryDefinitionCounts` (the `pairedBatchGroupIdsByDefinitionId != null && pairedBatchIncrementsByGroupId != null` and `else if (pairedBatchGroupIdsByDefinitionId != null)` paths). The function keeps a single, simpler implementation backed by the directional map.
- The `pairedBatchCount` block inside the inner loop (`domain-coverage.ts:291–314`) — it is replaced by the directional-counter increment.

What we keep:

- `getCoverageBatchGroupId` and `deduplicateRunsByGroupId` in `domain-coverage-utils.ts`. The trial-count path still calls `deduplicateRunsByGroupId` (see §5.7). `deduplicateRunsByGroupId` internally calls `getCoverageBatchGroupId`, so `getCoverageBatchGroupId` is **not orphaned** by this refactor — it has one fewer direct caller (the display path), but the trial-count path uses it transitively. The earlier draft of this spec called it "orphaned"; that was wrong. No cleanup follow-up is implied.

### 5.7 Per-model trial counts (intentionally unchanged — but accurately described)

`computePerModelTrialCounts` receives a list of non-aggregate runs collected across all companion definitions for the pair. Today it relies on `deduplicateRunsByGroupId(runs, completenessOf)` at `domain-coverage.ts:399` to choose one survivor per `jobChoiceBatchGroupId` (preferring the complete companion). This refactor **does not** change that path.

**Be honest about what trial counts measure.** `deduplicateRunsByGroupId` keeps exactly one run per launch group. So for a healthy paired batch where both companions are complete, only **one** companion's transcripts feed into `computePerModelTrialCounts` — the other companion's transcripts are dropped before the count. For a one-sided launch, the surviving complete run's transcripts are kept. So:

- `minTrialCount` / `maxTrialCount` / `modelBreakdown` measures: *"per-model transcript volume across the surviving (complete-preferred) representative of each paired-batch launch group, plus all ungrouped runs."*
- It is **not** "all transcripts ever ingested for this value pair." Half of every healthy paired batch's transcripts are intentionally excluded. (This existing behavior is what keeps the displayed trial count from doubling when both companions complete; it is the trial-count path's analog of "dedup by group id.")

This is the current behavior and this slice does not change it. Whether it is the right behavior is a separate question (see "Deferred" below).

**Why the divergence between `pairedBatchCount` and trial counts is acceptable:**

- `pairedBatchCount` (new): "how many launches do we have where **both** directions completed?" → counts only fully-paired launches.
- Trial counts (unchanged): "how many transcripts per model exist for the *representative* run of each launch group?" → counts the surviving complete companion when one exists; counts the surviving incomplete-only run when no companion completed; counts ungrouped runs once each.

A one-sided launch (A-first complete, B-first abandoned):
- `pairedBatchCount`: contributes 0 (no pair).
- Trial counts: the A-first run survives `deduplicateRunsByGroupId`, so its transcripts count.

A both-complete paired batch:
- `pairedBatchCount`: contributes 1 (one to A-first, one to B-first → min = 1).
- Trial counts: only one companion's transcripts count (`deduplicateRunsByGroupId` picks one).

A both-incomplete launch:
- `pairedBatchCount`: contributes 0 (no complete in either direction).
- Trial counts: an incomplete survivor is still picked by `deduplicateRunsByGroupId`; its (partial) transcripts count.

**Deferred (out of scope for this slice):** revisiting whether `computePerModelTrialCounts` should count transcripts from *both* companions in a healthy paired batch. That is a separate semantic question with its own answer space (count both → trial counts double for healthy pairs; count one → matches today). Punt to a later slice once `pairedBatchCount` is settled.

**Acknowledged operator-visible divergence:** an operator can see `pairedBatchCount = 0, minTrialCount > 0` for the same cell when only one direction completed. The cell's tooltip / docs should make clear that paired-batch counting is stricter than trial counting. Plan-phase: confirm whether the Web UI rendering of `pairedBatchCount` already explains this, and whether a tooltip update is in scope.

### 5.8 Glossary

`docs/canonical-glossary.md`'s `Paired Batch` entry currently reads:

> A paired batch counts as one when both companion runs are complete; if one companion is incomplete, the complete one is the survivor and the pair counts as one paired batch.

Replace with:

> A paired batch is counted whenever there is one complete A-first run and one complete B-first run that can be paired off. The Domain Overview shows `min(complete A-first, complete B-first)` for each value pair: when both directions have the same number of completed runs, that is the paired-batch count; when one direction has more, the surplus is unpaired and is **not** counted as a paired batch (the unpaired complete run still appears in `Batch` count).

> A paired launch where one companion finishes and the other does not is a **broken pair**: the complete companion contributes 1 to `Batch`, the incomplete companion contributes 1 to `Incomplete Batch`, and the launch contributes 0 to `Paired Batch`.

> **Note on terminology overlap:** "paired batch" is also used in the launch path to describe two runs that share a `jobChoiceBatchGroupId` because they were launched together (e.g., the anomaly detector at `cloud/apps/api/src/services/run/anomaly-detection.ts` finds "sibling runs" by group ID). That is the *launch-time* concept of a paired batch — runs that were spun up as a co-launched pair. The display-time concept above counts pairable analysis-ready data and does not require runs to share a launch group. Both senses are valid in their own contexts; the launch-time grouping still drives anomaly detection while the display-time count drives the Domain Overview hub.

> **Note on metric divergence within a cell:** within a single Domain Overview cell, `Paired Batch` (display-time, this slice) and the per-model trial counts (unchanged this slice) operate on different subsets of the underlying runs. The trial-count path picks one survivor per `jobChoiceBatchGroupId` (the launch-time concept), so for a healthy paired launch with both companions complete, only one companion's transcripts feed the trial counts. The paired-batch count picks both. The two metrics are correct in their own terms but are not directly comparable arithmetically (e.g., 1 paired batch does not imply 2× the trial-count of an unpaired complete run); see spec §5.7 for the full divergence table.

The existing `Incomplete Batch` glossary entry is unchanged structurally but should add this clarifying clause:

> An incomplete batch is a run that expects transcripts but is missing one or more (model × scenario × sampleIndex) slots. A broken pair (one direction complete, one incomplete) contributes one `Incomplete Batch` from its abandoned side.

(The original "B-first batch and A-first batch" example sentence in `Paired Batch` remains valid.)

## 6. Verification phase findings (must read before plan)

### 6.1 Consumers of `jobChoiceBatchGroupId`

Source-code consumers across `cloud/apps/api/src` and `cloud/workers` (excluding tests and generated GraphQL types):

| Consumer | File | Status |
|---|---|---|
| `detectPairAsymmetry` | `cloud/apps/api/src/services/run/anomaly-detection.ts:106,259,269` | **Active.** Reads `jobChoiceBatchGroupId` to find sibling runs in the same launch and compute success-rate deltas. Field MUST remain on Run.config. |
| `Run.pairedBatchGroupId` GraphQL resolver | `cloud/apps/api/src/graphql/types/run.ts:193` | **Active.** Exposes the field to the web UI. The web UI's `PairedRunComparisonCard` (`cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx:52`) and `RunCard` (`cloud/apps/web/src/components/runs/RunCard.tsx:112`) read it. Field MUST remain. |
| `domain-coverage.ts` (display path) | `cloud/apps/api/src/graphql/queries/domain-coverage.ts:291,301–314` | **Removed by this refactor.** The only caller of `getCoverageBatchGroupId` in the display path. |
| `getCoverageBatchGroupId` util | `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts:236` | **Active (utility).** Loses one caller (display) but stays exported because… it has no other callers in source. Verify in plan: if no remaining source consumer, mark for removal in a follow-up cleanup slice. |

`getCoverageBatchGroupId` has no other source consumer after this refactor (no other source-code import path was found in the verification grep). Recommendation: keep the export and the function this PR (it's small, the tests use it, and removal is a separate cleanup); flag it for removal in `closeout.md` so a follow-up can drop it.

### 6.2 Aggregate analysis pipeline

The user warned that `aggregate-fingerprint-payload`, circumplex eligibility, and `aggregate-preparation` may rely on `jobChoiceBatchGroupId` for correctness rather than display. Verification:

| File | Pairing field used | Affected by this refactor? |
|---|---|---|
| `aggregate-preparation.ts:284` | `companionRunId` | **No.** This refactor does not touch `companionRunId` writes or reads. |
| `aggregate-fingerprint-payload.ts` | none of the above | **No.** Grep for `jobChoiceBatchGroupId`/`pairedBatchGroupId`/`jobChoiceValueFirst` in the file returns zero matches. |
| `aggregate-eligibility.ts` | none | **No.** Same. |
| `circumplex/eligibility.ts`, `circumplex/statistics.ts`, `circumplex/aggregation.ts`, `circumplex/mds.ts` | none | **No.** Same. The word `paired` appears in `statistics.ts` only as a local variable name for an `(x,y)` zip. |
| `models-consistency.ts` | `companionRunId` | **No.** Uses `companionRunId` not the batch group field. |

Conclusion: no analysis-pipeline consumer of `jobChoiceBatchGroupId` exists. The field's surviving non-display consumer is the anomaly detector only.

### 6.3 Prod data spot-check (Railway production DB, 2026-04-25)

Counts for completed runs (`status = 'COMPLETED' AND deleted_at IS NULL`):

| Metric | Value |
|---|---|
| Total completed runs | 1,758 |
| Has `config.jobChoiceBatchGroupId` | 1,758 (100%) |
| Has `config.jobChoiceValueFirst` | 1,540 (87.6%) |
| Aggregate (rollup) runs | 372 |
| Non-aggregate runs | 1,386 |
| Non-aggregate **with** `jobChoiceValueFirst` | 1,270 (91.6%) |
| Non-aggregate **missing** `jobChoiceValueFirst` | 116 (8.4%) |

Date ranges:

| Bucket | Earliest | Latest |
|---|---|---|
| `jobChoiceValueFirst` present | 2026-03-30 | 2026-04-23 |
| `jobChoiceValueFirst` missing | 2026-03-17 | 2026-03-23 |

The 116 legacy non-aggregate runs predate the field's introduction (~2026-03-30). All 116 belong to one domain (the seed/main domain) and span 90 still-alive definitions. Those 90 definitions also have post-2026-03-30 runs (full overlap), so legacy + new runs coexist on the same definitions.

Pair structure for the 1,270 new non-aggregate runs:

| Distinct `jobChoiceValueFirst` per `jobChoiceBatchGroupId` | Run count per group | Number of groups |
|---|---|---|
| 2 | 2 | 631 |
| 1 | 1 | 8 |

98.7% of paired batches in prod are clean (both directions, 2 distinct value-first tokens). The 8 single-direction groups are partial pairs where one side never completed — under the new semantic, those eight contribute 0 to `pairedBatchCount` (instead of 1 today).

Within all 631 two-run groups, `samplesPerScenario` and `models` match across both runs (verified — 0 mismatches in any group). The user's "apples-to-oranges within a launch" worry is empirically not present because lifecycle.ts copies `sharedInput` to both halves at launch time.

### 6.4 Operator impact summary

The operator-visible delta on Domain Overview right after this ships:

- **Cells where every paired batch has both halves complete:** no change.
- **Cells where some launches have only one direction complete:** `pairedBatchCount` decreases by the number of one-sided launches. (8 such launches in prod, scattered across various value pairs.)
- **Cells backed by legacy runs only (no `jobChoiceValueFirst`):** `pairedBatchCount` drops to 0, even if `batchCount` is positive. There are no cells of this kind in prod today — every legacy definition also has post-March-30 runs — but the spec must define the behavior.

The post-deploy spot-check (§9) names a value pair the human can compare before/after.

## 7. Edge cases

E1. **Legacy runs with no `jobChoiceValueFirst`.** Drop from both directional counts. They still count toward `batchCount`. Net effect: a cell with 4 complete legacy runs and 2 complete new pairs (4 A-first + 2 B-first new) has `batchCount = 8`, `pairedBatchCount = 2`. The mismatch is real and operator-meaningful: legacy runs are not pairable with new runs and the display is honest about that.

E2. **Cell with only one direction launched.** `min(N, 0) = 0`. Operator sees `pairedBatchCount = 0` even when `batchCount > 0`. This is the intended new behavior.

E3. **More than two distinct `jobChoiceValueFirst` values in the same cell.** Only possible if a definition's content changes mid-life such that runs created against it carry different value-first tokens. Treat as data corruption: take `min` of the *two largest* directional counts and emit a `ctx.log.warn` with cell key and offending tokens. Do not throw. (This case should not happen in prod today — verification §6.3 found at most 2 distinct values per group across 1,270 runs — but the algorithm must be defensive for definitional drift.)

E4. **`jobChoiceValueFirst` is non-string (number, boolean, object).** Coerced to `null` by `getCoverageDirection`'s `typeof === 'string'` check. Treated as legacy/missing.

E5. **Whitespace-only `jobChoiceValueFirst`.** Trimmed by `getCoverageDirection`; empty result coerces to `null`.

E6. **Single-definition cell.** A value pair backed by exactly one definition (no companion published yet). All runs of that definition still split by `jobChoiceValueFirst` if both directions were ever launched on it (rare). `min(N, M)` still gives the correct answer.

E7. **Three or more companion definitions for one canonical pair.** Spec allows this — `defIdsForPair` is `definitionsByPairKey.get(key)` which can have any size. The merge step (§5.4 step 1) works for any number of definitions because we merge the per-definition direction maps before taking the min.

E8. **Mixed model filter.** A run that fails the model filter is excluded from both directional counters — same symmetric exclusion rule today's `batchCount` uses (`domain-coverage.ts:236`).

E9. **Run in `COMPLETED` status but with `isAggregate = true`.** Excluded by the existing `if (isAggregateRun) continue;` block at `domain-coverage.ts:215`. No change.

E10. **Run with `isRunComplete === false`.** Excluded from directional counts (it counts toward `incompleteBatchCount` instead). No change in that bucket.

## 8. Out of scope

- A migration to backfill `jobChoiceValueFirst` on legacy runs.
- A new GraphQL field exposing the per-direction counts (`aFirstCompleteCount`, `bFirstCompleteCount`) — the cell only needs `pairedBatchCount`. If a future UI wants the breakdown, that is a separate feature.
- Removing `getCoverageBatchGroupId` (the function still has a test caller and an exported surface; cleanup belongs in a follow-up).
- Touching the launch-path writes of `jobChoiceBatchGroupId` in `start.ts` / `lifecycle.ts` / `plan-slots.ts` / `execute-runs.ts`.
- Any change to `aggregate-preparation`, `aggregate-fingerprint-payload`, circumplex modules, anomaly detection, or `companionRunId`.
- Web UI changes — `pairedBatchCount` is consumed as a pre-rendered number; no UI logic depends on its computation method.

## 9. Post-deploy verification plan

After the PR merges and Railway deploys, the human can confirm correctness by:

1. **Pick a known-clean pair.** Pre-deploy, query the production DB for one value pair with non-trivial `pairedBatchCount > 1` whose runs all have `jobChoiceValueFirst` set (post-2026-03-30). Record its `batchCount` and `pairedBatchCount` from the live Domain Overview before the deploy.
2. **Pick a known-asymmetric pair (if any).** Search prod for a value pair where one direction has more complete runs than the other. Today its `pairedBatchCount` equals the larger count (because dedup keeps survivors); after the refactor it should equal the smaller. Record the expected delta.
3. **Pick a known-legacy pair (if any).** Search prod for a value pair whose only complete runs are pre-2026-03-30. Today its `pairedBatchCount` may be > 0; after the refactor it should be 0. Record the expected delta.
4. **Run the prod query** (read-only psql on the Railway DB) before deploy. The `BTRIM` and explicit `''` checks treat blank/whitespace `jobChoiceValueFirst` the same way the runtime does:
   ```sql
   SELECT
     def.id,
     COUNT(*) FILTER (WHERE BTRIM(COALESCE(r.config->>'jobChoiceValueFirst','')) <> '') AS new_runs,
     COUNT(*) FILTER (WHERE BTRIM(COALESCE(r.config->>'jobChoiceValueFirst','')) = '')  AS legacy_or_blank_runs,
     COUNT(DISTINCT BTRIM(COALESCE(r.config->>'jobChoiceValueFirst','')))
       FILTER (WHERE BTRIM(COALESCE(r.config->>'jobChoiceValueFirst','')) <> '')        AS distinct_directions
   FROM runs r
   JOIN definitions def ON def.id = r.definition_id
   WHERE r.status = 'COMPLETED' AND r.deleted_at IS NULL
     AND (r.config->>'isAggregate')::boolean IS NOT TRUE
     AND def.id IN (<pair's definition IDs>)
   GROUP BY def.id;
   ```
5. **Compare Domain Overview values before vs after deploy.** For each of the three pairs:
   - The clean pair's `pairedBatchCount` should be unchanged (or higher if new runs landed during deploy).
   - The asymmetric pair's `pairedBatchCount` should equal the smaller-direction count, not the larger.
   - The legacy pair's `pairedBatchCount` should be 0.
6. **Watch error logs for 10 minutes.** Filter on `services:graphql:queries` for `RUN_CONFIG_INVALID` or new warnings about >2 directions in a cell. Zero is the expected count.

`pairedBatchCount` is render-only on the Domain Overview hub; no upstream automation reads it, so the failure mode is "wrong number on screen for an operator," not a pipeline break. Step 6 is the canary; step 5 is the correctness check.

## 10. Files in scope

Edits:

- `cloud/apps/api/src/graphql/queries/domain-coverage.ts` — replace inner-loop `pairedBatchCount` computation with directional counters; rewire call to `selectPrimaryDefinitionCounts`.
- `cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts` — add `getCoverageDirection`; rewrite `selectPrimaryDefinitionCounts` to take a directional map; **keep** `getCoverageBatchGroupId` and `deduplicateRunsByGroupId` for now (still used by trial-count path and tests).
- `cloud/apps/api/src/graphql/queries/domain-coverage-gql-types.ts` — update `pairedBatchCount` field description.
- `cloud/apps/api/tests/graphql/queries/domain-coverage.test.ts` — update existing `selectPrimaryDefinitionCounts` tests; add new direction-based tests; keep `getCoverageBatchGroupId` and `deduplicateRunsByGroupId` tests untouched.
- `docs/canonical-glossary.md` — update `Paired Batch` entry.

No edits expected (verified — DO NOT MODIFY without spec amendment):

- `cloud/apps/api/src/services/run/start.ts`
- `cloud/apps/api/src/services/run/anomaly-detection.ts`
- `cloud/apps/api/src/graphql/mutations/run/lifecycle.ts`
- `cloud/apps/api/src/graphql/mutations/domain/launch/plan-slots.ts`
- `cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts`
- `cloud/apps/api/src/services/analysis/**` (entire directory)
- `cloud/apps/api/src/services/circumplex/**` (entire directory)
- `cloud/apps/api/src/graphql/types/run.ts` (Run.pairedBatchGroupId resolver stays)
- Any web UI file
- `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`

## 11. Reconciliation log

This section records how spec-checkpoint findings were addressed in the spec body.

### Round 1

- **HIGH (codex/edge-cases #1, codex/feasibility #1, gemini #1) — trial-count consistency / `incompleteBatchCount` wording.** Reworked §5.6 (no longer claims `deduplicateRunsByGroupId` is deleted), §5.7 (now explicitly keeps the trial-count path unchanged with a written rationale for why pair-count and trial-count are *meant* to diverge), and A3 (clarified that legacy completed runs land in `batchCount`, not `incompleteBatchCount`).
- **MEDIUM (codex/edge-cases #3, codex/feasibility #2) — cell anchor brittleness.** Added A8b documenting the new tie-break order in `selectPrimaryDefinitionCounts` (`batchCount` desc → directional-coverage desc → defId localeCompare). Implementation in plan §3 must follow this order.
- **MEDIUM (gemini #2) — glossary needs `Incomplete Batch` update.** §5.8 now updates both `Paired Batch` and `Incomplete Batch` entries; A10 reflects the broader scope.
- **LOW (codex/edge-cases #4, codex/feasibility residual) — post-deploy SQL misses blank strings.** §9 SQL rewritten using `BTRIM(COALESCE(..., ''))` to treat blank and whitespace as missing, matching runtime semantics.
- **LOW (gemini residual #2) — orphaned `getCoverageBatchGroupId` after refactor.** Round-1 spec wrongly called the function orphaned. Round-2 reviewers correctly pointed out it is still used transitively via `deduplicateRunsByGroupId` from the trial-count path. §5.6 corrected; no cleanup follow-up implied.
- **LOW (gemini residual #1) — silent re-categorization of legacy data.** Acknowledged in §6.4 and §7.E1; the post-deploy plan in §9 picks at least one legacy-only pair (if any exist) to verify the expected drop to 0.

### Round 2

- **HIGH (codex/edge-cases R2 #1) — loose pairing overcounts versus a strict-pair semantic.** New §2a explicitly chooses loose pairing, with a 4-row table showing where it diverges from strict pairing and why loose is the right answer for this operator-facing display. The user's task brief defines this directly. Strict pairing is rejected as a spec choice; reviewers who want strict should re-open the spec, not raise it again at later stages.
- **HIGH (gemini R2 #1) — trial-count description was misleading.** §5.7 rewritten to be honest about what `computePerModelTrialCounts` actually counts: one survivor per launch group (not "raw transcript volume"). The behavior is unchanged; only the description is now correct. Whether the trial-count path *should* count both companions in a healthy paired batch is deferred as out-of-scope.
- **MEDIUM (codex/feasibility R2 #1) — motivation oversold launch-path improvements.** §1 trimmed: removed the "future ad-hoc" pitch since this slice does not change the launch path.
- **MEDIUM (codex/feasibility R2 #2 + gemini R2 #2) — `getCoverageBatchGroupId` not actually orphaned.** §5.6 corrected (the function is still used transitively); the round-1 reconciliation note is also corrected.
- **MEDIUM (codex/edge-cases R2 #2) — `>2 directions` corruption fallback is unverified.** Acknowledged in §7.E3 already; plan-phase verification step is to spot-check prod for any cells with >2 distinct `jobChoiceValueFirst` tokens (none expected per §6.3).
- **LOW (gemini R2 #3) — A8b under-specified `directionCount`.** A8b expanded to spell out: `directionCount = directionalCompleteCountsByDefinitionId.get(defId).size`; no extra bookkeeping needed.

### Round 3

- **HIGH (codex/feasibility R3 #1) — Web UI fallback hides the new `pairedBatchCount = 0` semantic.** New §2b documents the UI rendering path explicitly: with default models configured (typical case), the cell's leading number is `minTrialCount`, not `pairedBatchCount`. The new semantic surfaces in the popover Evidence line and analysis-page query string. The no-models fallback at `CoverageCell.tsx:44` (`pairedBatchCount > 0 ? pairedBatchCount : batchCount`) is not changed in this slice; closeout will record the follow-up to revisit it.
- **MEDIUM (codex/edge-cases R3 #1) — duplicate runs in the same launch group can inflate the new count.** §5.3 changed from `Map<direction, number>` to `Map<direction, Set<groupId>>`. Same `(direction, groupId)` tuples now collapse to one. Ungrouped runs use a unique sentinel so they each count once. §5.4 updated to take `set.size` per direction. This makes the algorithm defensive against retry-driven duplicates that today's `deduplicateRunsByGroupId` would catch.
- **MEDIUM (codex/edge-cases R3 #2) — cross-launch comparability not enforced.** Already addressed in §2a as the loose-pairing trade-off; reviewer is restating the same point.
- **MEDIUM (gemini R3 #1) — pairedBatchCount vs trialCount inconsistency.** Already addressed in §5.7 (no change). The reviewer is correctly noting the deferred problem; deferring it remains the answer.
- **MEDIUM (gemini R3 #2) — terminology ambiguity for "Paired Batch".** §5.8 glossary now includes a "Note on terminology overlap" calling out the launch-time vs display-time senses of the term explicitly. Anomaly-detection's launch-time concept stays valid; Domain-Overview's display-time concept is the new semantic.
- **LOW (gemini R3 #3) — `getCoverageBatchIncrement` is dead code with misleading tests.** Pre-existing tech debt unrelated to this refactor. Out of scope for this slice; flagged for closeout follow-up.
- **LOW (codex/edge-cases R3 #3) — `>2 directions` fallback can return the wrong number.** Already acknowledged; verification is part of the post-deploy plan.

### Round 3b (post-Round-3 repair)

- **HIGH (codex/edge-cases R3b #1) — A2 contradicts the algorithm.** Round-3 spec said "pairedBatchCount must NOT depend on jobChoiceBatchGroupId" but §5.3's retry-dedup uses groupId. A2 reworded: the *primary semantic* is direction-independent; groupId is only used defensively for retry-collapse. Both can be true.
- **HIGH (gemini R3b #1, #2) — trial-count divergence + loose-pairing methodology.** Both raised again. Both already explicitly addressed (§5.7, §2a). These are *spec-level disagreements with the chosen direction*, not implementation gaps. The judge panel will adjudicate whether to override the spec's chosen position.
- **MEDIUM (codex/feasibility R3b #1) — terminology ambiguity (live in glossary, live in code).** Already addressed in §5.8; reviewer restating.
- **MEDIUM (codex/edge-cases R3b #2) — `jobChoiceValueFirst` not paired-batch-guarded.** Theoretically a non-paired run with the field set could be miscounted. Per §6.3 prod data, 100% of completed runs are PAIRED_BATCH. Adding a guard would be belt-and-suspenders. Documented as residual risk; not adding the guard in this slice. Plan-phase: include a defensive test that asserts non-PAIRED_BATCH runs (if any are constructed in tests) do not contribute to directional counts when their `jobChoiceValueFirst` is also missing (the typical case).
- **MEDIUM (codex/edge-cases R3b #3) — cross-launch comparability** — repeat of R3 #2; same disposition.
- **LOW (codex/feasibility R3b #2) — no read-time validation of `jobChoiceValueFirst`.** Documented as residual risk; the algorithm coerces missing/blank/non-string to "unclassified" per A3.
- **LOW (gemini R3b #4) — limited UI visibility.** Already addressed in §2b.

## 12. Assumptions carried into spec

A1. `jobChoiceValueFirst` token strings are stable per definition over time (no migration that re-tokens existing definitions). Verified: `paired-vignette-helpers.ts:79,85` stamps the token from the value statement at definition creation; `lifecycle.ts:125,136` passes the token into the run config at run creation. Tokens are domain-local but stable per definition.

A2. The two companion definitions of a paired vignette never share a `jobChoiceValueFirst` token. Verified empirically (§6.3): every clean prod batch has 2 distinct tokens for its 2 runs.

A3. The `definitionsByPairKey` map in `domain-coverage.ts` is the correct source for "which definitions back this canonical value pair." No change required.

A4. The cell still wants a single `pairedBatchCount` integer. No new GraphQL field or shape change on `DomainValueCoverageCell`.
