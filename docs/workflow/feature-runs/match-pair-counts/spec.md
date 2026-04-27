# Feature Spec: Match Pair Counts and condition-level coverage detection

## Summary

Add condition-level (per-trial) counting to the domain value coverage system, surface it in the cell popover using "X batches + Y conditions" notation, and add a "Match Pair Counts" action that opens the existing Start Paired Batch page pre-configured to top up the lagging direction at trial granularity.

PR #759 (commit `057658f0` on main) added `orphanedBatchCount`. Operator feedback: batch-level detection is too coarse. A 1-trial gap is invisible when both directions have the same number of complete batches, and the system over-corrects when one batch is incomplete (it would propose launching a whole new batch when the real fix is to top up a single missing transcript). The right unit for the operator's mental model is "complete batches + leftover conditions" per direction — like "1 hour 22 minutes" rather than "82 minutes."

---

## Granularity constraint: launches are whole `(model × scenario × samples)` jobs

The backend `buildRunJobPlan()` only emits full `model × scenario × samples` jobs ([`start-plan.ts:50-69`](cloud/apps/api/src/services/run/start-plan.ts)). There is no path to "launch exactly the missing 3 transcript slots." The smallest unit a launch can produce is `selectedModels.length × scenarios.length × samplesPerScenario` transcripts.

This means Match Pair Counts is **approximate at the trial level**. The card's job is to:
- Show the operator the gap honestly (in trials)
- Let them configure the launch to overshoot or undershoot the gap if needed (the live-recompute card flags residual mismatches)
- Submit the launch and let it produce its full set of trials

The spec does NOT promise "launch only the missing slots." It promises "let the operator close the gap with one launch when the gap fits a clean `(model × scenario × samples)` shape, and visualise the residual otherwise." The card copy MUST be consistent with this — never imply individual-slot targeting.

---

## Architecture decision: single-direction launch

The existing `startRun` mutation in [`lifecycle.ts:115-153`](cloud/apps/api/src/graphql/mutations/run/lifecycle.ts) hardcodes `PAIRED_BATCH` mode to launch BOTH the primary and companion runs as a coupled pair. There is no way today to launch just one direction as a partner-of-record for an existing batch group.

The standalone alternative is `AD_HOC_BATCH`, but that mode sets `methodologySafe: false` and does not set `jobChoiceValueFirst` or `jobChoiceBatchGroupId`, so an AD_HOC run cannot serve as the lagging-side partner of an existing paired-batch group.

**Resolution: introduce a single-direction launch capability.** This feature adds a new launch mode (or equivalent contract — the plan stage chooses the exact shape) such that the backend can launch ONE run with `methodologySafe: true`, the correct `jobChoiceValueFirst`, and either a fresh `jobChoiceBatchGroupId` or one bound to the existing companion's group. This is the only path that lets Match Pair Counts perform the surgical top-up the operator wants.

User-facing implications:
- The `<RunForm>` component on the Start Paired Batch page gains the ability to render in a "single-direction top-up" mode when arrived at via Match Pair Counts. In that mode the launch mode selector is hidden or pinned to the new top-up mode.
- Aggregate analysis treats the top-up run as a regular completed run for that direction. It contributes to `batchCount` and to the directional-groups bookkeeping just like any other run, so subsequent paired batches it helps form have full statistical weight.
- The `runCategory` for top-up runs is `'PRODUCTION'` (matching paired-batch semantics, not ad-hoc).

The plan stage must specify: the exact mutation contract change, what config keys the run carries, how aggregate analysis discovers it, and any migration concerns for in-flight code paths.

---

## User Stories (prioritized)

### US-1 (P0): See condition-level imbalance per direction

**As a** researcher reviewing the value coverage matrix,
**I want to** see how many complete batches AND how many leftover conditions each direction has,
**so that** I can tell at a glance whether the imbalance is whole-batch-sized or trial-sized.

**Acceptance criteria:**
- The cell popover displays each direction in the form `X batches + Y conditions` (e.g. "1 batch + 22 conditions")
- "Y conditions" reflects the count of (scenario × model × sampleIndex) slots filled by transcripts inside non-complete batches for that direction. (Definition note: a "complete" batch is one where every selected slot has at least one transcript; extra transcripts in a slot of a complete batch are not counted as leftovers. If real production data shows complete batches with surplus transcripts due to retries, the resolver author may revisit the definition during the plan stage.)
- "X batches" is unchanged: count of complete (per `isRunComplete`) non-aggregate runs per direction
- Both numbers are read from new GraphQL fields on `DomainValueCoverageCell` — added additively, no breaking changes to existing fields
- When a cell has zero runs in a direction, the popover shows `0 batches + 0 conditions`
- Empty cells (no vignette) continue to show their existing popover content ("No batch for this value pair") — the new condition-level fields do not change empty-cell behaviour

