# Wave 6 — Implementation Spec

**Status:** Draft
**Last updated:** 2026-05-10
**Scope:** Wave 6 of the [paired-batch removal cleanup](remove-paired-batch-concept.md). Final wave: tombstones, the replacement comparison card, and terminology cleanup.

## What this wave does

Wave 5 deleted the `PairedRunComparisonCard` and left a placeholder hole on the Overview tab below the per-model summary. Wave 6 fills that hole with a redesigned card that pools metrics correctly across mirrored runs at the same signature, drops three dead utility files, and updates the glossary so canonical terminology no longer mentions "paired batch."

Specifically:

- **New card** at the same UI position: shows pooled metrics for the current run's vignette, treating the two presentation directions as equal-weight contributors. Hidden for non-paired vignettes.
- **Delete `legacyCompanionPairedRun.ts`** — Wave 5 left it as a tombstone for a single caller in `AnalysisDetail.tsx`. The new card removes the need for that caller, so the file goes away.
- **Delete `job-choice-bridge-report.ts`** + its lib + its tests. One-off reporting script that walks deleted fields.
- **Delete `docs/backend/paired-batch-run-flow.md`** — documents the deleted code path.
- **Glossary + PRD cleanup** — drop "paired batch," "launch mode," "PAIR_ASYMMETRY" from canonical docs.

It is small and mostly mechanical. The only new code is the replacement card.

## What does NOT ship in Wave 6

| Concern | Where it goes |
|---|---|
| `legacyCompanionPairedRun.ts` deletion | **Deferred.** Adversarial review (PR-1023 follow-up review by Codex) flagged this file as load-bearing for the single-vignette dropdown on `AnalysisDetail` and for paired-mode transcript assembly via `useAnalysisState`. For pre-Wave-4 runs whose `mirroredRuns` may be incomplete, deleting the legacy fallback would silently break that navigation. The file stays until either (a) every live run has populated `mirroredRuns`, or (b) the dropdown is rebuilt against `mirroredRuns` directly. Tracked as a Wave-7 follow-up, not Wave 6. |
| JSONB cleanup migration to strip `pair_key`, `jobChoiceLaunchMode`, `jobChoiceBatchGroupId`, `jobChoiceValueFirst`, `methodologySafe`, `companionRunId` from existing rows | **Skipped indefinitely.** New code ignores these fields. Storage cost is tiny. Mistakes during a multi-million-row migration are unrecoverable, and forensic value of the historical fields is preserved by leaving them. |
| Bake bootstrap kappa CIs into the snapshot to avoid the 60–90s `modelAgreementOnTradeoffs` recompute | Future wave (own design pass). Wave 6 is mechanical cleanup; this is a perf/methodology change that needs a snapshot version bump (v1.13.0) and its own review. |
| Optional `requestPolicy` audit between `/models` and `/models/win-rate` | Out of scope; flagged by subagent during PR #1023 |

## Pre-flight

### A. Wave 5 must be merged

Confirm Wave 5 is on `main`. Specifically:

- `Run.pairedBatchGroupId`, `Run.companionRunId`, `Run.launchMode` are gone from the schema
- `PAIR_ASYMMETRY` is gone from the `RunAnomalyType` enum
- `StartPairedBatchPage` / `PairedRunComparisonCard` files do not exist
- The Prisma migration `20260509233425_remove_pair_asymmetry_enum` is applied

If any of these is missing, Wave 6 prerequisites are not met.

### B. The ship-of-Theseus check

Verify that nothing on `main` calls a Wave 5 deletion. Run:

```
grep -rn "PairedRunComparisonCard\|StartPairedBatchPage\|launchMode\|companionRunId\|pairedBatchGroupId\|PAIR_ASYMMETRY" \
  cloud/apps/api/src cloud/apps/web/src cloud/scripts \
  --include="*.ts" --include="*.tsx" --include="*.graphql"
```