### US-2 (P0): Add Transcripts column header to per-model breakdown

**As a** researcher looking at the per-model trial breakdown in the popover,
**I want to** see a "Transcripts" header above the model count column,
**so that** I know what those numbers represent without having to guess.

**Acceptance criteria:**
- The per-model breakdown rows in the popover gain a single header row labelled "Transcripts" above the count column
- Header is visible only when at least one model row is shown
- Header styling is consistent with existing popover typography
- Model name column remains unlabelled (the model name is self-explanatory)

### US-3 (P0): Trigger Match Pair Counts from a cell with a gap

**As a** researcher seeing a cell with an imbalance,
**I want to** click a "Match Pair Counts" action in the popover,
**so that** I can launch only the trials needed to bring the lagging direction up to the leading direction.

**Acceptance criteria:**
- The popover shows "Match Pair Counts" as a second action *alongside* (not replacing) "Start Paired Batch"
- Match Pair Counts is visible only when the cell has a real gap: `orphanedBatchCount > 0` OR (a yet-to-be-named) `orphanedConditionCount > 0`
- "Start Paired Batch" remains visible whenever the cell has a vignette, regardless of gap
- Clicking Match Pair Counts navigates to the existing `/definitions/<definitionId>/start-paired-batch` route, with route state that carries:
  - `pairKey` (e.g. `"achievement::power_dominance"`)
  - All `definitionId`s contributing to that cell's value pair (because cells aggregate companion definitions — the popover's primary `definitionId` is just the link target, not the full set)
  - The before-state directional counts: per direction, complete batches + leftover conditions
  - The lagging direction's value name (e.g. `"achievement"`) so the launch can pin `jobChoiceValueFirst`
  - The pair name as displayed (formatted with `VALUE_LABELS`) so the card doesn't have to re-derive it
- **Lagging-direction tie-breaker rule** (deterministic, documented). Operates entirely on filled-condition counts (since post-#756 each batch counts as 1 regardless of size):
  - Let `filled[A]` and `filled[B]` be the count of DISTINCT (scenarioId, modelId, sampleIndex) slots filled by transcripts in direction A and B respectively (across all runs in the cell, deduped, including incomplete runs)
  - If `filled[A] < filled[B]` → A is the lagging direction
  - If `filled[A] > filled[B]` → B is the lagging direction
  - If `filled[A] == filled[B]` AND batches differ → the direction with fewer complete batches is lagging
  - If both filled-conditions and batches are equal → there is no gap; Match Pair Counts is not offered
  - If a cell has zero runs in one direction (filled=0, batches=0) → that direction is the lagging one
  - Final tie-breaker (extremely rare — both filled and batches identical, but they're somehow "different"): prefer the direction whose value name sorts alphabetically earlier. This is a deterministic fallback, not a human-meaningful preference
  - If a cell aggregates multiple companion definitions, the rule is applied to the AGGREGATED counts (per the resolver's existing aggregation), not per-definition

- **DefinitionId-to-launch rule** (deterministic, separate from the lagging-direction rule). Cells can aggregate multiple companion definitions; the launch needs ONE `definitionId`:
  - The launch uses the definition whose primary value name matches the lagging direction's value name (i.e., the definition that produces A-first runs when launching against direction A)
  - This corresponds to the existing `pair.primary.id` vs `pair.companionId` choice in [`lifecycle.ts:115-153`](cloud/apps/api/src/graphql/mutations/run/lifecycle.ts) — the new single-direction launch mode picks one of these based on the lagging direction
  - When multiple definitions in the cell have the same primary value name (rare; would indicate duplicated companion definitions), the cell's existing `primaryDefinitionId` from the resolver is used as the tie-breaker (the resolver already has a deterministic primary picker)
- When `incompleteBatchCount > 0` is also present on the cell, Match Pair Counts is still visible but the popover shows an informational warning above the action: *"This pair has incomplete batches — topping up may not converge in one launch. Check the existing batches' status first."* The warning intentionally avoids quoting a specific count, because the existing resolver sums `incompleteBatchCount` across companion definitions and may double-count incomplete paired-launch pairs. (The plan stage may revisit deduplication for this signal; spec does not block on it.) The warning is informational; it does not link to a fix-incomplete-batches surface (that surface does not exist yet)

### US-4 (P0): See what the launch will produce on the Start Paired Batch page

**As a** researcher who clicked Match Pair Counts,
**I want to** see a compact summary card above the launch form showing the before/after diff,
**so that** I know what the launch will accomplish before I submit it.

**Acceptance criteria:**
- A summary card is rendered above the existing `<RunForm>` only when the page is reached via Match Pair Counts (route state present)
- Card shows the pair name (formatted as "Value A × Value B" using human-readable labels from `VALUE_LABELS`)
- Card shows two rows, one per direction, each with: direction label, before-state, after-state, in both batch and condition columns
- Card shows a footer line summarising the delta. **One condition equals one transcript** (per the dedupe rule: a condition is one slot, filled or unfilled). The card uses TRIAL count as the user-facing magnitude and shows condition count only as a secondary label when the gap is sub-batch-sized:
  - When the launch closes a sub-batch gap (e.g., 3 missing transcripts): *"Adding: 3 trials"*
  - When the launch closes a whole-batch gap or larger: *"Adding: 2 batches (50 trials)"* — the card shows batches as the headline because the user is closing batch-level imbalances, with trial count as the consequence
  - Never use the form *"1 condition (5 trials)"* — that conflates the slot definition with the transcript count and misleads users when `samplesPerScenario > 1`
- The "after" values recompute live whenever ANY of the following form inputs change: `selectedModels` (count), `samplePercentage`, `samplesPerScenario`, `scenarioCount` (or selected `scenarioIds` if specific-condition mode), `launchMode`, and `temperatureInput` if it affects which existing runs match the signature
- The trial-count math has two branches and MUST exactly match the backend `sampleScenarios()` formula in [`cloud/apps/api/src/services/run/start-helpers.ts`](cloud/apps/api/src/services/run/start-helpers.ts):
  - **Sample-percentage mode** (`samplePercentage < 100` and no explicit `scenarioIds`): `effective_scenarios = max(1, floor(total_scenarios × samplePercentage / 100))`. Total trials per launched direction = `selectedModels.length × effective_scenarios × samplesPerScenario`. Note: `Math.floor`, not `Math.ceil` and not "rounded" — the existing `useRunForm.ts` UI preview uses `Math.ceil` which DISAGREES with the backend; the card must use the backend's formula
  - **Specific-condition mode** (explicit `scenarioIds` provided, equivalent to backend `runMode: 'SPECIFIC_CONDITION'`): `effective_scenarios = (deduped scenarioIds).length` (the backend dedupes inside `buildRunJobPlan`). Total trials per launched direction = `selectedModels.length × effective_scenarios × samplesPerScenario`. The card MUST distinguish this mode and not apply the percentage formula
- The plan stage MUST reuse or extract the existing backend helper logic (in `cloud/apps/api/src/services/run/start-helpers.ts` and `start-plan.ts`) to keep the card's math aligned with the backend's. A pure shared helper (e.g., `computeLaunchTrialCount(input)` consumable by both `useRunForm.ts` and the new card) is the recommended approach to prevent drift
- If the live recomputation shows the launch would *not* close the gap, would overshoot in either direction, or would require multiple launches to converge, the card shows a yellow note describing the residual mismatch and what the user could change to converge in one launch
- If the user navigates to the page without Match Pair Counts state (the existing entry point), the form behaves exactly as today — no card, no extra form behaviour

### US-5 (P1): Form passes through unchanged when not in Match Pair Counts mode

**As a** researcher using the existing Start Paired Batch entry point,
**I want** the page to look and behave exactly as it does today,
**so that** existing workflows are not disturbed.

**Acceptance criteria:**
- When the page is loaded without Match Pair Counts route state, no summary card is shown
- `<RunForm>` props and behaviour are unchanged in the no-Match-Pair-Counts case
- Existing tests for the page still pass

### US-6 (P0): Backend launches a single direction as a paired-batch top-up

**As a** backend service triggered by Match Pair Counts,
**I want to** launch ONE run with the correct `jobChoiceValueFirst` and `methodologySafe: true`,
**so that** the operator's surgical top-up actually reaches the lagging direction without overshooting the leading one.

**Acceptance criteria:**
- A new launch contract (mode flag, mutation argument, or equivalent — plan stage decides the shape) lets `startRun` create a single run that:
  - Sets `methodologySafe: true` (matching paired-batch semantics, not ad-hoc)
  - Sets `jobChoiceValueFirst` to the lagging-direction value name
  - Sets `jobChoiceLaunchMode` to identify the run as a top-up (the exact value is plan-stage's choice)
  - Either inherits an existing `jobChoiceBatchGroupId` (so it joins an existing launch group) OR is given a fresh group ID (so it stands as its own launch group). Plan to choose one.
  - Sets `runCategory: 'PRODUCTION'`
- The new mode does NOT create a companion run — it launches exactly one run
- Existing `PAIRED_BATCH` and `AD_HOC_BATCH` modes continue to work exactly as today; no regression
- Aggregate analysis treats the top-up run as a regular completed run for that direction (it contributes to `batchCount` and to directional-groups bookkeeping in the coverage resolver)
- Mutation validation: caller must specify both `definitionId` (the lagging direction's vignette) and the direction value name; mismatched combos return a clear error
- The web client's launch path (used by Match Pair Counts) calls this new mode via the existing `startRun` mutation

**Why this priority:** without this, the rest of the feature is non-functional. Match Pair Counts cannot be implemented as the operator wants without a single-direction launch capability.

### US-7 (P2): Resolver handles edge cases without exceptions

**As a** backend operator,
**I want** the new condition-level counting logic to handle edge cases (no transcripts, mixed sampleIndex, ungrouped runs, >2 directions corruption),
**so that** the resolver never throws on real production data.

**Acceptance criteria:**
- Cells where neither direction has any runs return zero condition counts (paired = 0, orphaned = 0)
- Cells where only one direction has runs return `pairedConditionCount = 0` and `orphanedConditionCount = count of that direction`
- The corruption case (>2 distinct direction tokens for one cell) does not throw; logs a warning consistent with the existing batch-level handling
- Aggregate runs continue to be excluded from condition-level counts
- Deleted runs and deleted transcripts continue to be excluded

---

## What is NOT in scope

- A separate "fix incomplete batches" remediation surface (different worker path, different feature)
- Detecting trial-count drift caused by mismatched `samplesPerScenario` across batches in the same direction (rare; flagged as known limitation)
- Auto-thresholding (system deciding whether a gap is "worth" topping up). Operator decides.
- Changing the existing Start Paired Batch entry from the vignette detail page (it must continue to work as today)
- Changing the existing `PAIRED_BATCH` or `AD_HOC_BATCH` launch mode behaviour — those remain exactly as today
- Web-side consumption of the existing `orphanedBatchCount` field beyond what's needed to drive the new gating logic
- Banners, notifications, or proactive UI elsewhere on the page — Match Pair Counts lives only in the cell popover
- Modifying `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `MEMORY.md`, `.gitignore`, or any file not listed in `scope.json`

---

## Definitions

| Term | Meaning |
|------|---------|
| Batch | A complete non-aggregate run for a value-pair vignette. Per `isRunComplete`, every selected (scenarioId × modelId × sampleIndex) slot has at least one transcript |
| Slot | A `(scenarioId, modelId, sampleIndex)` tuple — the unit at which the existing `isRunComplete` and `coverage-completeness.ts` operate. **Transcripts with `scenarioId == null` are EXCLUDED from slot identification entirely** (mirroring `coverage-completeness.ts`'s drop-null pattern). They never participate in pairedConditionCount or orphanedConditionCount |
| Filled slot (cell-level) | A slot that has at least one transcript present in some run for this value-pair cell, in either direction |
| Direction | The value of `config.jobChoiceValueFirst` on a run (e.g. "achievement"). Two directions per value pair |
| Paired slot | A slot that has at least one transcript in BOTH directions across runs for this cell's value pair |
| Orphaned slot | A slot that has at least one transcript in ONLY ONE direction across runs for this cell's value pair |
| Leftover slot (UI term) | A filled slot whose containing run is not yet complete (per `isRunComplete`). Counted separately from the batch count |
| Gap | A directional imbalance: either `orphanedBatchCount > 0` or `orphanedConditionCount > 0` |

**Counting invariants (HIGH-priority spec rules — no ambiguity):**

1. **`pairedConditionCount`** = count of cell-level paired slots (slots with a transcript in both directions). Computed as the SIZE of the set intersection of "slots filled in direction A" and "slots filled in direction B".

2. **`orphanedConditionCount`** = count of cell-level orphaned slots. Computed as the SIZE of the symmetric difference of "slots filled in direction A" and "slots filled in direction B".

3. **Dedupe key for both counts is the 3-tuple `(scenarioId, modelId, sampleIndex)`**, NOT a 4-tuple including `runId`. A slot is identified by its `(scenario, model, sample)` triple regardless of which run filled it. Multiple runs in the same direction filling the same slot still count as one filled slot for that direction. This matches the existing `coverage-completeness.ts` semantic.

4. **Null `scenarioId` transcripts are excluded** from all condition-level counts (the `Transcript.scenarioId` column is nullable in `schema.prisma:633`; null rows are dropped before slot identification — mirroring the `existingTranscripts.filter((t): t is { scenarioId: string ...} => t.scenarioId !== null)` pattern in `domain-coverage.ts`).

5. **Aggregate runs and soft-deleted runs/transcripts are excluded** (existing semantics).

6. **Implementation hint (non-binding for spec, plan author chooses):** the resolver may compute these by either (a) widening the existing `transcripts` Prisma selection to include `scenarioId, sampleIndex` and aggregating into `Map<direction, Set<slotKey>>` in resolver memory, where `slotKey = "${scenarioId}|${modelId}|${sampleIndex}"`, OR (b) issuing a separate aggregation query. The spec does not mandate which.

The terms "paired condition" and "orphaned condition" are working names. The resolver author may propose better field names during plan stage.

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Cell with no runs in either direction | `orphanedBatchCount = 0`, `orphanedConditionCount = 0`, popover shows `0 batches + 0 conditions` per direction. Match Pair Counts not shown |
| Cell with one direction only (e.g. A-first only) | Existing `orphanedBatchCount` reflects the batch-level orphan. New condition-level fields reflect the trial-level orphan. Match Pair Counts shown |
| Cell with both `orphanedBatchCount > 0` AND `incompleteBatchCount > 0` | Match Pair Counts shown WITH the same informational warning as US-3 (no specific count, always plural): *"This pair has incomplete batches — topping up may not converge in one launch. Check the existing batches' status first."* No in-app fix-incomplete-batches tool exists yet |
| Cell with `orphanedBatchCount = 0` AND `orphanedConditionCount = 0` (fully balanced) | Match Pair Counts hidden. Start Paired Batch remains visible |
| Cell with `orphanedBatchCount = 0` but `orphanedConditionCount > 0` | (Possible if both directions have the same number of complete batches but a mismatched number of in-flight transcripts inside incomplete batches.) Match Pair Counts shown |
| User navigates away from Match Pair Counts page (back button / cancel) | Falls back to the originating coverage page (existing return-to logic preserved) |
| User submits the form with no live edits | The launch produces what the card preview said it would |
| User changes `samplesPerScenario` to 0 or negative | Form validation (existing) blocks submission. Card shows zero delta or warns |
| Direction token in `config.jobChoiceValueFirst` is missing/blank for a run | Run is excluded from directional counts but still included in `batchCount` (existing semantics, unchanged) |
| >2 distinct direction tokens in one cell (data corruption) | Log warning (existing batch-level pattern), use the two largest counts for paired/orphaned condition computations |
| Aggregate run encountered | Excluded from both batch-level and condition-level counts (existing semantics) |

---

## Spec-level decisions (formerly "Open Q's", now resolved here)

These are no longer plan-stage open questions — the spec resolves them. Plan stage may revisit only with explicit rationale.

1. **Schema shape for the new fields.** **Resolved: additive on `DomainValueCoverageCell`.** Add the new scalars `pairedConditionCount: Int!` and `orphanedConditionCount: Int!` directly on `DomainValueCoverageCell`, mirroring how `orphanedBatchCount` was added in PR #759. Per-direction detail (Q2) is exposed via a new nullable list field `directionalCoverage: [DirectionalCoverage!]!` (length 0 when neither direction has data). A nested sub-object adds clutter and breaks the existing flat field pattern; additive scalars keep client compatibility.

2. **Per-direction breakdown exposure.** **Resolved: list field on the cell.** A new GQL type `DirectionalCoverage { direction: String!, completeBatches: Int!, leftoverConditions: Int! }` is exposed via `directionalCoverage` on the cell. List length is 0 when no direction has runs, 1 for one-sided cells, 2 for normal cells, and may be > 2 only in the existing >2-distinct-tokens corruption case (where the resolver keeps the two largest per the existing `selectPrimaryDefinitionCounts` rule).

3. **Resolver query expansion.** **Resolved: widen the existing transcripts selection.** The Prisma query in `domain-coverage.ts` is widened to `transcripts: { ..., select: { modelId: true, scenarioId: true, sampleIndex: true } }`. No separate query path is introduced. Performance: the additional fields are scalar columns on the same row; impact is negligible relative to the existing transcript fetch. The plan stage should benchmark on a real production cell with > 1000 transcripts, but this is verification, not contract redesign.

4. **Single-direction launch contract shape.** **Resolved: new launch mode `'PAIRED_BATCH_TOPUP'` on the existing `startRun` mutation.** No new mutation. The mutation accepts the same `definitionId` as `PAIRED_BATCH` plus a required new field `topUpDirection: String!` (the lagging-direction value name) when launchMode is `PAIRED_BATCH_TOPUP`. Behaviour: the resolver creates ONE run with `methodologySafe: true`, `runCategory: 'PRODUCTION'`, `jobChoiceLaunchMode: 'PAIRED_BATCH_TOPUP'`, `jobChoiceValueFirst: <topUpDirection>`, and a fresh `jobChoiceBatchGroupId`. **Validation rule:** if the caller supplies an explicit `runCategory` other than `PRODUCTION` for `PAIRED_BATCH_TOPUP`, the mutation rejects with a clear error. (Existing `PAIRED_BATCH` and `AD_HOC_BATCH` modes are unchanged.)

5. **Top-up batch group binding.** **Resolved: fresh group ID per top-up launch (option b).** The top-up run gets its own freshly-generated `jobChoiceBatchGroupId`. It does NOT inherit from any leading-side run. Why: the resolver's `Set<groupKey>` semantic means a fresh ID makes the top-up individually visible in directional counts as +1 batch on the lagging side. Options (a) and (c) cause silent miscounts (run merges into existing group or reuses leading-side group, breaking the symmetric pairing logic).

6. **Companion-run lifecycle for top-up.** **Resolved (NEW — was implicit):** Top-up runs do NOT use the `companionRunId` field that paired-batch primary/companion runs use. The `companionRunId` field stays unset. Top-up runs stand alone. Aggregate analysis treats a top-up run exactly like any complete non-aggregate run for that direction — it contributes to `batchCount` and to the directional groups Set. There is no implicit pairing of a top-up to a specific leading-side batch; the pairing is statistical (you can pair any A-first run with any B-first run on the same vignette for symmetric analysis), not structural.

7. **Pre-fill defaults on the launch form.** **Resolved: seed conservatively, do not auto-launch.** When the page arrives via Match Pair Counts, the form is pre-filled as follows: `selectedModels` = the cell's currently-active default model set; `samplePercentage = 100`; `samplesPerScenario = 1`; `scenarioIds` = empty (sample-percentage mode at 100% selects all scenarios); `launchMode = PAIRED_BATCH_TOPUP`; `jobChoiceValueFirst` = the lagging direction (locked, not editable in this mode). The user MUST review and submit explicitly; the page never auto-launches. The card's live-recompute flags any residual gap if the user changes inputs. (Out of scope: precision pre-fill that exactly matches the gap shape — too fragile when scenario sets vary across companion definitions.)

8. **Empty `scenarioIds` array handling.** **Resolved (NEW):** The form treats an empty `scenarioIds` array as "no specific selection — fall back to sample-percentage mode" (matching the existing backend `buildRunJobPlan` behaviour). The card's live-recompute respects this: when scenarioIds is empty, the card uses sample-percentage math, not `scenarioIds.length × ...`. Operators using specific-condition mode must select at least one scenario explicitly.

9. **PR split.** **Resolved: 3 sequenced PRs (or 3 slice checkpoints in one PR — plan stage decides).**
   1. Detection PR/slice: resolver query expansion + new GraphQL fields + condition-counting tests
   2. Backend-launch PR/slice: `PAIRED_BATCH_TOPUP` mode + validation + tests
   3. UI PR/slice: popover changes + Match Pair Counts action + summary card + integration tests
   The slices are sequenced (UI depends on detection; UI depends on backend launch) so each can land independently if desired.

---

## Success Criteria

- **SC-1**: Operator can identify whether a coverage cell's imbalance is whole-batch-level or trial-level by reading the popover
- **SC-2**: Operator can launch a top-up from a single click in the popover, see what they're about to launch, and submit without re-deriving the gap math
- **SC-3**: The new GraphQL fields return correct values on real production data when smoke-tested with at least three distinct cell shapes (symmetric, asymmetric, fully one-sided)
- **SC-4**: No existing GraphQL consumer of `DomainValueCoverageCell` breaks (additive schema changes only)
- **SC-5**: No regression in the existing Start Paired Batch entry from the vignette detail page
- **SC-6**: Single-direction top-up runs land in the correct directional Set in the coverage resolver and bring `orphanedBatchCount` / `orphanedConditionCount` down to zero on the next page load (verified by an end-to-end test or manual smoke test)
- **SC-7**: Refresh / open-in-new-tab behaviour: the Match Pair Counts page falls back to the standard launch form (no card) without crashing if route state is missing, since `location.state` is in-memory only

---

## Verified facts (do not re-flag)

These were checked during prior rounds of spec review and are correct:

- **`Run` and `Transcript` tables both have `deletedAt` columns.** Verified in `cloud/packages/db/prisma/schema.prisma` (Run line 122, Transcript line 633). The `cloud/CLAUDE.md` quick-reference list of soft-deleted tables is incomplete and stale; it cites only `definitions`, `definition_tags`, `scenarios`, but the schema has at least 10 models with `deletedAt`. The existing `domain-coverage.ts` resolver (shipped in PR #759) already filters `runs.deletedAt: null` and `transcripts.deletedAt: null` in production. This spec's references to "deleted runs and deleted transcripts" are correct.

- **Soft-delete is the only delete pattern for runs.** No physical-delete code path exists for runs in the active product (cloud/).

- **`batchCount` is now 1 per complete run regardless of `samplesPerScenario`.** As of PR #756 ("Realign batch semantics across glossary, code, and database") and PR #759 (this feature's predecessor), the post-merge `domain-coverage.ts` resolver no longer multiplies batch counts by `samplesPerScenario`. A complete run contributes exactly 1 to `batchCount`. The pre-#756 `getCoverageBatchIncrement(samplesPerScenario)` multiplication path is dead in main HEAD `057658f0` for this purpose (it survives only on incomplete planned-trial calculations, not the visible batchCount). **Reviewers seeing the OLD multiplication behaviour are looking at this branch's stale HEAD `728da7d1`, which predates #756. The implementation will fork from main `057658f0`, so the new condition counting can rely on the post-#756 batch semantic.**

- **The branch HEAD this review process is running against is pre-#756 / pre-#759.** Reviewers should not flag findings about coverage-resolver behaviour that are based on the worktree's stale code unless the finding also applies to current main. When in doubt, refer to `git log origin/main -- cloud/apps/api/src/graphql/queries/domain-coverage.ts` for the actual current behaviour.

- **`expectedCount = scenarioSelections × modelCount × getCoverageBatchIncrement(samplesPerScenario)` is DEAD CODE post-#756.** The pre-#756 path that compared raw transcript counts to a planned-trial product was replaced with `isRunComplete()` (in `cloud/apps/api/src/services/run/coverage-completeness.ts`), which performs slot-by-slot completeness checking. `isRunComplete` walks every (scenarioId × modelId × sampleIndex) combination and confirms each has at least one transcript — it does not depend on `getCoverageBatchIncrement`. Reviewers seeing `expectedCount` arithmetic on this branch's stale HEAD should not flag it; that path was deleted in main.

---

## Constitutional / Cross-cutting

- The active product is under `cloud/`. `src/` (legacy) is out of scope.
- Branch must fork from `main` HEAD `057658f0` (latest after PR #759).
- All new fields are additive on `DomainValueCoverageCell`; no breaking changes.
- Glossary terminology: prefer "condition" for the (scenario × model × sample) slot and "trial" for an individual transcript only when contrasted with "batch." UI may use "trials" colloquially where it reads better; spec uses both consistently.
- Production smoke test (per the ship skill's Step 4.5) is required before merge: a real GraphQL query against production confirming the new fields return non-zero, sensible values for a known asymmetric cell.

---

## Assumptions carried in from discovery

1. New fields are added additively on `DomainValueCoverageCell`, matching the `orphanedBatchCount` pattern. Naming TBD by plan stage.
2. Popover notation: each direction shows "X batches + Y conditions". A "Transcripts" column header is added above the per-model breakdown.
3. Match Pair Counts opens the existing Start Paired Batch page. A summary card above the form shows the before/after diff and recalculates "after" live as the user edits the form. No aggressive auto-fill.
4. Match Pair Counts is shown only when `orphanedBatchCount > 0` OR `orphanedConditionCount > 0`. When `incompleteBatchCount > 0` also applies, a warning is surfaced rather than hiding the action.
5. Match Pair Counts is exposed only in the cell popover. No banners, notifications, or proactive UI elsewhere.

## Discovery decisions

- **Q1 — Where does Match Pair Counts go in the popover?** Answer: **Option B (sit alongside).** "Start Paired Batch" stays as the unconditional escape hatch. Match Pair Counts appears as a second link only when there's a gap to fix.

---

## Reconciliation history (responses to prior-round adversarial findings)

This section traces how the spec was hardened through 6 adversarial review rounds + 1 judge round. The responses are kept in the spec (rather than only in workflow state) so the judge panel and downstream readers can see the trail.

| Round | Finding | Response |
|------|---------|----------|
| R1 — Codex feasibility HIGH | `startRun` with PAIRED_BATCH always launches both directions; no single-direction path exists | Added US-6 (Backend launches a single direction); added Architecture Decision section. Spec-level Q4 now resolves to a new launch mode `PAIRED_BATCH_TOPUP` |
| R1 — Codex edge MED | Multi-definition cells need richer route state | US-3 acceptance updated to carry `pairKey`, all contributing `definitionId`s, lagging-direction value name, formatted pair name |
| R1 — Codex MED | Form recompute fields list | US-4 acceptance now lists all inputs: `selectedModels`, `samplePercentage`, `samplesPerScenario`, `scenarioCount`/`scenarioIds`, `launchMode`, `temperatureInput` |
| R1 — Gemini HIGH | `runs.deletedAt` allegedly absent per `cloud/CLAUDE.md` | False positive — verified `Run` and `Transcript` both have `deletedAt` in `schema.prisma`. Added "Verified facts" section; flagged `cloud/CLAUDE.md` as stale |
| R1 — Gemini LOW | Empty cells already render a "No batch" popover | US-1 acceptance updated to preserve existing empty-cell popover content |
| R2 — Codex feasibility HIGH | `samplesPerScenario × increment` would inflate batchCount | Stale-code observation — current main (post-#756) sets batchCount = 1 per complete run. Added second "Verified facts" entry |
| R2 — Codex MED | `incompleteBatchCount` summed across companion definitions; warning copy can lie | US-3 + Edge Cases warning copy now omits the count (always plural "batches") |
| R4 — Codex feasibility HIGH | `Transcript` has no uniqueness on slot tuple; retries inflate counts | Definitions section now defines slot, paired slot, orphaned slot in cell-level (3-tuple) terms with explicit dedupe invariants. Counting Invariants section added |
| R4 — Codex MED | Specific-condition mode (explicit `scenarioIds`) wasn't covered in card math | US-4 acceptance now has two-branch math (sample-percentage and specific-condition) |
| R4 — Codex MED | No deterministic lagging-direction tie-breaker | US-3 now has 6-rule deterministic tie-breaker operating on filled-condition counts |
| R4 — Gemini HIGH | `expectedCount` arithmetic broken | Stale-code observation — `expectedCount` path replaced by `isRunComplete` post-#756. Added third "Verified facts" entry |
| R4 — Gemini LOW | "1 condition (5 trials)" UI copy conflates terms | US-4 footer copy revised: "trials" is the user-facing magnitude; never "X conditions (Y trials)" |
| R5 — Codex MED | UI uses `Math.ceil`, backend uses `Math.floor` | US-4 math now exactly matches `sampleScenarios()` formula, requires shared helper |
| R5 — Codex MED | Backend can't launch individual slots | New "Granularity constraint" section: launches are whole `(model × scenario × samples)` jobs; spec no longer implies slot-level targeting |
| R5 — Codex MED | Multi-definition launch needs deterministic definitionId picker | New DefinitionId-to-launch rule added |
| R5 — Gemini MED | Tie-breaker used `per_batch_size` (contradicts batchCount=1) | Tie-breaker rewritten to operate on filled-condition counts only |
| R6/Judge — Completeness HIGH | Null-`scenarioId` rule missing | Counting Invariants now explicitly excludes null-scenarioId transcripts (mirroring `coverage-completeness.ts`) |
| R6/Judge — Restatement HIGH | Dedupe key contradiction (4-tuple vs 3-tuple) | Definitions section reconciled: cell-level dedupe is 3-tuple `(scenarioId, modelId, sampleIndex)`. The 4-tuple "Filled condition" wording was removed |
| R6/Judge — Restatement MED | Empty explicit-selection silently sampled | Spec-level decision #8 now defines empty `scenarioIds` behaviour |
| R6/Judge — Restatement LOW | `runCategory` validation for top-up | Spec-level decision #4 now requires the mutation to reject conflicting `runCategory` |
| R6/Judge — Implementation-risk HIGH | Plan stage open-Q's were load-bearing | Open Q's converted to spec-level decisions (#1–9). The plan stage's job is now narrower: implement these decisions, not re-derive them |
| R6/Judge — Gemini MED | Single-direction pairing lifecycle underspecified | Spec-level decision #6 now defines `companionRunId` behaviour for top-up runs (left unset; pairing is statistical not structural) |