Expected matches after Wave 5:

- `cloud/apps/web/src/utils/legacyCompanionPairedRun.ts` (this wave deletes it)
- `cloud/apps/web/src/pages/AnalysisDetail.tsx` (the caller of `findCompanionPairedRun` — this wave removes the call)
- `cloud/scripts/job-choice-bridge-report.ts` + lib + tests (this wave deletes them)
- The `companionRunId` URL search-param plumbing in `AnalysisConditionDetail.tsx`, `AnalysisPanel.tsx`, `ScenariosTab.tsx`, etc. (these are URL state, NOT the deleted GraphQL field — leave them)

Anything else is a missed cleanup or a real new caller. Investigate before Wave 6 lands.

## Implementation tasks

Order matters for the test/build phase. Tasks 2–5 can be done in any order; Task 1 (the new card) is the only meaningful new code.

### Task 1 — Build the replacement card

**File: `cloud/apps/web/src/components/analysis/PooledVignetteMetricsCard.tsx` (new)**

Replaces the deleted `PairedRunComparisonCard.tsx`. Lives at the same UI position — the empty `border-t border-gray-200 pt-4` slot at the bottom of `OverviewSummaryTable.tsx` (currently empty after Wave 5). Wave 6 wires this card into that slot.

#### Visibility rule

Render the card only when **all three** of these are true:

1. The run's definition has mirrored value tokens — `hasMirroredValueTokens(definitionContent)` returns true.
2. The run is **not** an aggregate run — `isAggregate === false`. Aggregate runs are rollups of source runs; they have no probes of their own and the rest of `AnalysisPanel` already special-cases them via `isAggregateAnalysis`. Showing this card on an aggregate page would be confusing because the aggregate is already a pooled view.
3. The `pressureSensitivity` query returns a non-empty `models` array. This is the data-driven backstop: even if a definition technically has two value tokens, the card hides itself if there is no actual paired-vignette data to show. This guards against malformed or non-mirrored two-token definitions that pass the `hasMirroredValueTokens` shape check but are not real mirrored pairs.

For any of these failing, render nothing (no placeholder).

#### Header

- Title: "Pooled vignette metrics" (or similar; final copy decided during implementation)
- Subtitle: vignette name (`run.definition?.name`)
- Pooling count line: "Includes **N** runs of this vignette and **M** mirrored runs at signature `vnewtd`." Where:
  - **N** = client-side count of runs whose `definitionId` equals the current run's `definitionId` and whose signature matches. Source: a `useRuns({ definitionId, status: 'COMPLETED' })` call (the hook is already used elsewhere on the page) filtered client-side by `formatTrialSignature(run.config) === signature`. The current run itself is included in N.
  - **M** = `run.mirroredRuns.length`. The `mirroredRuns` field is already populated by Wave 4's resolver and selected in the existing `runs.graphql` operation; no additional query needed.
  - If M is 0: show "Includes N runs of this vignette. Mirrored runs at signature `vnewtd` will populate this card once the companion vignette has runs."

No new GraphQL fields, no resolver changes. Both numbers come from data already on the client.

#### Per-model table (option B from the design discussion)

| Column | Source | Notes |
|---|---|---|
| Model | `pressureSensitivity.models[].label` | Sort alphabetically by label |
| Win rate (Value A) | `model.valuePairs[0].directionBalancedWinRate` | Format as percent, 1 decimal if non-integer |
| Win rate (Value B) | `model.valuePairs[0].directionBalancedOpponentWinRate` | Same format |
| Pressure response | `model.valuePairs[0].pressureResponse.value` | Format as signed percentage points (`+15`, `−4`). When null, render `—` with a tooltip explaining the reason from `pressureResponse.reason` (see "Null pressure response" below). |
| Trials | `model.valuePairs[0].n` | Plain integer, no formatting |

Column labels for the two value-rate columns come from `getPairedOrientationLabels(definitionContent).canonicalValues` (canonical alphabetical order — same as `directionBalancedWinRate` is computed against).

#### Math rule (load-bearing)

Direction-balanced averaging only. Each direction's win rate is computed independently across that direction's trials, and the two are then averaged with **equal weight**. Never sum trials across directions and divide by total — that overweights whichever direction has more runs and biases the result. Same rule for pressure response.

This is already what the `pressureSensitivity` resolver does (`computeDirectionBalancedPairWinRates` at `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts:600` averages per-vignette, then per-direction, then per-domain). The card just consumes its existing fields. The math rule is documented here so future contributors do not switch to a "simpler" weighted average.

**Test guard (Task 1.5 below):** a unit test must exist that uses deliberately lopsided trial counts in the two directions and asserts the resulting win rates and pressure response stay direction-balanced. This locks in the rule against silent regressions.

#### Null pressure response

Pressure response is the difference between the model's win rate when scenarios push toward Value A and when they push toward Value B. The math returns null when at least one of those conditions is too thin to compute. The reason is exposed via `pressureResponse.reason`:

| `reason` value | Tooltip copy on the dash |
|---|---|
| `directional-thin` | "Not enough trials with Value A stacked higher to compute pressure response." |
| `inverted-thin` | "Not enough trials with Value B stacked higher to compute pressure response." |
| `directional-and-inverted-thin` | "Both pressure conditions are too thin to compute pressure response." |
| `baseline-thin` | "Baseline (equal-pressure) trials are too thin to compute pressure response." |
| `null` reason but value is null | "Pressure response could not be computed." (fallback copy) |

Researchers reading the dash without context tend to assume "no pressure response detected" (real signal). The tooltip distinguishes that real-signal interpretation from "we don't have enough data yet."

#### Data source

The existing `pressureSensitivity(definitionId, signature)` query. No new resolver. The query already:

- Takes `definitionId` (this run's `definitionId`) and `signature` (this run's signature, derived via `formatTrialSignature(definitionVersion, temperature)`)
- Resolves the mirrored sibling vignette server-side via canonical token mirroring (Wave 4 work)
- Pools all completed runs of both directions at the matching signature
- Returns direction-balanced win rates and pressure response per model per value pair

The card simply selects the fields it needs from this query. No client-side run-list iteration, no companion search.

#### Empty / loading states

| State | UI |
|---|---|
| `definitionId` is null | Render nothing (the card is for run-level analysis only) |
| Query fetching, no data yet | "Loading pooled metrics…" inside the card frame |
| Query error | Inline amber notice with the error message |
| `pressureSensitivity` returns `excludedDefinitions` with `pair_key_companion_collision` | "Cannot blend this vignette pair — multiple companion vignettes share its mirrored token. Investigate before relying on these numbers." |
| `models` array is empty (visibility check #3 fails) | The card hides itself entirely. (See visibility rule above — the card relies on data presence, not just definition shape.) |
| `models` array is non-empty but every row has `n === 0` | "Trials in flight; no completed runs yet at this signature." |

(Note: `formatTrialSignature(definitionVersion, temperature)` always returns a usable string even when both are null — it returns the literal `'v?td'`. The card never has to handle a null/undefined signature.)

#### Visual treatment

Match the rest of the Overview tab. Keep visual weight low — this is supplemental information below the main table, not a hero element. Use the same border/background palette as other cards in the Overview tab (the deleted card used a teal accent because of its "paired" framing; the new card should use the same palette as neighboring cards since the framing is no longer pair-specific).

#### Wiring

`OverviewSummaryTable.tsx` currently has a closing `</div>` followed by `}` after the table. Wave 5 removed the comparison card slot but left the closing tag in place. Wave 6 adds the new card after the table — guarded by the `hasMirroredValueTokens` check on the definition content passed in via props.

The card needs the run's `definitionId`, the run's signature (derived from definitionVersion + temperature), and the definition content (for the `hasMirroredValueTokens` check and orientation labels). These props need to be plumbed back through `OverviewTab.tsx` from `AnalysisPanel.tsx` (where the run is already in scope).

#### Tests

**File: `cloud/apps/web/tests/components/analysis/PooledVignetteMetricsCard.test.tsx` (new)**

Test cases:

1. Renders the per-model table when `pressureSensitivity` returns models with completed trials
2. Renders the empty-mirror message in the header when paired but no mirrored-side runs yet (M = 0)
3. Renders the loading state while the query is fetching
4. Renders the collision error when `pair_key_companion_collision` is present
5. Does NOT render anything when the definition lacks mirrored value tokens (visibility check #1)
6. Does NOT render anything when the run is an aggregate (visibility check #2)
7. Does NOT render anything when `pressureSensitivity` returns an empty `models` array (visibility check #3)
8. Renders pressure response as a signed string (`+15`, `−4`) with the right sign
9. Renders `—` with the appropriate tooltip text for each `reason` value (`directional-thin`, `inverted-thin`, `directional-and-inverted-thin`, `baseline-thin`)
10. Win-rate columns use the canonical orientation labels (alphabetical first / second)
11. Header count line shows the correct N and M derived from `useRuns` + `mirroredRuns.length`

### Task 1.5 — Methodology test guard (server-side)

**File: `cloud/apps/api/tests/services/pressure-sensitivity/direction-balanced-invariant.test.ts` (new)**

This is the load-bearing test that locks in the user's research-integrity rule: **never overweight one direction over the other.** A future change that switches to count-additive pooling must fail this test.

Setup: build a fixture with two definitions in a mirrored pair. Direction A has many trials (e.g., 100 completed cells); direction B has few (e.g., 10 completed cells). The win rate within each direction is set to a known constant (e.g., A wins 70% of its trials, B wins 30% of its trials).

Assertions:

1. The pooled `directionBalancedWinRate` for Value A equals `(0.70 + 0.30) / 2 = 0.50` exactly. **Not** weighted by the trial counts (which would give a heavy bias toward A: `(0.70 * 100 + 0.30 * 10) / 110 ≈ 0.66`).
2. The pooled `directionBalancedOpponentWinRate` for Value B equals `0.50` exactly (the mirror).
3. The pooled `pressureResponse.value` is computed from per-direction averages, not trial-weighted across directions.
4. (Smoke) When trial counts are equal, the direction-balanced result equals the trial-weighted result. (Sanity check that the test fixture actually exercises the lopsided case.)

If a future contributor changes `computeDirectionBalancedPairWinRates` or `pooledDirectionalReduction` to a count-additive pooling, this test fails loudly. That is the point.

### Task 2 — Delete the job-choice bridge report script

**Files:**

- `cloud/scripts/job-choice-bridge-report.ts` — delete
- `cloud/scripts/job-choice-bridge-report-lib.ts` — delete
- `cloud/scripts/__tests__/job-choice-bridge-report.test.ts` — delete

Confirm no live caller. The script is a one-off invoked manually via `npx tsx`. There are no cron jobs or workflow steps that reference it.

**Confirmation:** `grep -rn "job-choice-bridge-report" cloud --include="*.ts" --include="*.tsx" --include="*.json" --include="*.yaml" --include="*.yml"` should return zero matches.

### Task 3 — Delete the paired-batch run flow doc

**File: `docs/backend/paired-batch-run-flow.md`** — delete

Documents the old paired-batch launch path that no longer exists. Anyone looking for "how runs are launched" should now refer to the current launch flow code in `cloud/apps/api/src/graphql/mutations/domain/launch/`.

**Confirmation:** `grep -rn "paired-batch-run-flow" docs --include="*.md"` should return matches only in workflow feature-run records (e.g., `docs/workflow/feature-runs/033-run-state-reconciliation/spec.md`, `docs/workflow/feature-runs/033-run-state-reconciliation/decisions-to-review-before-merge.md`). Those are historical receipts of past Feature Factory runs; dangling links in them are acceptable. Any match outside `docs/workflow/feature-runs/` needs to be updated or deleted.

### Task 4 — Glossary and PRD cleanup

**File: `docs/canonical-glossary.md`**

Open the file and **find any references** to the following concepts. Some may not be present — do not assume the file currently contains all of them. Remove or rewrite each match found:

- "paired batch" — concept no longer exists; the term should redirect to "mirrored vignette pair" or just be deleted
- "launch mode" — concept no longer exists
- "PAIR_ASYMMETRY" anomaly type — no longer exists
- "companion run" — the on-write companion linkage is gone; the read-side `mirroredRuns` resolver replaces it. If the term stays, redefine it as "any run of a mirrored vignette at the same signature."

Add an entry for **"mirrored vignette pair"** if not already present: two definitions in the same domain whose value tokens are flipped (`value_first` of one equals `value_second` of the other, and vice versa). This is the post-Wave-4 canonical term for what used to be a "paired batch."

**File: `docs/valuerank_prd.yaml`**

Same find-and-remove pattern. Search for: `paired_batch`, `launch_mode`, `PAIR_ASYMMETRY`, `companion_run_id`, `paired_batch_topup`. These were product-level terms that no longer reflect the system. Remove any matches found; do not assume specific terms exist.

**Confirmation:**

```
grep -n "paired batch\|launch mode\|PAIR_ASYMMETRY\|companion run" docs/canonical-glossary.md docs/valuerank_prd.yaml
```

Acceptable matches: any that explicitly note "deprecated" or "removed in Wave 5." Anything else needs to be updated or deleted.

### Task 5 — Verify

```
npm run lint --workspace @valuerank/shared
npm run lint --workspace @valuerank/db
npm run lint --workspace @valuerank/api
npm run lint --workspace @valuerank/web
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
  JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
  npm run test --workspace @valuerank/api
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" \
  JWT_SECRET="test-secret-that-is-at-least-32-characters-long" \
  npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/api
npm run build --workspace @valuerank/web
```

All must return 0 errors. No `@ts-ignore`, no `eslint-disable`, no `as any`.

### Final greps after Wave 6

```
grep -rn "PairedRunComparisonCard" cloud/apps/web/src --include="*.ts" --include="*.tsx"
grep -rn "job-choice-bridge-report" cloud --include="*.ts" --include="*.tsx" --include="*.json" --include="*.yaml" --include="*.yml"
grep -rn "paired-batch-run-flow" docs --include="*.md"
```

Expected results:
- `PairedRunComparisonCard`: zero matches (deleted in Wave 5).
- `job-choice-bridge-report`: zero matches.
- `paired-batch-run-flow`: matches only inside `docs/workflow/feature-runs/` (historical receipts, acceptable dangling links).
- Note: `legacyCompanionPairedRun.ts` and `findCompanionPairedRun` callers are intentionally still present per the deferral above — they remain until pre-Wave-4 runs are confirmed migrated to `mirroredRuns`.

Visual smoke test on a paired-vignette analysis page after the deploy:

1. Navigate to `/analysis/<paired-vignette-run-id>` for a vignette that has both directions trialled. Expect to see the new card with the per-model table populated.
2. Navigate to `/analysis/<non-paired-run-id>`. Expect no card at the bottom of the Overview tab.
3. Navigate to a paired vignette where the mirror has no runs yet. Expect the empty-mirror message.

## Order of changes

| Step | What | Why this order |
|---|---|---|
| 1 | Pre-flight greps (B above) | Confirms Wave 5 left the codebase in the expected state |
| 2 | Task 1.5: write the methodology guard test BEFORE Task 1 | Locks in the math rule before anyone touches the card. Test passes against current resolver. |
| 3 | Task 1: build the new card (component + tests, no wiring yet) | New code in isolation; tests cover the visibility rules and tooltip behavior |
| 4 | Task 1: wire into `OverviewSummaryTable.tsx` (props through `OverviewTab.tsx` from `AnalysisPanel.tsx`) | The "wiring" step is small but easy to break — separate from the new file work |
| 5 | Tasks 2–3: delete the bridge script and the run-flow doc | Independent; bundle for the same PR |
| 6 | Task 4: glossary / PRD updates | Doc-only; bundle |
| 7 | Task 5: verify | Required before opening the PR |

All tasks can ship in a single PR.

## Constraints

- DO NOT MODIFY: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `GEMINI.md`, `.gitignore`, `STATUS.md`, `experiments.md`, the docs in `docs/tech-debt/wave*.md` (those are spec history), or any file outside the inventory above.
- DO NOT use `@ts-ignore`, `eslint-disable`, or `as any`.
- DO NOT introduce a JSONB cleanup migration. Per the deferral above, those legacy fields are preserved as historical baggage.
- DO NOT touch the bootstrap CI computation or `cloud/apps/api/src/services/model-agreement/aggregation.ts` — that work has its own future wave.
- DO NOT change the `pressureSensitivity` resolver. The new card consumes existing fields; if a needed field is missing, that is a sign to revisit the design here, not to extend the resolver.
- DO NOT push or open the PR until the full preflight passes locally and a paired-vignette analysis page renders the card correctly in dev.

## Risk and rollback

| Failure | Symptom | Recovery |
|---|---|---|
| New card breaks paired-vignette analysis page | Page errors out, the entire Overview tab fails to render | Wrap the card in a tightly-scoped error boundary so the rest of the page still loads. (See implementation guidance: the existing `CopyVisualButton` and similar Overview components use simple `try/catch` rendering patterns. Mirror them.) |
| `pressureSensitivity` query has unexpected null fields | `n` or `directionBalancedWinRate` undefined for a model row | Render `—` for the cell. Do not throw. |
| Glossary update accidentally breaks a doc cross-link | Other docs reference deleted glossary entries | Rebuild the glossary index if there is one, or update the cross-references. Doc-only — does not affect production. |
| Removing `findCompanionPairedRun` breaks navigation for a very old run | Single-vignette dropdown on `AnalysisDetail` does not populate for runs that pre-date Wave 4 | Add the legacy fallback back temporarily, but as a separate utility file scoped to the dropdown only. The card never relies on it. |

**Worst case:** revert the Wave 6 PR. The new card is additive — removing it puts the page back to its post-Wave-5 state (per-model summary table with no card below). The deletions in Tasks 2–5 are recoverable from git history.

## Cleanup after Wave 6 stabilizes (~7 days post-deploy)

| File | Action |
|---|---|
| `docs/tech-debt/remove-paired-batch-concept.md` | Mark "complete" at the top. The 6-wave plan is now fully shipped. |
| Pre-Wave-6 grep documentation in this spec | Leave in place as a historical reference. |

Most other Wave 6 artifacts (the new card, the deletions, the glossary updates) are permanent.

## Sign-off log

| Phase | Approved by | Date |
|---|---|---|
| Spec reviewed (Gemini) | | |
| Spec reviewed (Codex) | | |
| Spec reviewed (Claude / human) | | |
| Pre-flight greps run | | |
| Card design verified visually in dev | | |
| Wave 6 PR opened | | |
| Wave 6 PR merged | | |
| Post-deploy verification | | |

## Related

- [Remove paired-batch concept](remove-paired-batch-concept.md) — parent planning doc
- [Wave 5 spec](wave5-spec.md) — predecessor wave (schema + UI cleanup)
- [Wave 4 spec](wave4-spec.md) — analysis-layer rewrite (introduced `mirroredRuns` and signature-based `pressureSensitivity`)
